import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import CandidatoRegistroEnviado from './registro-enviado';

describe('CandidatoRegistroEnviado', () => {
  it('shows the email from location state', () => {
    render(
      <MemoryRouter initialEntries={[{ pathname: '/x', state: { email: 'ana@b.com' } }]}>
        <Routes>
          <Route path="/x" element={<CandidatoRegistroEnviado />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText(/ana@b\.com/)).toBeInTheDocument();
    expect(screen.getByText(/spam/i)).toBeInTheDocument();
  });

  it('shows generic message when state is missing', () => {
    render(
      <MemoryRouter initialEntries={['/x']}>
        <Routes>
          <Route path="/x" element={<CandidatoRegistroEnviado />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText(/email para confirmar/i)).toBeInTheDocument();
  });
});
