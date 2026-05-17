import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../../features/workers/api', () => ({
  lookupCompanyBySlug: vi.fn(),
  requestWorkerRegistration: vi.fn(),
}));

import { lookupCompanyBySlug, requestWorkerRegistration } from '../../features/workers/api';
import CandidatoRegistro from './registro';

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/candidato/registro" element={<CandidatoRegistro />} />
        <Route path="/candidato/registro-enviado" element={<div>ENVIADO</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.mocked(lookupCompanyBySlug).mockReset();
  vi.mocked(requestWorkerRegistration).mockReset();
});

describe('CandidatoRegistro', () => {
  it('shows missing-slug message when ?company is absent', async () => {
    renderAt('/candidato/registro');
    expect(await screen.findByText(/falta el parámetro/i)).toBeInTheDocument();
  });

  it('shows not-found message when company lookup is 404', async () => {
    vi.mocked(lookupCompanyBySlug).mockResolvedValue({ ok: false, error: 'not_found' });
    renderAt('/candidato/registro?company=ghost');
    expect(await screen.findByText(/empresa no encontrada/i)).toBeInTheDocument();
  });

  it('renders form with company name on lookup success', async () => {
    vi.mocked(lookupCompanyBySlug).mockResolvedValue({ ok: true, name: 'Eventos Pérez' });
    renderAt('/candidato/registro?company=eventos-perez');
    expect(await screen.findByText(/Eventos Pérez/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /enviar/i })).toBeInTheDocument();
  });

  it('navigates to /registro-enviado after successful submit', async () => {
    vi.mocked(lookupCompanyBySlug).mockResolvedValue({ ok: true, name: 'X' });
    vi.mocked(requestWorkerRegistration).mockResolvedValue({ ok: true });
    renderAt('/candidato/registro?company=x');
    await screen.findByRole('button', { name: /enviar/i });
    await userEvent.type(screen.getByLabelText(/nombre/i), 'Ana');
    await userEvent.type(screen.getByLabelText(/apellidos/i), 'L');
    await userEvent.type(screen.getByLabelText(/^email$/i), 'a@b.com');
    await userEvent.type(screen.getByLabelText(/teléfono/i), '600000000');
    await userEvent.click(screen.getByLabelText('español'));
    await userEvent.click(screen.getByRole('button', { name: /enviar/i }));
    expect(await screen.findByText('ENVIADO')).toBeInTheDocument();
  });

  it('shows error message when submit returns email_send_failed', async () => {
    vi.mocked(lookupCompanyBySlug).mockResolvedValue({ ok: true, name: 'X' });
    vi.mocked(requestWorkerRegistration).mockResolvedValue({ ok: false, error: 'email_send_failed' });
    renderAt('/candidato/registro?company=x');
    await screen.findByRole('button', { name: /enviar/i });
    await userEvent.type(screen.getByLabelText(/nombre/i), 'Ana');
    await userEvent.type(screen.getByLabelText(/apellidos/i), 'L');
    await userEvent.type(screen.getByLabelText(/^email$/i), 'a@b.com');
    await userEvent.type(screen.getByLabelText(/teléfono/i), '600000000');
    await userEvent.click(screen.getByLabelText('español'));
    await userEvent.click(screen.getByRole('button', { name: /enviar/i }));
    expect(await screen.findByText(/problema enviando el email/i)).toBeInTheDocument();
  });
});
