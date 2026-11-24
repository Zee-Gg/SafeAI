/*
  On-screen restoring (Phase 4): shows the real values in place of placeholders in ChatGPT's
  messages (your sent messages and its replies), on YOUR screen only.

  HOW, WITHOUT BREAKING CHATGPT (a React app):
  - We NEVER remove or move ChatGPT's own nodes (that's what crashes React apps). In ChatGPT's
    text node we only shorten the text to the part BEFORE the first placeholder, and insert our
    own nodes right after it: [value element] [rest of the text] [value element] …
  - When ChatGPT changes that text again (a streaming reply, a redraw), it overwrites its node:
    we remove our inserted nodes and do it again on the new text. When it removes the node, we
    remove ours too.
  - Each value element shows the value inside a CLOSED Shadow DOM: ChatGPT's page scripts see
    only an element whose text is the placeholder (textContent), never the real value.
  - Never in editable areas: the input box, the edit-message box, any contenteditable,
    textarea or input. Only inside message elements (the adapter decides what those are).
  Work is batched: changes are collected and handled once per animation frame.
  PRIVACY: values live in this module's memory only while you're in the conversation; never logged.
*/
import type { MappingEntry } from '@safeai/shared';

import type { SiteAdapter } from '../../adapters/types';
import { buildRestoreTable, findRestorations, type RestoreValue } from './matcher';

const HOST_ATTRIBUTE = 'data-safeai-restored';
const TOOLTIP = 'Restored on your device by SafeAI';
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT', 'TITLE']);
const EDITABLE =
  'textarea, input, [contenteditable]:not([contenteditable="false"]), [role="textbox"]';

// One shared stylesheet for every value element's shadow root: a subtle dotted underline.
// Font, size, colour and line wrapping are inherited from ChatGPT's text around it.
let valueSheet: CSSStyleSheet | null = null;
function getValueSheet(): CSSStyleSheet {
  if (!valueSheet) {
    valueSheet = new CSSStyleSheet();
    valueSheet.replaceSync(`
      .value {
        text-decoration-line: underline;
        text-decoration-style: dotted;
        text-decoration-thickness: 1px;
        text-underline-offset: 3px;
        text-decoration-color: color-mix(in srgb, currentColor 55%, transparent);
        cursor: help;
      }
    `);
  }
  return valueSheet;
}

/** What we changed in one of ChatGPT's text nodes, so it can be undone. */
interface Patch {
  /** ChatGPT's full text before we shortened it. */
  original: string;
  /** The shortened text we wrote (lets us recognise our own change). */
  ownData: string;
  /** Our nodes inserted after it (value elements and text pieces). */
  inserted: Node[];
}

/** The restorer's controls, used by the content script. */
export interface Restorer {
  /** Replaces the known placeholders (e.g. after switching chats). [] = restore nothing. */
  setEntries(entries: readonly MappingEntry[]): void;
  /** Adds placeholders that were just saved (after sending). */
  addEntries(entries: readonly MappingEntry[]): void;
  /** Undoes every change and stops watching (extension reloaded or updated). */
  stop(): void;
  /** How many value elements are on screen inside `message` (used by the copy button, M4). */
  countIn(message: Element): number;
}

/** Starts watching ChatGPT's page and restoring values. */
export function createRestorer(adapter: SiteAdapter): Restorer {
  let table = new Map<string, RestoreValue>();
  const patches = new Map<Text, Patch>();
  const ours = new WeakSet<Node>(); // every node we inserted
  const pending = new Set<Text>();
  let frame = 0;

  /** True if this text node may be restored: inside a message, never in anything editable. */
  function eligible(node: Text): boolean {
    const parent = node.parentElement;
    if (!parent || !node.isConnected || ours.has(node)) return false;
    if (SKIP_TAGS.has(parent.tagName)) return false;
    if (parent.closest(`[${HOST_ATTRIBUTE}]`)) return false; // our own element's fallback text
    if (parent.isContentEditable || parent.closest(EDITABLE)) return false;
    if (adapter.isInsideComposer(parent)) return false;
    return adapter.findMessage(parent) !== null;
  }

  /** Our element for one value: placeholder text outside, the real value in a closed shadow root. */
  function createValueElement(placeholderText: string, value: string): HTMLElement {
    const host = document.createElement('span');
    host.setAttribute(HOST_ATTRIBUTE, '');
    // Light DOM = the placeholder: what ChatGPT's scripts (and textContent) see. Not displayed.
    host.textContent = placeholderText;
    const shadow = host.attachShadow({ mode: 'closed' });
    shadow.adoptedStyleSheets = [getValueSheet()];
    const shown = document.createElement('span');
    shown.className = 'value';
    shown.title = TOOLTIP;
    shown.textContent = value;
    shadow.append(shown);
    ours.add(host);
    return host;
  }

  /** Restores the placeholders in one of ChatGPT's text nodes. */
  function apply(node: Text): void {
    if (table.size === 0 || patches.has(node) || !eligible(node)) return;
    const text = node.data;
    const matches = findRestorations(text, table);
    const first = matches[0];
    const parent = node.parentNode;
    if (!first || !parent) return;

    const inserted: Node[] = [];
    let pos = first.start;
    for (const match of matches) {
      if (match.start > pos) inserted.push(document.createTextNode(text.slice(pos, match.start)));
      inserted.push(createValueElement(text.slice(match.start, match.end), match.value));
      pos = match.end;
    }
    if (pos < text.length) inserted.push(document.createTextNode(text.slice(pos)));
    for (const piece of inserted) ours.add(piece);

    const ownData = text.slice(0, first.start);
    patches.set(node, { original: text, ownData, inserted });
    node.data = ownData; // ChatGPT's node stays where it is; only its text is shortened
    const after = node.nextSibling;
    for (const piece of inserted) parent.insertBefore(piece, after);
  }

  /** Removes our inserted nodes for a text node (ChatGPT's own node is left alone). */
  function dropPatch(node: Text): Patch | undefined {
    const patch = patches.get(node);
    if (!patch) return undefined;
    patches.delete(node);
    for (const piece of patch.inserted) piece.parentNode?.removeChild(piece);
    return patch;
  }

  /** Puts ChatGPT's text back exactly as it was (unless ChatGPT has changed it since). */
  function revert(node: Text): void {
    const patch = dropPatch(node);
    if (patch && node.data === patch.ownData) node.data = patch.original;
  }

  function schedule(node: Text): void {
    pending.add(node);
    if (frame === 0) frame = requestAnimationFrame(flush);
  }

  function flush(): void {
    frame = 0;
    const nodes = [...pending];
    pending.clear();
    for (const node of nodes) apply(node);
    // Forget patches whose node ChatGPT has thrown away (their parent went with it).
    for (const node of patches.keys()) if (!node.isConnected) dropPatch(node);
  }

  /** Queues every text node inside `root` that could hold a placeholder. */
  function collect(root: Node): void {
    if (ours.has(root)) return;
    if (root instanceof Text) {
      schedule(root);
      return;
    }
    if (!(root instanceof Element)) return;
    if (root.closest(`[${HOST_ATTRIBUTE}]`)) return;
    // Only bother with elements in, or containing, a message.
    if (!adapter.findMessage(root) && !root.querySelector(adapter.messageSelector)) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (n instanceof Text && !ours.has(n)) schedule(n);
    }
  }

  function rescanAll(): void {
    for (const message of adapter.getMessages()) collect(message);
  }

  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'characterData') {
        const node = record.target;
        if (!(node instanceof Text) || ours.has(node)) continue;
        const patch = patches.get(node);
        if (patch && node.data === patch.ownData) continue; // our own change
        if (patch) dropPatch(node); // ChatGPT rewrote it: our pieces are out of date
        schedule(node);
        continue;
      }
      for (const removed of record.removedNodes) {
        if (removed instanceof Text) dropPatch(removed);
      }
      for (const added of record.addedNodes) collect(added);
    }
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });

  /** Undoes everything on screen (keeps watching). */
  function revertAll(): void {
    pending.clear();
    for (const node of [...patches.keys()]) revert(node);
  }

  return {
    setEntries(entries) {
      revertAll();
      table = buildRestoreTable(entries);
      rescanAll();
    },
    addEntries(entries) {
      if (entries.length === 0) return;
      const merged = new Map(table);
      for (const [key, value] of buildRestoreTable(entries)) merged.set(key, value);
      // Undo and redo everything, so text pieces we inserted earlier are checked again too.
      revertAll();
      table = merged;
      rescanAll();
    },
    stop() {
      observer.disconnect();
      if (frame !== 0) cancelAnimationFrame(frame);
      revertAll();
      table = new Map();
    },
    countIn(message) {
      return message.querySelectorAll(`[${HOST_ATTRIBUTE}]`).length;
    },
  };
}
