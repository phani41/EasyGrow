'use client';

import * as React from 'react';
import { Upload, Sparkles, CheckCircle2 } from 'lucide-react';
import { UploadZone } from '@/components/upload-zone';
import { CsvPreview } from '@/components/csv-preview';
import { ImportSummaryCard } from '@/components/import-summary';
import { ImportResults } from '@/components/import-results';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent } from '@/components/ui/card';
import { ThemeToggle } from '@/components/theme-toggle';
import { uploadCsvFile } from '@/lib/api';
import { connectMappingStream } from '@/lib/sse';
import {
  UploadState,
  UploadPreviewData,
  CrmRecord,
  ImportSummary,
} from '@/types';

export default function Home() {
  const [uploadState, setUploadState] = React.useState<UploadState>('idle');
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
  const [uploadError, setUploadError] = React.useState<string | null>(null);
  const [previewData, setPreviewData] = React.useState<UploadPreviewData | null>(null);
  const [records, setRecords] = React.useState<CrmRecord[]>([]);
  const [summary, setSummary] = React.useState<ImportSummary | null>(null);
  const [processingProgress, setProcessingProgress] = React.useState(0);
  const [isProcessing, setIsProcessing] = React.useState(false);
  const sseCleanupRef = React.useRef<(() => void) | null>(null);

  const handleFileSelect = async (file: File) => {
    setSelectedFile(file);
    setUploadError(null);
    setUploadState('uploading');

    try {
      const response = await uploadCsvFile(file);

      if (response.success && response.data) {
        setPreviewData(response.data);
        setUploadState('preview');
      } else {
        throw new Error(response.error || 'Upload failed');
      }
    } catch (error: unknown) {
      let message = 'Failed to upload file';

      if (error && typeof error === 'object' && 'response' in error) {
        const axiosError = error as { response?: { data?: { error?: string } } };
        message = axiosError.response?.data?.error || message;
      } else if (error instanceof Error) {
        message = error.message;
      }

      setUploadError(message);
      setUploadState('error');
      setSelectedFile(null);
    }
  };

  const handleProcessWithAi = () => {
    if (!previewData?.fileId) return;

    setIsProcessing(true);
    setProcessingProgress(0);
    setUploadError(null);

    // Connect to SSE stream for real-time batch processing
    const cleanup = connectMappingStream(previewData.fileId, {
      onProgress: (currentBatch, totalBatches, message) => {
        setProcessingProgress(Math.round((currentBatch / totalBatches) * 100));
      },
      onBatchComplete: (_batchIndex, _records, cumulativeSummary) => {
        setSummary(cumulativeSummary);
      },
      onComplete: (allRecords, finalSummary) => {
        setRecords(allRecords);
        setSummary(finalSummary);
        setProcessingProgress(100);
        setUploadState('complete');
        setIsProcessing(false);
      },
      onError: (error) => {
        setUploadError(error.message);
        setUploadState('error');
        setIsProcessing(false);
      },
    });

    // Store cleanup for potential abort
    sseCleanupRef.current = cleanup;
  };

  // Clean up SSE connection on unmount
  React.useEffect(() => {
    return () => {
      if (sseCleanupRef.current) {
        sseCleanupRef.current();
      }
    };
  }, []);

  const handleReset = () => {
    // Abort any in-flight SSE connection
    if (sseCleanupRef.current) {
      sseCleanupRef.current();
      sseCleanupRef.current = null;
    }
    setSelectedFile(null);
    setUploadError(null);
    setPreviewData(null);
    setRecords([]);
    setSummary(null);
    setProcessingProgress(0);
    setIsProcessing(false);
    setUploadState('idle');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-xl">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary/10 p-2">
              <Upload className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">EasyGrow</h1>
              <p className="text-xs text-muted-foreground -mt-0.5">
                AI-Powered CSV Importer
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {uploadState !== 'idle' && (
              <Button variant="ghost" size="sm" onClick={handleReset}>
                Start New Import
              </Button>
            )}
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main id="main-content" className="container py-8 space-y-8" role="main" aria-label="Import workflow">
        {/* Live region for screen reader announcements */}
        <div
          aria-live="polite"
          aria-atomic="true"
          className="sr-only"
        >
          {uploadState === 'uploading' && 'Uploading file'}
          {uploadState === 'preview' && 'File uploaded. Preview ready.'}
          {isProcessing && `Processing records. ${processingProgress} percent complete.`}
          {uploadState === 'complete' && `Import complete. ${summary?.totalProcessed ?? 0} records processed.`}
          {uploadState === 'error' && `Error: ${uploadError}`}
        </div>

        {/* Hero Section */}
        {uploadState === 'idle' && (
          <div className="text-center space-y-4 mb-8 animate-fade-in">
            <div className="inline-flex items-center gap-2 rounded-full border bg-muted/50 px-4 py-1.5 text-sm text-muted-foreground">
              <Sparkles className="h-4 w-4 text-primary" />
              Powered by Google Gemini AI
            </div>
            <h2 className="text-4xl font-bold tracking-tight sm:text-5xl">
              Import CSV Data into Your CRM
            </h2>
            <p className="max-w-2xl mx-auto text-lg text-muted-foreground">
              Upload any CSV file and let AI intelligently map your columns to
              our CRM schema. Smart field detection, error handling, and batch
              processing included.
            </p>
          </div>
        )}

        {/* Upload Zone */}
        <UploadZone
          onFileSelect={handleFileSelect}
          isUploading={uploadState === 'uploading'}
          selectedFile={selectedFile}
          error={uploadError}
          onClear={handleReset}
        />

        {/* CSV Preview */}
        {uploadState === 'preview' && previewData && (
          <>
            <CsvPreview
              headers={previewData.headers}
              rows={previewData.previewRows}
              totalRows={previewData.totalRows}
              fileName={previewData.fileName}
              isLoading={false}
              warnings={previewData.validation?.warnings}
              onProcessWithAi={handleProcessWithAi}
              isProcessing={isProcessing}
            />
          </>
        )}

        {/* Processing Progress - shown while waiting for AI, keeps preview visible */}
        {isProcessing && (
          <Card className="animate-fade-in">
            <CardContent className="pt-6">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  <div>
                    <p className="font-medium">AI is processing your data...</p>
                    <p className="text-sm text-muted-foreground">
                      Mapping columns to CRM schema with Gemini AI
                    </p>
                  </div>
                </div>
                <Progress value={processingProgress} className="h-2" />
                <p className="text-xs text-muted-foreground text-right">
                  {processingProgress}%
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Import Results */}
        {uploadState === 'complete' && summary && (
          <>
            <div className="flex items-center gap-3 rounded-2xl border border-green-500/20 bg-green-500/5 p-6 animate-fade-in">
              <div className="rounded-full bg-green-500/10 p-3">
                <CheckCircle2 className="h-6 w-6 text-green-500" />
              </div>
              <div>
                <h3 className="font-semibold text-lg">Import Complete</h3>
                <p className="text-sm text-muted-foreground">
                  Successfully processed {summary.totalProcessed.toLocaleString()}{' '}
                  records with AI-powered column mapping
                </p>
              </div>
            </div>

            <ImportSummaryCard summary={summary} />
            <ImportResults
              records={records}
              summary={{ totalProcessed: summary.totalProcessed }}
            />

            <div className="flex justify-center animate-fade-in">
              <Button
                variant="outline"
                size="lg"
                onClick={handleReset}
                className="gap-2"
              >
                <Upload className="h-4 w-4" />
                Import Another File
              </Button>
            </div>
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t mt-16">
        <div className="container py-6 text-center text-sm text-muted-foreground">
          EasyGrow &middot; AI-Powered CSV Importer &middot; Built with Next.js, Express, and Gemini AI
        </div>
      </footer>
    </div>
  );
}
