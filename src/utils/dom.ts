/**
 * Append-free DOM builder for generated documents: text always lands in
 * `textContent`, never in innerHTML, so record content cannot execute as markup.
 * `style` is a static literal chosen by the caller — never interpolated.
 */
export function node(doc: Document, tag: string, text: string, style: string): HTMLElement {
  const el = doc.createElement(tag);
  el.textContent = text;
  if (style) el.setAttribute("style", style);
  return el;
}
