import { describe, expect, it, vi, beforeEach } from 'vitest';

const { mockSelect, mockOrder, mockInsert, mockUpdate, mockEq, mockFrom } = vi.hoisted(() => {
  const mockOrder = vi.fn();
  const mockSelect = vi.fn(() => ({ order: mockOrder }));
  const mockEq = vi.fn();
  const mockInsert = vi.fn();
  const mockUpdate = vi.fn(() => ({ eq: mockEq }));
  const mockFrom = vi.fn(() => ({
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
  }));
  return { mockSelect, mockOrder, mockInsert, mockUpdate, mockEq, mockFrom };
});

vi.mock('../../lib/supabase', () => ({
  supabase: { from: mockFrom },
}));

import { listClients, createClient, updateClient, archiveClient, restoreClient } from './api';

beforeEach(() => {
  mockOrder.mockReset();
  mockSelect.mockReset().mockReturnValue({ order: mockOrder });
  mockEq.mockReset();
  mockInsert.mockReset();
  mockUpdate.mockReset().mockReturnValue({ eq: mockEq });
});

describe('listClients', () => {
  it('returns rows ordered by name', async () => {
    mockOrder.mockResolvedValue({ data: [{ id: 'c1', name: 'Ana' }], error: null });
    const r = await listClients();
    expect(mockFrom).toHaveBeenCalledWith('clients');
    expect(mockSelect).toHaveBeenCalledWith('*');
    expect(mockOrder).toHaveBeenCalledWith('name', { ascending: true });
    expect(r).toEqual([{ id: 'c1', name: 'Ana' }]);
  });
  it('throws on error', async () => {
    mockOrder.mockResolvedValue({ data: null, error: { message: 'rls' } });
    await expect(listClients()).rejects.toThrow('rls');
  });
  it('returns [] when data is null', async () => {
    mockOrder.mockResolvedValue({ data: null, error: null });
    expect(await listClients()).toEqual([]);
  });
});

describe('createClient', () => {
  it('inserts the input without company_id', async () => {
    mockInsert.mockResolvedValue({ error: null });
    await createClient({ name: 'X', contact_email: 'x@y.com' });
    expect(mockInsert).toHaveBeenCalledWith({ name: 'X', contact_email: 'x@y.com' });
  });
  it('throws on error', async () => {
    mockInsert.mockResolvedValue({ error: { message: 'check' } });
    await expect(createClient({ name: 'X', contact_email: 'x@y.com' })).rejects.toThrow('check');
  });
});

describe('updateClient', () => {
  it('updates fields by id', async () => {
    mockEq.mockResolvedValue({ error: null });
    await updateClient('c1', { name: 'Y', contact_email: 'y@y.com' });
    expect(mockUpdate).toHaveBeenCalledWith({ name: 'Y', contact_email: 'y@y.com' });
    expect(mockEq).toHaveBeenCalledWith('id', 'c1');
  });
  it('throws on error', async () => {
    mockEq.mockResolvedValue({ error: { message: 'boom' } });
    await expect(updateClient('c1', { name: 'Y', contact_email: 'y@y.com' })).rejects.toThrow('boom');
  });
});

describe('archiveClient', () => {
  it('sets archived_at to a timestamp', async () => {
    mockEq.mockResolvedValue({ error: null });
    await archiveClient('c1');
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ archived_at: expect.any(String) }));
    expect(mockEq).toHaveBeenCalledWith('id', 'c1');
  });
});

describe('restoreClient', () => {
  it('sets archived_at to null', async () => {
    mockEq.mockResolvedValue({ error: null });
    await restoreClient('c1');
    expect(mockUpdate).toHaveBeenCalledWith({ archived_at: null });
    expect(mockEq).toHaveBeenCalledWith('id', 'c1');
  });
});
