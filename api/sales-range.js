/**
 * /api/sales-range
 * Phase 3 Team A: 期間集計 KPI 軽量 API (hybrid: 集計テーブル + Square API)
 *
 * 戦略:
 *   - 期間 <= 7 日: 全期間 Square API 直叩き (リアルタイム性)
 *   - 期間 > 7 日 かつ 当日含まない: 全期間 集計テーブル square_dashboard.daily_sales SELECT
 *   - 期間 > 7 日 かつ 当日含む: hybrid (過去日 = 集計テーブル / 当日 = Square 直叩き)
 *
 * クエリ:
 *   - start_date (YYYY-MM-DD) 必須
 *   - end_date (YYYY-MM-DD) 必須 (start_date <= end_date)
 *   - location_id 必須: 単一 ID or 'ALL' / 'all'
 *   - start_hour (0-23) 省略時 0
 *
 * 認証: validateToken(req) (sales.js / transactions-range.js と同一)
 *
 * レスポンス (設計書 §4.3):
 *   {
 *     "byDate": {
 *       "2026-05-20": {
 *         "total_amount": ..., "transaction_count": ..., "customer_count": ...,
 *         "new_customer_count": ..., "repeat_customer_count": ..., ...,
 *         "new_sales": ..., "repeat_sales": ..., ...,
 *         "open_total_amount": ..., "open_order_count": ...,
 *         "categories": [{ "category_id": ..., "category_name": ..., "sales": ..., "item_count": ... }, ...]
 *       },
 *       ...
 *     },
 *     "meta": { "source": "live" | "aggregate" | "hybrid", "location_ids": [...], "live_dates": [...], "aggregate_dates": [...], "live_window_days": <number> }
 *   }
 *
 * 制約 (Phase 3 Team A スコープ):
 *   - migration / cron handler には触らない
 *   - 既存 _supabase.js / _shared.js / _segments.js / cron/aggregate-daily-sales.js (parseBusinessDayRange のみ) を import
 *   - hybrid 集計ロジックは cron handler の aggregateLocationDay と完全整合 (KPI / categories / segments)
 */

import { getSdbClient } from './_supabase.js';
import {
  setCors,
  validateToken,
  squareHeaders,
  fetchAllPayments,
  fetchOrdersBatch,
  fetchCatalogVariationCategoryMap,
  normalizePaymentsForReporting,
} from './_shared.js';
import { parseBusinessDayRange } from './cron/aggregate-daily-sales.js';
import { aggregateSegments } from './_segments.js';

// 対象 7 店舗の Square location 名 (cron handler と同一)
const TARGET_LOCATION_NAMES = [
  'Goodbye',
  'KITUNE',
  'LR',
  'moumou',
  '吸暮',
  '狛犬',
  '金魚',
];

const SHORT_RANGE_THRESHOLD = 7;

/**
 * USE_AGGREGATE flag (環境変数, デフォルト 'true'):
 *   - 'true': 集計テーブル参照あり (hybrid / aggregate モード)
 *   - 'false': 集計テーブル参照を完全スキップ → 全期間 live (緊急ロールバック)
 */
function isAggregateEnabled() {
  return (process.env.USE_AGGREGATE ?? 'true') === 'true';
}

/**
 * 'YYYY-MM-DD' 形式かつ実在する日付か判定。
 *   '2026-02-31' のような Date round-trip で別日に化けるケースを弾く。
 */
function isValidDateStr(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  if (Number.isNaN(d.getTime())) return false;
  const roundtrip = d.toISOString().slice(0, 10);
  return roundtrip === s;
}

/**
 * dayMetrics 構造を空状態で初期化 (_categoryAgg 任意)。
 */
function emptyDayMetrics({ includeCategoryAgg = false } = {}) {
  const base = {
    total_amount: 0,
    transaction_count: 0,
    customer_count: 0,
    new_customer_count: 0,
    repeat_customer_count: 0,
    regular_customer_count: 0,
    staff_customer_count: 0,
    unlisted_customer_count: 0,
    new_sales: 0,
    repeat_sales: 0,
    regular_sales: 0,
    staff_sales: 0,
    unlisted_sales: 0,
    open_total_amount: 0,
    open_order_count: 0,
    categories: [],
  };
  if (includeCategoryAgg) base._categoryAgg = {};
  return base;
}

/**
 * dayMetrics の flat フィールドから segments nested 形式を構築 (設計書 §4.3 互換)。
 *   segments: { customers: { new, repeat, regular, staff, unlisted }, sales: { ... } }
 * 既存の flat フィールド (new_sales 等) はそのまま残し、両方提供する。
 */
function buildSegmentsView(day) {
  return {
    customers: {
      new: day.new_customer_count,
      repeat: day.repeat_customer_count,
      regular: day.regular_customer_count,
      staff: day.staff_customer_count,
      unlisted: day.unlisted_customer_count,
    },
    sales: {
      new: day.new_sales,
      repeat: day.repeat_sales,
      regular: day.regular_sales,
      staff: day.staff_sales,
      unlisted: day.unlisted_sales,
    },
  };
}

/**
 * 対象 7 店舗の Square locations を取得 (cron handler の fetchTargetLocations と同等)。
 */
async function fetchTargetLocations() {
  const resp = await fetch('https://connect.squareup.com/v2/locations', {
    headers: squareHeaders(),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Square /v2/locations failed: ${resp.status} - ${text}`);
  }
  const data = await resp.json();
  return (data.locations || []).filter((loc) =>
    TARGET_LOCATION_NAMES.some((target) => loc.name && loc.name.includes(target))
  );
}

/**
 * JST 現在時刻 + start_hour を基準とした「今日の営業日」を返す。
 *   - JST 現在 hour < startHour → 営業日 = 前日
 *   - それ以外 → 営業日 = 今日
 */
function getTodayBusinessDate(startHour) {
  const nowMs = Date.now();
  const jstNow = new Date(nowMs + 9 * 60 * 60 * 1000);
  const hour = jstNow.getUTCHours();
  if (hour < startHour) {
    jstNow.setUTCDate(jstNow.getUTCDate() - 1);
  }
  const y = jstNow.getUTCFullYear();
  const m = String(jstNow.getUTCMonth() + 1).padStart(2, '0');
  const d = String(jstNow.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * [start_date ... end_date] の YYYY-MM-DD 配列を生成。UTC 起点で日付増分。
 */
function getDateArray(startDate, endDate) {
  const arr = [];
  const [sy, sm, sd] = startDate.split('-').map(Number);
  const [ey, em, ed] = endDate.split('-').map(Number);
  const cur = new Date(Date.UTC(sy, sm - 1, sd));
  const end = new Date(Date.UTC(ey, em - 1, ed));
  while (cur.getTime() <= end.getTime()) {
    const y = cur.getUTCFullYear();
    const m = String(cur.getUTCMonth() + 1).padStart(2, '0');
    const d = String(cur.getUTCDate()).padStart(2, '0');
    arr.push(`${y}-${m}-${d}`);
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return arr;
}

/**
 * 指定された YYYY-MM-DD 日付から N 日減算した日付を返す (UTC 起点の純粋文字列演算)。
 * @param {string} date - 基準日 (YYYY-MM-DD)
 * @param {number} n - 減算する日数
 * @returns {string} 減算後の日付 (YYYY-MM-DD)
 */
function subtractBusinessDays(date, n) {
  const [y, m, d] = date.split('-').map(Number);
  const cur = new Date(Date.UTC(y, m - 1, d));
  cur.setUTCDate(cur.getUTCDate() - n);
  const ry = cur.getUTCFullYear();
  const rm = String(cur.getUTCMonth() + 1).padStart(2, '0');
  const rd = String(cur.getUTCDate()).padStart(2, '0');
  return `${ry}-${rm}-${rd}`;
}

/**
 * 指定 location / 営業日 1 日分の OPEN orders を取得。
 * 失敗時は { open_total_amount: 0, open_order_count: 0 } を返し、エラーは握り潰す
 * (cron handler の fetchOpenOrdersForLocation と同等の挙動)。
 */
async function fetchOpenOrdersForLocation(locationId, beginTimeJST, endTimeJST) {
  try {
    const rawOrders = [];
    let cursor;
    do {
      const body = {
        location_ids: [locationId],
        query: {
          filter: {
            state_filter: { states: ['OPEN'] },
            date_time_filter: {
              created_at: { start_at: beginTimeJST, end_at: endTimeJST },
            },
          },
          sort: { sort_field: 'CREATED_AT', sort_order: 'DESC' },
        },
        limit: 500,
        ...(cursor ? { cursor } : {}),
      };

      const response = await fetch(
        'https://connect.squareup.com/v2/orders/search',
        {
          method: 'POST',
          headers: squareHeaders(),
          body: JSON.stringify(body),
        }
      );

      if (!response.ok) {
        return { open_total_amount: 0, open_order_count: 0 };
      }

      const data = await response.json();
      rawOrders.push(...(data.orders ?? []));
      cursor = data.cursor ?? undefined;
    } while (cursor);

    const open_total_amount = rawOrders.reduce(
      (sum, o) => sum + (o.total_money?.amount ?? 0),
      0
    );
    return { open_total_amount, open_order_count: rawOrders.length };
  } catch (_err) {
    return { open_total_amount: 0, open_order_count: 0 };
  }
}

/**
 * 1 店舗 1 営業日分の Square 直叩き集計。
 * cron handler の aggregateLocationDay と完全整合する KPI / segments / categoryAgg を生成。
 *
 * 戻り値:
 *   {
 *     total_amount, transaction_count, customer_count,
 *     new_customer_count, repeat_customer_count, regular_customer_count, staff_customer_count, unlisted_customer_count,
 *     new_sales, repeat_sales, regular_sales, staff_sales, unlisted_sales,
 *     open_total_amount, open_order_count,
 *     categories: [{ category_id, category_name, sales, item_count }]
 *   }
 */
async function aggregateLiveDay({ locationId, date, startHour }) {
  const { beginTimeJST, endTimeJST } = parseBusinessDayRange({ date, startHour });

  // 1. payments 取得 + 正規化 (COMPLETED フィルタ + 返金正規化 込み)
  const rawPayments = await fetchAllPayments({
    beginTimeJST,
    endTimeJST,
    location_id: locationId,
  });
  const payments = normalizePaymentsForReporting(rawPayments);

  // 2. orders / catalog 取得
  const orderIds = [...new Set(payments.map((p) => p.order_id).filter(Boolean))];
  let ordersMap = {};
  let variationCategoryMap = {};
  if (orderIds.length > 0) {
    ordersMap = await fetchOrdersBatch(orderIds);
    variationCategoryMap = await fetchCatalogVariationCategoryMap(ordersMap);
  }

  // 3. KPI + categoryAgg (cron handler の aggregateLocationDay と同じ按分ロジック)
  let totalAmount = 0;
  let transactionCount = 0;
  const customerIdSet = new Set();
  const categoryAgg = {}; // category_name -> { category_id, sales, item_count }

  for (const payment of payments) {
    const paymentAmount = payment.amount_money?.amount ?? 0;
    totalAmount += paymentAmount;
    transactionCount += 1;

    if (payment.customer_id) {
      customerIdSet.add(payment.customer_id);
    }

    const order = payment.order_id ? ordersMap[payment.order_id] : null;
    const lineItems = (order && order.line_items) || [];
    const positiveItems = lineItems.filter(
      (it) => parseFloat(it.quantity || '0') > 0
    );

    if (positiveItems.length === 0) {
      if (!categoryAgg['不明']) {
        categoryAgg['不明'] = { category_id: null, sales: 0, item_count: 0 };
      }
      categoryAgg['不明'].sales += paymentAmount;
      categoryAgg['不明'].item_count += 1;
      continue;
    }

    let totalLineAmount = 0;
    for (const item of positiveItems) {
      totalLineAmount += item.total_money?.amount ?? 0;
    }

    let allocatedTotal = 0;
    for (let i = 0; i < positiveItems.length; i++) {
      const item = positiveItems[i];
      const lineAmount = item.total_money?.amount ?? 0;
      const quantity = parseInt(item.quantity || '0', 10) || 0;
      const variationId = item.catalog_object_id || null;

      // _shared.js の fetchCatalogVariationCategoryMap は Plain Object: { [varId]: { id, name } | null }
      const catInfo = variationId ? variationCategoryMap[variationId] : null;
      const categoryName = catInfo?.name || '不明';
      const categoryId = catInfo?.id || null;

      let allocatedSales;
      if (i === positiveItems.length - 1) {
        // 最後の line に remainder を寄せる
        allocatedSales = paymentAmount - allocatedTotal;
      } else {
        allocatedSales =
          totalLineAmount > 0
            ? Math.floor((paymentAmount * lineAmount) / totalLineAmount)
            : 0;
      }
      allocatedTotal += allocatedSales;

      if (!categoryAgg[categoryName]) {
        categoryAgg[categoryName] = {
          category_id: categoryId,
          sales: 0,
          item_count: 0,
        };
      } else if (!categoryAgg[categoryName].category_id && categoryId) {
        categoryAgg[categoryName].category_id = categoryId;
      }
      categoryAgg[categoryName].sales += allocatedSales;
      categoryAgg[categoryName].item_count += quantity;
    }
  }

  // 4. セグメント別 (_segments.js の Transaction 型と完全一致)
  const transactions = payments.map((p) => ({
    id: p.id,
    customer_name: null,
    created_at_jst: p.created_at || '',
    amount: p.amount_money?.amount ?? 0,
    status: 'COMPLETED',
    source: 'square',
    line_items: ((ordersMap[p.order_id]?.line_items) || [])
      .filter((it) => parseFloat(it.quantity || '0') > 0)
      .map((it) => ({
        name: it.name || '不明',
        quantity: it.quantity || '0',
      })),
    discounts: [],
  }));
  const segments = aggregateSegments(transactions);

  // 5. OPEN orders (失敗時は 0 で握り潰し、KPI は返す)
  const openResult = await fetchOpenOrdersForLocation(
    locationId,
    beginTimeJST,
    endTimeJST
  );

  // 6. categories 配列形式に整形 (sales 降順)
  const categories = Object.entries(categoryAgg)
    .map(([name, c]) => ({
      category_id: c.category_id,
      category_name: name,
      sales: c.sales,
      item_count: c.item_count,
    }))
    .sort((a, b) => b.sales - a.sales);

  return {
    total_amount: totalAmount,
    transaction_count: transactionCount,
    customer_count: customerIdSet.size,
    new_customer_count: segments.customers.new,
    repeat_customer_count: segments.customers.repeat,
    regular_customer_count: segments.customers.regular,
    staff_customer_count: segments.customers.staff,
    unlisted_customer_count: segments.customers.unlisted,
    new_sales: segments.sales.new,
    repeat_sales: segments.sales.repeat,
    regular_sales: segments.sales.regular,
    staff_sales: segments.sales.staff,
    unlisted_sales: segments.sales.unlisted,
    open_total_amount: openResult.open_total_amount,
    open_order_count: openResult.open_order_count,
    categories,
  };
}

/**
 * 集計テーブル (daily_sales + daily_sales_by_category) から指定期間 / 指定 location 群を取得。
 * 戻り値:
 *   {
 *     byDate: { [date]: dayMetrics }  (ALL モード時は location 合算済み),
 *     presentCombinations: Set<'business_date|location_id'>  (欠損検知用),
 *   }
 *
 * RLS bypass のため service_role client を使用。
 * 本 API は validateToken で認可済みなので問題なし。
 * (anon は USAGE 未付与のため anon client では square_dashboard schema を SELECT できない)
 */
async function fetchAggregateData({ dates, locationIds, startHour }) {
  const byDate = {};
  const presentCombinations = new Set();
  if (dates.length === 0 || locationIds.length === 0) {
    return { byDate, presentCombinations };
  }

  const sdb = getSdbClient({ serviceRole: true });

  // daily_sales SELECT (schema は CLIENT_OPTIONS で固定済み → .from() 直接呼び)
  const { data: salesRows, error: salesErr } = await sdb
    .from('daily_sales')
    .select(
      'business_date,location_id,total_amount,transaction_count,customer_count,new_customer_count,repeat_customer_count,regular_customer_count,staff_customer_count,unlisted_customer_count,new_sales,repeat_sales,regular_sales,staff_sales,unlisted_sales,open_total_amount,open_order_count'
    )
    .in('business_date', dates)
    .in('location_id', locationIds)
    .eq('start_hour', startHour);

  if (salesErr) {
    throw new Error(`daily_sales SELECT failed: ${salesErr.message}`);
  }

  // daily_sales_by_category SELECT
  const { data: catRows, error: catErr } = await sdb
    .from('daily_sales_by_category')
    .select(
      'business_date,location_id,category_id,category_name,sales,item_count'
    )
    .in('business_date', dates)
    .in('location_id', locationIds)
    .eq('start_hour', startHour);

  if (catErr) {
    throw new Error(`daily_sales_by_category SELECT failed: ${catErr.message}`);
  }

  // 集計テーブル row → byDate に合算 (ALL モードでは date 単位 location 合算)
  for (const row of salesRows || []) {
    const d = row.business_date;
    presentCombinations.add(`${d}|${row.location_id}`);
    if (!byDate[d]) {
      byDate[d] = emptyDayMetrics({ includeCategoryAgg: true });
    }
    const target = byDate[d];
    target.total_amount += row.total_amount;
    target.transaction_count += row.transaction_count;
    target.customer_count += row.customer_count;
    target.new_customer_count += row.new_customer_count;
    target.repeat_customer_count += row.repeat_customer_count;
    target.regular_customer_count += row.regular_customer_count;
    target.staff_customer_count += row.staff_customer_count;
    target.unlisted_customer_count += row.unlisted_customer_count;
    target.new_sales += row.new_sales;
    target.repeat_sales += row.repeat_sales;
    target.regular_sales += row.regular_sales;
    target.staff_sales += row.staff_sales;
    target.unlisted_sales += row.unlisted_sales;
    target.open_total_amount += row.open_total_amount;
    target.open_order_count += row.open_order_count;
  }

  for (const row of catRows || []) {
    const d = row.business_date;
    if (!byDate[d]) continue; // daily_sales 側に row が無い date は category だけ来ても無視
    const key = row.category_name || '不明';
    if (!byDate[d]._categoryAgg[key]) {
      byDate[d]._categoryAgg[key] = {
        category_id: row.category_id,
        category_name: key,
        sales: 0,
        item_count: 0,
      };
    } else if (!byDate[d]._categoryAgg[key].category_id && row.category_id) {
      byDate[d]._categoryAgg[key].category_id = row.category_id;
    }
    byDate[d]._categoryAgg[key].sales += row.sales;
    byDate[d]._categoryAgg[key].item_count += row.item_count;
  }

  // _categoryAgg → categories[] (sales 降順)
  for (const d of Object.keys(byDate)) {
    const agg = byDate[d]._categoryAgg;
    byDate[d].categories = Object.values(agg).sort((a, b) => b.sales - a.sales);
    delete byDate[d]._categoryAgg;
  }

  return { byDate, presentCombinations };
}

/**
 * 同一 date / 同一 location group の 2 つの dayMetrics を合算 (ALL モード live 集計用)。
 */
function mergeDayMetrics(base, delta) {
  if (!base) {
    // delta が categories[] を持っているのでそのまま deep copy
    return {
      total_amount: delta.total_amount,
      transaction_count: delta.transaction_count,
      customer_count: delta.customer_count,
      new_customer_count: delta.new_customer_count,
      repeat_customer_count: delta.repeat_customer_count,
      regular_customer_count: delta.regular_customer_count,
      staff_customer_count: delta.staff_customer_count,
      unlisted_customer_count: delta.unlisted_customer_count,
      new_sales: delta.new_sales,
      repeat_sales: delta.repeat_sales,
      regular_sales: delta.regular_sales,
      staff_sales: delta.staff_sales,
      unlisted_sales: delta.unlisted_sales,
      open_total_amount: delta.open_total_amount,
      open_order_count: delta.open_order_count,
      categories: (delta.categories || []).map((c) => ({ ...c })),
    };
  }

  base.total_amount += delta.total_amount;
  base.transaction_count += delta.transaction_count;
  base.customer_count += delta.customer_count;
  base.new_customer_count += delta.new_customer_count;
  base.repeat_customer_count += delta.repeat_customer_count;
  base.regular_customer_count += delta.regular_customer_count;
  base.staff_customer_count += delta.staff_customer_count;
  base.unlisted_customer_count += delta.unlisted_customer_count;
  base.new_sales += delta.new_sales;
  base.repeat_sales += delta.repeat_sales;
  base.regular_sales += delta.regular_sales;
  base.staff_sales += delta.staff_sales;
  base.unlisted_sales += delta.unlisted_sales;
  base.open_total_amount += delta.open_total_amount;
  base.open_order_count += delta.open_order_count;

  // categories 合算 (category_name キー)
  const catMap = new Map();
  for (const c of base.categories || []) {
    catMap.set(c.category_name, { ...c });
  }
  for (const c of delta.categories || []) {
    const existing = catMap.get(c.category_name);
    if (!existing) {
      catMap.set(c.category_name, { ...c });
    } else {
      existing.sales += c.sales;
      existing.item_count += c.item_count;
      if (!existing.category_id && c.category_id) {
        existing.category_id = c.category_id;
      }
    }
  }
  base.categories = Array.from(catMap.values()).sort((a, b) => b.sales - a.sales);
  return base;
}

export default async (req, res) => {
  if (setCors(req, res)) return res.status(200).end();

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // P0-1: 認可チェック (storeLabel ベース)
  const auth = validateToken(req);
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const { storeLabel } = auth;

  const { start_date, end_date, location_id, start_hour } = req.query;

  if (!start_date || !end_date || !location_id) {
    return res
      .status(400)
      .json({ error: 'start_date, end_date and location_id are required' });
  }

  if (typeof location_id !== 'string') {
    return res.status(400).json({ error: 'location_id must be a single string' });
  }

  // P2-8: date 形式 + 実在チェック (round-trip)
  if (!isValidDateStr(start_date) || !isValidDateStr(end_date)) {
    return res
      .status(400)
      .json({ error: 'start_date / end_date must be valid YYYY-MM-DD' });
  }

  if (start_date > end_date) {
    return res
      .status(400)
      .json({ error: 'start_date must be <= end_date' });
  }

  const startHour = Math.max(
    0,
    Math.min(23, parseInt(start_hour ?? '13', 10) || 13)
  );

  // P0-1: storeLabel != 'ALL' のとき location_id='ALL' を拒否
  const isAll =
    typeof location_id === 'string' && location_id.toUpperCase() === 'ALL';
  if (storeLabel !== 'ALL' && isAll) {
    return res.status(403).json({ error: 'Not authorized for ALL mode' });
  }

  try {
    const dates = getDateArray(start_date, end_date);
    const todayBusinessDate = getTodayBusinessDate(startHour);
    // N=0 を明示的にサポート (ロールバック lever): `|| 1` だと 0 が 1 に置換される falsy bug を回避
    const _parsedLiveWindow = Number.parseInt(process.env.SQ_LIVE_WINDOW_DAYS ?? '1', 10);
    const liveWindowDays = Number.isNaN(_parsedLiveWindow) ? 1 : Math.max(0, Math.min(7, _parsedLiveWindow));
    const shortRange = dates.length <= SHORT_RANGE_THRESHOLD;
    const useAggregate = isAggregateEnabled();

    // P1-3: 未来日除外 + USE_AGGREGATE flag 対応
    //   - 当日 (todayBusinessDate) のみ live
    //   - 過去日は aggregate (USE_AGGREGATE=false なら live にロールバック)
    //   - 未来日は空 metrics で埋め
    //   - shortRange かつ aggregate 有効でも全部 live (リアルタイム優先・既存挙動維持)
    //   - shortRange かつ aggregate 無効でも全部 live (同上)
    const futureDates = dates.filter((d) => d > todayBusinessDate);
    let liveDates;
    let aggregateDates;
    if (!useAggregate) {
      // 緊急ロールバック: 全期間 live (未来日除く)
      liveDates = dates.filter((d) => d <= todayBusinessDate);
      aggregateDates = [];
    } else if (shortRange) {
      liveDates = dates.filter((d) => d <= todayBusinessDate);
      aggregateDates = [];
    } else {
      const liveBoundary = subtractBusinessDays(todayBusinessDate, liveWindowDays);
      liveDates = dates.filter((d) => d >= liveBoundary && d <= todayBusinessDate);
      aggregateDates = dates.filter((d) => d < liveBoundary);
    }

    // location_id 解決 (ALL / 単一) + storeLabel フィルタ
    let targetLocationIds;
    if (isAll) {
      const locs = await fetchTargetLocations();
      targetLocationIds = locs.map((l) => l.id);
      if (targetLocationIds.length === 0) {
        return res
          .status(500)
          .json({ error: 'No target locations matched on Square' });
      }
    } else {
      // ALL も非ALLも、必ず fetchTargetLocations() の id 集合に intersect
      const locs = await fetchTargetLocations();
      const allowedAll = new Set(locs.map((l) => l.id));
      if (storeLabel !== 'ALL') {
        const ownLocs = locs.filter((l) => l.name && l.name.includes(storeLabel));
        const allowed = new Set(ownLocs.map((l) => l.id));
        if (!allowed.has(location_id)) {
          return res.status(403).json({ error: 'Not authorized for this location' });
        }
      } else {
        if (!allowedAll.has(location_id)) {
          return res.status(403).json({ error: 'Unknown location_id' });
        }
      }
      targetLocationIds = [location_id];
    }

    const metaWarnings = [];

    // 1. 集計テーブル分 (過去日) — 失敗時は live にフォールバック (P1-4)
    let byDate = {};
    let presentCombinations = new Set();
    let aggregateFellBackToLive = false;
    if (aggregateDates.length > 0) {
      try {
        const aggResult = await fetchAggregateData({
          dates: aggregateDates,
          locationIds: targetLocationIds,
          startHour,
        });
        byDate = aggResult.byDate;
        presentCombinations = aggResult.presentCombinations;
      } catch (aggErr) {
        console.error(
          '[sales-range] aggregate fallback to live:',
          aggErr && aggErr.message ? aggErr.message : String(aggErr)
        );
        metaWarnings.push({
          type: 'aggregate_fallback',
          error: aggErr && aggErr.message ? aggErr.message : String(aggErr),
        });
        // 集計テーブル分も live に流す
        liveDates = [...liveDates, ...aggregateDates];
        aggregateDates = [];
        aggregateFellBackToLive = true;
      }
    }

    // 2. P1-6: 部分欠損検知 (集計テーブル参照ケース && fallback 起きてない時のみ)
    let missingCombinations = [];
    if (!aggregateFellBackToLive && aggregateDates.length > 0) {
      for (const d of aggregateDates) {
        for (const locId of targetLocationIds) {
          if (!presentCombinations.has(`${d}|${locId}`)) {
            missingCombinations.push({ business_date: d, location_id: locId });
          }
        }
      }
    }

    // 3. live 分 (Square 直叩き) を date × location で並列実行 → 同 date は合算
    //    P1-5: Promise.allSettled で失敗 location を partial_failures に記録、成功分は返す
    const partialFailures = [];
    if (liveDates.length > 0) {
      const tasks = [];
      for (const d of liveDates) {
        for (const locId of targetLocationIds) {
          tasks.push(
            aggregateLiveDay({ locationId: locId, date: d, startHour }).then(
              (metrics) => ({ date: d, locationId: locId, metrics })
            )
          );
        }
      }
      const settled = await Promise.allSettled(tasks);
      for (let i = 0; i < settled.length; i++) {
        const r = settled[i];
        if (r.status === 'fulfilled') {
          const { date, metrics } = r.value;
          byDate[date] = mergeDayMetrics(byDate[date] || null, metrics);
        } else {
          // 失敗した tasks[i] に対応する date / locId を再算出
          const dateIdx = Math.floor(i / targetLocationIds.length);
          const locIdx = i % targetLocationIds.length;
          const failedDate = liveDates[dateIdx];
          const failedLoc = targetLocationIds[locIdx];
          const errMsg =
            r.reason && r.reason.message
              ? r.reason.message
              : String(r.reason);
          console.error(
            `[sales-range] live aggregate failed: date=${failedDate} loc=${failedLoc} err=${errMsg}`
          );
          partialFailures.push({
            business_date: failedDate,
            location_id: failedLoc,
            error: errMsg,
          });
        }
      }
    }

    // 4. 欠損 date を空 metrics で埋める (集計テーブル row が無い過去日 / 未来日 / 失敗 live)
    for (const d of dates) {
      if (!byDate[d]) {
        byDate[d] = emptyDayMetrics();
      }
    }

    // 5. P1-7: 各 dayMetrics に segments nested を付与 (flat も維持)
    for (const d of Object.keys(byDate)) {
      byDate[d].segments = buildSegmentsView(byDate[d]);
    }

    // 6. source 決定
    let source;
    if (dates.length > 0 && futureDates.length === dates.length) {
      source = 'empty'; // 全日が未来日
    } else if (!useAggregate) {
      source = 'live';
    } else if (liveDates.length > 0 && aggregateDates.length > 0) {
      source = 'hybrid';
    } else if (liveDates.length > 0) {
      source = 'live';
    } else {
      source = 'aggregate';
    }

    const meta = {
      source,
      location_ids: targetLocationIds,
      live_dates: liveDates,
      aggregate_dates: aggregateDates,
      future_dates: futureDates,
      use_aggregate: useAggregate,
      live_window_days: liveWindowDays,
    };
    if (missingCombinations.length > 0) {
      meta.missing_combinations = missingCombinations;
    }
    if (partialFailures.length > 0) {
      meta.partial_failures = partialFailures;
    }
    if (metaWarnings.length > 0) {
      meta.warnings = metaWarnings;
    }

    return res.status(200).json({ byDate, meta });
  } catch (err) {
    const fullMessage = err && err.stack ? `${err.message}\n${err.stack}` : String(err);
    console.error('sales-range error:', fullMessage);
    return res.status(500).json({ error: 'Internal server error', detail: err && err.message ? err.message : String(err) });
  }
};
