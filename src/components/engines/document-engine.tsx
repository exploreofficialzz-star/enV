import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ErrorBanner } from "@/components/tools/error-banner";
import { CopyButton } from "@/components/tools/copy-button";
import { downloadText } from "@/lib/utils";
import { Download, Printer } from "lucide-react";
import { flashcardsToHtml, flashcardsToText, parseFlashcards, type Flashcard } from "./document-engine-utils";

export function DocumentEngine({ op }: { op: string }) {
  const [input, setInput] = useState("mitosis:cell division that produces two genetically identical daughter cells\nphotosynthesis:process plants use to convert light energy into chemical energy");
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [error, setError] = useState<string | null>(null);

  if (op !== "flashcards") return <p className="text-sm text-muted">This document tool is not wired yet.</p>;

  const generate = () => {
    try { setCards(parseFlashcards(input)); setError(null); }
    catch (e) { setCards([]); setError(e instanceof Error ? e.message : "Could not generate flashcards."); }
  };
  const text = cards.length ? flashcardsToText(cards) : "";

  return <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); generate(); }}>
    <Textarea value={input} onChange={(e) => setInput(e.target.value)} rows={9} aria-label="Flashcard terms and definitions" placeholder="term:definition" />
    <p className="text-xs text-subtle">One card per line. Split the term and definition with the first colon.</p>
    <div className="flex flex-wrap gap-2">
      <Button type="submit">Generate cards</Button>
      <Button type="button" variant="ghost" onClick={() => { setInput(""); setCards([]); setError(null); }}>Reset</Button>
    </div>
    <ErrorBanner message={error} />
    {cards.length ? <section className="space-y-3" aria-label="Generated flashcards">
      <div className="flex flex-wrap gap-2">
        <CopyButton text={text} />
        <Button type="button" variant="outline" onClick={() => downloadText(flashcardsToHtml(cards), "env-flashcards.html")}><Download className="size-4" /> Download printable HTML</Button>
        <Button type="button" variant="outline" onClick={() => window.print()}><Printer className="size-4" /> Print</Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {cards.map((card, i) => <article key={`${i}-${card.term}`} className="rounded-xl border border-border bg-surface-2 p-5"><h3 className="font-semibold">{card.term}</h3><p className="mt-3 text-sm text-muted">{card.definition}</p></article>)}
      </div>
    </section> : null}
  </form>;
}
