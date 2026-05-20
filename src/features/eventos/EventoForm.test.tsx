import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { EventoForm } from './EventoForm';
import type { Event } from './types';

const clients = [
  { id: 'c1', name: 'Bodega X', contact_email: 'info@bodega.com' },
  { id: 'c2', name: 'Ayto Y', contact_email: 'town@y.com' },
];

const existing: Event = {
  id: 'e1', company_id: 'co', client_id: 'c1', name: 'Boda', address: 'Calle 1',
  organizer_email: 'o@x.com', access_token: 'tok', starts_at: '2026-05-20T06:00:00.000Z',
  ends_at: '2026-05-20T18:00:00.000Z', last_confirmation_sent_at: null,
  created_at: '2026-05-19T10:00:00Z', archived_at: null,
};

describe('EventoForm', () => {
  it('renders client options', () => {
    render(<EventoForm clients={clients} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole('option', { name: 'Bodega X' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Ayto Y' })).toBeInTheDocument();
  });

  it('shows required errors on empty submit', async () => {
    render(<EventoForm clients={clients} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /guardar/i }));
    expect(await screen.findAllByText(/obligatorio|selecciona/i)).not.toHaveLength(0);
  });

  it('autofills organizer_email from selected client when empty', async () => {
    render(<EventoForm clients={clients} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    await userEvent.selectOptions(screen.getByLabelText(/cliente/i), 'c1');
    expect(screen.getByLabelText(/email del organizador/i)).toHaveValue('info@bodega.com');
  });

  it('shows error when ends_at is before starts_at', async () => {
    render(<EventoForm clients={clients} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    await userEvent.selectOptions(screen.getByLabelText(/cliente/i), 'c1');
    await userEvent.type(screen.getByLabelText(/nombre/i), 'Boda');
    await userEvent.type(screen.getByLabelText(/dirección/i), 'Calle 1');
    await userEvent.type(screen.getByLabelText(/inicio/i), '2026-05-20T20:00');
    await userEvent.type(screen.getByLabelText(/fin/i), '2026-05-20T10:00');
    await userEvent.click(screen.getByRole('button', { name: /guardar/i }));
    expect(await screen.findByText(/posterior al inicio/i)).toBeInTheDocument();
  });

  it('prefills fields in edit mode', () => {
    render(<EventoForm clients={clients} event={existing} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByLabelText(/nombre/i)).toHaveValue('Boda');
    expect(screen.getByLabelText(/dirección/i)).toHaveValue('Calle 1');
    expect(screen.getByLabelText(/email del organizador/i)).toHaveValue('o@x.com');
  });

  it('calls onSubmit with ISO dates on valid submit', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<EventoForm clients={clients} onSubmit={onSubmit} onCancel={vi.fn()} />);
    await userEvent.selectOptions(screen.getByLabelText(/cliente/i), 'c1');
    await userEvent.type(screen.getByLabelText(/nombre/i), 'Boda');
    await userEvent.type(screen.getByLabelText(/dirección/i), 'Calle 1');
    await userEvent.type(screen.getByLabelText(/inicio/i), '2026-05-20T08:00');
    await userEvent.type(screen.getByLabelText(/fin/i), '2026-05-20T20:00');
    await userEvent.click(screen.getByRole('button', { name: /guardar/i }));
    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalled());
    const payload = onSubmit.mock.calls[0][0];
    expect(payload.client_id).toBe('c1');
    expect(payload.name).toBe('Boda');
    expect(payload.starts_at).toMatch(/Z$/);
    expect(payload.ends_at).toMatch(/Z$/);
  });
});
