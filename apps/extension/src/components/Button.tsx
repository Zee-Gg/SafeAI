/*
  The standard button for SafeAI's in-page UI. Three looks: "primary" (the main action, teal),
  "secondary" (bordered) and "ghost" (text only). Uses semantic tokens, so it follows light/dark.
  `loading` shows a spinner and blocks clicks while keeping the button's size.
*/
import type { ButtonHTMLAttributes, Ref } from 'react';

import { Spinner } from './Spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'sm' | 'md';
  loading?: boolean;
  /** React 19 passes `ref` as a normal prop (the panel focuses buttons on open). */
  ref?: Ref<HTMLButtonElement>;
}

const BASE =
  'inline-flex shrink-0 items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap transition-colors duration-(--duration-fast) ease-out motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-50';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-action text-on-action enabled:hover:bg-action-hover',
  secondary: 'border border-line bg-surface text-fg enabled:hover:bg-surface-muted',
  ghost: 'text-fg-muted enabled:hover:bg-surface-muted enabled:hover:text-fg',
};

const SIZES = { sm: 'h-7 px-2.5 text-xs', md: 'h-9 px-3.5 text-sm' };

/** A token-styled button. */
export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  disabled,
  className = '',
  children,
  ref,
  ...rest
}: ButtonProps) {
  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...rest}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}
