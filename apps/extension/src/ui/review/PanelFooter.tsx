/*
  The bottom of the review panel: a live summary ("3 of 4 items will be protected"), the notice
  that unticked items are sent unchanged, and the buttons. The main button says what will really
  happen: "Protect and Send", "Send Without Redaction" or "Send", and is disabled while any
  blocked item is still in the message. In the "Too long" state only Cancel and Edit message show.
*/
import type { RefObject } from 'react';

import { Button } from '../../components/Button';
import { WarningIcon } from '../../components/icons';

interface PanelFooterProps {
  summary: string;
  showUntickedNotice: boolean;
  primaryLabel: string;
  primaryDisabled: boolean;
  /** The "Too long to check safely" state: no send button at all. */
  tooLong: boolean;
  sending: boolean;
  onCancel: () => void;
  onEdit: () => void;
  onPrimary: () => void;
  primaryRef: RefObject<HTMLButtonElement | null>;
  editRef: RefObject<HTMLButtonElement | null>;
}

/** Summary, notice and the action buttons. */
export function PanelFooter({
  summary,
  showUntickedNotice,
  primaryLabel,
  primaryDisabled,
  tooLong,
  sending,
  onCancel,
  onEdit,
  onPrimary,
  primaryRef,
  editRef,
}: PanelFooterProps) {
  return (
    <div className="border-t border-line px-5 py-3">
      {!tooLong && (
        <div className="mb-3 flex flex-col gap-1">
          {/* A live region: screen readers announce the summary whenever it changes. */}
          <p role="status" aria-live="polite" className="text-sm font-medium text-fg">
            {summary}
          </p>
          {showUntickedNotice && (
            <p className="flex items-center gap-1.5 text-xs text-warning">
              <WarningIcon size={14} />
              Unticked items are sent to ChatGPT unchanged.
            </p>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button variant="ghost" onClick={onCancel} disabled={sending}>
          Cancel
        </Button>
        <Button ref={editRef} variant="secondary" onClick={onEdit} disabled={sending}>
          Edit message
        </Button>
        {!tooLong && (
          <Button
            ref={primaryRef}
            variant="primary"
            onClick={onPrimary}
            disabled={primaryDisabled}
            loading={sending}
            aria-keyshortcuts="Control+Enter Meta+Enter"
          >
            {sending ? 'Sending…' : primaryLabel}
          </Button>
        )}
      </div>
    </div>
  );
}
