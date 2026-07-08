'use client';

import * as React from 'react';
import { useDropzone } from 'react-dropzone';
import {
  Upload,
  X,
  AlertCircle,
  CheckCircle,
  FileSpreadsheet,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  validateFile,
  formatFileSize,
  MAX_FILE_SIZE,
} from '@/lib/validation';

interface UploadZoneProps {
  onFileSelect: (file: File) => void;
  isUploading: boolean;
  selectedFile: File | null;
  error: string | null;
  onClear: () => void;
}

const ACCEPTED_FILE_TYPES = {
  'text/csv': ['.csv'],
};

export function UploadZone({
  onFileSelect,
  isUploading,
  selectedFile,
  error,
  onClear,
}: UploadZoneProps) {
  const [clientValidationError, setClientValidationError] = React.useState<string | null>(null);
  const dropzoneRef = React.useRef<HTMLDivElement>(null);

  const handleClear = React.useCallback(
    (e?: React.MouseEvent) => {
      e?.stopPropagation();
      setClientValidationError(null);
      onClear();
    },
    [onClear]
  );

  const onDrop = React.useCallback(
    (acceptedFiles: File[], rejections: { file: File; errors: { message: string }[] }[]) => {
      // Handle react-dropzone-level rejections (wrong mime type, too large)
      if (rejections.length > 0) {
        const rejection = rejections[0];
        if (rejection.errors[0]?.message?.includes('type')) {
          setClientValidationError('Only .csv files are accepted. Please select a CSV file.');
        } else if (rejection.errors[0]?.message?.includes('size')) {
          setClientValidationError(
            `File is too large. Maximum size is ${formatFileSize(MAX_FILE_SIZE)}.`
          );
        } else {
          setClientValidationError(rejection.errors[0]?.message || 'Invalid file.');
        }
        return;
      }

      if (acceptedFiles.length === 0) return;

      const file = acceptedFiles[0];
      const validation = validateFile(file);

      if (!validation.valid) {
        setClientValidationError(validation.error || 'Invalid file.');
        return;
      }

      setClientValidationError(null);
      onFileSelect(file);
    },
    [onFileSelect]
  );

  const {
    getRootProps,
    getInputProps,
    isDragActive,
    isDragReject,
    open,
  } = useDropzone({
    onDrop,
    accept: ACCEPTED_FILE_TYPES,
    maxFiles: 1,
    maxSize: MAX_FILE_SIZE,
    disabled: isUploading,
    noClick: !!selectedFile, // Don't open file dialog when a file is already selected
  });

  // Determine which error to show
  const displayError = error || clientValidationError;
  const hasError = !!displayError;
  const dropzoneDisabled = isUploading;

  return (
    <div className="w-full space-y-3">
      <div
        {...getRootProps()}
        ref={dropzoneRef}
        role="button"
        tabIndex={dropzoneDisabled || !!selectedFile ? -1 : 0}
        aria-label="CSV file upload zone"
        aria-describedby={hasError ? 'upload-error' : undefined}
        className={cn(
          'relative flex flex-col items-center justify-center w-full min-h-[300px] rounded-2xl border-2 border-dashed transition-all duration-300',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',

          // Active drag states
          isDragActive && !isDragReject && 'border-primary bg-primary/5 scale-[1.01] shadow-lg shadow-primary/10',
          isDragReject && 'border-destructive bg-destructive/5 scale-[1.01]',

          // Normal states
          !isDragActive &&
            !hasError &&
            !selectedFile &&
            'border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30 hover:shadow-md',
          selectedFile &&
            !hasError &&
            'border-primary/30 bg-primary/[0.02]',

          // Error state
          hasError && 'border-destructive/40 bg-destructive/5',

          // Disabled
          dropzoneDisabled && 'pointer-events-none opacity-60',

          // Cursor
          !dropzoneDisabled && !selectedFile && 'cursor-pointer',
          !dropzoneDisabled && selectedFile && 'cursor-default'
        )}
      >
        {/* Hidden file input */}
        <input {...getInputProps()} />

        {/* Drag-reject overlay message */}
        {isDragReject && (
          <div className="absolute inset-0 z-20 flex items-center justify-center rounded-2xl bg-destructive/10 backdrop-blur-[2px]">
            <div className="flex flex-col items-center gap-2 text-destructive">
              <AlertCircle className="h-8 w-8" />
              <p className="text-sm font-medium">CSV files only</p>
            </div>
          </div>
        )}

        <div className="flex flex-col items-center gap-5 p-8 text-center z-10">
          {selectedFile ? (
            <>
              {/* Selected file state */}
              <div className="rounded-full bg-primary/10 p-4 ring-1 ring-primary/20">
                <FileSpreadsheet className="h-10 w-10 text-primary" />
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2 justify-center">
                  <p className="text-sm font-semibold">{selectedFile.name}</p>
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    CSV
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {formatFileSize(selectedFile.size)}
                </p>
                <div className="flex items-center gap-1.5 justify-center text-xs text-green-600 dark:text-green-400">
                  <CheckCircle className="h-3.5 w-3.5" />
                  <span>File validated</span>
                </div>
              </div>
              {!isUploading && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleClear(e);
                  }}
                  className="text-muted-foreground hover:text-destructive hover:border-destructive/50 transition-colors"
                >
                  <X className="h-4 w-4 mr-1.5" />
                  Remove file
                </Button>
              )}
            </>
          ) : (
            <>
              {/* Idle state / Drag-over state */}
              <div
                className={cn(
                  'rounded-full p-5 transition-all duration-300',
                  isDragActive ? 'bg-primary/15 scale-110' : 'bg-muted'
                )}
              >
                <Upload
                  className={cn(
                    'h-10 w-10 transition-all duration-300',
                    isDragActive
                      ? 'text-primary scale-110'
                      : 'text-muted-foreground'
                  )}
                />
              </div>
              <div className="space-y-1.5">
                <p className="text-sm font-semibold">
                  {isDragActive
                    ? 'Drop your CSV file to upload'
                    : 'Drag & drop your CSV file here'}
                </p>
                <p className="text-xs text-muted-foreground flex items-center gap-1 justify-center">
                  <span>or</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      open();
                    }}
                    className="text-primary underline underline-offset-2 hover:text-primary/80 font-medium"
                  >
                    browse files
                  </button>
                  <span>&middot; CSV up to 10 MB</span>
                </p>
              </div>
              <div className="flex items-center gap-4 text-[11px] text-muted-foreground/60 mt-1">
                <span>✓ Any CSV format</span>
                <span>✓ Column auto-detection</span>
                <span>✓ AI mapping</span>
              </div>
            </>
          )}
        </div>

        {/* Upload Progress Overlay */}
        {isUploading && (
          <div className="absolute inset-0 z-30 flex items-center justify-center rounded-2xl bg-background/80 backdrop-blur-sm animate-fade-in">
            <div className="flex flex-col items-center gap-3">
              <div className="relative">
                <div className="h-12 w-12 rounded-full border-2 border-muted" />
                <div className="absolute inset-0 h-12 w-12 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium">Uploading and analyzing...</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Parsing CSV structure
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Error Message */}
      {displayError && (
        <div
          id="upload-error"
          role="alert"
          className="flex items-start gap-3 rounded-xl bg-destructive/10 border border-destructive/20 px-4 py-3.5 animate-fade-in"
        >
          <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-destructive">Upload Error</p>
            <p className="text-sm text-destructive/80 mt-0.5">{displayError}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 text-destructive/60 hover:text-destructive hover:bg-destructive/10"
            onClick={() => {
              setClientValidationError(null);
              onClear();
            }}
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Dismiss error</span>
          </Button>
        </div>
      )}
    </div>
  );
}
