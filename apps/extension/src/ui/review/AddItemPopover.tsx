/*
  "Protect this": appears under the message when you select some text in "Your message".
  You pick what it is (default: Custom term) and add it; every place that text appears in the
  message is then protected too. It is shown as a bar under the preview rather than a floating
  bubble, so it never covers text, works at narrow widths and is easy to reach by keyboard.
*/
import {
  CATEGORY_GROUP,
  CATEGORY_LABEL,
  DETECTOR_CATEGORIES,
  type DetectorCategory,
} from '@safeai/shared';
import { useEffect, useId, useRef, useState } from 'react';

import { Button } from '../../components/Button';
import { IconButton } from '../../components/IconButton';
import { CloseIcon, PlusIcon } from '../../components/icons';
import { GROUP_STYLE } from './group-style';
import { GROUP_ORDER, shortenValue } from './model';

interface AddItemPopoverProps {
  /** The selected text. */
  value: string;
  onAdd: (category: DetectorCategory) => void;
  onClose: () => void;
}

/** The "Protect this" bar for a text selection. */
export function AddItemPopover({ value, onAdd, onClose }: AddItemPopoverProps) {
  const [category, setCategory] = useState<DetectorCategory>('custom_term');
  const selectId = useId();
  const addRef = useRef<HTMLButtonElement>(null);
  const short = shortenValue(value, 28);

  // Move focus to "Protect this" so keyboard users can act on the selection right away.
  useEffect(() => {
    addRef.current?.focus();
  }, [value]);

  return (
    <div
      role="group"
      aria-label="Protect the selected text"
      className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-line bg-surface px-2 py-2 text-sm"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation(); // close only this bar, not the whole panel
          onClose();
        }
      }}
    >
      <span className="min-w-0 truncate font-ui-mono text-fg" title={value}>
        “{short.text}”
      </span>
      <label htmlFor={selectId} className="text-xs text-fg-muted">
        as
      </label>
      <select
        id={selectId}
        value={category}
        onChange={(event) => setCategory(event.target.value as DetectorCategory)}
        className="h-7 rounded-md border border-line bg-surface px-1.5 text-xs text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        <option value="custom_term">{CATEGORY_LABEL.custom_term}</option>
        {GROUP_ORDER.map((group) => (
          <optgroup key={group} label={GROUP_STYLE[group].name}>
            {DETECTOR_CATEGORIES.filter(
              (c) => CATEGORY_GROUP[c] === group && c !== 'custom_term',
            ).map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <Button ref={addRef} size="sm" variant="primary" onClick={() => onAdd(category)}>
        <PlusIcon size={14} /> Protect this
      </Button>
      <IconButton size="sm" label="Close" onClick={onClose} className="ml-auto">
        <CloseIcon size={14} />
      </IconButton>
    </div>
  );
}
