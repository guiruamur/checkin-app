import { describe, expect, it, vi, beforeEach } from 'vitest';

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }));

vi.mock('../../lib/supabase', () => ({
  supabase: { from: mockFrom },
}));

import {
  listEvents, getEvent, createEvent, updateEvent, archiveEvent, restoreEvent,
  listActiveClients, listApprovedWorkers,
  listAssignments, addAssignment, updateAssignment, removeAssignment,
} from './api';

// Query chainable: cada metodo devuelve el mismo objeto; es thenable para
// resolver en await, y .single/.maybeSingle resuelven el result.
function makeQuery(result: { data: unknown; error: unknown }) {
  const q: Record<string, unknown> = {};
  for (const m of ['select', 'insert', 'update', 'eq', 'is', 'order']) {
    q[m] = vi.fn(() => q);
  }
  q.single = vi.fn(() => Promise.resolve(result));
  q.maybeSingle = vi.fn(() => Promise.resolve(result));
  q.then = (resolve: (v: unknown) => unknown) => resolve(result);
  return q;
}

beforeEach(() => {
  mockFrom.mockReset();
});

describe('listEvents', () => {
  it('selects events with client join ordered by starts_at asc', async () => {
    const q = makeQuery({ data: [{ id: 'e1', name: 'Boda', clients: { name: 'Bodega X' } }], error: null });
    mockFrom.mockReturnValue(q);
    const r = await listEvents();
    expect(mockFrom).toHaveBeenCalledWith('events');
    expect(q.select).toHaveBeenCalledWith('*, clients(name)');
    expect(q.order).toHaveBeenCalledWith('starts_at', { ascending: true });
    expect(r).toEqual([{ id: 'e1', name: 'Boda', clients: { name: 'Bodega X' } }]);
  });
  it('throws on error', async () => {
    mockFrom.mockReturnValue(makeQuery({ data: null, error: { message: 'rls' } }));
    await expect(listEvents()).rejects.toThrow('rls');
  });
});

describe('getEvent', () => {
  it('returns single event with client join', async () => {
    const q = makeQuery({ data: { id: 'e1', clients: { name: 'X' } }, error: null });
    mockFrom.mockReturnValue(q);
    const r = await getEvent('e1');
    expect(q.eq).toHaveBeenCalledWith('id', 'e1');
    expect(r).toEqual({ id: 'e1', clients: { name: 'X' } });
  });
  it('returns null when not found', async () => {
    mockFrom.mockReturnValue(makeQuery({ data: null, error: null }));
    expect(await getEvent('nope')).toBeNull();
  });
});

describe('createEvent', () => {
  it('inserts and returns the new id', async () => {
    const q = makeQuery({ data: { id: 'new-id' }, error: null });
    mockFrom.mockReturnValue(q);
    const input = {
      client_id: 'c1', name: 'Boda', address: 'Calle 1',
      organizer_email: 'o@x.com', starts_at: '2026-05-20T08:00:00.000Z', ends_at: '2026-05-20T20:00:00.000Z',
    };
    const id = await createEvent(input);
    expect(q.insert).toHaveBeenCalledWith(input);
    expect(q.select).toHaveBeenCalledWith('id');
    expect(id).toBe('new-id');
  });
  it('throws on error', async () => {
    mockFrom.mockReturnValue(makeQuery({ data: null, error: { message: 'check' } }));
    await expect(createEvent({
      client_id: 'c1', name: 'B', address: 'A', organizer_email: 'o@x.com',
      starts_at: 'x', ends_at: 'y',
    })).rejects.toThrow('check');
  });
});

describe('updateEvent / archiveEvent / restoreEvent', () => {
  it('updateEvent updates by id', async () => {
    const q = makeQuery({ data: null, error: null });
    mockFrom.mockReturnValue(q);
    await updateEvent('e1', {
      client_id: 'c1', name: 'B', address: 'A', organizer_email: 'o@x.com', starts_at: 'x', ends_at: 'y',
    });
    expect(q.update).toHaveBeenCalled();
    expect(q.eq).toHaveBeenCalledWith('id', 'e1');
  });
  it('archiveEvent sets archived_at', async () => {
    const q = makeQuery({ data: null, error: null });
    mockFrom.mockReturnValue(q);
    await archiveEvent('e1');
    expect(q.update).toHaveBeenCalledWith(expect.objectContaining({ archived_at: expect.any(String) }));
  });
  it('restoreEvent nulls archived_at', async () => {
    const q = makeQuery({ data: null, error: null });
    mockFrom.mockReturnValue(q);
    await restoreEvent('e1');
    expect(q.update).toHaveBeenCalledWith({ archived_at: null });
  });
});

describe('selects', () => {
  it('listActiveClients filters archived null', async () => {
    const q = makeQuery({ data: [{ id: 'c1', name: 'X', contact_email: 'x@x.com' }], error: null });
    mockFrom.mockReturnValue(q);
    const r = await listActiveClients();
    expect(mockFrom).toHaveBeenCalledWith('clients');
    expect(q.is).toHaveBeenCalledWith('archived_at', null);
    expect(r).toEqual([{ id: 'c1', name: 'X', contact_email: 'x@x.com' }]);
  });
  it('listApprovedWorkers filters status approved + archived null', async () => {
    const q = makeQuery({ data: [{ id: 'w1', first_name: 'Ana', last_name: 'P' }], error: null });
    mockFrom.mockReturnValue(q);
    const r = await listApprovedWorkers();
    expect(mockFrom).toHaveBeenCalledWith('workers');
    expect(q.eq).toHaveBeenCalledWith('status', 'approved');
    expect(q.is).toHaveBeenCalledWith('archived_at', null);
    expect(r).toEqual([{ id: 'w1', first_name: 'Ana', last_name: 'P' }]);
  });
});

describe('assignments', () => {
  it('listAssignments selects by event with worker join', async () => {
    const q = makeQuery({ data: [{ id: 'a1', workers: { first_name: 'Ana', last_name: 'P' } }], error: null });
    mockFrom.mockReturnValue(q);
    const r = await listAssignments('e1');
    expect(mockFrom).toHaveBeenCalledWith('event_assignments');
    expect(q.select).toHaveBeenCalledWith('*, workers(first_name, last_name)');
    expect(q.eq).toHaveBeenCalledWith('event_id', 'e1');
    expect(r).toEqual([{ id: 'a1', workers: { first_name: 'Ana', last_name: 'P' } }]);
  });
  it('addAssignment inserts the row', async () => {
    const q = makeQuery({ data: null, error: null });
    mockFrom.mockReturnValue(q);
    await addAssignment('e1', 'w1', '2026-05-20T08:00:00.000Z', '2026-05-20T20:00:00.000Z');
    expect(q.insert).toHaveBeenCalledWith({
      event_id: 'e1', worker_id: 'w1',
      scheduled_start: '2026-05-20T08:00:00.000Z', scheduled_end: '2026-05-20T20:00:00.000Z',
    });
  });
  it('updateAssignment updates schedule by id', async () => {
    const q = makeQuery({ data: null, error: null });
    mockFrom.mockReturnValue(q);
    await updateAssignment('a1', '2026-05-20T09:00:00.000Z', '2026-05-20T13:00:00.000Z');
    expect(q.update).toHaveBeenCalledWith({
      scheduled_start: '2026-05-20T09:00:00.000Z', scheduled_end: '2026-05-20T13:00:00.000Z',
    });
    expect(q.eq).toHaveBeenCalledWith('id', 'a1');
  });
  it('removeAssignment deletes by id', async () => {
    const q = makeQuery({ data: null, error: null });
    (q as Record<string, unknown>).delete = vi.fn(() => q);
    mockFrom.mockReturnValue(q);
    await removeAssignment('a1');
    expect((q as Record<string, unknown>).delete).toHaveBeenCalled();
    expect(q.eq).toHaveBeenCalledWith('id', 'a1');
  });
});
