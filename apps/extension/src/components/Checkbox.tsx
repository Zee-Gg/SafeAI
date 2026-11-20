/*
  A checkbox drawn with our tokens. It is a REAL <input type="checkbox"> underneath (styled with
  appearance-none), so Space toggles it, screen readers announce it, and labels work for free.
  The tick icon sits on top and ignores the mouse.
*/
import type { InputHTMLAttributes } from 'react';

import { CheckIcon } from './icons';

type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>;

/** A token-styled native checkbox (16px). */
export function Checkbox({ className = '', ...rest }: CheckboxProps) {
  return (
    <span className={`relative inline-flex size-4 shrink-0 ${className}`}>
      <input
        type="checkbox"
        className="peer size-4 cursor-pointer appearance-none rounded-sm border border-fg-muted bg-surface transition-colors duration-(--duration-fast) checked:border-action checked:bg-action focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none"
        {...rest}
      />
      <CheckIcon
        size={12}
        className="pointer-events-none absolute inset-0 m-auto text-on-action opacity-0 peer-checked:opacity-100"
      />
    </span>
  );
}
