// Solmar City v2 — every tuning number, colour and constant in one place.
// The world is a fixed-size coastal city; the renderer scales the canvas to the
// window, so no rule below depends on the screen size. Sections: the world grid,
// the player and cars, traffic and police, wanted points, combat, the seven jobs
// (five story, two side), the radio, and the palette.

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** The city, in world pixels. Roads form a grid; the beach and sea run along the south edge. */
export const WORLD = { width: 3600, height: 2700 };
export const ROAD_WIDTH = 112;
export const V_ROADS = [350, 750, 1150, 1550, 1950, 2350, 2750, 3150];
export const H_ROADS = [350, 750, 1150, 1550, 1950, 2250];
export const BEACH_Y = 2380; // sand starts here
export const WATER_Y = 2560; // sea starts here; it blocks movement
export const PORT_X = 3300; // container port starts here

export const PLAYER = {
  radius: 13,
  walkSpeed: 205,
  runSpeed: 330,
  maxHealth: 100,
  startCash: 250,
  startAmmo: 12,
  maxAmmo: 60,
};

export const CAR = {
  radius: 19,
  accel: 420,
  brake: 700,
  reverseMax: 180,
  maxSpeed: 560,
  turnRate: 2.6,
  handbrakeTurn: 3.6,
  maxHealth: 100,
  stealRadius: 78,
  /** Below this health the engine sputters and the car slows down. */
  sputterHealth: 25,
  /** Handling factor while the car is badly hurt (50% of speed and accel). */
  hurtHandling: 0.5,
  /** Handling factor while the car is lightly hurt (75%). */
  wornHandling: 0.75,
};

export const TRAFFIC = {
  cars: 14,
  minSpeed: 150,
  maxSpeed: 260,
  turnChance: 0.22,
  pedestrians: 26,
  pedSpeedMin: 38,
  pedSpeedMax: 72,
};

/** How a traffic car dodges the player's car: look this far ahead, shift this far sideways. */
export const TRAFFIC_AVOID = {
  range: 150,
  shift: 46,
  slowFactor: 0.45,
};

/** A near miss at speed pays a little cash (and feels great). */
export const NEAR_MISS = {
  distance: 48,
  speed: 300,
  reward: 10,
  cooldown: 3,
};

export const POLICE = {
  maxCars: 5,
  chaseSpeed: 540,
  chaseSpeedHot: 585, // 4-5 stars: the patrol cars push harder
  ramDamage: 9,
  bustRadius: 46,
  loseDistance: 950,
  loseSeconds: 6,
  /** How fast patrol cars appear while mission 3 is building heat. */
  heatSpawnRate: 2.4,
  spawnRate: 1.5,
};

/** The on-foot bust: a patrol car that stops beside Leo fills this meter; full means busted. */
export const BUST = {
  radius: 62, // the cop must be this close to fill the meter
  holdSeconds: 0.8, // seconds held close to get busted
  drainRadius: 95, // further than this, the meter drains
  arrestSpeed: 260, // how fast a cop closes in on a pedestrian
};

/** Wanted points thresholds for stars 1..5. */
export const WANTED_LEVELS = [10, 25, 45, 65, 85];
export const CRIME = {
  stealCar: 13,
  hitPedestrian: 15,
  shoot: 8,
  killPedestrian: 22,
  damagePolice: 12,
  killPolice: 30,
  hitAndRun: 6,
  honkAtPolice: 2,
};

/** While mission 3 is building heat, every crime counts extra. */
export const HEAT_BOOST = 1.6;

export const COMBAT = {
  bulletSpeed: 950,
  bulletRange: 520,
  bulletDamage: 34,
  punchRange: 58,
  punchDamage: 26,
  punchCooldown: 0.38,
  shootCooldown: 0.22,
};

/** Five story jobs plus two repeatable side jobs. */
export const MISSIONS = 7;

/** The radio: three original synth tracks, picked by what is happening. */
export const MUSIC = {
  cruise: { name: 'SUNSET CRUISE', bpm: 96 },
  drive: { name: 'PALM ROW DRIVE', bpm: 116 },
  chase: { name: 'HEAT CHASE', bpm: 138 },
};

/** The side jobs: how many crates, how long, what they pay. */
export const SIDE = {
  beachCrates: 5,
  beachSeconds: 90,
  beachReward: 350,
  portCrates: 3,
  portSeconds: 150,
  portReward: 500,
  collectRadius: 44,
};

/** Where the save is kept between visits (this browser only). */
export const SAVE_KEY = 'solmar-city.save.v2';

export const PALETTE = {
  grass: '#8fbf6a',
  grassDark: '#7fae5c',
  sand: '#e8d29a',
  water: '#3f9fd8',
  waterDeep: '#2b7fb8',
  road: '#3d3f4a',
  roadEdge: '#c9c2b4',
  sidewalk: '#cfc8b8',
  lane: '#f7d774',
  park: '#6fae56',
  pond: '#5fb3d9',
  buildingWall: '#b8a894',
  plaza: '#d8cdb8',
  port: '#9aa0a8',
  containerA: '#d96c4f',
  containerB: '#5b8fc9',
  containerC: '#e8a34c',
  containerD: '#7fb069',
  player: '#2ec4b6',
  playerDark: '#1d8a80',
  police: '#f2f4f6',
  policeBlue: '#2b5fd9',
  hudPanel: 'rgba(12, 16, 24, 0.72)',
  hudText: '#f4f1e8',
  hudMuted: '#c8c2b2',
  gold: '#f2c94c',
  orange: '#e8a34c',
  red: '#e5534b',
  green: '#7fc76a',
  crate: '#a9713f',
  bonfire: '#ff7b2f',
  warehouse: '#8a6fbf',
};

export const BUILDING_COLORS = [
  '#d96c4f', '#e8a34c', '#5b8fc9', '#7fb069', '#c96f9b',
  '#8a6fbf', '#e0d6c2', '#4fa8a0', '#b0523f', '#6b8fbf',
];

/** Car paint colours for traffic and parked cars. */
export const CAR_COLORS = [
  '#d94f3d', '#e8a34c', '#4f7fd9', '#58b368', '#c9c9c9',
  '#3a3f4a', '#e8e0d0', '#8a5fd9', '#d9c94f', '#4fb3c9',
];

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
