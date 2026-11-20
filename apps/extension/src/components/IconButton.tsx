/*
  A square button that shows only an icon (e.g. the panel's × close button).
  `label` is required: it is what screen readers announce, since there is no visible text.
*/
import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  children: ReactNode;
  size?: 'sm' | 'md';
}

/** An icon-only button with an accessible name and a visible focus ring. */
export function IconButton({
  label,
  children,
  size = 'md',
  className = '',
  ...rest
}: IconButtonProps) {
  const box = size === 'sm' ? 'size-6' : 'size-8';
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`inline-flex ${box} shrink-0 items-center justify-center rounded-md text-fg-muted transition-colors duration-(--duration-fast) hover:bg-surface-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus motion-reduce:transition-none ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
