import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./_shared.js', () => ({
  setCors: vi.fn(() => false),
  validateToken: vi.fn(() => ({ user: 'test' })),
  parseRangeTimeRange: vi.fn(() => ({ beginTimeJST: 'b', endTimeJST: 'e' })),
  computeBusinessDate: vi.fn(() => '2026-04-01'),
  fetchCustomers: vi.fn(async () => ({})),
  squareHeaders: vi.fn(() => ({})),
}));

// 35 日ガードは fetch (Square API) より前に発火するので fetch は呼ばれない想定。
// ただし境界 OK ケースのため fetch をスタブしておく。
vi.stubGlobal(
  'fetch',
  vi.fn(async () =>
    new Response(JSON.stringify({ orders: [], cursor: undefined }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  ),
);

const { default: handler } = await import('./open-orders-range.js');

function makeRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    end() {
      return this;
    },
  };
}

function makeReq(query) {
  return { method: 'GET', query, headers: {} };
}

describe('api/open-orders-range — 入力検証ガード', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('期間 36 日で 400 + period_too_long を返す', async () => {
    const req = makeReq({
      start_date: '2026-04-01',
      end_date: '2026-05-06',
      location_id: 'L1',
    });
    const res = makeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('period_too_long');
    expect(res.body.max_days).toBe(35);
    expect(res.body.requested_days).toBe(36);
  });

  it('start_date > end_date で 400 + invalid_date_range を返す', async () => {
    const req = makeReq({
      start_date: '2026-04-30',
      end_date: '2026-04-01',
      location_id: 'L1',
    });
    const res = makeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('invalid_date_range');
  });

  it('不正日付 2026-02-31 で 400 + invalid_date を返す', async () => {
    const req = makeReq({
      start_date: '2026-02-31',
      end_date: '2026-03-01',
      location_id: 'L1',
    });
    const res = makeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('invalid_date');
  });

  it('120 日のリクエストで requested_days=120 を返す', async () => {
    const req = makeReq({
      start_date: '2026-01-01',
      end_date: '2026-04-30',
      location_id: 'L1',
    });
    const res = makeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('period_too_long');
    expect(res.body.requested_days).toBe(120);
  });

  it('必須パラメータ未指定で 400 を返す (既存挙動)', async () => {
    const req = makeReq({});
    const res = makeRes();
    await handler(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/location_id/);
  });
});
