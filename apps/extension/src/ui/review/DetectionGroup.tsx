/*
  One category group in the review panel's list (Secrets / Personal / Financial / Business):
  a coloured heading with the number of items, then its rows.
*/
import type { CategoryGroup } from '@safeai/shared';
import { useId, type ReactNode } from 'react';

import { GROUP_STYLE } from './group-style';

/** A titled group of rows. */
export function DetectionGroup({
  group,
  count,
  children,
}: {
  group: CategoryGroup;
  count: number;
  children: ReactNode;
}) {
  const headingId = useId();
  const style = GROUP_STYLE[group];
  return (
    <section aria-labelledby={headingId}>
      <h3
        id={headingId}
        className={`flex items-center gap-2 px-2 pt-3 pb-1 text-xs font-semibold tracking-wide uppercase ${style.text}`}
      >
        <span aria-hidden="true" className={`size-2 rounded-full ${style.dot}`} />
        {style.name} · {count}
      </h3>
      <ul className="flex flex-col gap-0.5">{children}</ul>
    </section>
  );
}
