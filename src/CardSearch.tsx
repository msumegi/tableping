import { useEffect, useState } from "react";
import type { Card } from "./types";
import { QUICK_SEARCHES, SEARCH_UNAVAILABLE, hydrateSetName, searchCards } from "./lib/cards";

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

  async function run(term: string) {
    setErr("");
    setBusy(true);
    try {
      const found = await searchCards(term);
      setResults(found);
      if (!found.length) setErr("No cards for that. Try a name, or a name and set.");
    } catch {
      setErr(SEARCH_UNAVAILABLE);
    } finally {
      setBusy(false);
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
      <div className="card-grid">
        {results.map((card) => (
          <button
            key={card.id}
            className="card-tile"
            onClick={async () => onPick(await hydrateSetName(card))}
          >
            <img src={card.image} alt={card.name} />
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
