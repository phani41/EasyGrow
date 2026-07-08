import { CsvRow } from '../types';

interface CachedCsvData {
  headers: string[];
  rows: CsvRow[];
  fileName: string;
  totalRows: number;
  createdAt: Date;
}

/**
 * Simple in-memory cache for parsed CSV data.
 * In production, this could be replaced with Redis or a database.
 */
class CsvDataCache {
  private store = new Map<string, CachedCsvData>();
  private readonly TTL_MS = 30 * 60 * 1000; // 30 minutes
  private readonly MAX_ENTRIES = 50; // Prevent unbounded memory growth
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Run cleanup every 5 minutes
    this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
    // Allow the interval to not keep the process alive
    if (this.cleanupInterval) {
      this.cleanupInterval.unref();
    }
  }

  set(
    fileId: string,
    data: Omit<CachedCsvData, 'createdAt'>
  ): void {
    // Evict oldest entry if at capacity
    if (this.store.size >= this.MAX_ENTRIES) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey) {
        this.store.delete(oldestKey);
      }
    }
    this.store.set(fileId, { ...data, createdAt: new Date() });
  }

  get(fileId: string): CachedCsvData | undefined {
    const data = this.store.get(fileId);
    if (!data) return undefined;

    // Check TTL
    if (Date.now() - data.createdAt.getTime() > this.TTL_MS) {
      this.store.delete(fileId);
      return undefined;
    }
    return data;
  }

  delete(fileId: string): void {
    this.store.delete(fileId);
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [id, data] of this.store.entries()) {
      if (now - data.createdAt.getTime() > this.TTL_MS) {
        this.store.delete(id);
      }
    }
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.store.clear();
  }
}

export const csvCache = new CsvDataCache();
