import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('./api', () => ({
  listClients: vi.fn(),
  createClient: vi.fn(),
  updateClient: vi.fn(),
  archiveClient: vi.fn(),
  restoreClient: vi.fn(),
}));

import { listClients, createClient, archiveClient, restoreClient } from './api';
import { ClientesList } from './ClientesList';
import type { Client } from './types';

function mkClient(over: Partial<Client> = {}): Client {
  return {
    id: crypto.randomUUID(), company_id: 'co',
    name: 'Bodega X', contact_email: 'info@x.com', phone: null, notes: null,
    created_at: '2026-05-19T10:00:00Z', archived_at: null,
    ...over,
  };
}

beforeEach(() => {
  vi.mocked(listClients).mockReset();
  vi.mocked(createClient).mockReset();
  vi.mocked(archiveClient).mockReset();
  vi.mocked(restoreClient).mockReset();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

describe('ClientesList', () => {
  it('loads and renders active clients', async () => {
    vi.mocked(listClients).mockResolvedValue([mkClient({ name: 'Bodega X' })]);
    render(<ClientesList />);
    expect(await screen.findByText('Bodega X')).toBeInTheDocument();
  });

  it('hides archived clients by default, shows them with toggle', async () => {
    vi.mocked(listClients).mockResolvedValue([
      mkClient({ name: 'Activa' }),
      mkClient({ name: 'Archivada', archived_at: '2026-05-19T12:00:00Z' }),
    ]);
    render(<ClientesList />);
    await screen.findByText('Activa');
    expect(screen.queryByText('Archivada')).not.toBeInTheDocument();
    await userEvent.click(screen.getByLabelText(/mostrar archivados/i));
    expect(await screen.findByText('Archivada')).toBeInTheDocument();
    expect(screen.queryByText('Activa')).not.toBeInTheDocument();
  });

  it('filters by search term (name or email)', async () => {
    vi.mocked(listClients).mockResolvedValue([
      mkClient({ name: 'Bodega X', contact_email: 'x@x.com' }),
      mkClient({ name: 'Ayuntamiento', contact_email: 'town@y.com' }),
    ]);
    render(<ClientesList />);
    await screen.findByText('Bodega X');
    await userEvent.type(screen.getByPlaceholderText(/buscar/i), 'town');
    expect(screen.getByText('Ayuntamiento')).toBeInTheDocument();
    expect(screen.queryByText('Bodega X')).not.toBeInTheDocument();
  });

  it('opens create modal on "+ Nuevo cliente" and creates', async () => {
    vi.mocked(listClients)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([mkClient({ name: 'Nueva' })]);
    vi.mocked(createClient).mockResolvedValue(undefined);
    render(<ClientesList />);
    await screen.findByText(/sin clientes/i);
    await userEvent.click(screen.getByRole('button', { name: /nuevo cliente/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/nombre/i), 'Nueva');
    await userEvent.type(screen.getByLabelText(/email de contacto/i), 'n@n.com');
    await userEvent.click(screen.getByRole('button', { name: /guardar/i }));
    await vi.waitFor(() => expect(createClient).toHaveBeenCalledWith({ name: 'Nueva', contact_email: 'n@n.com' }));
    await vi.waitFor(() => expect(listClients).toHaveBeenCalledTimes(2));
  });

  it('archives a client with confirm and refetches', async () => {
    const c = mkClient({ name: 'Bodega X' });
    vi.mocked(listClients)
      .mockResolvedValueOnce([c])
      .mockResolvedValueOnce([{ ...c, archived_at: '2026-05-19T12:00:00Z' }]);
    vi.mocked(archiveClient).mockResolvedValue(undefined);
    render(<ClientesList />);
    await screen.findByText('Bodega X');
    await userEvent.click(screen.getByRole('button', { name: /archivar/i }));
    expect(window.confirm).toHaveBeenCalled();
    expect(archiveClient).toHaveBeenCalledWith(c.id);
    await vi.waitFor(() => expect(listClients).toHaveBeenCalledTimes(2));
  });

  it('restores an archived client and refetches', async () => {
    const c = mkClient({ name: 'Archivada', archived_at: '2026-05-19T12:00:00Z' });
    vi.mocked(listClients)
      .mockResolvedValueOnce([c])
      .mockResolvedValueOnce([{ ...c, archived_at: null }]);
    vi.mocked(restoreClient).mockResolvedValue(undefined);
    render(<ClientesList />);
    await userEvent.click(await screen.findByLabelText(/mostrar archivados/i));
    await userEvent.click(await screen.findByRole('button', { name: /restaurar/i }));
    expect(restoreClient).toHaveBeenCalledWith(c.id);
    await vi.waitFor(() => expect(listClients).toHaveBeenCalledTimes(2));
  });

  it('shows error banner when listClients throws', async () => {
    vi.mocked(listClients).mockRejectedValue(new Error('rls denied'));
    render(<ClientesList />);
    expect(await screen.findByText(/error al cargar/i)).toBeInTheDocument();
  });
});
