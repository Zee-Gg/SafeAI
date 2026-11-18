/*
  Replaces the text inside ChatGPT's input box in a way ChatGPT actually notices.

  WHY NOT JUST `composer.textContent = newText`?
  ChatGPT's input box is a ProseMirror editor. ProseMirror keeps its OWN copy of the document in
  JavaScript memory and treats the HTML on screen as just a picture of it. If we change the HTML
  directly, ProseMirror either ignores it or redraws the old text on top — and ChatGPT sends the
  text from ProseMirror's memory, i.e. the ORIGINAL text. That would leak exactly what we tried
  to hide. So we must change the text the way a user would: by "typing" or "pasting" it, which
  fires the editing events ProseMirror listens to.

  After each attempt we READ THE TEXT BACK and only report success if it really matches.
*/

/** Which technique changed the text. "none" = nothing worked. */
export type ReplaceMethod = 'insertText' | 'paste' | 'none';

// Give the editor a moment to process the event and redraw before we read it back.
const SETTLE_MS = 30;

/**
 * Replaces everything in the input box with newText. Tries "insertText" first, then "paste".
 * Resolves with success: true only if reading the box back gives newText.
 */
export async function replaceComposerText(
  composer: HTMLElement,
  newText: string,
): Promise<{ success: boolean; method: ReplaceMethod }> {
  // Strategy 1: select everything, then "type" the new text over it.
  // document.execCommand is officially deprecated, but it is still the most reliable way to fire
  // the real editing events (beforeinput/input) that rich editors like ProseMirror listen to.
  composer.focus();
  selectAllInside(composer);
  document.execCommand('insertText', false, newText);
  if (await textMatches(composer, newText)) return { success: true, method: 'insertText' };

  // Strategy 2: select everything, then simulate pasting the new text.
  composer.focus();
  selectAllInside(composer);
  const clipboard = new DataTransfer();
  clipboard.setData('text/plain', newText);
  composer.dispatchEvent(
    new ClipboardEvent('paste', { clipboardData: clipboard, bubbles: true, cancelable: true }),
  );
  if (await textMatches(composer, newText)) return { success: true, method: 'paste' };

  return { success: false, method: 'none' };
}

/** Selects all the content of the input box (like pressing Ctrl+A inside it). */
function selectAllInside(composer: HTMLElement): void {
  if (composer instanceof HTMLTextAreaElement) {
    composer.select();
    return;
  }
  const range = document.createRange();
  range.selectNodeContents(composer);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

/** Waits briefly, then checks whether the input box now contains the expected text. */
async function textMatches(composer: HTMLElement, expected: string): Promise<boolean> {
  await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
  const actual = composer instanceof HTMLTextAreaElement ? composer.value : composer.innerText;
  return normalize(actual) === normalize(expected);
}

/** Ignores whitespace differences (ProseMirror may add or trim line breaks between paragraphs). */
function normalize(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}
