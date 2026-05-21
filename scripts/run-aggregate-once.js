#!/usr/bin/env node
/**
 * ローカル単発実行: cron handler を mock req/res で呼ぶ。
 *
 * 使い方:
 *   node --env-file=.env scripts/run-aggregate-once.js 2026-05-20
 *   node --env-file=.env scripts/run-aggregate-once.js 2026-05-20 LXXXXXXXXXXX
 *
 * 必要環境変数:
 *   SQUARE_DASHBOARD_SUPABASE_URL
 *   SQUARE_DASHBOARD_SUPABASE_SERVICE_ROLE_KEY
 *   SQUARE_DASHBOARD_CRON_SECRET
 *   SQUARE_ACCESS_TOKEN
 */
import handler from '../api/cron/aggregate-daily-sales.js';

async function main() {
  const [, , targetDate, locationId] = process.argv;

  if (!targetDate) {
    console.error(
      'Usage: node --env-file=.env scripts/run-aggregate-once.js YYYY-MM-DD [location_id]'
    );
    process.exit(1);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
    console.error(`Invalid date format: ${targetDate}. Use YYYY-MM-DD.`);
    process.exit(1);
  }

  console.log(
    `[run-aggregate-once] start target_date=${targetDate}${
      locationId ? ` location_id=${locationId}` : ' (all target locations)'
    }`
  );
  console.log('[run-aggregate-once] env check:');
  console.log(
    `  SQUARE_DASHBOARD_SUPABASE_URL: ${
      process.env.SQUARE_DASHBOARD_SUPABASE_URL ? 'SET' : 'UNSET'
    }`
  );
  console.log(
    `  SQUARE_DASHBOARD_SUPABASE_SERVICE_ROLE_KEY: ${
      process.env.SQUARE_DASHBOARD_SUPABASE_SERVICE_ROLE_KEY ? 'SET' : 'UNSET'
    }`
  );
  console.log(
    `  SQUARE_DASHBOARD_CRON_SECRET: ${
      process.env.SQUARE_DASHBOARD_CRON_SECRET ? 'SET' : 'UNSET'
    }`
  );
  console.log(
    `  SQUARE_ACCESS_TOKEN: ${process.env.SQUARE_ACCESS_TOKEN ? 'SET' : 'UNSET'}`
  );

  const req = {
    method: 'GET',
    headers: {},
    query: {
      secret: process.env.SQUARE_DASHBOARD_CRON_SECRET,
      target_date: targetDate,
      ...(locationId ? { location_id: locationId } : {}),
    },
  };

  let statusCode = null;
  let responseBody = null;
  const res = {
    status(code) {
      statusCode = code;
      return res;
    },
    json(data) {
      responseBody = data;
      return res;
    },
    setHeader() {
      return res;
    },
    end() {
      return res;
    },
  };

  try {
    await handler(req, res);
    console.log(`[run-aggregate-once] HTTP status: ${statusCode}`);
    console.log('[run-aggregate-once] response:');
    console.log(JSON.stringify(responseBody, null, 2));
    if (statusCode && statusCode >= 400) process.exit(1);
  } catch (err) {
    console.error('[run-aggregate-once] unhandled error:', err);
    process.exit(1);
  }
}

main();
