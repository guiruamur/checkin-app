import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi, beforeEach } from 'vitest';

const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }));
vi.mock('react-router-dom', async (orig) => {
  const actual = await orig<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('./api', () => ({
  listEvents: vi.fn(),
  createEvent: vi.fn(),
  archiveEvent: vi.fn(),
  restoreEvent: vi.fn(),
  listActiveClients: vi.fn(),
}));

import { listEvents, createEvent, archiveEvent, listActiveClients } from './api';
import { EventosList } from './EventosList';
import type { EventWithClient } from './types';

// Fechas robustas independientes del reloj real: 2099 siempre es futuro,
// 2020 siempre es pasado. Evita fake timers (que cuelgan con userEvent v14).
const FUTURE = '2099-07-01T08:00:00.000Z';
const FUTURE_END = '2099-07-01T20:00:00.000Z';
const PAST = '2020-05-01T08:00:00.000Z';
const PAST_END = '2020-05-01T20:00:00.000Z';

function mkEvent(over: Partial<EventWithClient> = {}): EventWithClient {
  return {
    id: crypto.randomUUID(), company_id: 'co', client_id: 'c1', name: 'Evento',
    address: 'Calle 1', organizer_email: 'o@x.com', access_token: 'tok',
    starts_at: FUTURE, ends_at: FUTURE_END,
    last_confirmation_sent_at: null, created_at: '2020-01-01T10:00:00Z', archived_at: null,
    clients: { name: 'Bodega X' },
    ...over,
  };
}

beforeEach(() => {
  vi.mocked(listEvents).mockReset();
  vi.mocked(createEvent).mockReset();
  vi.mocked(archiveEvent).mockReset();
  vi.mocked(listActiveClients).mockReset().mockResolvedValue([]);
  mockNavigate.mockReset();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

function renderList() {
  return render(<MemoryRouter><EventosList /></MemoryRouter>);
}

describe('EventosList', () => {
  it('shows upcoming events by default (starts_at >= now, not archived)', async () => {
    vi.mocked(listEvents).mockResolvedValue([
      mkEvent({ name: 'Futuro', starts_at: FUTURE }),
      mkEvent({ name: 'Pasado', starts_at: PAST, ends_at: PAST_END }),
    ]);
    renderList();
    expect(await screen.findByText('Futuro')).toBeInTheDocument();
    expect(screen.queryByText('Pasado')).not.toBeInTheDocument();
  });

  it('switches to Pasados tab', async () => {
    vi.mocked(listEvents).mockResolvedValue([
      mkEvent({ name: 'Futuro', starts_at: FUTURE }),
      mkEvent({ name: 'Pasado', starts_at: PAST, ends_at: PAST_END }),
    ]);
    renderList();
    await screen.findByText('Futuro');
    await userEvent.click(screen.getByRole('button', { name: /pasados/i }));
    expect(await screen.findByText('Pasado')).toBeInTheDocument();
    expect(screen.queryByText('Futuro')).not.toBeInTheDocument();
  });

  it('switches to Archivados tab', async () => {
    vi.mocked(listEvents).mockResolvedValue([
      mkEvent({ name: 'Activo' }),
      mkEvent({ name: 'Archivado', archived_at: '2020-06-10T10:00:00.000Z' }),
    ]);
    renderList();
    await screen.findByText('Activo');
    await userEvent.click(screen.getByRole('button', { name: /archivados/i }));
    expect(await screen.findByText('Archivado')).toBeInTheDocument();
  });

  it('filters by name search', async () => {
    vi.mocked(listEvents).mockResolvedValue([
      mkEvent({ name: 'Boda Pérez', starts_at: FUTURE }),
      mkEvent({ name: 'Congreso', starts_at: FUTURE }),
    ]);
    renderList();
    await screen.findByText('Boda Pérez');
    await userEvent.type(screen.getByPlaceholderText(/buscar/i), 'congreso');
    expect(screen.getByText('Congreso')).toBeInTheDocument();
    expect(screen.queryByText('Boda Pérez')).not.toBeInTheDocument();
  });

  it('creates event and navigates to its detail', async () => {
    vi.mocked(listEvents).mockResolvedValue([]);
    vi.mocked(listActiveClients).mockResolvedValue([{ id: 'c1', name: 'Bodega X', contact_email: 'info@x.com' }]);
    vi.mocked(createEvent).mockResolvedValue('new-id');
    renderList();
    await screen.findByText(/sin eventos/i);
    await userEvent.click(screen.getByRole('button', { name: /nuevo evento/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText(/cliente/i), 'c1');
    await userEvent.type(screen.getByLabelText(/nombre/i), 'Nueva Boda');
    await userEvent.type(screen.getByLabelText(/dirección/i), 'Calle 1');
    await userEvent.type(screen.getByLabelText(/inicio/i), '2099-07-01T08:00');
    await userEvent.type(screen.getByLabelText(/fin/i), '2099-07-01T20:00');
    await userEvent.click(screen.getByRole('button', { name: /guardar/i }));
    await vi.waitFor(() => expect(createEvent).toHaveBeenCalled());
    await vi.waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/admin/eventos/new-id'));
  });

  it('archives an event with confirm and refetches', async () => {
    const e = mkEvent({ name: 'Futuro', starts_at: FUTURE });
    vi.mocked(listEvents)
      .mockResolvedValueOnce([e])
      .mockResolvedValueOnce([{ ...e, archived_at: '2099-06-15T12:00:00.000Z' }]);
    vi.mocked(archiveEvent).mockResolvedValue(undefined);
    renderList();
    await screen.findByText('Futuro');
    await userEvent.click(screen.getByRole('button', { name: /archivar/i }));
    expect(window.confirm).toHaveBeenCalled();
    expect(archiveEvent).toHaveBeenCalledWith(e.id);
    await vi.waitFor(() => expect(listEvents).toHaveBeenCalledTimes(2));
  });

  it('shows error banner when listEvents throws', async () => {
    vi.mocked(listEvents).mockRejectedValue(new Error('rls denied'));
    renderList();
    expect(await screen.findByText(/error al cargar/i)).toBeInTheDocument();
  });
});
