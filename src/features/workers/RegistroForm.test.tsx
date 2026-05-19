import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RegistroForm } from './RegistroForm';

describe('RegistroForm', () => {
  it('renders all required fields', () => {
    render(<RegistroForm onSubmit={vi.fn()} />);
    expect(screen.getByLabelText(/nombre/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/apellidos/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^email$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/teléfono/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/código postal/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/experiencia/i)).toBeInTheDocument();
    // Idiomas: hay 13 checkboxes
    const langCheckboxes = screen.getAllByRole('checkbox');
    expect(langCheckboxes.length).toBe(13);
  });

  it('shows validation errors when submitted empty', async () => {
    render(<RegistroForm onSubmit={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /enviar/i }));
    expect(await screen.findAllByText(/obligatorio/i)).not.toHaveLength(0);
  });

  it('shows phone format error', async () => {
    render(<RegistroForm onSubmit={vi.fn()} />);
    await userEvent.type(screen.getByLabelText(/teléfono/i), 'abc');
    await userEvent.click(screen.getByRole('button', { name: /enviar/i }));
    expect(await screen.findByText(/teléfono inválido/i)).toBeInTheDocument();
  });

  it('shows postal code format error', async () => {
    render(<RegistroForm onSubmit={vi.fn()} />);
    await userEvent.type(screen.getByLabelText(/código postal/i), '123');
    await userEvent.click(screen.getByRole('button', { name: /enviar/i }));
    expect(await screen.findByText(/código postal inválido/i)).toBeInTheDocument();
  });

  it('requires at least one language', async () => {
    render(<RegistroForm onSubmit={vi.fn()} />);
    // Rellenar el resto valido
    await userEvent.type(screen.getByLabelText(/nombre/i), 'Ana');
    await userEvent.type(screen.getByLabelText(/apellidos/i), 'López');
    await userEvent.type(screen.getByLabelText(/^email$/i), 'a@b.com');
    await userEvent.type(screen.getByLabelText(/teléfono/i), '600000000');
    await userEvent.click(screen.getByRole('button', { name: /enviar/i }));
    expect(await screen.findByText(/al menos un idioma/i)).toBeInTheDocument();
  });

  it('calls onSubmit with normalized payload on valid form', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<RegistroForm onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText(/nombre/i), 'Ana');
    await userEvent.type(screen.getByLabelText(/apellidos/i), 'López');
    await userEvent.type(screen.getByLabelText(/^email$/i), 'a@b.com');
    await userEvent.type(screen.getByLabelText(/teléfono/i), '600000000');
    await userEvent.click(screen.getByLabelText('español'));
    await userEvent.click(screen.getByRole('button', { name: /enviar/i }));
    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalled());
    const payload = onSubmit.mock.calls[0][0];
    expect(payload).toMatchObject({
      first_name: 'Ana',
      last_name: 'López',
      email: 'a@b.com',
      phone: '600000000',
      languages: ['español'],
    });
    // postal_code y experience_summary deben ser undefined cuando vacíos
    expect(payload.postal_code).toBeUndefined();
    expect(payload.experience_summary).toBeUndefined();
  });

  it('honeypot field is hidden but present in the DOM', () => {
    render(<RegistroForm onSubmit={vi.fn()} />);
    const honeypot = document.querySelector('input[name="website"]') as HTMLInputElement;
    expect(honeypot).toBeTruthy();
    expect(honeypot.tabIndex).toBe(-1);
    expect(honeypot.getAttribute('aria-hidden')).toBe('true');
  });

  it('submit button is disabled while submitting', async () => {
    let resolve: () => void = () => {};
    const onSubmit = vi.fn().mockReturnValue(new Promise<void>((r) => { resolve = r; }));
    render(<RegistroForm onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText(/nombre/i), 'Ana');
    await userEvent.type(screen.getByLabelText(/apellidos/i), 'López');
    await userEvent.type(screen.getByLabelText(/^email$/i), 'a@b.com');
    await userEvent.type(screen.getByLabelText(/teléfono/i), '600000000');
    await userEvent.click(screen.getByLabelText('español'));
    await userEvent.click(screen.getByRole('button', { name: /enviar/i }));
    await vi.waitFor(() => expect(screen.getByRole('button', { name: /enviando|enviar/i })).toBeDisabled());
    resolve();
  });
});
