export interface Stick {
  id: string;
  xPercent: number;
  yPercent: number;
  rotationDeg: number;
  lengthPercent: number;
  thicknessPx: number;
  colorIndex: number;
  zIndex: number;
}

const STICK_COUNT = 24;
// Fixed seed: the layout must be identical on every reload, every server
// restart, and every redeploy, so this is never reseeded from time or
// Math.random().
const SEED = 20261006;

// mulberry32 — a small deterministic PRNG, seeded once at module load.
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildSticks(): Stick[] {
  const rand = mulberry32(SEED);
  const sticks: Stick[] = [];
  for (let i = 0; i < STICK_COUNT; i++) {
    sticks.push({
      id: `s${i + 1}`,
      xPercent: 14 + rand() * 62,
      yPercent: 14 + rand() * 62,
      rotationDeg: rand() * 360,
      lengthPercent: 22 + rand() * 14,
      thicknessPx: 10 + rand() * 6,
      colorIndex: Math.floor(rand() * 5),
      // Generation order doubles as stacking order: the last stick scattered
      // onto the pile sits on top.
      zIndex: i + 1,
    });
  }
  return sticks;
}

export const STICKS: readonly Stick[] = buildSticks();
export const TOTAL_STICKS = STICKS.length;
