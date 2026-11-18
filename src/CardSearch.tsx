import { useEffect, useRef, useState } from "react";
import { CardImage } from "./CardImage";
import type { Card } from "./types";
import { QUICK_SEARCHES, SEARCH_UNAVAILABLE, hydrateSetName, searchCardList } from "./lib/cards";
import { SEARCH_SAVED_ONLY } from "./lib/copy";

export function CardSearchPanel({
  onPick,
  showChips = true,
  autoFocus = false,
  placeholder = "Umbreon Evolving Skies, Pikachu…",
}: {
  onPick: (card: Card) => void;
  showChips?: boolean;
  autoFocus?: boolean;
  placeholder?: string;
}) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [results, setResults] = useState<Card[]>([]);
  const [savedOnly, setSavedOnly] = useState(false);
  const latestQuery = useRef("");

  async function run(term: string) {
    const query = term.trim();
    latestQuery.current = query;
    setErr("");
    setResults([]);
    setSavedOnly(false);
    setBusy(true);
    try {
      const found = await searchCardList(query);
      if (latestQuery.current !== query) return;
      setResults(found.cards);
      setSavedOnly(found.savedOnly && found.cards.length > 0);
      if (!found.cards.length) setErr("Nothing for that. Try a name, or a name and set.");
    } catch {
      if (latestQuery.current !== query) return;
      setResults([]);
      setSavedOnly(false);
      setErr(SEARCH_UNAVAILABLE);
    } finally {
      if (latestQuery.current === query) setBusy(false);
    }
  }

  useEffect(() => {
    const t = window.setTimeout(() => {
      if (q.trim().length >= 2) void run(q);
    }, 280);
    return () => window.clearTimeout(t);
  }, [q]);

  return (
    <>
      <input
        className="field"
        placeholder={placeholder}
        value={q}
        autoFocus={autoFocus}
        onChange={(e) => setQ(e.target.value)}
        aria-label="Search Pokémon cards by name or set"
      />
      {showChips ? (
        <div className="chips">
          {QUICK_SEARCHES.map((name) => (
            <button
              key={name}
              className="chip"
              onClick={() => {
                setQ(name);
                void run(name);
              }}
            >
              {name}
            </button>
          ))}
        </div>
      ) : null}
      {busy ? <p className="status">Searching…</p> : null}
      {err ? <p className="status error">{err}</p> : null}
      {savedOnly && !err ? <p className="hint">{SEARCH_SAVED_ONLY}</p> : null}
      <div className="card-grid">
        {results.map((card) => (
          <button
            key={card.id}
            className="card-tile"
            onClick={async () => onPick(await hydrateSetName(card))}
          >
            <CardImage src={card.image} name={card.name} />
            <figcaption>
              <div className="name">{card.name}</div>
              <div className="meta">
                {card.setName} {card.number && `· ${card.number}`}
              </div>
            </figcaption>
          </button>
        ))}
      </div>
    </>
  );
}
