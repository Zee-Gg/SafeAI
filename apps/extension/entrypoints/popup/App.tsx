/*
  The popup screen: Protection switch (On / Paused), status, last activity, placeholder memory
  (retention in plain words, remembered-chat count, unreadable notice, Clear with confirmation),
  and — in dev builds only — dev tools (override warning), the service-worker lab and the
  Playground link. Every colour, radius and shadow comes from the design tokens.
  Accessibility: real <button>s, visible focus rings, live regions for changing values.
*/
import { useEffect, useState, type ReactNode, type SVGProps } from 'react';

import {
  CATEGORY_GROUP,
  CATEGORY_LABEL,
  DEFAULT_POLICY,
  getSiteName,
  InterceptRecordSchema,
  PolicySchema,
  type CategoryGroup,
  type DetectorCategory,
  type InterceptAction,
  type InterceptRecord,
  type PingReply,
} from '@safeai/shared';
import { browser } from 'wxt/browser';

import { pingContentScript, sendToBackground } from '../../src/lib/messaging';
import {
  devPolicyOverrideItem,
  isProtectionEnabled,
  lastInterceptItem,
  settingsItem,
  vaultStatusItem,
} from '../../src/lib/storage';

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
      {import.meta.env.DEV && (
        <span className="ml-auto rounded-full bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-700 ring-1 ring-primary-200 ring-inset">
          Phase 4 · Dev
        </span>
      )}
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
      hint: 'SafeAI runs on ChatGPT for now.',
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

/** The Protection switch (On / Paused). Saved in storage; ChatGPT tabs react instantly. */
function ProtectionToggle() {
  const [enabled, setEnabled] = useState<boolean | null>(null); // null = still loading

  useEffect(() => {
    void settingsItem.getValue().then((settings) => setEnabled(isProtectionEnabled(settings)));
    return settingsItem.watch((settings) => setEnabled(isProtectionEnabled(settings)));
  }, []);

  function toggle() {
    if (enabled === null) return;
    void settingsItem.setValue({ protectionEnabled: !enabled });
  }

  const on = enabled !== false;
  return (
    <section
      aria-label="Protection"
      className="flex items-center justify-between gap-4 rounded-lg border border-neutral-200 bg-neutral-0 px-4 py-3 shadow-sm"
    >
      <div>
        <p id="protection-label" className="text-sm font-semibold text-neutral-900">
          Protection{' '}
          <span className={on ? 'text-success' : 'text-neutral-500'}>· {on ? 'On' : 'Paused'}</span>
        </p>
        <p id="protection-help" className="text-xs text-neutral-500">
          {on
            ? 'Every message is checked before it reaches ChatGPT.'
            : 'Messages are sent unchanged. SafeAI only observes.'}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-labelledby="protection-label"
        aria-describedby="protection-help"
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

/** Chip colours per category group (static class names so Tailwind can find them). */
const GROUP_CHIP: Record<CategoryGroup, string> = {
  personal: 'bg-personal-subtle text-personal',
  secrets: 'bg-secrets-subtle text-secrets',
  financial: 'bg-financial-subtle text-financial',
  business: 'bg-business-subtle text-business',
};

/** What was found, per category, e.g. "Email 2" "API key 1". Counts only — never values. */
function CategoryChips({ counts }: { counts: Partial<Record<DetectorCategory, number>> }) {
  const entries = Object.entries(counts) as [DetectorCategory, number][];
  if (entries.length === 0) {
    return <p className="mt-3 text-xs text-neutral-500">Nothing sensitive found.</p>;
  }
  return (
    <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Found per category">
      {entries.map(([category, count]) => (
        <li
          key={category}
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${GROUP_CHIP[CATEGORY_GROUP[category]]}`}
        >
          {CATEGORY_LABEL[category]} {count}
        </li>
      ))}
    </ul>
  );
}

/** How each action is shown: its label and pill colours. */
const ACTION_VIEW: Record<InterceptAction, { label: string; pill: string }> = {
  protected: { label: 'Protected', pill: 'bg-success-subtle text-success' },
  sent_clean: { label: 'Sent clean', pill: 'bg-success-subtle text-success' },
  sent_unredacted: { label: 'Sent without redaction', pill: 'bg-warning-subtle text-warning' },
  cancelled: { label: 'Cancelled', pill: 'bg-neutral-100 text-neutral-700' },
  blocked: { label: 'Blocked', pill: 'bg-danger-subtle text-danger' },
  incomplete: { label: 'Too long', pill: 'bg-danger-subtle text-danger' },
  // Covers every "stopped for safety" case: couldn't write/verify, no memory, message changed,
  // or the automatic send failed.
  write_failed: { label: 'Not sent (error)', pill: 'bg-danger-subtle text-danger' },
  paused: { label: 'Paused', pill: 'bg-neutral-100 text-neutral-700' },
};

/** What SafeAI did with the most recent message (metadata only, never text or values). */
function LastActivityCard() {
  const now = useNow();
  const { loaded, record } = useLastIntercept();

  let body: ReactNode;
  if (!loaded) {
    body = <p className="text-sm text-neutral-500">Loading…</p>;
  } else if (!record) {
    body = (
      <div className="rounded-md border border-dashed border-neutral-200 px-3 py-4 text-center">
        <p className="text-sm font-medium text-neutral-700">No activity yet</p>
        <p className="text-xs text-neutral-500">
          Send a message on chatgpt.com and it shows up here.
        </p>
      </div>
    );
  } else {
    const view = ACTION_VIEW[record.action];
    body = (
      <>
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-sm text-neutral-700">
            {getSiteName(record.site)} · {timeAgo(record.at, now)}
          </p>
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${view.pill}`}>
            {view.label}
          </span>
        </div>
        <dl className="grid grid-cols-3 gap-2">
          <Stat label="Replaced" value={String(record.replacedCount)} />
          <Stat label="Scan time" value={`${record.durationMs.toFixed(1)} ms`} />
          <Stat label="Characters" value={String(record.charCount)} />
        </dl>
        <CategoryChips counts={record.countsByCategory} />
      </>
    );
  }

  return (
    <Card title="Last activity">
      <div aria-live="polite">{body}</div>
    </Card>
  );
}

/** The retention the extension uses: DEFAULT_POLICY, or the Playground override in dev builds. */
function useRetentionDays(): number {
  const [days, setDays] = useState(DEFAULT_POLICY.mappingRetentionDays);
  useEffect(() => {
    const item = devPolicyOverrideItem; // null in production builds
    if (!import.meta.env.DEV || !item) return;
    const apply = (value: unknown) => {
      const parsed = PolicySchema.safeParse(value);
      setDays(
        parsed.success ? parsed.data.mappingRetentionDays : DEFAULT_POLICY.mappingRetentionDays,
      );
    };
    void item.getValue().then(apply);
    return item.watch(apply);
  }, []);
  return days;
}

/** The retention in plain words. */
function retentionSentence(days: number): string {
  if (days === 0) return 'Real values are remembered only until you close the browser.';
  return `Real values are remembered on this device for ${days} ${days === 1 ? 'day' : 'days'}.`;
}

/**
 * Placeholder memory (everyone): how long real values are kept, how many chats are remembered
 * (a count only, never values), a notice if encrypted memory couldn't be read, and
 * "Clear placeholder memory" with a confirmation step.
 */
function MemoryCard() {
  const days = useRetentionDays();
  const [conversations, setConversations] = useState<number | null>(null);
  const [unreadable, setUnreadable] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState('');

  async function refreshCount() {
    const result = await sendToBackground({ type: 'MAPPING_STATS' });
    setConversations(result.ok ? result.data.conversations : null);
  }

  useEffect(() => {
    void refreshCount();
    void vaultStatusItem.getValue().then((status) => setUnreadable(status.unreadableCount > 0));
    return vaultStatusItem.watch((status) => setUnreadable(status.unreadableCount > 0));
  }, []);

  async function clearMemory() {
    const result = await sendToBackground({ type: 'MAPPING_CLEAR_ALL' });
    setConfirming(false);
    setMessage(result.ok ? 'Placeholder memory cleared.' : "Couldn't clear it. Please try again.");
    await refreshCount();
  }

  const button =
    'inline-flex items-center rounded-md px-3 py-1.5 text-sm font-medium shadow-sm transition-colors duration-(--duration-fast) ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 motion-reduce:transition-none';

  return (
    <Card title="Placeholder memory">
      <p className="text-sm text-neutral-800">{retentionSentence(days)}</p>
      <p className="mt-0.5 text-xs text-neutral-500">
        {days === 0
          ? 'Kept in memory only, never written to disk.'
          : 'Encrypted, and counted from the last time you use a chat.'}
      </p>
      <p className="mt-2 text-sm text-neutral-700" aria-live="polite">
        Remembered chats:{' '}
        <strong className="tabular-nums">{conversations === null ? '–' : conversations}</strong>
      </p>

      {unreadable && (
        <p
          role="alert"
          className="mt-3 rounded-md bg-warning-subtle px-3 py-2 text-xs text-warning"
        >
          Some remembered values couldn&apos;t be read, so placeholders are shown as they are and
          those chats can&apos;t send protected messages. Clear placeholder memory to start fresh.
        </p>
      )}

      <div className="mt-3" aria-live="polite">
        {confirming ? (
          <div className="rounded-md border border-neutral-200 bg-neutral-50 p-3">
            <p className="text-sm text-neutral-800">
              Forget every remembered value? Placeholders already in your chats will stay as
              placeholders.
            </p>
            <div className="mt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className={`${button} border border-neutral-300 bg-neutral-0 text-neutral-800 hover:bg-neutral-50`}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void clearMemory()}
                className={`${button} bg-danger text-neutral-0 hover:opacity-90`}
              >
                Clear
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              setMessage('');
              setConfirming(true);
            }}
            className={`${button} border border-neutral-300 bg-neutral-0 text-neutral-800 hover:bg-neutral-50`}
          >
            Clear placeholder memory
          </button>
        )}
        {message && <p className="mt-2 text-xs text-neutral-500">{message}</p>}
      </div>
    </Card>
  );
}

/** DEV BUILDS ONLY: warns when the Playground policy override is active. */
function DevToolsCard() {
  const [overrideActive, setOverrideActive] = useState(false);

  useEffect(() => {
    const item = devPolicyOverrideItem;
    if (!item) return;
    void item.getValue().then((value) => setOverrideActive(value !== null));
    return item.watch((value) => setOverrideActive(value !== null));
  }, []);

  return (
    <Card title="Dev tools">
      <p className="text-sm text-neutral-700">
        {overrideActive ? (
          <span className="inline-flex rounded-full bg-warning-subtle px-2 py-0.5 text-xs font-medium text-warning">
            Dev policy override active
          </span>
        ) : (
          'ChatGPT uses the default policy.'
        )}
      </p>
    </Card>
  );
}

/** Bottom line with the extension version (read from the manifest). */
function Footer() {
  return (
    <footer className="flex items-center justify-between gap-2 px-4 pb-3 text-xs text-neutral-400">
      <span>v{browser.runtime.getManifest().version}</span>
      {/* DEV ONLY: in production builds import.meta.env.DEV is false, so this link (and the
          Playground page itself) don't exist. Opening a tab needs no extra permission. */}
      {import.meta.env.DEV && (
        <button
          type="button"
          onClick={() => {
            void browser.tabs.create({ url: browser.runtime.getURL('/playground.html') });
            window.close();
          }}
          className="rounded-sm font-medium text-primary-700 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
        >
          Open Detection Playground ↗
        </button>
      )}
    </footer>
  );
}

/** The whole popup screen. */
export function App() {
  return (
    <div className="flex flex-col">
      <Header />
      <main className="flex flex-col gap-3 p-4">
        <ProtectionToggle />
        <StatusCard />
        <LastActivityCard />
        <MemoryCard />
        {import.meta.env.DEV && <DevToolsCard />}
        {import.meta.env.DEV && <WorkerLabCard />}
      </main>
      <Footer />
    </div>
  );
}
