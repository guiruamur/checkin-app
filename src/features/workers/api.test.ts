import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const { mockGetSession, mockUpdate, mockEq, mockFrom } = vi.hoisted(() => {
  const mockEq = vi.fn();
  const mockUpdate = vi.fn(() => ({ eq: mockEq }));
  const mockFrom = vi.fn(() => ({
    update: mockUpdate,
    select: () => ({ order: () => Promise.resolve({ data: [], error: null }) }),
  }));
  const mockGetSession = vi.fn();
  return { mockGetSession, mockUpdate, mockEq, mockFrom };
});

vi.mock('../../lib/env', () => ({
  env: { VITE_SUPABASE_URL: 'http://stub', VITE_SUPABASE_ANON_KEY: 'anon' },
}));

vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: { getSession: mockGetSession },
    from: mockFrom,
  },
}));

import {
  lookupCompanyBySlug,
  requestWorkerRegistration,
  verifyWorkerRegistration,
  approveWorker,
  rejectWorker,
  archiveWorker,
} from './api';

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
  mockGetSession.mockReset();
  mockUpdate.mockReset();
  mockEq.mockReset();
  mockUpdate.mockReturnValue({ eq: mockEq });
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('lookupCompanyBySlug', () => {
  it('returns ok with name on 200', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true, status: 200, json: () => Promise.resolve({ name: 'Eventos Pérez' }),
    });
    const r = await lookupCompanyBySlug('eventos-perez');
    expect(r).toEqual({ ok: true, name: 'Eventos Pérez' });
  });
  it('returns not_found on 404', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false, status: 404, json: () => Promise.resolve({ error: 'not_found' }),
    });
    const r = await lookupCompanyBySlug('nope');
    expect(r).toEqual({ ok: false, error: 'not_found' });
  });
  it('returns network on fetch throw', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('boom'));
    const r = await lookupCompanyBySlug('x');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('network');
  });
});

describe('requestWorkerRegistration', () => {
  const input = {
    company_slug: 'x', first_name: 'A', last_name: 'B',
    email: 'a@b.com', phone: '600000000', languages: ['español' as const],
  };
  it('ok on 200', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true, status: 200, json: () => Promise.resolve({}),
    });
    const r = await requestWorkerRegistration(input);
    expect(r).toEqual({ ok: true });
  });
  it('validation on 400 with known error', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false, status: 400, json: () => Promise.resolve({ error: 'validation' }),
    });
    const r = await requestWorkerRegistration(input);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('validation');
  });
  it('email_send_failed on 500 with known error', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false, status: 500, json: () => Promise.resolve({ error: 'email_send_failed' }),
    });
    const r = await requestWorkerRegistration(input);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('email_send_failed');
  });
});

describe('verifyWorkerRegistration', () => {
  it('ok with company_name on 200', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true, status: 200, json: () => Promise.resolve({ company_name: 'X' }),
    });
    const r = await verifyWorkerRegistration('tok');
    expect(r).toEqual({ ok: true, company_name: 'X' });
  });
  it('invalid_token on 400', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false, status: 400, json: () => Promise.resolve({ error: 'invalid_token' }),
    });
    const r = await verifyWorkerRegistration('tok');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('invalid_token');
  });
  it('token_expired on 400', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false, status: 400, json: () => Promise.resolve({ error: 'token_expired' }),
    });
    const r = await verifyWorkerRegistration('tok');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('token_expired');
  });
});

describe('approveWorker', () => {
  it('no_session when not logged in', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    const r = await approveWorker('w1');
    expect(r).toEqual({ ok: false, error: 'no_session' });
  });
  it('ok on 200 from edge function', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { access_token: 't' } } });
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true, status: 200, json: () => Promise.resolve({ ok: true }),
    });
    const r = await approveWorker('w1');
    expect(r).toEqual({ ok: true, email_warning: undefined });
  });
  it('passes email_warning through', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { access_token: 't' } } });
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true, status: 200, json: () => Promise.resolve({ ok: true, email_warning: true }),
    });
    const r = await approveWorker('w1');
    expect(r).toEqual({ ok: true, email_warning: true });
  });
});

describe('rejectWorker', () => {
  it('calls supabase update with status=rejected and archived_at', async () => {
    mockEq.mockResolvedValue({ error: null });
    await rejectWorker('w1');
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
      status: 'rejected',
      archived_at: expect.any(String),
    }));
    expect(mockEq).toHaveBeenCalledWith('id', 'w1');
  });
  it('throws on supabase error', async () => {
    mockEq.mockResolvedValue({ error: { message: 'rls' } });
    await expect(rejectWorker('w1')).rejects.toThrow('rls');
  });
});

describe('archiveWorker', () => {
  it('calls supabase update with archived_at only', async () => {
    mockEq.mockResolvedValue({ error: null });
    await archiveWorker('w1');
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ archived_at: expect.any(String) }));
    expect(mockUpdate).toHaveBeenCalledWith(expect.not.objectContaining({ status: expect.anything() }));
  });
});
