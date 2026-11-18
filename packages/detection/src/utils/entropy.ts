/*
  Shannon entropy: how "random" a string looks, in bits per character.
  Normal words reuse few letters (low entropy, ~2–3); generated secrets use many different
  characters evenly (high entropy, often 4+). Used to spot secrets no known pattern caught.
*/

/** Bits of randomness per character (0 for an empty string or a single repeated character). */
export function shannonEntropy(text: string): number {
  if (text.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const char of text) counts.set(char, (counts.get(char) ?? 0) + 1);

  const total = [...text].length; // count characters, not UTF-16 units (emoji = 1)
  let entropy = 0;
  for (const count of counts.values()) {
    const p = count / total;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}
