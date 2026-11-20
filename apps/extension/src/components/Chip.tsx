/*
  A monospace chip for placeholders such as [EMAIL_1], so they stand out from normal text in the
  panel's list and in the "What ChatGPT will see" preview.
*/
import type { ReactNode } from 'react';

/** A placeholder chip, e.g. <Chip>[EMAIL_1]</Chip>. */
export function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-sm border border-action/30 bg-surface-muted px-1 font-ui-mono text-xs leading-[18px] font-medium whitespace-nowrap text-action">
      {children}
    </span>
  );
}
