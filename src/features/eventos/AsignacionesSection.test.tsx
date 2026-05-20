import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('./api', () => ({
  listAssignments: vi.fn(),
  addAssignment: vi.fn(),
  updateAssignment: vi.fn(),
  removeAssignment: vi.fn(),
  listApprovedWorkers: vi.fn(),
}));

import { listAssignments, addAssignment, removeAssignment, listApprovedWorkers } from './api';
import { AsignacionesSection } from './AsignacionesSection';
import type { AssignmentWithWorker } from './types';

function mkAssignment(over: Partial<AssignmentWithWorker> = {}): AssignmentWithWorker {
  return {
    id: crypto.randomUUID(), event_id: 'e1', worker_id: 'w1',
    scheduled_start: '2026-07-01T08:00:00.000Z', scheduled_end: '2026-07-01T20:00:00.000Z',
    created_at: '2026-06-01T10:00:00Z',
    workers: { first_name: 'Ana', last_name: 'Pérez' },
    ...over,
  };
}

const PROPS = {
  eventId: 'e1',
  eventStart: '2026-07-01T08:00:00.000Z',
  eventEnd: '2026-07-01T20:00:00.000Z',
};

beforeEach(() => {
  vi.mocked(listAssignments).mockReset();
  vi.mocked(addAssignment).mockReset();
  vi.mocked(removeAssignment).mockReset();
  vi.mocked(listApprovedWorkers).mockReset().mockResolvedValue([
    { id: 'w1', first_name: 'Ana', last_name: 'Pérez' },
    { id: 'w2', first_name: 'Beto', last_name: 'López' },
  ]);
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

describe('AsignacionesSection', () => {
  it('shows empty state when no assignments', async () => {
    vi.mocked(listAssignments).mockResolvedValue([]);
    render(<AsignacionesSection {...PROPS} />);
    expect(await screen.findByText(/sin trabajadores asignados/i)).toBeInTheDocument();
  });

  it('lists existing assignments with worker name', async () => {
    vi.mocked(listAssignments).mockResolvedValue([mkAssignment()]);
    render(<AsignacionesSection {...PROPS} />);
    expect(await screen.findByText(/Ana Pérez/)).toBeInTheDocument();
  });

  it('adds a worker with the event schedule by default', async () => {
    vi.mocked(listAssignments)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([mkAssignment()]);
    vi.mocked(addAssignment).mockResolvedValue(undefined);
    render(<AsignacionesSection {...PROPS} />);
    await screen.findByText(/sin trabajadores asignados/i);
    await userEvent.type(screen.getByPlaceholderText(/buscar trabajador/i), 'Ana');
    await userEvent.click(screen.getByRole('button', { name: /añadir Ana Pérez/i }));
    expect(addAssignment).toHaveBeenCalledWith('e1', 'w1', PROPS.eventStart, PROPS.eventEnd);
    await vi.waitFor(() => expect(listAssignments).toHaveBeenCalledTimes(2));
  });

  it('duplicates an assignment (split shift)', async () => {
    const a = mkAssignment();
    vi.mocked(listAssignments)
      .mockResolvedValueOnce([a])
      .mockResolvedValueOnce([a, mkAssignment({ id: 'a2' })]);
    vi.mocked(addAssignment).mockResolvedValue(undefined);
    render(<AsignacionesSection {...PROPS} />);
    await screen.findByText(/Ana Pérez/);
    await userEvent.click(screen.getByRole('button', { name: /duplicar/i }));
    expect(addAssignment).toHaveBeenCalledWith('e1', a.worker_id, a.scheduled_start, a.scheduled_end);
    await vi.waitFor(() => expect(listAssignments).toHaveBeenCalledTimes(2));
  });

  it('removes an assignment with confirm', async () => {
    const a = mkAssignment();
    vi.mocked(listAssignments)
      .mockResolvedValueOnce([a])
      .mockResolvedValueOnce([]);
    vi.mocked(removeAssignment).mockResolvedValue(undefined);
    render(<AsignacionesSection {...PROPS} />);
    await screen.findByText(/Ana Pérez/);
    await userEvent.click(screen.getByRole('button', { name: /quitar/i }));
    expect(window.confirm).toHaveBeenCalled();
    expect(removeAssignment).toHaveBeenCalledWith(a.id);
    await vi.waitFor(() => expect(listAssignments).toHaveBeenCalledTimes(2));
  });
});
