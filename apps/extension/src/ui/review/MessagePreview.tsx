/*
  The message preview at the top of the review panel, with two tabs:
  - "Your message": your text with every found item highlighted. Select any text with the mouse
    to protect it too ("Protect this").
  - "What ChatGPT will see": the text with placeholders such as [EMAIL_1], plus the one-time
    hint line if it will be added.
  Each piece of text carries its start position (data-offset), which is how a selection inside
  the Shadow DOM is turned back into positions in the message.
*/
import { CATEGORY_GROUP, CATEGORY_LABEL, type DetectorCategory } from '@safeai/shared';
import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';

import { Chip } from '../../components/Chip';
import { HINT_LINE } from '../../content/redactor';
import { AddItemPopover } from './AddItemPopover';
import { GROUP_STYLE } from './group-style';
import { MAX_ADDED_LENGTH, messagePieces, type OutputPiece, type ReviewRow } from './model';

type Tab = 'original' | 'output';

interface MessagePreviewProps {
  text: string;
  rows: readonly ReviewRow[];
  output: { pieces: OutputPiece[]; hint: boolean };
  onAdd: (category: DetectorCategory, value: string) => void;
  disabled: boolean;
}

/** The two-tab message preview with select-to-protect. */
export function MessagePreview({ text, rows, output, onAdd, disabled }: MessagePreviewProps) {
  const [tab, setTab] = useState<Tab>('original');
  const [selected, setSelected] = useState<string | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const baseId = useId();
  const pieces = useMemo(() => messagePieces(text, rows), [text, rows]);

  /** Reads the current text selection and offers "Protect this" if it's inside the message. */
  function readSelection() {
    const box = contentRef.current;
    if (!box || disabled) return;
    const range = currentRange(box);
    if (!range) return;
    const a = offsetAt(box, range.startContainer, range.startOffset);
    const b = offsetAt(box, range.endContainer, range.endOffset);
    if (a === null || b === null) return;
    let start = Math.min(a, b);
    let end = Math.max(a, b);
    while (start < end && /\s/.test(text.charAt(start))) start++; // trim spaces around it
    while (end > start && /\s/.test(text.charAt(end - 1))) end--;
    if (end - start < 1 || end - start > MAX_ADDED_LENGTH) return;
    setSelected(text.slice(start, end));
  }

  function onTabKey(event: KeyboardEvent) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const next: Tab = tab === 'original' ? 'output' : 'original';
    setTab(next);
    event.currentTarget.parentElement
      ?.querySelector<HTMLButtonElement>(`[data-tab="${next}"]`)
      ?.focus();
  }

  const tabButton = (id: Tab, label: string) => (
    <button
      type="button"
      role="tab"
      data-tab={id}
      id={`${baseId}-tab-${id}`}
      aria-selected={tab === id}
      aria-controls={`${baseId}-panel`}
      tabIndex={tab === id ? 0 : -1}
      onClick={() => setTab(id)}
      onKeyDown={onTabKey}
      className={`h-7 rounded-md px-2.5 text-xs font-medium transition-colors duration-(--duration-fast) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus motion-reduce:transition-none ${
        tab === id
          ? 'bg-surface text-fg [box-shadow:var(--shadow-sm)]'
          : 'text-fg-muted hover:text-fg'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div>
      <div
        role="tablist"
        aria-label="Message preview"
        className="inline-flex gap-1 rounded-lg bg-surface-muted p-1"
      >
        {tabButton('original', 'Your message')}
        {tabButton('output', 'What ChatGPT will see')}
      </div>

      <div
        id={`${baseId}-panel`}
        role="tabpanel"
        aria-labelledby={`${baseId}-tab-${tab}`}
        className="mt-2 max-h-44 overflow-y-auto overscroll-contain rounded-md border border-line bg-surface-muted p-3 text-sm [overflow-wrap:anywhere] whitespace-pre-wrap text-fg"
      >
        {tab === 'original' ? (
          <div ref={contentRef} onMouseUp={readSelection} className="select-text">
            {pieces.map((piece) => {
              const value = text.slice(piece.start, piece.end);
              if (!piece.row) {
                return (
                  <span key={piece.start} data-offset={piece.start}>
                    {value}
                  </span>
                );
              }
              return (
                <span
                  key={piece.start}
                  data-offset={piece.start}
                  title={CATEGORY_LABEL[piece.row.category]}
                  className={`rounded-sm px-0.5 ${markStyle(piece.row)}`}
                >
                  {value}
                </span>
              );
            })}
          </div>
        ) : (
          <div>
            {output.pieces.map((piece, i) =>
              piece.kind === 'placeholder' ? (
                <Chip key={i}>{piece.text}</Chip>
              ) : (
                <span key={i}>{piece.text}</span>
              ),
            )}
            {output.hint && (
              <span className="text-fg-muted italic">
                {'\n\n'}
                {HINT_LINE}
              </span>
            )}
          </div>
        )}
      </div>

      {tab === 'original' && !selected && !disabled && (
        <p className="mt-1.5 text-xs text-fg-muted">
          Tip: select any text above to protect it too.
        </p>
      )}
      {tab === 'original' && selected && (
        <AddItemPopover
          value={selected}
          onAdd={(category) => {
            onAdd(category, selected);
            setSelected(null);
          }}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

/** Highlight style: ticked = filled in the group colour; unticked = dotted underline; blocked = red. */
function markStyle(row: ReviewRow): string {
  if (row.kind === 'block')
    return 'bg-danger-subtle text-danger underline decoration-wavy decoration-danger';
  const group = GROUP_STYLE[CATEGORY_GROUP[row.category]];
  return row.selected
    ? group.mark
    : `underline decoration-dotted decoration-2 underline-offset-2 ${group.text} ${group.decoration}`;
}

/** The selection's range, read from OUR shadow root (the page's own selection can't see inside). */
function currentRange(box: HTMLElement): Range | null {
  const root = box.getRootNode();
  const selection =
    root instanceof ShadowRoot && hasGetSelection(root)
      ? root.getSelection()
      : document.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  return box.contains(range.startContainer) && box.contains(range.endContainer) ? range : null;
}

/** Chrome supports shadowRoot.getSelection(), but TypeScript's DOM types don't list it. */
function hasGetSelection(
  root: ShadowRoot,
): root is ShadowRoot & { getSelection(): Selection | null } {
  return typeof Reflect.get(root, 'getSelection') === 'function';
}

/** Turns a (node, offset) selection point into a position in the message, using data-offset. */
function offsetAt(box: HTMLElement, node: Node, offset: number): number | null {
  if (node === box) {
    // The point sits between pieces: `offset` counts child elements.
    const child = box.children[offset];
    if (child instanceof HTMLElement) return Number(child.dataset.offset);
    const last = box.lastElementChild;
    return last instanceof HTMLElement
      ? Number(last.dataset.offset) + (last.textContent?.length ?? 0)
      : 0;
  }
  const element = node instanceof Element ? node : node.parentElement;
  const piece = element?.closest<HTMLElement>('[data-offset]');
  if (!piece || !box.contains(piece)) return null;
  const base = Number(piece.dataset.offset);
  if (node.nodeType === Node.TEXT_NODE) return base + offset;
  return offset === 0 ? base : base + (piece.textContent?.length ?? 0);
}
