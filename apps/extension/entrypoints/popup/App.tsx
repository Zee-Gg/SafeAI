/*
  The popup screen. M3 shows only the header; the status, toggle, last-intercept and
  service-worker-lab cards are added in M4–M6. Every colour/radius/shadow comes from the tokens.
*/
import type { SVGProps } from 'react';

/** Teal shield logo, drawn with the current text colour. */
function ShieldIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M12 2.5 4.5 5.25v6.1c0 4.6 3.1 8.6 7.5 10.15 4.4-1.55 7.5-5.55 7.5-10.15v-6.1L12 2.5Z"
        fill="currentColor"
      />
      <path
        d="m8.5 12.25 2.4 2.4 4.6-4.9"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** The top bar: logo, product name and phase pill. */
function Header() {
  return (
    <header className="flex items-center gap-2 border-b border-neutral-200 bg-neutral-0 px-4 py-3">
      <ShieldIcon className="size-6 text-primary-600" />
      <h1 className="text-md font-semibold tracking-tight text-neutral-900">SafeAI</h1>
      <span className="ml-auto rounded-full bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-700 ring-1 ring-primary-200 ring-inset">
        Phase 1 · Dev
      </span>
    </header>
  );
}

/** The whole popup screen. */
export function App() {
  return (
    <div className="flex flex-col">
      <Header />
      <main className="p-4 text-sm text-neutral-500">
        More sections arrive in the next milestones.
      </main>
    </div>
  );
}
