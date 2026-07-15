import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Report } from '../../stores/reports';
import { formatRelativeDate } from '../../lib/date';

type Tone = 'active' | 'paused' | 'running' | 'failed' | 'idle';

interface StatusBadgeProps {
  report: Report;
  /// Whether the row believes the report is currently running. Caller
  /// computes this from local optimistic state (4c+); for 4a's
  /// read-only list it's always false and the badge falls through to the
  /// cache-derived states.
  isRunning?: boolean;
}

interface Resolved {
  tone: Tone;
  label: string;
}

/// Resolve the visual state from the report's advisory cache fields.
/// Priority: running (live) > failed (last_error set) > paused
/// (!enabled) > active. The "active" label leans on `last_run_at` for
/// the suffix; first-run reports show just "ACTIVE".
function resolve(report: Report, isRunning: boolean, t: (key: string) => string): Resolved {
  if (isRunning) return { tone: 'running', label: t('reports_status_running') };
  if (report.last_error) {
    const suffix = report.last_run_at
      ? ` · ${formatRelativeDate(report.last_run_at).toUpperCase()}`
      : '';
    return { tone: 'failed', label: `${t('reports_status_failed')}${suffix}` };
  }
  if (!report.enabled) return { tone: 'paused', label: t('reports_status_paused') };
  if (report.last_run_at) {
    return {
      tone: 'active',
      label: `${t('reports_status_ran')} ${formatRelativeDate(report.last_run_at).toUpperCase()}`,
    };
  }
  return { tone: 'idle', label: t('reports_status_never_run') };
}

const DOT_BY_TONE: Record<Tone, string> = {
  active: 'bg-emerald-400',
  paused: 'bg-[var(--color-text-tertiary)]',
  running: 'bg-[var(--color-accent)] animate-pulse',
  failed: 'bg-red-500',
  idle: 'bg-[var(--color-text-tertiary)]/60',
};

const TEXT_BY_TONE: Record<Tone, string> = {
  active: 'text-[var(--color-text-secondary)]',
  paused: 'text-[var(--color-text-tertiary)]',
  running: 'text-[var(--color-accent-light)]',
  failed: 'text-red-400',
  idle: 'text-[var(--color-text-tertiary)]',
};

export const StatusBadge = memo(function StatusBadge({ report, isRunning = false }: StatusBadgeProps) {
  const { t } = useTranslation();
  const { tone, label } = resolve(report, isRunning, t);
  return (
    <div className="inline-flex items-center gap-1.5">
      <span className={`w-1.5 h-1.5 rounded-full ${DOT_BY_TONE[tone]}`} aria-hidden />
      <span
        className={`text-[10.5px] font-medium uppercase tracking-[0.14em] tabular-nums ${TEXT_BY_TONE[tone]}`}
      >
        {label}
      </span>
    </div>
  );
});
