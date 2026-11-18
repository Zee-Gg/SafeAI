/*
  The popup screen: header, service-worker lab and footer (status, toggle and last-intercept
  cards are added in M5–M6). Every colour, radius and shadow comes from the design tokens.
  Accessibility: real <button>s, visible focus rings, live regions for changing values.
*/
import { useEffect, useState, type ReactNode, type SVGProps } from 'react';

import type { PingReply } from '@safeai/shared';
import { browser } from 'wxt/browser';

import { sendToBackground } from '../../src/lib/messaging';

/* ---------- Helpers ---------- */

/** Turns a past timestamp into short text like "12s ago", "3m ago" or "2h ago". */
function timeAgo(timestamp: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - timestamp) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

/** Returns the current time and re-renders every `intervalMs`, so "Xs ago" labels keep counting. */
function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

/* ---------- Building blocks ---------- */

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

/** A white rounded section with a title and optional action on the right. */
function Card({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className="rounded-lg border border-neutral-200 bg-neutral-0 p-4 shadow-sm"
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-neutral-900">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** One small labelled number, e.g. "Memory 3". */
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-neutral-50 px-3 py-2">
      <dt className="text-xs text-neutral-500">{label}</dt>
      <dd className="font-mono text-md font-medium text-neutral-900 tabular-nums">{value}</dd>
    </div>
  );
}

/* ---------- Sections ---------- */

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

/** Experiment card: ping the background worker and watch memory vs storage counters. */
function WorkerLabCard() {
  const now = useNow();
  const [reply, setReply] = useState<PingReply | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function ping() {
    setPending(true);
    setError(null);
    const result = await sendToBackground({ type: 'PING' });
    setPending(false);
    if (result.ok) setReply(result.data);
    else setError(result.error);
  }

  const pingButton = (
    <button
      type="button"
      onClick={() => void ping()}
      disabled={pending}
      className="inline-flex items-center rounded-md bg-primary-600 px-3 py-1.5 text-sm font-medium text-neutral-0 shadow-sm transition-colors duration-(--duration-fast) ease-out hover:bg-primary-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 active:bg-primary-800 disabled:cursor-not-allowed disabled:bg-neutral-300 disabled:text-neutral-600 motion-reduce:transition-none"
    >
      {pending ? 'Pinging…' : 'Ping worker'}
    </button>
  );

  return (
    <Card title="Service worker lab" action={pingButton}>
      <dl className="grid grid-cols-3 gap-2" aria-live="polite">
        <Stat label="Memory" value={reply ? String(reply.memoryCount) : '–'} />
        <Stat label="Storage" value={reply ? String(reply.storageCount) : '–'} />
        <Stat label="Started" value={reply ? timeAgo(reply.workerStartedAt, now) : '–'} />
      </dl>
      {error && (
        <p role="alert" className="mt-3 rounded-md bg-danger-subtle px-3 py-2 text-xs text-danger">
          {error}
        </p>
      )}
      <p className="mt-3 text-xs text-neutral-500">
        Wait ~40s without clicking, then ping again — memory resets, storage doesn&apos;t.
      </p>
    </Card>
  );
}

/** Bottom line with the extension version (read from the manifest). */
function Footer() {
  return (
    <footer className="px-4 pb-3 text-xs text-neutral-400">
      v{browser.runtime.getManifest().version}
    </footer>
  );
}

/** The whole popup screen. */
export function App() {
  return (
    <div className="flex flex-col">
      <Header />
      <main className="flex flex-col gap-3 p-4">
        <WorkerLabCard />
      </main>
      <Footer />
    </div>
  );
}
