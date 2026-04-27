// Default deck bundled with the Worker.
//
// Source is `cards/printed.json`, the registry produced by the sibling
// Python CLI (`russian-loto`). The registry stores entries keyed by cid
// with `{ seq, numbers, rows, printed_at, recovered, formats }`; we
// throw away the registry-only fields and surface a flat array of the
// shape the client UI consumes (`{ seq, cid, numbers, rows }`).
//
// To refresh the deck: regenerate via the Python CLI, drop the new
// `printed.json` over `cards/printed.json`, run the test suite. No
// other code changes; the import below picks up the new contents
// automatically at build/bundle time.

// JSON modules are supported natively by Bun, esbuild (Wrangler) and
// Workers' module loader; no `with { type: "json" }` attribute needed.
import REGISTRY from "../cards/printed.json";

interface RegistryEntry {
  seq: number;
  numbers: number[];
  rows: (number | null)[][];
}

export interface Card {
  seq: number;
  cid: string;
  numbers: number[];
  rows: (number | null)[][];
}

function entryToCard(cid: string, e: RegistryEntry): Card {
  return { seq: e.seq, cid, numbers: e.numbers, rows: e.rows };
}

export const DEFAULT_CARDS: Card[] = Object.entries(
  REGISTRY as Record<string, RegistryEntry>,
)
  .map(([cid, entry]) => entryToCard(cid, entry))
  .sort((a, b) => a.seq - b.seq);
