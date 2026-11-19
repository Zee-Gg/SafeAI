/*
  Aho-Corasick: finds MANY words in a text in ONE pass. The time grows with the text length
  (plus the number of matches), not with the number of words, so 5,000 custom terms cost about
  the same per character as 5. Our own small implementation, decided in Phase 2 M5: the npm
  options were missing or unmaintained, and we need start+end positions on normalized text.
  How it works: all words go into a tree of characters (a "trie"); each node also gets a
  "failure link" saying where to continue when the next character doesn't fit, so the scan
  never steps backwards in the text.
*/

/** One hit: pattern number `pattern` found at text[start, end). */
export interface AhoCorasickMatch {
  start: number;
  end: number;
  pattern: number;
}

/** The prepared search machine. Build once, search many times. */
export interface Automaton {
  /** Child nodes per node, keyed by UTF-16 character code. */
  readonly next: Map<number, number>[];
  /** Failure link per node: the longest suffix of this node's path that is also in the trie. */
  readonly fail: number[];
  /** Patterns that end exactly at this node. */
  readonly ends: number[][];
  /** Nearest node (via failure links) that ends a pattern, or -1. Avoids copying output lists. */
  readonly outputLink: number[];
  /** Length of each pattern (to compute where a match starts). */
  readonly lengths: number[];
}

const ROOT = 0;

/** Builds the search machine for the given patterns. Empty patterns are ignored. */
export function buildAutomaton(patterns: readonly string[]): Automaton {
  const next: Map<number, number>[] = [new Map()];
  const ends: number[][] = [[]];

  // 1. Put every pattern into the trie.
  patterns.forEach((pattern, index) => {
    if (pattern.length === 0) return;
    let node = ROOT;
    for (let i = 0; i < pattern.length; i++) {
      const code = pattern.charCodeAt(i);
      let child = next[node]?.get(code);
      if (child === undefined) {
        child = next.length;
        next.push(new Map());
        ends.push([]);
        next[node]?.set(code, child);
      }
      node = child;
    }
    ends[node]?.push(index);
  });

  // 2. Breadth-first: each node's failure link and output link.
  const fail = new Array<number>(next.length).fill(ROOT);
  const outputLink = new Array<number>(next.length).fill(-1);
  const queue: number[] = [];
  for (const child of next[ROOT]?.values() ?? []) queue.push(child);

  for (let head = 0; head < queue.length; head++) {
    const node = queue[head] ?? ROOT;
    for (const [code, child] of next[node] ?? []) {
      // Follow failure links until a node that can continue with this character.
      let f = fail[node] ?? ROOT;
      while (f !== ROOT && !next[f]?.has(code)) f = fail[f] ?? ROOT;
      const target = next[f]?.get(code);
      const childFail = target !== undefined && target !== child ? target : ROOT;
      fail[child] = childFail;
      outputLink[child] =
        (ends[childFail]?.length ?? 0) > 0 ? childFail : (outputLink[childFail] ?? -1);
      queue.push(child);
    }
  }

  return { next, fail, ends, outputLink, lengths: patterns.map((p) => p.length) };
}

/** Finds every occurrence of every pattern in `text` (overlapping ones included), in one pass. */
export function searchAll(automaton: Automaton, text: string): AhoCorasickMatch[] {
  const { next, fail, ends, outputLink, lengths } = automaton;
  const matches: AhoCorasickMatch[] = [];
  let node = ROOT;

  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    while (node !== ROOT && !next[node]?.has(code)) node = fail[node] ?? ROOT;
    node = next[node]?.get(code) ?? ROOT;

    // Report every pattern ending here: this node's own, then along the output links.
    // (The root never ends a pattern and its output link is -1, so the loop always stops.)
    for (let out = node; out !== -1; out = outputLink[out] ?? -1) {
      for (const pattern of ends[out] ?? []) {
        matches.push({ start: i + 1 - (lengths[pattern] ?? 0), end: i + 1, pattern });
      }
    }
  }
  return matches;
}
