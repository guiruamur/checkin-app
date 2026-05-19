import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('./api', () => ({
  listWorkers: vi.fn(),
  approveWorker: vi.fn(),
  rejectWorker: vi.fn(),
  archiveWorker: vi.fn(),
}));

import { listWorkers, approveWorker, rejectWorker, archiveWorker } from './api';
import { AgendaTabs } from './AgendaTabs';
import type { Worker } from './types';

function mkWorker(over: Partial<Worker> = {}): Worker {
  return {
    id: crypto.randomUUID(), company_id: 'co',
    email: `${over.first_name ?? 'x'}@x.com`, phone: '600000000',
    first_name: 'Ana', last_name: 'López',
    postal_code: null, languages: ['español'], experience_summary: null,
    status: 'pending', approved_at: null, approved_by: null, archived_at: null,
    created_at: '2026-05-17T10:00:00Z',
    ...over,
  };
}

beforeEach(() => {
  vi.mocked(listWorkers).mockReset();
  vi.mocked(approveWorker).mockReset();
  vi.mocked(rejectWorker).mockReset();
  vi.mocked(archiveWorker).mockReset();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

describe('AgendaTabs', () => {
  it('shows loading initially then renders Aprobados tab by default', async () => {
    vi.mocked(listWorkers).mockResolvedValue([
      mkWorker({ first_name: 'Ana', status: 'approved' }),
      mkWorker({ first_name: 'Beto', status: 'pending' }),
    ]);
    render(<AgendaTabs />);
    expect(await screen.findByText(/Ana López/)).toBeInTheDocument();
    expect(screen.queryByText(/Beto López/)).not.toBeInTheDocument();
  });

  it('shows pending count badge in Pendientes tab', async () => {
    vi.mocked(listWorkers).mockResolvedValue([
      mkWorker({ first_name: 'A', status: 'pending' }),
      mkWorker({ first_name: 'B', status: 'pending' }),
      mkWorker({ first_name: 'C', status: 'approved' }),
    ]);
    render(<AgendaTabs />);
    await screen.findByText(/C López/);
    const pendingTab = screen.getByRole('button', { name: /pendientes/i });
    expect(within(pendingTab).getByText('2')).toBeInTheDocument();
  });

  it('switching to Pendientes tab shows pending workers', async () => {
    vi.mocked(listWorkers).mockResolvedValue([
      mkWorker({ first_name: 'A', status: 'pending' }),
      mkWorker({ first_name: 'B', status: 'approved' }),
    ]);
    render(<AgendaTabs />);
    await screen.findByText(/B López/);
    await userEvent.click(screen.getByRole('button', { name: /pendientes/i }));
    expect(await screen.findByText(/A López/)).toBeInTheDocument();
  });

  it('toggle "Mostrar archivados" reveals archived workers in current tab', async () => {
    vi.mocked(listWorkers).mockResolvedValue([
      mkWorker({ first_name: 'A', status: 'approved' }),
      mkWorker({ first_name: 'B', status: 'approved', archived_at: '2026-05-18T10:00:00Z' }),
    ]);
    render(<AgendaTabs />);
    await screen.findByText(/A López/);
    expect(screen.queryByText(/B López/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByLabelText(/mostrar archivados/i));
    expect(await screen.findByText(/B López/)).toBeInTheDocument();
  });

  it('search filters by name', async () => {
    vi.mocked(listWorkers).mockResolvedValue([
      mkWorker({ first_name: 'Ana', status: 'approved' }),
      mkWorker({ first_name: 'Beto', status: 'approved' }),
    ]);
    render(<AgendaTabs />);
    await screen.findByText(/Ana López/);
    await userEvent.type(screen.getByPlaceholderText(/buscar/i), 'Beto');
    expect(screen.queryByText(/Ana López/)).not.toBeInTheDocument();
    expect(screen.getByText(/Beto López/)).toBeInTheDocument();
  });

  it('approve action calls approveWorker and refetches', async () => {
    const pending = mkWorker({ first_name: 'A', status: 'pending' });
    vi.mocked(listWorkers)
      .mockResolvedValueOnce([pending])
      .mockResolvedValueOnce([{ ...pending, status: 'approved', approved_at: '2026-05-18T00:00:00Z' }]);
    vi.mocked(approveWorker).mockResolvedValue({ ok: true });
    render(<AgendaTabs />);
    await userEvent.click(screen.getByRole('button', { name: /pendientes/i }));
    await screen.findByText(/A López/);
    await userEvent.click(screen.getByRole('button', { name: /aprobar/i }));
    expect(approveWorker).toHaveBeenCalledWith(pending.id);
    await vi.waitFor(() => expect(listWorkers).toHaveBeenCalledTimes(2));
  });

  it('reject action confirms, calls rejectWorker, refetches', async () => {
    const pending = mkWorker({ first_name: 'A', status: 'pending' });
    vi.mocked(listWorkers)
      .mockResolvedValueOnce([pending])
      .mockResolvedValueOnce([{ ...pending, status: 'rejected', archived_at: '2026-05-18T00:00:00Z' }]);
    vi.mocked(rejectWorker).mockResolvedValue(undefined);
    render(<AgendaTabs />);
    await userEvent.click(screen.getByRole('button', { name: /pendientes/i }));
    await screen.findByText(/A López/);
    await userEvent.click(screen.getByRole('button', { name: /rechazar/i }));
    expect(window.confirm).toHaveBeenCalled();
    expect(rejectWorker).toHaveBeenCalledWith(pending.id);
    await vi.waitFor(() => expect(listWorkers).toHaveBeenCalledTimes(2));
  });

  it('opens worker detail modal on Ver click', async () => {
    vi.mocked(listWorkers).mockResolvedValue([mkWorker({ first_name: 'Ana', status: 'approved' })]);
    render(<AgendaTabs />);
    await userEvent.click(await screen.findByRole('button', { name: /ver/i }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('shows error banner when listWorkers throws', async () => {
    vi.mocked(listWorkers).mockRejectedValue(new Error('rls denied'));
    render(<AgendaTabs />);
    expect(await screen.findByText(/error al cargar/i)).toBeInTheDocument();
  });
});
