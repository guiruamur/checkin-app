import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../../features/workers/api', () => ({
  verifyWorkerRegistration: vi.fn(),
}));

import { verifyWorkerRegistration } from '../../features/workers/api';
import CandidatoVerificar from './verificar';

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/candidato/verificar" element={<CandidatoVerificar />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => { vi.mocked(verifyWorkerRegistration).mockReset(); });

describe('CandidatoVerificar', () => {
  it('shows missing-token message when token is absent', async () => {
    renderAt('/candidato/verificar');
    expect(await screen.findByText(/enlace no válido/i)).toBeInTheDocument();
  });

  it('shows success message with company name', async () => {
    vi.mocked(verifyWorkerRegistration).mockResolvedValue({ ok: true, company_name: 'Eventos Pérez' });
    renderAt('/candidato/verificar?token=abc');
    expect(await screen.findByText(/gracias por inscribirte/i)).toBeInTheDocument();
    expect(screen.getByText(/Eventos Pérez/)).toBeInTheDocument();
  });

  it('shows expired-token message', async () => {
    vi.mocked(verifyWorkerRegistration).mockResolvedValue({ ok: false, error: 'token_expired' });
    renderAt('/candidato/verificar?token=expired');
    expect(await screen.findByText(/enlace ha caducado/i)).toBeInTheDocument();
  });

  it('shows invalid-token message', async () => {
    vi.mocked(verifyWorkerRegistration).mockResolvedValue({ ok: false, error: 'invalid_token' });
    renderAt('/candidato/verificar?token=bad');
    expect(await screen.findByText(/enlace no es válido/i)).toBeInTheDocument();
  });
});
