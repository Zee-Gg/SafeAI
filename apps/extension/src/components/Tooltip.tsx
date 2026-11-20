/*
  A small tooltip shown on hover AND keyboard focus (e.g. the full value of a shortened item).
  The trigger is focusable and points to the tooltip with aria-describedby, so screen readers
  read the full text too. Pure CSS show/hide: no timers, no positioning library.
*/
import { useId, type ReactNode } from 'react';

interface TooltipProps {
  /** The tooltip text. */
  content: string;
  /** What you hover/focus. */
  children: ReactNode;
}

/** Wraps `children` in a focusable trigger that shows `content` on hover/focus. */
export function Tooltip({ content, children }: TooltipProps) {
  const id = useId();
  return (
    <span className="group/tooltip relative inline-flex min-w-0">
      <span
        tabIndex={0}
        aria-describedby={id}
        className="min-w-0 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        {children}
      </span>
      <span
        id={id}
        role="tooltip"
        className="pointer-events-none invisible absolute bottom-full left-0 z-10 mb-1 w-max max-w-[min(420px,80vw)] rounded-md bg-neutral-900 px-2 py-1 font-ui-mono text-xs break-all text-neutral-0 opacity-0 [box-shadow:var(--shadow-md)] transition-opacity duration-(--duration-fast) group-focus-within/tooltip:visible group-focus-within/tooltip:opacity-100 group-hover/tooltip:visible group-hover/tooltip:opacity-100 motion-reduce:transition-none"
      >
        {content}
      </span>
    </span>
  );
}
