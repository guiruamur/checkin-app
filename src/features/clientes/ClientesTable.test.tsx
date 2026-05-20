import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ClientesTable } from './ClientesTable';
import type { Client } from './types';

const base: Client = {
  id: 'c1', company_id: 'co', name: 'Bodega X', contact_email: 'info@bodega.com',
  phone: '912345678', notes: null, created_at: '2026-05-19T10:00:00Z', archived_at: null,
};

const callbacks = { onEdit: vi.fn(), onArchive: vi.fn(), onRestore: vi.fn() };

describe('ClientesTable', () => {
  it('shows empty state when clients is empty', () => {
    render(<ClientesTable clients={[]} {...callbacks} />);
    expect(screen.getByText(/sin clientes/i)).toBeInTheDocument();
  });

  it('renders one row per client with name, email and phone', () => {
    render(<ClientesTable clients={[base, { ...base, id: 'c2', name: 'Bodega Y' }]} {...callbacks} />);
    expect(screen.getByText('Bodega X')).toBeInTheDocument();
    expect(screen.getByText('Bodega Y')).toBeInTheDocument();
    expect(screen.getAllByText('info@bodega.com').length).toBeGreaterThan(0);
    expect(screen.getAllByText('912345678').length).toBeGreaterThan(0);
  });

  it('shows Editar and Archivar for active clients', () => {
    render(<ClientesTable clients={[base]} {...callbacks} />);
    expect(screen.getByRole('button', { name: /editar/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /archivar/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /restaurar/i })).not.toBeInTheDocument();
  });

  it('shows only Restaurar for archived clients', () => {
    render(<ClientesTable clients={[{ ...base, archived_at: '2026-05-19T12:00:00Z' }]} {...callbacks} />);
    expect(screen.queryByRole('button', { name: /editar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /archivar/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /restaurar/i })).toBeInTheDocument();
  });

  it('calls onEdit with the client object', async () => {
    const fns = { ...callbacks, onEdit: vi.fn() };
    render(<ClientesTable clients={[base]} {...fns} />);
    await userEvent.click(screen.getByRole('button', { name: /editar/i }));
    expect(fns.onEdit).toHaveBeenCalledWith(base);
  });

  it('calls onArchive with client id', async () => {
    const fns = { ...callbacks, onArchive: vi.fn() };
    render(<ClientesTable clients={[base]} {...fns} />);
    await userEvent.click(screen.getByRole('button', { name: /archivar/i }));
    expect(fns.onArchive).toHaveBeenCalledWith('c1');
  });

  it('calls onRestore with client id', async () => {
    const fns = { ...callbacks, onRestore: vi.fn() };
    render(<ClientesTable clients={[{ ...base, archived_at: '2026-05-19T12:00:00Z' }]} {...fns} />);
    await userEvent.click(screen.getByRole('button', { name: /restaurar/i }));
    expect(fns.onRestore).toHaveBeenCalledWith('c1');
  });
});
