/*
  The review panel: shown when you press Enter on a message with findings. It holds a WORKING
  COPY of your message (ChatGPT's box is only changed after "Protect and Send"), your choices and
  the items you added. "Remove from message" deletes a blocked value from the working copy and
  scans it again; your other choices are kept (matched by category + value).
  Keyboard: focus starts on the main button; Tab stays inside; Esc = Cancel;
  Ctrl/Cmd+Enter = the main button; Space toggles the focused checkbox.
  PRIVACY: real values live only in this component's state and disappear when it unmounts.
*/
import { CATEGORY_GROUP, type DetectorCategory } from '@safeai/shared';
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
} from 'react';

import { IconButton } from '../../components/IconButton';
import { CloseIcon, ShieldIcon, WarningIcon } from '../../components/icons';
import { DetectionGroup } from './DetectionGroup';
import { DetectionRow } from './DetectionRow';
import { MessagePreview } from './MessagePreview';
import { PanelFooter } from './PanelFooter';
import {
  buildRows,
  countRows,
  GROUP_ORDER,
  previewOutput,
  primaryLabel,
  removeValue,
  rowKey,
  selectedItems,
  summaryText,
  type AddedItem,
  type ReviewDecision,
  type ReviewInput,
  type ReviewRow,
} from './model';

/** A tiny on/off signal the mount code uses to start the closing animation. */
export interface ClosingSignal {
  get: () => boolean;
  subscribe: (listener: () => void) => () => void;
}

interface ReviewPanelProps {
  input: ReviewInput;
  onDecision: (decision: ReviewDecision) => void;
  closing: ClosingSignal;
}

const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

/** The whole review panel (backdrop + dialog). */
export function ReviewPanel({ input, onDecision, closing }: ReviewPanelProps) {
  const [text, setText] = useState(input.text);
  const [result, setResult] = useState(input.result);
  const [added, setAdded] = useState<AddedItem[]>([]);
  const [choices, setChoices] = useState<ReadonlyMap<string, boolean>>(new Map());
  const [sending, setSending] = useState(false);
  const isClosing = useSyncExternalStore(closing.subscribe, closing.get);

  const decidedRef = useRef(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const editRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  const tooLong = !result.complete;
  const rows = useMemo(
    () => buildRows(text, result, added, choices, input.policy),
    [text, result, added, choices, input.policy],
  );
  const counts = countRows(rows);
  const output = useMemo(
    () => previewOutput(text, rows, input.mapping, input.policy.placeholderHint),
    [text, rows, input.mapping, input.policy.placeholderHint],
  );
  const primaryDisabled = counts.blocked > 0 || sending;
  const busy = sending || isClosing;

  /** Reports the decision once (double clicks and key repeats are ignored). */
  function decide(decision: ReviewDecision) {
    if (decidedRef.current) return;
    decidedRef.current = true;
    if (decision.kind === 'send') setSending(true);
    onDecision(decision);
  }

  function onPrimary() {
    if (primaryDisabled || tooLong) return;
    decide({ kind: 'send', text, items: selectedItems(rows) });
  }

  // Where focus goes: on open, and again after "Remove from message" (its button disappears).
  // Order: the main button if it can be used; else the first Remove button; else Edit message.
  // `refocus` changes on every removal, which re-runs this after React has updated the panel.
  const [refocus, setRefocus] = useState(0);
  useEffect(() => {
    const main = primaryRef.current; // null in the "Too long" state (no main button)
    if (main && !main.disabled) {
      main.focus();
      return;
    }
    const remove = dialogRef.current?.querySelector<HTMLButtonElement>('[data-remove-blocked]');
    (remove ?? editRef.current)?.focus();
  }, [refocus]);

  function toggle(row: ReviewRow) {
    if (row.locked || row.kind === 'block') return;
    setChoices((prev) => new Map(prev).set(row.key, !row.selected));
  }

  function removeFromMessage(row: ReviewRow) {
    const nextText = removeValue(text, row.value);
    setText(nextText);
    setResult(input.rescan(nextText));
    setRefocus((n) => n + 1);
  }

  function addItem(category: DetectorCategory, value: string) {
    const key = rowKey(category, value);
    setAdded((prev) =>
      prev.some((item) => rowKey(item.category, item.value) === key)
        ? prev
        : [...prev, { category, value }],
    );
    setChoices((prev) => new Map(prev).set(key, true));
  }

  function removeAdded(row: ReviewRow) {
    setAdded((prev) => prev.filter((item) => rowKey(item.category, item.value) !== row.key));
    setChoices((prev) => {
      const next = new Map(prev);
      next.delete(row.key);
      return next;
    });
  }

  /** Esc, Ctrl/Cmd+Enter and the focus trap (Tab never leaves the panel). */
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (busy) {
      if (event.key !== 'Tab') return;
    } else if (event.key === 'Escape') {
      event.preventDefault();
      decide({ kind: 'cancel' });
      return;
    } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      onPrimary();
      return;
    }
    if (event.key !== 'Tab') return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const focusable = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)];
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;
    const active = (dialog.getRootNode() as ShadowRoot | Document).activeElement;
    if (event.shiftKey && (active === first || !dialog.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  }

  const groups = GROUP_ORDER.map((group) => ({
    group,
    rows: rows.filter((row) => CATEGORY_GROUP[row.category] === group),
  })).filter((g) => g.rows.length > 0);

  const motion =
    'transition-[opacity,translate] duration-(--duration-base) ease-(--ease-out) motion-reduce:transition-none';

  return (
    <div className="fixed inset-0 flex items-center justify-center p-4 font-ui text-fg antialiased">
      {/* Dimmed page. Clicking it does nothing (and keeps focus in the panel). */}
      <div
        aria-hidden="true"
        onMouseDown={(event) => event.preventDefault()}
        className={`absolute inset-0 bg-backdrop ${motion} starting:opacity-0 ${isClosing ? 'opacity-0' : ''}`}
      />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onKeyDown={onKeyDown}
        className={`relative flex max-h-[calc(100vh-32px)] w-full max-w-[600px] flex-col rounded-xl border border-line bg-surface [box-shadow:var(--shadow-lg)] ${motion} starting:translate-y-2 starting:opacity-0 ${isClosing ? 'translate-y-2 opacity-0' : ''}`}
      >
        {/* Header */}
        <div className="flex items-start gap-3 border-b border-line px-5 pt-4 pb-3">
          <span
            className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg ${tooLong ? 'bg-warning-subtle text-warning' : 'bg-surface-muted text-action'}`}
          >
            {tooLong ? <WarningIcon size={18} /> : <ShieldIcon size={18} />}
          </span>
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-md font-semibold text-fg">
              {tooLong
                ? result.failedDetectors.length > 0
                  ? "Couldn't check this message safely"
                  : 'Too long to check safely'
                : 'Review before sending'}
            </h2>
            <p id={descriptionId} className="text-sm text-fg-muted">
              {tooLong
                ? 'SafeAI could not finish checking this message, so it was not sent.'
                : `SafeAI found ${rows.length} ${rows.length === 1 ? 'item' : 'items'}. Ticked items are replaced before sending.`}
            </p>
          </div>
          <IconButton label="Cancel" onClick={() => decide({ kind: 'cancel' })} disabled={busy}>
            <CloseIcon size={16} />
          </IconButton>
        </div>

        {/* Body (scrolls) */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
          {tooLong ? (
            <div className="flex flex-col gap-2 text-sm text-fg">
              <p>
                {result.failedDetectors.length > 0
                  ? 'Part of the check failed, so SafeAI cannot be sure what this message contains.'
                  : 'The message is too long to check in time.'}{' '}
                Nothing was sent, and your text is unchanged.
              </p>
              <p className="text-fg-muted">
                Choose <strong className="font-medium text-fg">Edit message</strong> to shorten it
                or split it into smaller messages.
              </p>
            </div>
          ) : (
            <>
              <MessagePreview
                text={text}
                rows={rows}
                output={output}
                onAdd={addItem}
                disabled={busy}
              />
              <div className="mt-2">
                {groups.length === 0 ? (
                  <p className="px-2 pt-3 text-sm text-fg-muted">
                    Nothing sensitive is left in this message.
                  </p>
                ) : (
                  groups.map(({ group, rows: groupRows }) => (
                    <DetectionGroup key={group} group={group} count={groupRows.length}>
                      {groupRows.map((row) => (
                        <DetectionRow
                          key={row.key}
                          row={row}
                          placeholder={output.placeholderByRow.get(row.key)}
                          onToggle={toggle}
                          onRemoveFromMessage={removeFromMessage}
                          onRemoveAdded={removeAdded}
                          disabled={busy}
                        />
                      ))}
                    </DetectionGroup>
                  ))
                )}
              </div>
            </>
          )}
        </div>

        <PanelFooter
          summary={summaryText(counts)}
          showUntickedNotice={counts.unticked > 0}
          primaryLabel={primaryLabel(counts)}
          primaryDisabled={primaryDisabled}
          tooLong={tooLong}
          sending={sending}
          onCancel={() => decide({ kind: 'cancel' })}
          onEdit={() => decide({ kind: 'edit' })}
          onPrimary={onPrimary}
          primaryRef={primaryRef}
          editRef={editRef}
        />
      </div>
    </div>
  );
}
