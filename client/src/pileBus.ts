/**
 * The shared pile between hands arrives about 15 times a second. It goes straight to the
 * drawing code (TableIntro) through here, without re-drawing the whole page each time.
 */
export interface PileMessage {
  id: number;
  perWall: number;
  tiles: number[];
  done: boolean;
}

type Listener = (m: PileMessage) => void;
const listeners = new Set<Listener>();
let latest: PileMessage | null = null;

export function emitPile(m: PileMessage): void {
  latest = m;
  listeners.forEach((l) => l(m));
}

export function onPile(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function latestPile(): PileMessage | null {
  return latest;
}
