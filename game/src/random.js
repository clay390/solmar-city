// Solmar City v2 — the only source of randomness in the city.
// mulberry32 is tiny, fast and, given the same seed, always deals the same hand:
// the city layout, the traffic and the mission crates all come from here, so a
// `?seed=N` link always opens the same Solmar City. The game also uses the
// plain Math.random for cosmetic things (particles, flashes) that never change
// the rules, so only this module has to be deterministic.

/** A seeded generator: call the returned function for a float in [0, 1). */
export function createRandom(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/** A float in [min, max), from the given generator. */
export function randomRange(rng, min, max) {
  return min + rng() * (max - min);
}

/** Whole numbers from min to max, inclusive, from the given generator. */
export function randomInt(rng, min, max) {
  return min + Math.floor(rng() * (max - min + 1));
}

/** One random entry from an array, using the given generator. */
export function randomChoice(rng, list) {
  return list[Math.floor(rng() * list.length)];
}

/** One random entry, removed from the array. */
export function randomTake(rng, list) {
  return list.splice(Math.floor(rng() * list.length), 1)[0];
}

/** A fresh copy of the array with its order shuffled (Fisher-Yates). */
export function shuffle(rng, list) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
