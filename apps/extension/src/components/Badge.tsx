/*
  A small label pill, e.g. "Likely", "Suggested", "Added by you".
  The tone picks the colour; every tone uses semantic/status tokens so it works in light and dark.
*/
import type { ReactNode } from 'react';

export type BadgeTone = 'neutral' | 'info' | 'warning' | 'danger' | 'action';

const TONES: Record<BadgeTone, string> = {
  neutral: 'border-line bg-surface-muted text-fg-muted',
  info: 'border-info/25 bg-info-subtle text-info',
  warning: 'border-warning/25 bg-warning-subtle text-warning',
  danger: 'border-danger/25 bg-danger-subtle text-danger',
  action: 'border-action/25 bg-surface-muted text-action',
};

/** A compact, rounded label. */
export function Badge({ tone = 'neutral', children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-1.5 text-xs leading-[18px] font-medium whitespace-nowrap ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}
