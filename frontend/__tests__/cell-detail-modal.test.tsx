import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CellDetailModal } from '@/components/cell-detail-modal';

describe('CellDetailModal', () => {
  const defaultProps = {
    value: 'Test cell content that is long enough to be useful',
    columnName: 'Email',
    rowIndex: 5,
    onClose: vi.fn(),
    label: 'Row',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render the modal with correct content', () => {
    render(<CellDetailModal {...defaultProps} />);

    expect(screen.getByText('Row 5 · Email')).toBeInTheDocument();
    expect(screen.getByText('Test cell content that is long enough to be useful')).toBeInTheDocument();
  });

  it('should have proper ARIA attributes', () => {
    render(<CellDetailModal {...defaultProps} />);

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-label', 'Row 5: Email');
  });

  it('should call onClose when close button is clicked', () => {
    render(<CellDetailModal {...defaultProps} />);

    const closeButton = screen.getByRole('button', { name: /close/i });
    fireEvent.click(closeButton);

    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });

  it('should call onClose when backdrop is clicked', () => {
    render(<CellDetailModal {...defaultProps} />);

    const dialog = screen.getByRole('dialog');
    fireEvent.click(dialog);

    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });

  it('should NOT call onClose when modal content is clicked', () => {
    render(<CellDetailModal {...defaultProps} />);

    const content = screen.getByText('Test cell content that is long enough to be useful');
    fireEvent.click(content.closest('pre')!);

    expect(defaultProps.onClose).not.toHaveBeenCalled();
  });

  it('should show empty state when value is empty', () => {
    render(<CellDetailModal {...defaultProps} value="" />);

    expect(screen.getByText('Empty')).toBeInTheDocument();
  });

  it('should show custom label when provided', () => {
    render(<CellDetailModal {...defaultProps} label="Record #" />);

    expect(screen.getByText('Record # 5 · Email')).toBeInTheDocument();
    const emailElements = screen.getAllByText(/Email/);
    expect(emailElements.length).toBe(2);
  });

  it('should not show column name as title for Row label', () => {
    render(<CellDetailModal {...defaultProps} label="Row" />);

    const emailInstances = screen.getAllByText(/Email/);
    expect(emailInstances.length).toBe(1);
  });

  it('should have a copy button when value is present', () => {
    render(<CellDetailModal {...defaultProps} />);

    const copyButton = screen.getByRole('button', { name: /copy to clipboard/i });
    expect(copyButton).toBeInTheDocument();
  });

  it('should not show copy button when value is empty', () => {
    render(<CellDetailModal {...defaultProps} value="" />);

    expect(screen.queryByRole('button', { name: /copy/i })).not.toBeInTheDocument();
  });

  it('should show copied state after clicking copy', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText },
    });

    render(<CellDetailModal {...defaultProps} />);

    const copyButton = screen.getByRole('button', { name: /copy to clipboard/i });
    fireEvent.click(copyButton);

    await vi.waitFor(() => {
      expect(screen.getByRole('button', { name: /copied/i })).toBeInTheDocument();
    });
  });

  it('should display the value in a pre element', () => {
    render(<CellDetailModal {...defaultProps} />);

    const pre = document.querySelector('pre');
    expect(pre).toBeInTheDocument();
    expect(pre).toHaveTextContent('Test cell content that is long enough to be useful');
  });
});
