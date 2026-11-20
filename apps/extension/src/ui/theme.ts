/*
  Follows ChatGPT's light/dark theme, so SafeAI's panel looks native in both.
  ChatGPT marks dark mode with a "dark" class on <html> (and color-scheme: dark). We read that,
  and watch <html> for changes so the panel switches live when you change ChatGPT's theme.
*/

export type Theme = 'light' | 'dark';

/** ChatGPT's current theme. */
export function getChatGptTheme(): Theme {
  const html = document.documentElement;
  if (html.classList.contains('dark')) return 'dark';
  if (html.classList.contains('light')) return 'light';
  // Fallback: the page's color-scheme (e.g. "dark" or "light dark").
  return getComputedStyle(html).colorScheme.trim() === 'dark' ? 'dark' : 'light';
}

/** Calls `onChange` whenever ChatGPT's theme changes. Returns a function that stops watching. */
export function watchTheme(onChange: (theme: Theme) => void): () => void {
  let current = getChatGptTheme();
  const observer = new MutationObserver(() => {
    const next = getChatGptTheme();
    if (next === current) return;
    current = next;
    onChange(next);
  });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class', 'style', 'data-theme'],
  });
  return () => observer.disconnect();
}
