/*
  Aho-Corasick: finds MANY words in a text in ONE pass. The time grows with the text length
  (plus the number of matches), not with the number of words, so 5,000 custom terms cost about
  the same per character as 5. Our own small implementation, decided in Phase 2 M5: the npm
  options were missing or unmaintained, and we need start+end positions on normalized text.
  How it works: all words go into a tree of characters (a "trie"); each node also gets a
  "failure link" saying where to continue when the next character doesn't fit, so the scan
  never steps backwards in the text.
  MEMORY: the tree is stored in ONE lookup table plus compact number arrays (not one object
  per node). 5,000 terms make ~90,000 nodes; one object each kept the garbage collector busy
  and slowed down the OTHER detectors (found by your Playground timings in M9).
*/

/** One hit: pattern number `pattern` found at text[start, end). */
export interface AhoCorasickMatch {
  start: number;
  end: number;
  pattern: number;
}

/** The prepared search machine. Build once, search many times. */
export interface Automaton {
  /** Child lookup: key = node * 65536 + UTF-16 character code → child node. */
  readonly transitions: Map<number, number>;
  /** Failure link per node: the longest suffix of this node's path that is also in the trie. */
  readonly fail: Int32Array;
  /** Nearest node (via failure links) that ends a pattern, or -1. Avoids copying output lists. */
  readonly outputLink: Int32Array;
  /** Patterns that end exactly at a node (only nodes that end at least one pattern). */
  readonly ends: Map<number, number[]>;
  /** Length of each pattern (to compute where a match starts). */
  readonly lengths: readonly number[];
}

const ROOT = 0;
/** UTF-16 character codes are below 65,536, so node * 65536 + code is a unique key. */
const CODE_RANGE = 0x10000;

/** Builds the search machine for the given patterns. Empty patterns are ignored. */
export function buildAutomaton(patterns: readonly string[]): Automaton {
  // The trie can't have more nodes than the total number of pattern characters (+ the root).
  const maxNodes = patterns.reduce((sum, p) => sum + p.length, 0) + 1;
  const transitions = new Map<number, number>();
  const ends = new Map<number, number[]>();
  // Each node's children as a linked list (first child, next sibling), used only while building.
  const firstChild = new Int32Array(maxNodes).fill(-1);
  const nextSibling = new Int32Array(maxNodes).fill(-1);
  const edgeCode = new Int32Array(maxNodes); // the character leading INTO each node
  let nodeCount = 1;

  // 1. Put every pattern into the trie.
  patterns.forEach((pattern, index) => {
    if (pattern.length === 0) return;
    let node = ROOT;
    for (let i = 0; i < pattern.length; i++) {
      const code = pattern.charCodeAt(i);
      const key = node * CODE_RANGE + code;
      let child = transitions.get(key);
      if (child === undefined) {
        child = nodeCount++;
        transitions.set(key, child);
        edgeCode[child] = code;
        nextSibling[child] = firstChild[node] ?? -1;
        firstChild[node] = child;
      }
      node = child;
    }
    const list = ends.get(node);
    if (list) list.push(index);
    else ends.set(node, [index]);
  });

  // 2. Breadth-first: each node's failure link and output link.
  const fail = new Int32Array(nodeCount); // all 0 = ROOT
  const outputLink = new Int32Array(nodeCount).fill(-1);
  const queue = new Int32Array(nodeCount);
  let tail = 0;
  for (let c = firstChild[ROOT] ?? -1; c !== -1; c = nextSibling[c] ?? -1) queue[tail++] = c;

  for (let head = 0; head < tail; head++) {
    const node = queue[head] ?? ROOT;
    for (let child = firstChild[node] ?? -1; child !== -1; child = nextSibling[child] ?? -1) {
      const code = edgeCode[child] ?? 0;
      // Follow failure links until a node that can continue with this character.
      let f = fail[node] ?? ROOT;
      let target = transitions.get(f * CODE_RANGE + code);
      while (target === undefined && f !== ROOT) {
        f = fail[f] ?? ROOT;
        target = transitions.get(f * CODE_RANGE + code);
      }
      const childFail = target !== undefined && target !== child ? target : ROOT;
      fail[child] = childFail;
      outputLink[child] = ends.has(childFail) ? childFail : (outputLink[childFail] ?? -1);
      queue[tail++] = child;
    }
  }

  return { transitions, fail, outputLink, ends, lengths: patterns.map((p) => p.length) };
}

/** Finds every occurrence of every pattern in `text` (overlapping ones included), in one pass. */
export function searchAll(automaton: Automaton, text: string): AhoCorasickMatch[] {
  const { transitions, fail, ends, outputLink, lengths } = automaton;
  const matches: AhoCorasickMatch[] = [];
  let node = ROOT;

  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    let next = transitions.get(node * CODE_RANGE + code);
    while (next === undefined && node !== ROOT) {
      node = fail[node] ?? ROOT;
      next = transitions.get(node * CODE_RANGE + code);
    }
    node = next ?? ROOT;

    // Report every pattern ending here: this node's own, then along the output links.
    // (The root never ends a pattern and its output link is -1, so the loop always stops.)
    for (let out = ends.has(node) ? node : (outputLink[node] ?? -1); out !== -1; ) {
      for (const pattern of ends.get(out) ?? []) {
        matches.push({ start: i + 1 - (lengths[pattern] ?? 0), end: i + 1, pattern });
      }
      out = outputLink[out] ?? -1;
    }
  }
  return matches;
}
