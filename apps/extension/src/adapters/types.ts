/*
  Defines "SiteAdapter": the list of things every AI site file must be able to do.
  The rest of SafeAI only talks to this interface, so supporting a new site (Claude, Gemini)
  means writing one new adapter — not changing the interceptor or the content-script flow.
*/

/** Everything SafeAI needs to know about one AI chat site's page. */
export interface SiteAdapter {
  /** Short site id, e.g. "chatgpt". */
  id: string;
  /** Finds the input box where the user types. */
  getComposer(): HTMLElement | null;
  /** True if this element is the input box or inside it. */
  isInsideComposer(el: Element): boolean;
  /** Finds the send button (may only exist once some text is typed). */
  getSendButton(): HTMLElement | null;
  /** True if this element is the send button or inside it (e.g. its icon). */
  isSendButton(el: Element): boolean;
  /** Gets the plain text currently typed in the input box. */
  readText(composer: HTMLElement): string;
  /** Phase 4: CSS selector for one message on screen (a sent message or a reply). */
  messageSelector: string;
  /** Phase 4: the message element (sent message or reply) that contains `node`, or null. */
  findMessage(node: Node): HTMLElement | null;
  /** Phase 4: every message element currently on the page, top to bottom. */
  getMessages(): HTMLElement[];
  /** Health check: which of our selectors currently find something on the page. */
  checkSelectors(): { composer: boolean; sendButton: boolean };
}
