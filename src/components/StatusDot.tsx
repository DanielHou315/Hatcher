import type { ProgressStatus } from '@/lib/kinds';

const LABELS: Record<ProgressStatus | 'missing', string> = {
  'not-started': 'Not started',
  'in-progress': 'In progress',
  done: 'Done',
  missing: 'Missing',
};

export function StatusDot({ status }: { status: ProgressStatus | 'missing' }) {
  return <span className="dot" data-status={status} role="img" aria-label={LABELS[status]} title={LABELS[status]} />;
}

export function ProgressBar({ done, total, label }: { done: number; total: number; label?: string }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div
      className="bar"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={done}
      aria-label={label ?? `${done} of ${total} done`}
    >
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}
