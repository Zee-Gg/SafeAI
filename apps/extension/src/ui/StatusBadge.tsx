/*
  The small SafeAI pill shown at the top-right of chatgpt.com, just under ChatGPT's top bar
  (bottom-right covered ChatGPT's input buttons). It is click-through, except the error state.
  It lives inside a Shadow DOM (created by the content script), so ChatGPT's CSS can't break it
  and ours can't leak into ChatGPT. A tiny "store" lets the content script change what it shows.
  Note: Tailwind's shadow-* utilities rely on @property, which doesn't work inside Shadow DOM,
  so shadows here use the token directly: [box-shadow:var(--shadow-lg)].
*/
import { useEffect, useSyncExternalStore } from 'react';

/** What the badge is currently showing. */
export type BadgeState =
  | { kind: 'observing' }
  | { kind: 'replaceOn' }
  | { kind: 'success'; message: string }
  | { kind: 'error'; message: string };

/** Everything the badge renders: its state plus an optional dev-only info line. */
interface BadgeView {
  state: BadgeState;
  devInfo: string | null;
}

/**
 * Controller the content script uses to update the badge from outside React.
 * Written as function properties (not methods) because React calls getView/subscribe on their own.
 */
export interface BadgeStore {
  getView: () => BadgeView;
  subscribe: (listener: () => void) => () => void;
  /** Sets the resting state shown when nothing special is happening. */
  setMode: (mode: 'observing' | 'replaceOn') => void;
  /** Shows a green message that fades back to the resting state after 4 s. */
  showSuccess: (message: string) => void;
  /** Shows a red message that stays until the user clicks it. */
  showError: (message: string) => void;
  /** Sets (or clears with null) the small dev-only line, e.g. the selector check. */
  setDevInfo: (text: string | null) => void;
  /** Goes back to the resting state. */
  dismiss: () => void;
}

const SUCCESS_VISIBLE_MS = 4000;

/** Creates a badge store, starting in the "observing" state. */
export function createBadgeStore(): BadgeStore {
  let restingState: BadgeState = { kind: 'observing' };
  let view: BadgeView = { state: restingState, devInfo: null };
  const listeners = new Set<() => void>();

  function update(next: Partial<BadgeView>) {
    view = { ...view, ...next }; // new object, so React notices the change
    listeners.forEach((listener) => listener());
  }

  return {
    getView: () => view,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setMode: (mode) => {
      restingState = { kind: mode };
      // Don't hide an error the user hasn't seen yet.
      if (view.state.kind !== 'error') update({ state: restingState });
    },
    showSuccess: (message) => update({ state: { kind: 'success', message } }),
    showError: (message) => update({ state: { kind: 'error', message } }),
    setDevInfo: (devInfo) => update({ devInfo }),
    dismiss: () => update({ state: restingState }),
  };
}

const PILL =
  'flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium [box-shadow:var(--shadow-lg)] transition-opacity duration-(--duration-base) ease-out starting:opacity-0 motion-reduce:transition-none';

const STYLES: Record<BadgeState['kind'], { pill: string; dot: string }> = {
  observing: { pill: 'border-neutral-200 bg-neutral-0 text-neutral-700', dot: 'bg-primary-500' },
  replaceOn: { pill: 'border-primary-200 bg-primary-50 text-primary-800', dot: 'bg-primary-600' },
  success: { pill: 'border-success/20 bg-success-subtle text-success', dot: 'bg-success' },
  error: { pill: 'border-danger/30 bg-danger-subtle text-danger', dot: 'bg-danger' },
};

function labelFor(state: BadgeState): string {
  switch (state.kind) {
    case 'observing':
      return 'SafeAI · Observing';
    case 'replaceOn':
      return 'SafeAI · Test replace ON';
    case 'success':
    case 'error':
      return `SafeAI · ${state.message}`;
  }
}

/** The badge itself. Renders whatever the store currently holds. */
export function StatusBadge({ store }: { store: BadgeStore }) {
  const { state, devInfo } = useSyncExternalStore(store.subscribe, store.getView);

  // Success messages fade back to the resting state after a few seconds.
  useEffect(() => {
    if (state.kind !== 'success') return;
    const timer = window.setTimeout(() => store.dismiss(), SUCCESS_VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, [state, store]);

  const style = STYLES[state.kind];
  const content = (
    <>
      <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${style.dot}`} />
      {labelFor(state)}
    </>
  );

  return (
    // pointer-events-none: clicks pass straight through to ChatGPT, so the badge can never block
    // a ChatGPT button. Only the error badge (which must be clickable) turns them back on.
    <div className="pointer-events-none fixed top-16 right-4 z-2147483647 flex flex-col items-end gap-1 font-system">
      {state.kind === 'error' ? (
        // Errors stay until clicked, so the badge becomes a real button (keyboard accessible).
        // role="alert" on the wrapper makes screen readers announce the error immediately.
        <div role="alert" key={state.message}>
          <button
            type="button"
            onClick={() => store.dismiss()}
            title="Click to dismiss"
            className={`${PILL} ${style.pill} pointer-events-auto cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger`}
          >
            {content}
          </button>
        </div>
      ) : (
        <div key={labelFor(state)} role="status" className={`${PILL} ${style.pill}`}>
          {content}
        </div>
      )}
      {devInfo && (
        <div className="rounded-sm bg-neutral-900/80 px-2 py-0.5 font-mono text-xs text-neutral-0">
          {devInfo}
        </div>
      )}
    </div>
  );
}
