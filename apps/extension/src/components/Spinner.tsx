/*
  A small spinning circle shown inside a button while something is in progress.
  With "reduce motion" turned on it spins much more slowly instead of stopping, so it still
  reads as "working". Hidden from screen readers: the button's text says what is happening.
*/

/** A 16px spinner in the current text colour. */
export function Spinner({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={16}
      height={16}
      aria-hidden="true"
      focusable="false"
      className={`animate-spin motion-reduce:animate-[spin_2s_linear_infinite] ${className}`}
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth="3"
      />
      <path
        d="M21 12a9 9 0 00-9-9"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
