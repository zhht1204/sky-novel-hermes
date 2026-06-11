import type { ButtonHTMLAttributes, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { statusLabel } from '../utils.js';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  loading?: boolean;
}

export function Button({ variant = 'secondary', loading = false, className, children, disabled, ...rest }: ButtonProps) {
  return (
    <button
      className={`btn btn-${variant}${className ? ` ${className}` : ''}`}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && <Spinner size={14} />}
      {children}
    </button>
  );
}

export function Spinner({ size = 16 }: { size?: number }) {
  return <span className="spinner" style={{ width: size, height: size }} aria-hidden="true" />;
}

export function Panel({ title, actions, className, children }: { title?: ReactNode; actions?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section className={`panel${className ? ` ${className}` : ''}`}>
      {(title || actions) && (
        <div className="panel-head">
          {title && <h2>{title}</h2>}
          {actions && <div className="panel-actions">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function StatusBadge({ status }: { status: string }) {
  return <span className={`badge badge-${status}`}>{statusLabel(status)}</span>;
}

export function ProgressBar({ value, total, status }: { value: number; total: number; status?: string }) {
  const pct = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;
  const indeterminate = total === 0 && status === 'running';
  return (
    <div className="progress" title={`${value}/${total}`}>
      <div
        className={`progress-fill st-${status ?? 'queued'}${indeterminate ? ' indeterminate' : ''}`}
        style={{ width: indeterminate ? undefined : `${pct}%` }}
      />
      <span className="progress-label">
        {value}/{total}
      </span>
    </div>
  );
}

export function Metric({ label, value, icon: Icon }: { label: string; value: number | string; icon?: LucideIcon }) {
  return (
    <section className="metric">
      <span className="metric-label">
        {Icon && <Icon size={15} />}
        {label}
      </span>
      <strong>{value}</strong>
    </section>
  );
}

export function Skeleton({ width = '100%', height = 14, radius = 'var(--radius-sm)' }: { width?: number | string; height?: number | string; radius?: string }) {
  return <span className="skeleton" style={{ width, height, borderRadius: radius }} aria-hidden="true" />;
}

export function SkeletonRows({ rows = 4, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <tbody className="skeleton-rows">
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <tr key={rowIndex}>
          {Array.from({ length: cols }).map((__, colIndex) => (
            <td key={colIndex}>
              <Skeleton width={colIndex === 0 ? '70%' : '45%'} />
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  );
}

export function EmptyState({ icon: Icon, title, hint }: { icon?: LucideIcon; title: string; hint?: string }) {
  return (
    <div className="emptyState">
      {Icon && <Icon size={28} className="emptyState-icon" />}
      <strong>{title}</strong>
      {hint && <span>{hint}</span>}
    </div>
  );
}
