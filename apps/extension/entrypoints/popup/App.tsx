/*
  The popup screen: header, status, test-replace toggle, last intercept, service-worker lab and
  footer. Every colour, radius and shadow comes from the design tokens.
  Accessibility: real <button>s, visible focus rings, live regions for changing values.
*/
import { useEffect, useState, type ReactNode, type SVGProps } from 'react';

import {
  getSiteName,
  InterceptRecordSchema,
  type InterceptRecord,
  type PingReply,
} from '@safeai/shared';
import { browser } from 'wxt/browser';

import { pingContentScript, sendToBackground } from '../../src/lib/messaging';
import { lastInterceptItem, settingsItem } from '../../src/lib/storage';

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

type TabStatus = 'checking' | 'active' | 'inactive';

/** Shows whether SafeAI is running on the current tab, by asking that tab's content script. */
function StatusCard() {
  const [status, setStatus] = useState<TabStatus>('checking');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // tab.id is available without the "tabs" permission (tab.url is not — hence the ping).
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      const result = tab?.id === undefined ? null : await pingContentScript(tab.id);
      if (!cancelled) setStatus(result?.ok ? 'active' : 'inactive');
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const view = {
    checking: {
      dot: 'bg-neutral-300 animate-pulse motion-reduce:animate-none',
      title: 'Checking…',
      hint: '',
    },
    active: {
      dot: 'bg-success',
      title: 'Active on ChatGPT',
      hint: 'Watching messages you send on this tab.',
    },
    inactive: {
      dot: 'bg-neutral-400',
      title: 'Open chatgpt.com to start',
      hint: 'SafeAI only runs on ChatGPT in Phase 1.',
    },
  }[status];

  return (
    <section
      aria-label="Status"
      className="flex items-start gap-3 rounded-lg border border-neutral-200 bg-neutral-0 px-4 py-3 shadow-sm"
    >
      <span aria-hidden="true" className={`mt-1.5 size-2 shrink-0 rounded-full ${view.dot}`} />
      <div role="status">
        <p className="text-sm font-semibold text-neutral-900">{view.title}</p>
        {view.hint && <p className="text-xs text-neutral-500">{view.hint}</p>}
      </div>
    </section>
  );
}

/** The "Test replace mode" switch. Saved in storage; ChatGPT tabs react instantly (they watch it). */
function TestModeToggle() {
  const [enabled, setEnabled] = useState<boolean | null>(null); // null = still loading

  useEffect(() => {
    void settingsItem.getValue().then((settings) => setEnabled(settings.testReplaceMode));
    return settingsItem.watch((settings) => setEnabled(settings?.testReplaceMode ?? false));
  }, []);

  function toggle() {
    if (enabled === null) return;
    void settingsItem.setValue({ testReplaceMode: !enabled });
  }

  const on = enabled === true;
  return (
    <section
      aria-label="Test replace mode"
      className="flex items-center justify-between gap-4 rounded-lg border border-neutral-200 bg-neutral-0 px-4 py-3 shadow-sm"
    >
      <div>
        <p id="test-mode-label" className="text-sm font-semibold text-neutral-900">
          Test replace mode
        </p>
        <p id="test-mode-help" className="text-xs text-neutral-500">
          Replaces emails with [EMAIL_1] before sending
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-labelledby="test-mode-label"
        aria-describedby="test-mode-help"
        disabled={enabled === null}
        onClick={toggle}
        className={`relative inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors duration-(--duration-fast) ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none ${
          on ? 'bg-primary-600 hover:bg-primary-700' : 'bg-neutral-300 hover:bg-neutral-400'
        }`}
      >
        <span
          aria-hidden="true"
          className={`inline-block size-5 rounded-full bg-neutral-0 shadow-sm transition-transform duration-(--duration-fast) ease-out motion-reduce:transition-none ${
            on ? 'translate-x-4.5' : 'translate-x-0.5'
          }`}
        />
      </button>
    </section>
  );
}

/** Loads the last intercept once, then keeps it up to date when storage changes. */
function useLastIntercept(): { loaded: boolean; record: InterceptRecord | null } {
  const [state, setState] = useState<{ loaded: boolean; record: InterceptRecord | null }>({
    loaded: false,
    record: null,
  });

  useEffect(() => {
    void sendToBackground({ type: 'GET_STATUS' }).then((result) =>
      setState({ loaded: true, record: result.ok ? result.data.lastIntercept : null }),
    );
    // Live updates: storage values aren't type-checked by Chrome, so validate them again here.
    return lastInterceptItem.watch((value) => {
      const parsed = InterceptRecordSchema.nullable().safeParse(value);
      setState({ loaded: true, record: parsed.success ? parsed.data : null });
    });
  }, []);

  return state;
}

/** Metadata about the most recent send attempt (never the text). */
function LastInterceptCard() {
  const now = useNow();
  const { loaded, record } = useLastIntercept();

  let body: ReactNode;
  if (!loaded) {
    body = <p className="text-sm text-neutral-500">Loading…</p>;
  } else if (!record) {
    body = (
      <div className="rounded-md border border-dashed border-neutral-200 px-3 py-4 text-center">
        <p className="text-sm font-medium text-neutral-700">No messages yet</p>
        <p className="text-xs text-neutral-500">
          Send a message on chatgpt.com and it shows up here.
        </p>
      </div>
    );
  } else {
    body = (
      <>
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-sm text-neutral-700">
            {getSiteName(record.site)} · {timeAgo(record.at, now)}
          </p>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              record.success ? 'bg-success-subtle text-success' : 'bg-danger-subtle text-danger'
            }`}
          >
            {record.success ? 'Success' : 'Failed — not sent'}
          </span>
        </div>
        <dl className="grid grid-cols-2 gap-2">
          <Stat label="Characters" value={String(record.charCount)} />
          <Stat label="Emails replaced" value={String(record.replacedCount)} />
          <Stat label="Method" value={record.method} />
          <Stat label="Mode" value={record.mode} />
        </dl>
      </>
    );
  }

  return (
    <Card title="Last intercept">
      <div aria-live="polite">{body}</div>
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
        <StatusCard />
        <TestModeToggle />
        <LastInterceptCard />
        <WorkerLabCard />
      </main>
      <Footer />
    </div>
  );
}
