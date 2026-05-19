import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AgendaTable } from './AgendaTable';
import type { Worker } from './types';

const base: Worker = {
  id: 'w1', company_id: 'co', email: 'a@x.com', phone: '600',
  first_name: 'Ana', last_name: 'López', postal_code: null,
  languages: ['español'], experience_summary: null,
  status: 'pending', approved_at: null, approved_by: null,
  archived_at: null, created_at: '2026-05-17T10:00:00Z',
};

const callbacks = {
  onApprove: vi.fn(), onReject: vi.fn(), onArchive: vi.fn(), onView: vi.fn(),
};

describe('AgendaTable', () => {
  it('shows empty state when workers is empty', () => {
    render(<AgendaTable workers={[]} {...callbacks} />);
    expect(screen.getByText(/sin candidatos/i)).toBeInTheDocument();
  });

  it('renders one row per worker with name and email', () => {
    render(<AgendaTable workers={[base, { ...base, id: 'w2', first_name: 'Beto' }]} {...callbacks} />);
    expect(screen.getByText(/Ana López/)).toBeInTheDocument();
    expect(screen.getByText(/Beto López/)).toBeInTheDocument();
  });

  it('shows Approve, Reject, Archive, View for pending non-archived', async () => {
    render(<AgendaTable workers={[base]} {...callbacks} />);
    expect(screen.getByRole('button', { name: /aprobar/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /rechazar/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /archivar/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ver/i })).toBeInTheDocument();
  });

  it('shows only Archive and View for approved non-archived', () => {
    render(<AgendaTable workers={[{ ...base, status: 'approved' }]} {...callbacks} />);
    expect(screen.queryByRole('button', { name: /aprobar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /rechazar/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /archivar/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ver/i })).toBeInTheDocument();
  });

  it('shows only View for archived workers', () => {
    render(<AgendaTable workers={[{ ...base, archived_at: '2026-05-18T10:00:00Z' }]} {...callbacks} />);
    expect(screen.queryByRole('button', { name: /aprobar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /rechazar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /archivar/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ver/i })).toBeInTheDocument();
  });

  it('calls onApprove with worker id', async () => {
    const fns = { ...callbacks, onApprove: vi.fn() };
    render(<AgendaTable workers={[base]} {...fns} />);
    await userEvent.click(screen.getByRole('button', { name: /aprobar/i }));
    expect(fns.onApprove).toHaveBeenCalledWith('w1');
  });

  it('calls onView with worker object', async () => {
    const fns = { ...callbacks, onView: vi.fn() };
    render(<AgendaTable workers={[base]} {...fns} />);
    await userEvent.click(screen.getByRole('button', { name: /ver/i }));
    expect(fns.onView).toHaveBeenCalledWith(base);
  });
});
