import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorBoundary } from '@/components/error-boundary';

function GoodComponent() {
  return <div data-testid="good">Everything is fine</div>;
}

function BadComponent(): never {
  throw new Error('Test error message');
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('should render children when no error occurs', () => {
    render(
      <ErrorBoundary>
        <GoodComponent />
      </ErrorBoundary>
    );

    expect(screen.getByTestId('good')).toBeInTheDocument();
    expect(screen.getByText('Everything is fine')).toBeInTheDocument();
  });

  it('should display fallback UI when a child throws', () => {
    render(
      <ErrorBoundary>
        <BadComponent />
      </ErrorBoundary>
    );

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(
      screen.getByText('An unexpected error occurred. Please try refreshing the page.')
    ).toBeInTheDocument();
  });

  it('should show the error message in the details section', () => {
    render(
      <ErrorBoundary>
        <BadComponent />
      </ErrorBoundary>
    );

    expect(screen.getByText('Test error message')).toBeInTheDocument();
  });

  it('should show a Try again button after an error', () => {
    render(
      <ErrorBoundary>
        <BadComponent />
      </ErrorBoundary>
    );

    expect(screen.getByRole('button', { name: /Try again/i })).toBeInTheDocument();
  });

  it('should reset state and render children again when Try again is clicked', () => {
    const { rerender } = render(
      <ErrorBoundary>
        <BadComponent />
      </ErrorBoundary>
    );

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();

    rerender(
      <ErrorBoundary>
        <GoodComponent />
      </ErrorBoundary>
    );

    fireEvent.click(screen.getByRole('button', { name: /Try again/i }));

    expect(screen.getByTestId('good')).toBeInTheDocument();
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
  });

  it('should render custom fallback when provided', () => {
    const CustomFallback = () => <div data-testid="custom-fallback">Custom Error UI</div>;

    render(
      <ErrorBoundary fallback={<CustomFallback />}>
        <BadComponent />
      </ErrorBoundary>
    );

    expect(screen.getByTestId('custom-fallback')).toBeInTheDocument();
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
  });

  it('should log errors to console', () => {
    const consoleSpy = vi.spyOn(console, 'error');

    render(
      <ErrorBoundary>
        <BadComponent />
      </ErrorBoundary>
    );

    expect(consoleSpy).toHaveBeenCalled();
  });

  it('should handle errors in nested components', () => {
    function Parent() {
      return (
        <div>
          <span>Parent wrapper</span>
          <BadComponent />
        </div>
      );
    }

    render(
      <ErrorBoundary>
        <Parent />
      </ErrorBoundary>
    );

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });
});
