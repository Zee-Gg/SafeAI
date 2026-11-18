/*
  PHASE 1 TEST ONLY. The real detection engine arrives in Phase 2.
  Swaps every email address for a placeholder: [EMAIL_1], [EMAIL_2]… so we can prove that
  "stop the message → change its text → send the changed version" works on ChatGPT.
*/

// A simple email pattern: name@domain.tld. Good enough for a test; Phase 2 replaces it.
const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/**
 * Replaces each email with [EMAIL_n]. The same email (ignoring upper/lower case) always gets
 * the same number. `count` = how many DIFFERENT emails were found.
 */
export function transformForTest(text: string): { text: string; count: number } {
  const numbers = new Map<string, number>();
  const replaced = text.replace(EMAIL_PATTERN, (email) => {
    const key = email.toLowerCase();
    let n = numbers.get(key);
    if (n === undefined) {
      n = numbers.size + 1;
      numbers.set(key, n);
    }
    return `[EMAIL_${n}]`;
  });
  return { text: replaced, count: numbers.size };
}
