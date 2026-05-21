import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import {
  SCHEMA,
  getServiceClient,
  getAnonClient,
  __resetClientCacheForTest,
} from './_supabase.js';

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}));

describe('api/_supabase.js', () => {
  let originalEnv;

  beforeEach(() => {
    __resetClientCacheForTest();
    vi.clearAllMocks();

    let callCount = 0;
    createClient.mockImplementation(() => {
      callCount += 1;
      return { id: callCount };
    });

    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('throws if SQUARE_DASHBOARD_SUPABASE_URL is not set when calling getServiceClient()', () => {
    delete process.env.SQUARE_DASHBOARD_SUPABASE_URL;
    process.env.SQUARE_DASHBOARD_SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';

    expect(() => getServiceClient()).toThrow();
  });

  it('throws if SQUARE_DASHBOARD_SUPABASE_URL is not set when calling getAnonClient()', () => {
    delete process.env.SQUARE_DASHBOARD_SUPABASE_URL;
    process.env.SQUARE_DASHBOARD_SUPABASE_ANON_KEY = 'test-anon-key';

    expect(() => getAnonClient()).toThrow();
  });

  it('throws if SQUARE_DASHBOARD_SUPABASE_SERVICE_ROLE_KEY is not set when calling getServiceClient()', () => {
    process.env.SQUARE_DASHBOARD_SUPABASE_URL = 'http://localhost';
    delete process.env.SQUARE_DASHBOARD_SUPABASE_SERVICE_ROLE_KEY;

    expect(() => getServiceClient()).toThrow();
  });

  it('throws if SQUARE_DASHBOARD_SUPABASE_ANON_KEY is not set when calling getAnonClient()', () => {
    process.env.SQUARE_DASHBOARD_SUPABASE_URL = 'http://localhost';
    delete process.env.SQUARE_DASHBOARD_SUPABASE_ANON_KEY;

    expect(() => getAnonClient()).toThrow();
  });

  it('returns the same instance when getServiceClient() is called twice', () => {
    process.env.SQUARE_DASHBOARD_SUPABASE_URL = 'http://localhost';
    process.env.SQUARE_DASHBOARD_SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';

    const first = getServiceClient();
    const second = getServiceClient();

    expect(first).toBe(second);
    expect(createClient).toHaveBeenCalledTimes(1);
  });

  it('returns the same instance when getAnonClient() is called twice', () => {
    process.env.SQUARE_DASHBOARD_SUPABASE_URL = 'http://localhost';
    process.env.SQUARE_DASHBOARD_SUPABASE_ANON_KEY = 'test-anon-key';

    const first = getAnonClient();
    const second = getAnonClient();

    expect(first).toBe(second);
    expect(createClient).toHaveBeenCalledTimes(1);
  });

  it('returns different instances for service and anon clients', () => {
    process.env.SQUARE_DASHBOARD_SUPABASE_URL = 'http://localhost';
    process.env.SQUARE_DASHBOARD_SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
    process.env.SQUARE_DASHBOARD_SUPABASE_ANON_KEY = 'test-anon-key';

    const serviceClient = getServiceClient();
    const anonClient = getAnonClient();

    expect(serviceClient).not.toBe(anonClient);
    expect(createClient).toHaveBeenCalledTimes(2);
  });

  it('passes db.schema as square_dashboard to createClient (service role)', () => {
    process.env.SQUARE_DASHBOARD_SUPABASE_URL = 'http://localhost';
    process.env.SQUARE_DASHBOARD_SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';

    getServiceClient();

    expect(createClient).toHaveBeenCalledWith(
      'http://localhost',
      'test-service-key',
      expect.objectContaining({
        db: { schema: 'square_dashboard' },
      })
    );
  });

  it('passes db.schema as square_dashboard to createClient (anon)', () => {
    process.env.SQUARE_DASHBOARD_SUPABASE_URL = 'http://localhost';
    process.env.SQUARE_DASHBOARD_SUPABASE_ANON_KEY = 'test-anon-key';

    getAnonClient();

    expect(createClient).toHaveBeenCalledWith(
      'http://localhost',
      'test-anon-key',
      expect.objectContaining({
        db: { schema: 'square_dashboard' },
      })
    );
  });

  it('sets auth.persistSession and autoRefreshToken to false in createClient', () => {
    process.env.SQUARE_DASHBOARD_SUPABASE_URL = 'http://localhost';
    process.env.SQUARE_DASHBOARD_SUPABASE_ANON_KEY = 'test-anon-key';

    getAnonClient();

    expect(createClient).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      })
    );
  });

  it('exports SCHEMA as square_dashboard', () => {
    expect(SCHEMA).toBe('square_dashboard');
  });
});
