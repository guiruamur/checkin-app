import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EventoQR } from './EventoQR';

describe('EventoQR', () => {
  it('renders the check-in URL text with the access token', () => {
    render(<EventoQR accessToken="tok-123" baseUrl="https://app.example" />);
    expect(screen.getByText('https://app.example/e/tok-123')).toBeInTheDocument();
  });

  it('renders an SVG QR code', () => {
    const { container } = render(<EventoQR accessToken="tok-123" baseUrl="https://app.example" />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });
});
