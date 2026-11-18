/*
  Catches Enter presses and Send clicks BEFORE ChatGPT sees them.
  Listeners sit on `document` in the CAPTURE phase: events travel down from the document to the
  clicked element first, so we run before ChatGPT's own handlers. Listening on `document`
  (event delegation) also survives ChatGPT replacing its input box when you switch chats.
  In "observe" mode nothing is blocked; in "replace" mode the event is stopped and we take over.
*/
import type { SiteAdapter } from '../adapters/types';

/** What started the send attempt. */
export type Trigger = 'enter' | 'click' | 'submit';

/** "observe" = watch only; "replace" = block, then let the caller send a changed version. */
export type InterceptMode = 'observe' | 'replace';

// One send can fire several events (e.g. Enter, then a form submit). Treat events this close
// together as ONE attempt.
const DUPLICATE_WINDOW_MS = 300;
// Safety net: if our own re-send never happens, the bypass switches itself off.
const BYPASS_EXPIRY_MS = 1000;

let removeListeners: (() => void) | null = null;
let bypassActive = false;
let bypassExpiryTimer: number | undefined;
let lastAttemptAt = 0;

/** Starts watching for send attempts. Calls onAttempt once per attempt. */
export function startInterceptor(
  adapter: SiteAdapter,
  getMode: () => InterceptMode,
  onAttempt: (trigger: Trigger, mode: InterceptMode) => void,
): void {
  stopInterceptor();

  function handle(event: Event, trigger: Trigger): void {
    // Our own re-send (see allowNextSubmit): let it through untouched. Clear the bypass after the
    // current task, so follow-up events of the SAME re-send (click → submit) also pass.
    if (bypassActive) {
      window.setTimeout(clearBypass, 0);
      return;
    }

    const mode = getMode();
    if (mode === 'replace') {
      event.preventDefault(); // stop the browser's default action (e.g. form submit)
      event.stopImmediatePropagation(); // stop ChatGPT's own handlers from ever seeing it
    }

    const now = Date.now();
    if (now - lastAttemptAt < DUPLICATE_WINDOW_MS) return;
    lastAttemptAt = now;
    onAttempt(trigger, mode);
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key !== 'Enter') return;
    if (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return; // Shift+Enter = new line
    if (event.isComposing) return; // typing with an IME (e.g. Chinese/Japanese): Enter picks a character
    if (!(event.target instanceof Element) || !adapter.isInsideComposer(event.target)) return;
    handle(event, 'enter');
  }

  function onClick(event: MouseEvent): void {
    if (!(event.target instanceof Element) || !adapter.isSendButton(event.target)) return;
    handle(event, 'click');
  }

  function onSubmit(event: SubmitEvent): void {
    const composer = adapter.getComposer();
    if (
      !(event.target instanceof HTMLFormElement) ||
      !composer ||
      !event.target.contains(composer)
    ) {
      return;
    }
    handle(event, 'submit');
  }

  // `true` = capture phase (run before the page's own listeners).
  document.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('click', onClick, true);
  document.addEventListener('submit', onSubmit, true);

  removeListeners = () => {
    document.removeEventListener('keydown', onKeyDown, true);
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('submit', onSubmit, true);
  };
}

/** Lets OUR next re-send through without intercepting it again (one-time bypass). */
export function allowNextSubmit(): void {
  bypassActive = true;
  window.clearTimeout(bypassExpiryTimer);
  bypassExpiryTimer = window.setTimeout(clearBypass, BYPASS_EXPIRY_MS);
}

/** Removes all listeners (e.g. when the extension reloads). */
export function stopInterceptor(): void {
  removeListeners?.();
  removeListeners = null;
  clearBypass();
}

function clearBypass(): void {
  bypassActive = false;
  window.clearTimeout(bypassExpiryTimer);
}
