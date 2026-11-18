/*
  Runs a regex over text and returns exact start/end positions, for the whole match or for one
  capture group. Uses the regex "d" flag (match indices), so e.g. for "password: hunter2" we can
  get the position of just "hunter2" without counting characters by hand.
*/

/** One regex hit: where it starts, where it ends (exclusive), and the matched text. */
export interface RegexMatch {
  start: number;
  end: number;
  value: string;
}

/**
 * All matches of `regex` in `text`. `group` picks a capture group by number or name
 * (0 = the whole match). Matches where that group didn't take part are skipped.
 * The regex must have the "g" (find all) and "d" (positions) flags.
 */
export function matchAll(regex: RegExp, text: string, group: number | string = 0): RegexMatch[] {
  if (!regex.global || !regex.hasIndices) {
    throw new Error(`Regex ${regex.source.slice(0, 40)} needs the "g" and "d" flags`);
  }
  const results: RegexMatch[] = [];
  // matchAll works on a copy of the regex, so the shared regex's lastIndex is never changed.
  for (const match of text.matchAll(regex)) {
    const range =
      typeof group === 'number' ? match.indices?.[group] : match.indices?.groups?.[group];
    if (!range) continue;
    const [start, end] = range;
    results.push({ start, end, value: text.slice(start, end) });
  }
  return results;
}
