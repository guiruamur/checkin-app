import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WorkerDetailModal } from './WorkerDetailModal';
import type { Worker } from './types';

const baseWorker: Worker = {
  id: 'w1',
  company_id: 'co',
  email: 'ana@x.com',
  phone: '600000000',
  first_name: 'Ana',
  last_name: 'López',
  postal_code: '08001',
  languages: ['español', 'inglés'],
  experience_summary: 'Tres años de experiencia.',
  status: 'pending',
  approved_at: null,
  approved_by: null,
  archived_at: null,
  created_at: '2026-05-17T10:00:00Z',
};

describe('WorkerDetailModal', () => {
  it('renders nothing when worker is null', () => {
    const { container } = render(<WorkerDetailModal worker={null} onClose={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders all fields of a complete worker', () => {
    render(<WorkerDetailModal worker={baseWorker} onClose={vi.fn()} />);
    expect(screen.getByText(/Ana López/)).toBeInTheDocument();
    expect(screen.getByText('ana@x.com')).toBeInTheDocument();
    expect(screen.getByText('600000000')).toBeInTheDocument();
    expect(screen.getByText('08001')).toBeInTheDocument();
    expect(screen.getByText('español')).toBeInTheDocument();
    expect(screen.getByText('inglés')).toBeInTheDocument();
    expect(screen.getByText(/tres años/i)).toBeInTheDocument();
    expect(screen.getByText(/pendiente/i)).toBeInTheDocument();
  });

  it('omits optional fields when null', () => {
    render(<WorkerDetailModal worker={{ ...baseWorker, postal_code: null, experience_summary: null }} onClose={vi.fn()} />);
    expect(screen.queryByText(/código postal/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/experiencia/i)).not.toBeInTheDocument();
  });

  it('shows approved badge with approved_at date', () => {
    render(
      <WorkerDetailModal
        worker={{ ...baseWorker, status: 'approved', approved_at: '2026-05-18T12:00:00Z' }}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText(/^Aprobado$/i)).toBeInTheDocument();
    expect(screen.getByText(/aprobado el:/i)).toBeInTheDocument();
  });

  it('shows archived marker when archived_at is set, preserving original status badge', () => {
    render(
      <WorkerDetailModal
        worker={{ ...baseWorker, status: 'approved', approved_at: '2026-05-18T12:00:00Z', archived_at: '2026-05-19T12:00:00Z' }}
        onClose={vi.fn()}
      />,
    );
    // El badge de estado original se preserva
    expect(screen.getByText(/^Aprobado$/i)).toBeInTheDocument();
    // Y aparece el marker de archivado (puede haber varios textos con "Archivad..."; basta con que exista al menos uno)
    expect(screen.getAllByText(/archivad/i).length).toBeGreaterThan(0);
  });
});
