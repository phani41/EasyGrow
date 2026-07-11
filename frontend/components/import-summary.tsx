'use client';

import * as React from 'react';
import {
  CheckCircle,
  XCircle,
  Mail,
  Phone,
  Database,
  BarChart3,
  Target,
  Users,
  TrendingUp,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { ImportSummary } from '@/types';

interface ImportSummaryCardProps {
  summary: ImportSummary;
}

function AnimatedCounter({
  value,
  duration = 1000,
}: {
  value: number;
  duration?: number;
}) {
  const [displayValue, setDisplayValue] = React.useState(0);
  const prevValueRef = React.useRef(0);
  const rafRef = React.useRef<number>(0);

  React.useEffect(() => {
    const startValue = prevValueRef.current;
    const endValue = value;
    const startTime = performance.now();

    function animate(currentTime: number) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(startValue + (endValue - startValue) * eased);
      setDisplayValue(current);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      }
    }

    prevValueRef.current = endValue;
    rafRef.current = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(rafRef.current);
  }, [value, duration]);

  return <>{displayValue.toLocaleString()}</>;
}

export function ImportSummaryCard({ summary }: ImportSummaryCardProps) {
  const totalContacts = summary.totalProcessed + summary.skippedNoContact;
  const contactRate =
    totalContacts > 0
      ? Math.round((summary.totalProcessed / totalContacts) * 100)
      : 0;

  const dataQualityScore =
    totalContacts > 0
      ? Math.round(
          ((summary.emailsExtracted + summary.phonesExtracted) /
            (totalContacts * 2)) *
            100
        )
      : 0;

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-blue-500/10 p-2.5">
                <Database className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold tabular-nums">
                  <AnimatedCounter value={summary.totalProcessed} />
                </p>
                <p className="text-xs text-muted-foreground">Records Processed</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-green-500/10 p-2.5">
                <Mail className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold tabular-nums">
                  <AnimatedCounter value={summary.emailsExtracted} />
                </p>
                <p className="text-xs text-muted-foreground">Emails Found</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-purple-500/10 p-2.5">
                <Phone className="h-5 w-5 text-purple-500" />
              </div>
              <div>
                <p className="text-2xl font-bold tabular-nums">
                  <AnimatedCounter value={summary.phonesExtracted} />
                </p>
                <p className="text-xs text-muted-foreground">Phones Found</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-orange-500/10 p-2.5">
                <XCircle className="h-5 w-5 text-orange-500" />
              </div>
              <div>
                <p className="text-2xl font-bold tabular-nums">
                  <AnimatedCounter value={summary.skippedNoContact} />
                </p>
                <p className="text-xs text-muted-foreground">Skipped (No Contact)</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quality Metrics */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary/10 p-2">
              <TrendingUp className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">Data Quality</CardTitle>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-blue-500" />
                <span className="text-sm font-medium">Contact Capture Rate</span>
              </div>
              <span className="text-sm font-bold tabular-nums">{contactRate}%</span>
            </div>
            <Progress
              value={contactRate}
              className="h-2.5"
              indicatorClassName={
                contactRate >= 90
                  ? 'bg-green-500'
                  : contactRate >= 70
                  ? 'bg-blue-500'
                  : contactRate >= 50
                  ? 'bg-yellow-500'
                  : 'bg-orange-500'
              }
            />
            <p className="text-xs text-muted-foreground">
              {contactRate >= 90
                ? 'Excellent — most records have contact information'
                : contactRate >= 70
                ? 'Good — majority of records are usable'
                : contactRate >= 50
                ? 'Fair — consider reviewing the source data'
                : 'Poor — many records lack email and phone'}
            </p>
          </div>

          <div className="flex items-center gap-6 pt-1">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-green-500" />
              <span className="text-xs text-muted-foreground">
                {summary.emailsExtracted.toLocaleString()} with email
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-purple-500" />
              <span className="text-xs text-muted-foreground">
                {summary.phonesExtracted.toLocaleString()} with phone
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-orange-500" />
              <span className="text-xs text-muted-foreground">
                {summary.skippedNoContact.toLocaleString()} skipped
              </span>
            </div>
          </div>

          {totalContacts > 0 && (
            <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-3">
              <div
                className={cn(
                  'rounded-full p-2',
                  dataQualityScore >= 80
                    ? 'bg-green-500/10'
                    : dataQualityScore >= 50
                    ? 'bg-yellow-500/10'
                    : 'bg-orange-500/10'
                )}
              >
                <BarChart3
                  className={cn(
                    'h-4 w-4',
                    dataQualityScore >= 80
                      ? 'text-green-500'
                      : dataQualityScore >= 50
                      ? 'text-yellow-500'
                      : 'text-orange-500'
                  )}
                />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Data Quality Score</span>
                  <span className="text-sm font-bold">{dataQualityScore}%</span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Based on email and phone completeness across all records
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}


