// Solmar City v2 — the city itself: a seeded grid of roads, blocks, buildings,
// a beach and sea along the south edge, a container port on the east edge, and
// a park downtown. Pure data and geometry — no drawing, no browser — plus the
// collision helpers every moving thing uses: circle-vs-building, water, and the
// world edge. New in v2: a bonfire pit on the beach and a warehouse in the port,
// the two delivery points for the side jobs.

import {
  BEACH_Y, BUILDING_COLORS, H_ROADS, PALETTE, PORT_X, V_ROADS, WATER_Y, WORLD,
} from './config.js';
import { randomInt, randomChoice, randomRange } from './random.js';

/** The park block: between V_ROADS[3..4] and H_ROADS[2..3]. */
const PARK = {
  x0: V_ROADS[3] + 60, x1: V_ROADS[4] - 60,
  y0: H_ROADS[2] + 60, y1: H_ROADS[3] - 60,
};

/** Named places the missions, the minimap and the renderer point at. */
export const LANDMARKS = {
  garage: { x: V_ROADS[2], y: H_ROADS[0] - 130, name: 'Rosa\u2019s Garage' },
  plaza: { x: V_ROADS[3], y: H_ROADS[1], name: 'Marlin Plaza' },
  marina: { x: 1800, y: BEACH_Y + 60, name: 'Sunset Marina' },
  portGate: { x: PORT_X - 90, y: H_ROADS[1], name: 'Port Gate' },
  hospital: { x: V_ROADS[4], y: H_ROADS[3], name: 'Solmar General' },
  vegaTower: { x: V_ROADS[3] + 190, y: H_ROADS[1] + 190, name: 'Vega Tower' },
  bonfire: { x: 900, y: BEACH_Y + 70, name: 'Bonfire Pit' },
  warehouse: { x: PORT_X + 60, y: 1500, name: 'Port Warehouse' },
  /** The door of the warehouse, on open ground in front of the building. */
  warehouseDoor: { x: PORT_X + 60, y: 1390, name: 'Warehouse Door' },
};

/** Scatter trees across the park, keeping clear of the pond. */
function plantPark(random, trees, pond) {
  const x0 = PARK.x0;
  const x1 = PARK.x1;
  const y0 = PARK.y0;
  const y1 = PARK.y1;
  for (let t = 0; t < 26; t += 1) {
    const tx = randomRange(random, x0, x1);
    const ty = randomRange(random, y0, y1);
    if (Math.hypot(tx - pond.x, ty - pond.y) < 120) continue;
    trees.push({ x: tx, y: ty, r: randomRange(random, 12, 20) });
  }
}

/** One or two buildings inside a normal block, kept clear of the roads. */
function raiseBuildings(random, buildings, x0, x1, y0, y1) {
  const count = random() < 0.55 ? 1 : 2;
  for (let b = 0; b < count; b += 1) {
    const w = randomRange(random, 90, count === 1 ? x1 - x0 - 20 : (x1 - x0) / 2 - 30);
    const h = randomRange(random, 80, y1 - y0 - 20);
    const bx = count === 1
      ? x0 + (x1 - x0 - w) / 2
      : x0 + b * ((x1 - x0) / 2) + (b === 0 ? 6 : 14);
    const by = y0 + randomRange(random, 0, Math.max(0, y1 - y0 - h));
    buildings.push({
      x: bx, y: by, w, h,
      color: randomChoice(random, BUILDING_COLORS),
      tall: random() < 0.16,
      name: '',
    });
  }
}

/** The port yard: a seeded grid of containers east of the last road, in two
 * bands that leave a clear lane in front of the warehouse. (The old code tried
 * to spot the port by road index and never matched it, so v1 shipped a port
 * with no containers at all.) */
function buildPortYard(random, containers) {
  const palette = [PALETTE.containerA, PALETTE.containerB, PALETTE.containerC, PALETTE.containerD];
  for (const y0 of [360, 1720]) {
    for (let row = 0; row < 5; row += 1) {
      for (const x of [3340, 3470]) {
        containers.push({
          x: x + randomRange(random, -14, 14),
          y: y0 + row * 80 + randomRange(random, -8, 8),
          w: randomRange(random, 70, 100),
          h: 34,
          color: randomChoice(random, palette),
        });
      }
    }
  }
}

function buildCity(random) {
  const buildings = [];
  const trees = [];
  const containers = [];
  const ponds = [{ x: (PARK.x0 + PARK.x1) / 2, y: (PARK.y0 + PARK.y1) / 2, r: 90 }];

  for (let col = 0; col < V_ROADS.length - 1; col += 1) {
    for (let row = 0; row < H_ROADS.length - 1; row += 1) {
      const x0 = V_ROADS[col] + 78;
      const x1 = V_ROADS[col + 1] - 78;
      const y0 = H_ROADS[row] + 78;
      const y1 = H_ROADS[row + 1] - 78;
      if (col === 3 && row === 2) {
        plantPark(random, trees, ponds[0]);
        continue;
      }
      raiseBuildings(random, buildings, x0, x1, y0, y1);
    }
  }

  buildPortYard(random, containers);

  // The Vega Tower: the tallest building downtown, a landmark, not a copy of anything.
  buildings.push({
    x: LANDMARKS.vegaTower.x - 70, y: LANDMARKS.vegaTower.y - 70,
    w: 140, h: 140, color: '#4f7fd9', tall: true, name: 'Vega Tower',
  });

  // The port warehouse: the delivery point for the Port Shuffle side job.
  buildings.push({
    x: LANDMARKS.warehouse.x - 20, y: LANDMARKS.warehouse.y - 60,
    w: 220, h: 120, color: PALETTE.warehouse, tall: false, name: 'Port Warehouse',
  });

  // Street trees along the beach promenade and a few downtown corners.
  for (let x = 220; x < WORLD.width - 200; x += 130) {
    trees.push({ x: x + randomRange(random, -20, 20), y: BEACH_Y - 42, r: randomRange(random, 13, 19) });
  }
  for (let t = 0; t < 18; t += 1) {
    trees.push({
      x: randomRange(random, 200, WORLD.width - 200),
      y: randomRange(random, 200, BEACH_Y - 120),
      r: randomRange(random, 11, 17),
    });
  }

  return {
    buildings, trees, containers, ponds, park: PARK,
    bonfire: { x: LANDMARKS.bonfire.x, y: LANDMARKS.bonfire.y, r: 26 },
    warehouse: { x: LANDMARKS.warehouse.x, y: LANDMARKS.warehouse.y },
  };
}

/** True when the point is on a road (asphalt), false on a block or the beach. */
export function isOnRoad(city, x, y) {
  for (const rx of V_ROADS) if (Math.abs(x - rx) < 56) return true;
  for (const ry of H_ROADS) if (Math.abs(y - ry) < 56) return true;
  return false;
}

/** The nearest point on any road centreline to (x, y). */
export function nearestRoadPoint(x, y) {
  let best = null;
  let bestD = Infinity;
  for (const rx of V_ROADS) {
    const d = Math.abs(x - rx);
    if (d < bestD) { bestD = d; best = { x: rx, y, axis: 'v' }; }
  }
  for (const ry of H_ROADS) {
    const d = Math.abs(y - ry);
    if (d < bestD) { bestD = d; best = { x, y: ry, axis: 'h' }; }
  }
  return best;
}

/** A building or container whose rectangle contains the point, or null. */
export function solidAt(city, x, y) {
  for (const b of city.buildings) {
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b;
  }
  for (const c of city.containers) {
    if (x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h) return c;
  }
  return null;
}

/**
 * Push a circle (pos.x, pos.y, radius r) out of every solid rectangle, the sea and
 * the world edge. Mutates pos, returns true when it touched anything.
 */
export function collideCircle(city, pos, r) {
  let hit = false;
  if (pos.x < r) { pos.x = r; hit = true; }
  if (pos.x > WORLD.width - r) { pos.x = WORLD.width - r; hit = true; }
  if (pos.y < r) { pos.y = r; hit = true; }
  if (pos.y > WORLD.height - r) { pos.y = WORLD.height - r; hit = true; }
  // The sea blocks everyone; the sand is fine to walk and drive on.
  if (pos.y + r > WATER_Y) { pos.y = WATER_Y - r; hit = true; }
  const solids = city.buildings.concat(city.containers);
  for (const s of solids) {
    const cx = Math.max(s.x, Math.min(pos.x, s.x + s.w));
    const cy = Math.max(s.y, Math.min(pos.y, s.y + s.h));
    const dx = pos.x - cx;
    const dy = pos.y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 >= r * r || d2 === 0) {
      if (d2 === 0) {
        // Centre inside the rectangle: push out along the shortest side.
        const left = pos.x - s.x;
        const right = s.x + s.w - pos.x;
        const top = pos.y - s.y;
        const bottom = s.y + s.h - pos.y;
        const min = Math.min(left, right, top, bottom);
        if (min === left) pos.x = s.x - r;
        else if (min === right) pos.x = s.x + s.w + r;
        else if (min === top) pos.y = s.y - r;
        else pos.y = s.y + s.h + r;
        hit = true;
      }
      continue;
    }
    const d = Math.sqrt(d2);
    pos.x = cx + (dx / d) * r;
    pos.y = cy + (dy / d) * r;
    hit = true;
  }
  return hit;
}

/** A random point on a road, at least `margin` from the world edge. */
export function randomRoadPoint(random, margin = 120) {
  if (random() < 0.5) {
    return { x: randomChoice(random, V_ROADS), y: randomRange(random, margin, WORLD.height - margin), axis: 'v' };
  }
  return { x: randomRange(random, margin, WORLD.width - margin), y: randomChoice(random, H_ROADS), axis: 'h' };
}

export function createCity(random) {
  const city = buildCity(random);
  city.width = WORLD.width;
  city.height = WORLD.height;
  city.beachY = BEACH_Y;
  city.waterY = WATER_Y;
  city.portX = PORT_X;
  return city;
}

// Re-exported for callers that only import world.js.
export { randomInt };
