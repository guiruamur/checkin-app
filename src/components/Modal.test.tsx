import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Modal } from './Modal';

describe('Modal', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<Modal open={false} onClose={() => {}} title="t">child</Modal>);
    expect(container).toBeEmptyDOMElement();
  });
  it('renders title and children when open', () => {
    render(<Modal open onClose={() => {}} title="Mi título">contenido</Modal>);
    expect(screen.getByText('Mi título')).toBeInTheDocument();
    expect(screen.getByText('contenido')).toBeInTheDocument();
  });
  it('has dialog role and aria-modal', () => {
    render(<Modal open onClose={() => {}} title="t">x</Modal>);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });
  it('calls onClose when × button is clicked', async () => {
    const onClose = vi.fn();
    render(<Modal open onClose={onClose} title="t">x</Modal>);
    await userEvent.click(screen.getByLabelText(/cerrar/i));
    expect(onClose).toHaveBeenCalled();
  });
  it('calls onClose when backdrop is clicked', async () => {
    const onClose = vi.fn();
    render(<Modal open onClose={onClose} title="t">x</Modal>);
    await userEvent.click(screen.getByRole('dialog'));
    expect(onClose).toHaveBeenCalled();
  });
  it('does NOT call onClose when content area is clicked', async () => {
    const onClose = vi.fn();
    render(<Modal open onClose={onClose} title="t">contenido</Modal>);
    await userEvent.click(screen.getByText('contenido'));
    expect(onClose).not.toHaveBeenCalled();
  });
});
