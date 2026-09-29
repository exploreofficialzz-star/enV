export type Flashcard = { term: string; definition: string };

export function parseFlashcards(input: string): Flashcard[] {
  const cards: Flashcard[] = [];
  for (const [index, raw] of input.split(/\r?\n/).entries()) {
    const line = raw.trim();
    if (!line) continue;
    const separator = line.indexOf(":");
    if (separator <= 0 || separator === line.length - 1) {
      throw new Error(`Line ${index + 1}: use term:definition format.`);
    }
    const term = line.slice(0, separator).trim();
    const definition = line.slice(separator + 1).trim();
    if (!term || !definition) throw new Error(`Line ${index + 1}: both term and definition are required.`);
    cards.push({ term, definition });
  }
  if (!cards.length) throw new Error("Enter at least one flashcard as term:definition.");
  return cards;
}

export function flashcardsToText(cards: Flashcard[]): string {
  return cards.map((card, i) => `${i + 1}. ${card.term}\n   ${card.definition}`).join("\n\n");
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch] ?? ch));
}

export function flashcardsToHtml(cards: Flashcard[]): string {
  const body = cards.map((card) => `<article class="card"><h2>${escapeHtml(card.term)}</h2><p>${escapeHtml(card.definition)}</p></article>`).join("\n");
  return `<!doctype html>\n<html><head><meta charset="utf-8"><title>enV Flashcards</title><style>@page{margin:12mm}body{font-family:system-ui,sans-serif;margin:0;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12mm}.card{border:1px solid #888;border-radius:8px;padding:12mm;min-height:45mm;break-inside:avoid}.card h2{margin:0 0 8mm;font-size:18pt}.card p{margin:0;font-size:12pt;line-height:1.5}</style></head><body>${body}</body></html>`;
}
