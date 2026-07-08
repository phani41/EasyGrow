'use client';

import * as React from 'react';
import { X, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface CellDetailModalProps {
  value: string;
  columnName: string;
  rowIndex: number;
  onClose: () => void;
  label?: string;
}

export function CellDetailModal({
  value,
  columnName,
  rowIndex,
  onClose,
  label = 'Row',
}: CellDetailModalProps) {
  const [copied, setCopied] = React.useState(false);
  const modalRef = React.useRef<HTMLDivElement>(null);
  const previousFocusRef = React.useRef<HTMLElement | null>(null);

  // Trap focus within modal
  React.useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement;
    const modal = modalRef.current;
    if (!modal) return;

    const focusableSelector =
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

    function handleTab(e: KeyboardEvent) {
      if (e.key !== 'Tab' || !modal) return;
      const focusable = modal.querySelectorAll<HTMLElement>(focusableSelector);
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    // Auto-focus the close button
    requestAnimationFrame(() => {
      const closeBtn = modal.querySelector('button');
      closeBtn?.focus();
    });

    document.addEventListener('keydown', handleTab);
    return () => {
      document.removeEventListener('keydown', handleTab);
      previousFocusRef.current?.focus();
    };
  }, []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API may be unavailable
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`${label} ${rowIndex}: ${columnName}`}
    >
      <div
        ref={modalRef}
        className="bg-background rounded-xl border shadow-2xl max-w-lg w-full mx-4 animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div className="space-y-0.5">
            <p className="text-xs text-muted-foreground">
              {label} {rowIndex} &middot; {columnName}
            </p>
            {label !== 'Row' && (
              <p className="font-medium">{columnName}</p>
            )}
          </div>
          <div className="flex items-center gap-1">
            {value && (
              <Button
                variant="ghost"
                size="icon"
                onClick={handleCopy}
                aria-label={copied ? 'Copied' : 'Copy to clipboard'}
                className="h-8 w-8"
              >
                {copied ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            )}
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="px-5 py-4 max-h-64 overflow-y-auto">
          <pre className="text-sm whitespace-pre-wrap break-words font-sans">
            {value || (
              <span className="text-muted-foreground/50 italic">Empty</span>
            )}
          </pre>
        </div>
      </div>
    </div>
  );
}
