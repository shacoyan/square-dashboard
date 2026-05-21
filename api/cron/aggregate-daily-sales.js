import { getSdbClient } from '../_supabase.js';
import {
  squareHeaders,
  fetchAllPayments,
  fetchOrdersBatch,
  fetchCatalogVariationCategoryMap,
  normalizePaymentsForReporting,
} from '../_shared.js';
import { aggregateSegments } from '../_segments.js';

/**
 * 対象 7 店舗の Square location 名（部分一致でフィルタ）。
 * Square 側の location.name は完全一致しない可能性があるため、
 * includes() でマッチさせる方針（既存 api/locations.js と同じ挙動）。
 */
const TARGET_LOCATION_NAMES = [
  'Goodbye',
  'KITUNE',
  'LR',
  'moumou',
  '吸暮',
  '狛犬',
  '金魚',
];

/**
 * Square API 部分失敗の閾値。
 * orders 取得成功率がこれを下回った場合、status=failed として記録する。
 */
const ORDERS_SUCCESS_RATE_THRESHOLD = 0.8;

/**
 * start_hour を境界とした「営業日 1 日分」の JST 期間を生成する。
 * 例: target_date=2026-05-20, startHour=0 → 05-20T00:00:00+09:00 〜 05-21T00:00:00+09:00
 *     target_date=2026-05-20, startHour=10 → 05-20T10:00:00+09:00 〜 05-21T10:00:00+09:00
 */
export function parseBusinessDayRange({ date, startHour }) {
  const [yStr, mStr, dStr] = date.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  const d = Number(dStr);

  // JST 暦日を直接インクリメントし、Date.UTC で月/年/うるう年またぎを自動処理する。
  // 旧実装は new Date(JST 文字列) → setUTCDate(+1) → JST 復元という UTC 経由のため、
  // JST 0 時起点 (UTC 内部 = 前日 15:00Z) のときに getUTCDate() が前日値となり、
  // +1 しても UTC 日付が当日に戻るだけで JST に戻すと元と同一日付となるゼロ長範囲バグがあった。
  const nextTimeMs = Date.UTC(y, m - 1, d + 1);
  const nextDate = new Date(nextTimeMs);
  const ny = nextDate.getUTCFullYear();
  const nm = String(nextDate.getUTCMonth() + 1).padStart(2, '0');
  const nd = String(nextDate.getUTCDate()).padStart(2, '0');
  const nextDateStr = `${ny}-${nm}-${nd}`;

  const sh = String(startHour).padStart(2, '0');
  const beginTimeJST = `${date}T${sh}:00:00+09:00`;
  const endTimeJST = `${nextDateStr}T${sh}:00:00+09:00`;

  return { beginTimeJST, endTimeJST };
}

/**
 * JST における「前日」を YYYY-MM-DD で返す。
 */
function getJSTYesterday() {
  const nowMs = Date.now();
  const jstNow = new Date(nowMs + 9 * 60 * 60 * 1000);
  jstNow.setUTCDate(jstNow.getUTCDate() - 1);
  const y = jstNow.getUTCFullYear();
  const m = String(jstNow.getUTCMonth() + 1).padStart(2, '0');
  const d = String(jstNow.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * 対象 7 店舗の Square locations を取得する。
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
 * 指定 location / 期間の OPEN orders (未決済) を取得する。
 * - エラー時は { open_total_amount: 0, open_count: 0, error: string } を返す。
 *   open_orders 失敗は致命的ではないため partial_failure として扱う。
 */
async function fetchOpenOrdersForLocation(locationId, beginTimeJST, endTimeJST) {
  try {
    // cursor pagination で OPEN orders を完全取得する。
    // 旧実装は limit:100 の 1 回コールのみで、100 件超の店舗は過少集計だった
    // (しかも `partial_failure` にもならない silent な取りこぼし)。
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
        const errText = await response.text();
        return {
          open_total_amount: 0,
          open_count: 0,
          error: `Square /v2/orders/search OPEN failed: ${response.status} - ${errText}`,
        };
      }

      const data = await response.json();
      rawOrders.push(...(data.orders ?? []));
      cursor = data.cursor ?? undefined;
    } while (cursor);

    const open_total_amount = rawOrders.reduce(
      (sum, o) => sum + (o.total_money?.amount ?? 0),
      0
    );
    const open_count = rawOrders.length;
    return { open_total_amount, open_count };
  } catch (err) {
    const errMsg = err && err.stack ? `${err.message}\n${err.stack}` : String(err);
    return { open_total_amount: 0, open_count: 0, error: errMsg };
  }
}

/**
 * 1 店舗 1 日分の集計を行う。
 * 返り値:
 *  {
 *    totalAmount, transactionCount, customerCount,
 *    categoryAgg, squareApiCalls,
 *    partialFailure, ordersSuccessRate, openOrdersError,
 *    segments: { customers, sales, acquisition },
 *    openTotalAmount, openOrderCount,
 *  }
 */
async function aggregateLocationDay({ locationId, beginTimeJST, endTimeJST }) {
  let squareApiCalls = 0;
  let partialFailure = false;
  let ordersSuccessRate = 1.0;
  let openOrdersError = null;

  // 1. payments 取得 + 正規化
  const rawPayments = await fetchAllPayments({
    beginTimeJST,
    endTimeJST,
    location_id: locationId,
  });
  squareApiCalls += 1;
  const payments = normalizePaymentsForReporting(rawPayments);

  // 2. order_id 集約 → orders / catalog 取得
  const orderIds = [...new Set(payments.map((p) => p.order_id).filter(Boolean))];

  let ordersMap = {};
  let variationCategoryMap = {};

  if (orderIds.length > 0) {
    ordersMap = await fetchOrdersBatch(orderIds);
    squareApiCalls += 1;

    // Square API 部分失敗検知: orders 取得成功率
    const fetchedOrderKeys = Object.keys(ordersMap).length;
    ordersSuccessRate = orderIds.length > 0 ? fetchedOrderKeys / orderIds.length : 1;
    if (fetchedOrderKeys < orderIds.length) {
      partialFailure = true;
    }

    variationCategoryMap = await fetchCatalogVariationCategoryMap(ordersMap);
    squareApiCalls += 1;
  }

  // 3. KPI + カテゴリ別集計
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

    // 売上ありの line_items のみ集計対象
    const positiveItems = lineItems.filter(
      (it) => parseFloat(it.quantity || '0') > 0
    );

    if (positiveItems.length === 0) {
      // line_items 取れない場合は '不明' へ全額
      if (!categoryAgg['不明']) {
        categoryAgg['不明'] = { category_id: null, sales: 0, item_count: 0 };
      }
      categoryAgg['不明'].sales += paymentAmount;
      categoryAgg['不明'].item_count += 1;
      continue;
    }

    // line_items の total_money.amount 比率で payment amount を按分。
    // floor + remainder を最終 line に寄せる方式 (_segments.js と同じ思想)。
    // 合計が paymentAmount と一致することを保証する。
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

      // Engineer D 変更後: variationCategoryMap[varId] = { id, name } | null
      const catInfo = variationId ? variationCategoryMap[variationId] : null;
      const categoryName = catInfo?.name || '不明';
      const categoryId = catInfo?.id || null;

      let allocatedSales;
      if (i === positiveItems.length - 1) {
        // 最後の line item に remainder を寄せる
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
        // 既存エントリに category_id が無く、今回 id が取れたら埋める
        categoryAgg[categoryName].category_id = categoryId;
      }
      categoryAgg[categoryName].sales += allocatedSales;
      categoryAgg[categoryName].item_count += quantity;
    }
  }

  // 4. セグメント別集計 (new/repeat/regular/staff/unlisted)
  //    _segments.js の Transaction 型に合わせて変換
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

  // 5. 未決済 (open orders) 取得
  const openOrdersResult = await fetchOpenOrdersForLocation(
    locationId,
    beginTimeJST,
    endTimeJST
  );
  squareApiCalls += 1;
  if (openOrdersResult.error) {
    partialFailure = true;
    openOrdersError = openOrdersResult.error;
  }

  return {
    totalAmount,
    transactionCount,
    customerCount: customerIdSet.size,
    categoryAgg,
    squareApiCalls,
    partialFailure,
    ordersSuccessRate,
    openOrdersError,
    segments,
    openTotalAmount: openOrdersResult.open_total_amount,
    openOrderCount: openOrdersResult.open_count,
  };
}

export default async function handler(req, res) {
  const startedAt = Date.now();
  let runId = null;
  let supabase = null;
  let targetDate = null;

  try {
    // 1. secret 認証 (クエリ or Authorization Bearer)
    //    Vercel Cron は標準 env `CRON_SECRET` を Authorization Bearer に自動付与するため両対応。
    //    querySecret と bearerSecret は独立判定: どちらか片方が cronSecret に一致すれば OK。
    //    (OR 判定で `querySecret || bearerSecret` を取ると、誤った ?secret=xxx + 正しい Bearer の組合せで 401 になる)
    const cronSecret =
      process.env.SQUARE_DASHBOARD_CRON_SECRET || process.env.CRON_SECRET;
    const querySecret = req.query?.secret;
    const authHeader = req.headers?.authorization;
    const bearerSecret =
      authHeader && authHeader.startsWith('Bearer ')
        ? authHeader.slice(7)
        : null;

    const queryMatches = !!querySecret && querySecret === cronSecret;
    const bearerMatches = !!bearerSecret && bearerSecret === cronSecret;

    if (!cronSecret || (!queryMatches && !bearerMatches)) {
      return res
        .status(401)
        .json({ ok: false, error: 'Unauthorized: invalid or missing secret' });
    }

    // 2. supabase service_role client
    supabase = getSdbClient({ serviceRole: true });

    // 3. parameters
    const explicitTargetDate = req.query?.target_date || null;
    targetDate = explicitTargetDate || getJSTYesterday();
    const targetLocationId = req.query?.location_id || null;

    // start_hour: 0〜23 の range にクランプ (NaN/範囲外は 0 に丸める)
    const rawStartHour = req.query?.start_hour;
    const startHour =
      rawStartHour === undefined || rawStartHour === null
        ? 0
        : Math.max(0, Math.min(23, parseInt(rawStartHour, 10) || 0));

    const runType = explicitTargetDate ? 'manual_retry' : 'daily_cron';
    const source = explicitTargetDate ? 'manual' : 'cron';

    // 4. aggregation_runs INSERT (status=running)
    const { data: runRow, error: runError } = await supabase
      .from('aggregation_runs')
      .insert({
        run_type: runType,
        target_date: targetDate,
        target_location_id: targetLocationId,
        started_at: new Date().toISOString(),
        status: 'running',
      })
      .select('id')
      .single();

    if (runError) {
      throw new Error(`aggregation_runs INSERT failed: ${runError.message}`);
    }
    runId = runRow.id;

    // 5. 対象店舗取得
    const allTargetLocations = await fetchTargetLocations();
    let locations = allTargetLocations;
    if (targetLocationId) {
      locations = allTargetLocations.filter((l) => l.id === targetLocationId);
      if (locations.length === 0) {
        throw new Error(
          `Location not found in target list: ${targetLocationId}`
        );
      }
    }

    let totalRowsUpserted = 0;
    let totalSquareApiCalls = 1; // /v2/locations 1 回分
    let overallPartialFailure = false;
    let anyCriticalFailure = false;
    const locationsWithPartialFailure = [];
    const locationFailureDetails = [];

    // 6. 各店舗を直列処理 (Square レート制限 9req/sec を超えないため)
    for (const location of locations) {
      const { beginTimeJST, endTimeJST } = parseBusinessDayRange({
        date: targetDate,
        startHour,
      });

      const agg = await aggregateLocationDay({
        locationId: location.id,
        beginTimeJST,
        endTimeJST,
      });
      totalSquareApiCalls += agg.squareApiCalls;

      if (agg.partialFailure) {
        overallPartialFailure = true;
        locationsWithPartialFailure.push(location.id);
        locationFailureDetails.push({
          location_id: location.id,
          location_name: location.name || location.id || 'Unknown',
          orders_success_rate: agg.ordersSuccessRate,
          open_orders_error: agg.openOrdersError,
        });
        if (agg.ordersSuccessRate < ORDERS_SUCCESS_RATE_THRESHOLD) {
          anyCriticalFailure = true;
        }
      }

      const nowIso = new Date().toISOString();
      // location.name が空のときは id, それも無ければ 'Unknown' に fallback
      const locationName = location.name || location.id || 'Unknown';

      // 6a. daily_sales UPSERT
      const dailySalesRow = {
        business_date: targetDate,
        location_id: location.id,
        location_name: locationName,
        start_hour: startHour,
        total_amount: agg.totalAmount,
        transaction_count: agg.transactionCount,
        customer_count: agg.customerCount,
        // セグメント別 (new/repeat/regular/staff/unlisted)
        new_customer_count: agg.segments.customers.new,
        repeat_customer_count: agg.segments.customers.repeat,
        regular_customer_count: agg.segments.customers.regular,
        staff_customer_count: agg.segments.customers.staff,
        unlisted_customer_count: agg.segments.customers.unlisted,
        new_sales: agg.segments.sales.new,
        repeat_sales: agg.segments.sales.repeat,
        regular_sales: agg.segments.sales.regular,
        staff_sales: agg.segments.sales.staff,
        unlisted_sales: agg.segments.sales.unlisted,
        // 未決済 (open orders)
        open_total_amount: agg.openTotalAmount,
        open_order_count: agg.openOrderCount,
        aggregated_at: nowIso,
        source,
      };

      const { error: dsError } = await supabase
        .from('daily_sales')
        .upsert(dailySalesRow, {
          onConflict: 'business_date,location_id,start_hour',
        });

      if (dsError) {
        throw new Error(
          `daily_sales UPSERT failed for ${location.id}: ${dsError.message}`
        );
      }
      totalRowsUpserted += 1;

      // 6b. daily_sales_by_category UPSERT
      //     UPSERT のみだと過去存在したが今回消えたカテゴリ行がテーブルに残り
      //     SUM(daily_sales_by_category.sales) ≠ daily_sales.total_amount の不整合になる。
      //     冪等性を保ちつつ stale row を排除するため、同 (business_date, location_id, start_hour) キーで
      //     先に DELETE → INSERT の DELETE+INSERT パターンを採用する。
      //     (再実行時も同 data を再投入するだけなので冪等)
      const { error: catDelError } = await supabase
        .from('daily_sales_by_category')
        .delete()
        .eq('business_date', targetDate)
        .eq('location_id', location.id)
        .eq('start_hour', startHour);

      if (catDelError) {
        throw new Error(
          `daily_sales_by_category DELETE (stale row purge) failed for ${location.id}: ${catDelError.message}`
        );
      }

      const categoryRows = Object.entries(agg.categoryAgg).map(
        ([categoryName, c]) => ({
          business_date: targetDate,
          location_id: location.id,
          start_hour: startHour,
          category_id: c.category_id,
          category_name: categoryName,
          sales: c.sales,
          item_count: c.item_count,
          aggregated_at: nowIso,
          source,
        })
      );

      if (categoryRows.length > 0) {
        const { error: catError } = await supabase
          .from('daily_sales_by_category')
          .insert(categoryRows);

        if (catError) {
          throw new Error(
            `daily_sales_by_category INSERT failed for ${location.id}: ${catError.message}`
          );
        }
        totalRowsUpserted += categoryRows.length;
      }
    }

    // 7. aggregation_runs success / partial / failed の判定
    //    - orders 取得成功率 < 0.8 の店舗があれば status=failed
    //    - その他の partial_failure (open_orders エラー等) は status=success + metadata.partial_failure=true
    const durationMs = Date.now() - startedAt;

    const metadata = {
      location_count: locations.length,
      duration_ms: durationMs,
      partial_failure: overallPartialFailure,
      locations_with_partial_failure: locationsWithPartialFailure,
      location_failure_details: locationFailureDetails,
    };

    const finalStatus = anyCriticalFailure ? 'failed' : 'success';
    const finalErrorMessage = anyCriticalFailure
      ? `Critical partial failure: orders_success_rate < ${ORDERS_SUCCESS_RATE_THRESHOLD} for one or more locations. Details: ${JSON.stringify(locationFailureDetails)}`
      : null;

    await supabase
      .from('aggregation_runs')
      .update({
        finished_at: new Date().toISOString(),
        status: finalStatus,
        rows_upserted: totalRowsUpserted,
        square_api_calls: totalSquareApiCalls,
        metadata,
        error_message: finalErrorMessage,
      })
      .eq('id', runId);

    // critical failure (orders_success_rate < 閾値) のときは HTTP 500 を返し、
    // Vercel Cron / 監視に明示的な失敗として伝える。
    // partial_failure (open_orders 失敗等の軽微なもの) は 200 のまま OK。
    const responseBody = {
      ok: !anyCriticalFailure,
      run_id: runId,
      target_date: targetDate,
      location_count: locations.length,
      rows_upserted: totalRowsUpserted,
      square_api_calls: totalSquareApiCalls,
      duration_ms: durationMs,
      partial_failure: overallPartialFailure,
      locations_with_partial_failure: locationsWithPartialFailure,
    };

    if (anyCriticalFailure) {
      return res.status(500).json({
        ...responseBody,
        error: finalErrorMessage,
      });
    }

    return res.status(200).json(responseBody);
  } catch (err) {
    // 8. aggregation_runs failed (error_message 全文保存・短縮禁止)
    const fullErrorMessage =
      err && err.stack ? `${err.message}\n${err.stack}` : String(err);
    if (runId && supabase) {
      try {
        await supabase
          .from('aggregation_runs')
          .update({
            finished_at: new Date().toISOString(),
            status: 'failed',
            error_message: fullErrorMessage,
          })
          .eq('id', runId);
      } catch (updateErr) {
        console.error(
          'Failed to update aggregation_runs (failed status):',
          updateErr
        );
      }
    }
    console.error('aggregate-daily-sales error:', fullErrorMessage);
    return res.status(500).json({
      ok: false,
      run_id: runId,
      target_date: targetDate,
      error: err && err.message ? err.message : String(err),
    });
  }
}
