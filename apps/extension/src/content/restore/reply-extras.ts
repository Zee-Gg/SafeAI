/*
  Extras for ChatGPT replies that contain restored values (Phase 4 M4):
  - a small "Copy with real values" button under each such reply (ChatGPT's own copy button
    copies placeholders, because it reads ChatGPT's data, not the screen);
  - the badge "Restored N items" once a NEW reply has finished (it stopped changing for a moment).
  The button lives in its own closed Shadow DOM, placed right AFTER the reply element (never
  inside ChatGPT's text, never moving ChatGPT's nodes), and follows ChatGPT's light/dark theme.
  PRIVACY: the real values go only to your clipboard, and only when you click.
*/
import type { SiteAdapter } from '../../adapters/types';
import { getChatGptTheme, watchTheme } from '../../ui/theme';
import type { BadgeStore } from '../../ui/StatusBadge';
import type { Restorer } from './restorer';

// A reply counts as "finished" when nothing in it was restored/changed for this long.
const SETTLE_MS = 1500;
// Right after a chat is loaded (page reload, chat switch) restored replies are old ones: no badge.
const QUIET_AFTER_LOAD_MS = 3000;
const COPIED_VISIBLE_MS = 2000;

const BUTTON_CSS = `
  :host { all: initial; display: block; margin: 4px 0 8px; }
  button {
    display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 10px;
    border-radius: 8px; border: 1px solid var(--line); background: var(--surface);
    color: var(--muted); cursor: pointer;
    font: 500 12px/16px 'SafeAI Geist', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;
    transition: background-color 150ms ease-out, color 150ms ease-out;
  }
  button:hover { background: var(--hover); color: var(--fg); }
  button:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
  button[data-state='copied'] { color: var(--success); }
  button[data-state='failed'] { color: var(--danger); }
  svg { width: 14px; height: 14px; }
  @media (prefers-reduced-motion: reduce) { button { transition: none; } }
  /* The same values as the design tokens (packages/design/src/tokens.css), light then dark. */
  :host { --line: #dfe4ea; --surface: #ffffff; --hover: #f6f8fa; --fg: #171c26; --muted: #6b7686;
    --focus: #0c7f7b; --success: #15803d; --danger: #b42318; }
  :host([data-theme='dark']) { --line: #262d3a; --surface: #151a23; --hover: #1b212c;
    --fg: #e6eaf0; --muted: #9aa5b3; --focus: #2fb8b0; --success: #4ade80; --danger: #ff8a80; }
`;

const COPY_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 012-2h10"/></svg>';
const CHECK_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7"/></svg>';

let sheet: CSSStyleSheet | null = null;
function getSheet(): CSSStyleSheet {
  if (!sheet) {
    sheet = new CSSStyleSheet();
    sheet.replaceSync(BUTTON_CSS);
  }
  return sheet;
}

/** Starts adding copy buttons and badge messages. Returns a function that removes everything. */
export function startReplyExtras(
  adapter: SiteAdapter,
  restorer: Restorer,
  badge: BadgeStore,
): () => void {
  const buttons = new Map<HTMLElement, HTMLElement>(); // reply → our button's host
  const announced = new WeakMap<Element, number>(); // reply → count already announced
  let settleTimer = 0;
  let theme = getChatGptTheme();

  /** Our button for one reply (in a closed shadow root). */
  function createButton(reply: HTMLElement): HTMLElement {
    const host = document.createElement('div');
    host.setAttribute('data-safeai-copy', '');
    host.dataset.theme = theme;
    const shadow = host.attachShadow({ mode: 'closed' });
    shadow.adoptedStyleSheets = [getSheet()];
    const button = document.createElement('button');
    button.type = 'button';
    const setLabel = (icon: string, label: string) => {
      // Static, trusted markup only (our own icons and fixed words): never any value.
      button.innerHTML = `${icon}<span>${label}</span>`;
    };
    setLabel(COPY_ICON, 'Copy with real values');
    button.title = 'Copies this reply with the real values instead of placeholders';
    let resetTimer = 0;
    button.addEventListener('click', () => {
      const text = restorer.textWithValues(reply);
      navigator.clipboard.writeText(text).then(
        () => {
          button.dataset.state = 'copied';
          setLabel(CHECK_ICON, 'Copied');
        },
        () => {
          button.dataset.state = 'failed';
          setLabel(COPY_ICON, "Couldn't copy");
        },
      );
      window.clearTimeout(resetTimer);
      resetTimer = window.setTimeout(() => {
        delete button.dataset.state;
        setLabel(COPY_ICON, 'Copy with real values');
      }, COPIED_VISIBLE_MS);
    });
    shadow.append(button);
    return host;
  }

  /** Adds/removes buttons so exactly the replies with restored values have one. */
  function refreshButtons(): void {
    for (const [reply, host] of buttons) {
      if (!reply.isConnected || restorer.countIn(reply) === 0) {
        host.remove();
        buttons.delete(reply);
      } else if (host.previousElementSibling !== reply) {
        reply.after(host); // ChatGPT moved things around: put ours back right after the reply
      }
    }
    for (const message of adapter.getMessages()) {
      if (!adapter.isReply(message) || buttons.has(message)) continue;
      if (restorer.countIn(message) === 0) continue;
      const host = createButton(message);
      message.after(host); // a new sibling after the reply; ChatGPT's own nodes aren't moved
      buttons.set(message, host);
    }
  }

  /** Badge "Restored N items" for the newest reply, once per new value count. */
  function announce(): void {
    const replies = adapter.getMessages().filter((m) => adapter.isReply(m));
    const latest = replies[replies.length - 1];
    if (!latest) return;
    const count = restorer.countIn(latest);
    const before = announced.get(latest) ?? 0;
    if (count <= before) return;
    announced.set(latest, count);
    if (Date.now() - restorer.lastLoadedAt() < QUIET_AFTER_LOAD_MS) return; // an old reply
    badge.showInfo(`Restored ${count} ${count === 1 ? 'item' : 'items'}`);
  }

  const unsubscribe = restorer.onUpdate(() => {
    // Wait until the reply stops changing (streaming), then update buttons and the badge.
    window.clearTimeout(settleTimer);
    settleTimer = window.setTimeout(() => {
      refreshButtons();
      announce();
    }, SETTLE_MS);
  });

  const stopTheme = watchTheme((next) => {
    theme = next;
    for (const host of buttons.values()) host.dataset.theme = next;
  });

  return () => {
    unsubscribe();
    stopTheme();
    window.clearTimeout(settleTimer);
    for (const host of buttons.values()) host.remove();
    buttons.clear();
  };
}
