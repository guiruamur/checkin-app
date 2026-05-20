import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ClienteForm } from './ClienteForm';
import type { Client } from './types';

const existing: Client = {
  id: 'c1', company_id: 'co', name: 'Bodega X', contact_email: 'info@bodega.com',
  phone: '912345678', notes: 'Cliente habitual', created_at: '2026-05-19T10:00:00Z',
  archived_at: null,
};

describe('ClienteForm', () => {
  it('renders empty fields for create mode', () => {
    render(<ClienteForm onSubmit={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByLabelText(/nombre/i)).toHaveValue('');
    expect(screen.getByLabelText(/email de contacto/i)).toHaveValue('');
  });

  it('prefills fields in edit mode', () => {
    render(<ClienteForm client={existing} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByLabelText(/nombre/i)).toHaveValue('Bodega X');
    expect(screen.getByLabelText(/email de contacto/i)).toHaveValue('info@bodega.com');
    expect(screen.getByLabelText(/teléfono/i)).toHaveValue('912345678');
    expect(screen.getByLabelText(/notas/i)).toHaveValue('Cliente habitual');
  });

  it('shows required errors when submitted empty', async () => {
    render(<ClienteForm onSubmit={vi.fn()} onCancel={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /guardar/i }));
    expect(await screen.findAllByText(/obligatorio/i)).not.toHaveLength(0);
  });

  it('shows email format error', async () => {
    render(<ClienteForm onSubmit={vi.fn()} onCancel={vi.fn()} />);
    await userEvent.type(screen.getByLabelText(/nombre/i), 'X');
    await userEvent.type(screen.getByLabelText(/email de contacto/i), 'no-es-email');
    await userEvent.click(screen.getByRole('button', { name: /guardar/i }));
    expect(await screen.findByText(/email inválido/i)).toBeInTheDocument();
  });

  it('shows phone format error for letters', async () => {
    render(<ClienteForm onSubmit={vi.fn()} onCancel={vi.fn()} />);
    await userEvent.type(screen.getByLabelText(/nombre/i), 'X');
    await userEvent.type(screen.getByLabelText(/email de contacto/i), 'x@y.com');
    await userEvent.type(screen.getByLabelText(/teléfono/i), 'abc');
    await userEvent.click(screen.getByRole('button', { name: /guardar/i }));
    expect(await screen.findByText(/teléfono inválido/i)).toBeInTheDocument();
  });

  it('calls onSubmit with normalized payload, omitting empty optionals', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<ClienteForm onSubmit={onSubmit} onCancel={vi.fn()} />);
    await userEvent.type(screen.getByLabelText(/nombre/i), 'Bodega X');
    await userEvent.type(screen.getByLabelText(/email de contacto/i), 'info@bodega.com');
    await userEvent.click(screen.getByRole('button', { name: /guardar/i }));
    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalled());
    const payload = onSubmit.mock.calls[0][0];
    expect(payload).toEqual({ name: 'Bodega X', contact_email: 'info@bodega.com' });
    expect(payload.phone).toBeUndefined();
    expect(payload.notes).toBeUndefined();
  });

  it('calls onCancel when cancel button clicked', async () => {
    const onCancel = vi.fn();
    render(<ClienteForm onSubmit={vi.fn()} onCancel={onCancel} />);
    await userEvent.click(screen.getByRole('button', { name: /cancelar/i }));
    expect(onCancel).toHaveBeenCalled();
  });
});
