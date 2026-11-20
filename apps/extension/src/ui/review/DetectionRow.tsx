/*
  One row of the review panel, in every variant:
  - redact: ticked, can be unticked;     - locked: ticked + lock, "Required by your policy";
  - warn: unticked + "Suggested";        - block: no checkbox, red, "Remove from message";
  - added by you: ticked + "Added by you" + × to remove it again.
  Long values are shortened in the middle; the full value is in a tooltip (hover or focus).
*/
import { CATEGORY_LABEL } from '@safeai/shared';
import { useId } from 'react';

import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Checkbox } from '../../components/Checkbox';
import { Chip } from '../../components/Chip';
import { IconButton } from '../../components/IconButton';
import { ArrowRightIcon, CloseIcon, LockIcon } from '../../components/icons';
import { Tooltip } from '../../components/Tooltip';
import { shortenValue, type ReviewRow } from './model';

interface DetectionRowProps {
  row: ReviewRow;
  /** The placeholder it will become (only for ticked rows). */
  placeholder: string | undefined;
  onToggle: (row: ReviewRow) => void;
  onRemoveFromMessage: (row: ReviewRow) => void;
  onRemoveAdded: (row: ReviewRow) => void;
  disabled: boolean;
}

const CONFIDENCE_LABEL = { high: null, medium: 'Likely', low: 'Possible' } as const;

/** One value in the list, with its checkbox (or lock) and what it becomes. */
export function DetectionRow({
  row,
  placeholder,
  onToggle,
  onRemoveFromMessage,
  onRemoveAdded,
  disabled,
}: DetectionRowProps) {
  const checkboxId = useId();
  const short = shortenValue(row.value);
  const isBlocked = row.kind === 'block';
  const confidence = row.confidence ? CONFIDENCE_LABEL[row.confidence] : null;
  const count = row.spans.length;

  const valueText = (
    <span
      className={`block truncate font-ui-mono text-sm ${isBlocked ? 'text-danger' : 'text-fg'}`}
    >
      {short.text}
    </span>
  );

  return (
    <li
      className={`flex items-start gap-3 rounded-md px-2 py-2 ${isBlocked ? 'bg-danger-subtle' : ''}`}
    >
      {/* Left: checkbox, or a lock for blocked items. */}
      <span className="flex h-5 items-center">
        {isBlocked ? (
          <LockIcon size={16} className="text-danger" />
        ) : (
          <Checkbox
            id={checkboxId}
            checked={row.selected}
            disabled={row.locked || disabled}
            onChange={() => onToggle(row)}
            aria-label={`Protect ${CATEGORY_LABEL[row.category]}: ${short.text}`}
          />
        )}
      </span>

      {/* Middle: the value and what it is. */}
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          {short.shortened ? (
            <Tooltip content={row.value}>{valueText}</Tooltip>
          ) : (
            <label htmlFor={isBlocked ? undefined : checkboxId} className="min-w-0 cursor-pointer">
              {valueText}
            </label>
          )}
          {count > 1 && (
            <span className="shrink-0 text-xs text-fg-muted" title={`Appears ${count} times`}>
              ×{count}
            </span>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-fg-muted">
          <span>{CATEGORY_LABEL[row.category]}</span>
          {confidence && <Badge>{confidence}</Badge>}
          {row.kind === 'warn' && <Badge tone="warning">Suggested</Badge>}
          {row.kind === 'added' && <Badge tone="info">Added by you</Badge>}
          {row.locked && (
            <span className="inline-flex items-center gap-1">
              <LockIcon size={12} /> Required by your policy
            </span>
          )}
        </div>
        {isBlocked && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-danger">Must be removed before sending</span>
            <Button
              size="sm"
              variant="secondary"
              disabled={disabled}
              onClick={() => onRemoveFromMessage(row)}
              data-remove-blocked=""
            >
              Remove from message
            </Button>
          </div>
        )}
      </div>

      {/* Right: what ChatGPT will get instead. */}
      {!isBlocked && (
        <div className="flex shrink-0 items-center gap-1.5 pt-0.5">
          {row.selected && placeholder ? (
            <>
              <ArrowRightIcon size={14} className="text-fg-muted" />
              <Chip>{placeholder}</Chip>
            </>
          ) : (
            <span className="text-xs text-fg-muted">Sent as is</span>
          )}
          {row.kind === 'added' && (
            <IconButton
              size="sm"
              label={`Stop protecting ${short.text}`}
              onClick={() => onRemoveAdded(row)}
              disabled={disabled}
            >
              <CloseIcon size={14} />
            </IconButton>
          )}
        </div>
      )}
    </li>
  );
}
