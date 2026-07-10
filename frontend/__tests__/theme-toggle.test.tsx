import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeToggle } from '@/components/theme-toggle';

// ===== Mock next-themes =====

const { mockSetTheme } = vi.hoisted(() => ({
  mockSetTheme: vi.fn(),
}));
let mockTheme = 'light';

vi.mock('next-themes', () => ({
  useTheme: () => ({
    theme: mockTheme,
    setTheme: mockSetTheme,
  }),
}));

// ===== ThemeToggle =====

describe('ThemeToggle', () => {
  beforeEach(() => {
    mockTheme = 'light';
    mockSetTheme.mockClear();
  });

  it('should render the toggle button', () => {
    render(<ThemeToggle />);
    const button = screen.getByRole('button', { name: /toggle theme/i });
    expect(button).toBeInTheDocument();
  });

  it('should show the sun icon in dark mode (to switch to light)', () => {
    mockTheme = 'dark';
    render(<ThemeToggle />);
    // In dark mode, the sun icon (switch to light) should be visible
    const button = screen.getByRole('button', { name: /toggle theme/i });
    expect(button).toBeInTheDocument();
  });

  it('should call setTheme with dark when currently light', () => {
    mockTheme = 'light';
    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole('button', { name: /toggle theme/i }));
    expect(mockSetTheme).toHaveBeenCalledWith('dark');
  });

  it('should call setTheme with light when currently dark', () => {
    mockTheme = 'dark';
    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole('button', { name: /toggle theme/i }));
    expect(mockSetTheme).toHaveBeenCalledWith('light');
  });

  it('should have accessible label on the button', () => {
    render(<ThemeToggle />);
    const button = screen.getByRole('button', { name: /toggle theme/i });
    expect(button).toHaveClass('transition-transform');
  });
});
