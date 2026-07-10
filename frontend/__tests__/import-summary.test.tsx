import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ImportSummaryCard } from '@/components/import-summary';
import type { ImportSummary } from '@/types';

// Mock requestAnimationFrame for AnimatedCounter — complete animation in one frame
beforeEach(() => {
  vi.spyOn(performance, 'now').mockReturnValue(0);
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
    cb(1000); // elapsed = 1000 - 0 = 1000 >= duration, progress = 1
    return 1;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
});

// ===== Helpers =====

function createSummary(overrides: Partial<ImportSummary> = {}): ImportSummary {
  return {
    totalProcessed: 100,
    skippedNoContact: 10,
    skippedInvalid: 5,
    emailsExtracted: 80,
    phonesExtracted: 60,
    ...overrides,
  };
}

// ===== ImportSummaryCard =====

describe('ImportSummaryCard', () => {
  it('should render all stat cards', () => {
    render(<ImportSummaryCard summary={createSummary()} />);

    expect(screen.getByText('Records Processed')).toBeInTheDocument();
    expect(screen.getByText('Emails Found')).toBeInTheDocument();
    expect(screen.getByText('Phones Found')).toBeInTheDocument();
    expect(screen.getByText('Skipped (No Contact)')).toBeInTheDocument();
  });

  it('should render animated counters for all stats', () => {
    const summary = createSummary({
      totalProcessed: 1500,
      emailsExtracted: 1200,
      phonesExtracted: 800,
      skippedNoContact: 50,
    });

    render(<ImportSummaryCard summary={summary} />);

    // The animated counters should eventually display the values
    expect(screen.getByText('1,500')).toBeInTheDocument();
    expect(screen.getByText('1,200')).toBeInTheDocument();
    expect(screen.getByText('800')).toBeInTheDocument();
    expect(screen.getByText('50')).toBeInTheDocument();
  });

  it('should render Data Quality section', () => {
    render(<ImportSummaryCard summary={createSummary()} />);

    expect(screen.getByText('Data Quality')).toBeInTheDocument();
    expect(screen.getByText('Contact Capture Rate')).toBeInTheDocument();
  });

  it('should calculate correct contact capture rate', () => {
    // 100 processed out of 110 total contacts = ~91%
    render(<ImportSummaryCard summary={createSummary({
      totalProcessed: 100,
      skippedNoContact: 10,
    })} />);

    expect(screen.getByText('91%')).toBeInTheDocument();
  });

  it('should show excellent rating for high contact rate', () => {
    render(<ImportSummaryCard summary={createSummary({
      totalProcessed: 95,
      skippedNoContact: 5,
    })} />);

    expect(screen.getByText(/Excellent/)).toBeInTheDocument();
  });

  it('should show good rating for moderate contact rate', () => {
    render(<ImportSummaryCard summary={createSummary({
      totalProcessed: 75,
      skippedNoContact: 25,
    })} />);

    expect(screen.getByText(/Good/)).toBeInTheDocument();
  });

  it('should show fair rating for low contact rate', () => {
    render(<ImportSummaryCard summary={createSummary({
      totalProcessed: 50,
      skippedNoContact: 50,
    })} />);

    expect(screen.getByText(/Fair/)).toBeInTheDocument();
  });

  it('should show poor rating for very low contact rate', () => {
    render(<ImportSummaryCard summary={createSummary({
      totalProcessed: 20,
      skippedNoContact: 80,
    })} />);

    expect(screen.getByText(/Poor/)).toBeInTheDocument();
  });

  it('should render email/phone breakdown section', () => {
    render(<ImportSummaryCard summary={createSummary({
      emailsExtracted: 80,
      phonesExtracted: 60,
      skippedNoContact: 10,
    })} />);

    expect(screen.getByText('80 with email')).toBeInTheDocument();
    expect(screen.getByText('60 with phone')).toBeInTheDocument();
    expect(screen.getByText('10 skipped')).toBeInTheDocument();
  });

  it('should render data quality score section', () => {
    render(<ImportSummaryCard summary={createSummary({
      totalProcessed: 100,
      emailsExtracted: 80,
      phonesExtracted: 60,
    })} />);

    expect(screen.getByText('Data Quality Score')).toBeInTheDocument();
  });

  it('should handle zero contacts gracefully', () => {
    render(<ImportSummaryCard summary={createSummary({
      totalProcessed: 0,
      skippedNoContact: 0,
      emailsExtracted: 0,
      phonesExtracted: 0,
    })} />);

    // Contact rate should be 0%
    expect(screen.getByText('0%')).toBeInTheDocument();
    // Data Quality Score should not be rendered when totalContacts is 0
    expect(screen.queryByText('Data Quality Score')).not.toBeInTheDocument();
  });

  it('should render with all zeros', () => {
    render(<ImportSummaryCard summary={createSummary({
      totalProcessed: 0,
      skippedNoContact: 0,
      skippedInvalid: 0,
      emailsExtracted: 0,
      phonesExtracted: 0,
    })} />);

    expect(screen.getByText('Records Processed')).toBeInTheDocument();
    expect(screen.getByText('Emails Found')).toBeInTheDocument();
    expect(screen.getByText('Phones Found')).toBeInTheDocument();
    expect(screen.getByText('Skipped (No Contact)')).toBeInTheDocument();
  });

  it('should show correct data quality score percentage', () => {
    // 80 emails + 60 phones out of (100 * 2) = 200 possible = 70%
    // Must override skippedNoContact to 0 so totalContacts = 100
    render(<ImportSummaryCard summary={createSummary({
      totalProcessed: 100,
      skippedNoContact: 0,
      emailsExtracted: 80,
      phonesExtracted: 60,
    })} />);

    expect(screen.getByText('70%')).toBeInTheDocument();
  });
});
