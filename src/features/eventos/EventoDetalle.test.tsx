import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('./api', () => ({
  getEvent: vi.fn(),
  updateEvent: vi.fn(),
  listActiveClients: vi.fn(),
  listAssignments: vi.fn(),
  addAssignment: vi.fn(),
  updateAssignment: vi.fn(),
  removeAssignment: vi.fn(),
  listApprovedWorkers: vi.fn(),
}));

import { getEvent, listActiveClients, listAssignments, listApprovedWorkers } from './api';
import { EventoDetalle } from './EventoDetalle';
import type { EventWithClient } from './types';

const EVENT: EventWithClient = {
  id: 'e1', company_id: 'co', client_id: 'c1', name: 'Boda Pérez', address: 'Calle 1',
  organizer_email: 'o@x.com', access_token: 'tok-abc', starts_at: '2026-07-01T08:00:00.000Z',
  ends_at: '2026-07-01T20:00:00.000Z', last_confirmation_sent_at: null,
  created_at: '2026-06-01T10:00:00Z', archived_at: null,
  clients: { name: 'Bodega X' },
};

beforeEach(() => {
  vi.mocked(getEvent).mockReset();
  vi.mocked(listActiveClients).mockReset().mockResolvedValue([]);
  vi.mocked(listAssignments).mockReset().mockResolvedValue([]);
  vi.mocked(listApprovedWorkers).mockReset().mockResolvedValue([]);
});

describe('EventoDetalle', () => {
  it('shows "not found" when event is null', async () => {
    vi.mocked(getEvent).mockResolvedValue(null);
    render(<EventoDetalle eventId="nope" />);
    expect(await screen.findByText(/evento no encontrado/i)).toBeInTheDocument();
  });

  it('renders event data, client name and QR with token', async () => {
    vi.mocked(getEvent).mockResolvedValue(EVENT);
    render(<EventoDetalle eventId="e1" />);
    expect(await screen.findByText('Boda Pérez')).toBeInTheDocument();
    expect(screen.getByText(/Bodega X/)).toBeInTheDocument();
    expect(screen.getByText(/\/e\/tok-abc$/)).toBeInTheDocument();
  });

  it('opens edit modal on Editar', async () => {
    vi.mocked(getEvent).mockResolvedValue(EVENT);
    render(<EventoDetalle eventId="e1" />);
    await screen.findByText('Boda Pérez');
    await userEvent.click(screen.getByRole('button', { name: /editar/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('renders the assignments section', async () => {
    vi.mocked(getEvent).mockResolvedValue(EVENT);
    render(<EventoDetalle eventId="e1" />);
    expect(await screen.findByText(/trabajadores asignados/i)).toBeInTheDocument();
  });
});
