/*
  Opens the review panel on chatgpt.com inside its own Shadow DOM (WXT createShadowRootUi):
  position "modal" (covers the page), the highest z-index, and isolateEvents (your key presses
  inside the panel never reach ChatGPT). It follows ChatGPT's light/dark theme live.
  Returns the user's decision and a close() that plays the closing animation, then removes the
  panel completely, so the real values it showed leave memory with it.
*/
import { createShadowRootUi, type ContentScriptContext } from '#imports';
import { createRoot, type Root } from 'react-dom/client';

import { ensureFonts } from '../fonts';
import { getChatGptTheme, watchTheme } from '../theme';
import type { ReviewDecision, ReviewInput } from './model';
import { ReviewPanel, type ClosingSignal } from './ReviewPanel';

const CLOSE_ANIMATION_MS = 200;
const MAX_Z_INDEX = 2147483647;

/** The open panel: wait for `decision`, then call `close()`. */
export interface ReviewPanelHandle {
  decision: Promise<ReviewDecision>;
  /** Fades the panel out and removes it. Safe to call more than once. */
  close: () => Promise<void>;
}

/** Shows the review panel for one message. */
export async function openReviewPanel(
  ctx: ContentScriptContext,
  input: ReviewInput,
): Promise<ReviewPanelHandle> {
  ensureFonts();

  let resolveDecision: (decision: ReviewDecision) => void = () => undefined;
  const decision = new Promise<ReviewDecision>((resolve) => {
    resolveDecision = resolve;
  });
  const closing = createClosingSignal();
  let stopWatchingTheme: () => void = () => undefined;

  const ui = await createShadowRootUi<Root>(ctx, {
    name: 'safeai-review',
    position: 'modal',
    zIndex: MAX_Z_INDEX,
    isolateEvents: true, // keydown/keyup/keypress stay inside the panel
    onMount(container) {
      const wrapper = document.createElement('div');
      wrapper.dataset.theme = getChatGptTheme();
      stopWatchingTheme = watchTheme((theme) => {
        wrapper.dataset.theme = theme;
      });
      container.append(wrapper);
      const root = createRoot(wrapper);
      root.render(<ReviewPanel input={input} onDecision={resolveDecision} closing={closing} />);
      return root;
    },
    onRemove(root) {
      stopWatchingTheme();
      root?.unmount(); // the panel's state (with the real values) is gone after this
    },
  });
  ui.mount();

  let closed = false;
  return {
    decision,
    async close() {
      if (closed) return;
      closed = true;
      closing.start();
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      await new Promise((resolve) => setTimeout(resolve, reduceMotion ? 0 : CLOSE_ANIMATION_MS));
      ui.remove();
    },
  };
}

/** A one-way switch (open → closing) that React can subscribe to. */
function createClosingSignal(): ClosingSignal & { start: () => void } {
  let value = false;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    start: () => {
      value = true;
      listeners.forEach((listener) => listener());
    },
  };
}
