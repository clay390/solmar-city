// Solmar City v2 — the city's other inhabitants: traffic cars that follow the
// road grid, pedestrians on the sidewalks, parked cars waiting to be stolen,
// and the pickups scattered around Solmar. Nothing here knows about the screen
// — it only moves things. New in v2, the traffic is no longer a set of
// bumper cars: a traffic car that sees the player's car ahead in its lane
// steers around it instead of ramming it; two traffic cars that meet exchange
// speed and spin out instead of passing through each other; and a car hit
// hard enough becomes a wreck that smokes, blocks the road, and is towed away
// after a while. A shot-out tyre (see combat.js) leaves a car limping.

import { CAR_COLORS, H_ROADS, TRAFFIC, TRAFFIC_AVOID, V_ROADS, WORLD } from './config.js';
import { collideCircle, isOnRoad, nearestRoadPoint, randomRoadPoint } from './world.js';
import { randomChoice, randomRange } from './random.js';
import { addWanted } from './police.js';

const PED_SHIRTS = ['#e8e0d0', '#d96c4f', '#5b8fc9', '#7fb069', '#c96f9b', '#e8a34c', '#8a6fbf', '#4fa8a0'];
const SIDEWALK = 72; // distance from a road centreline to the sidewalk
const WRECK_RESPAWN = 20; // seconds before a wreck is towed and replaced

function spawnTrafficCar(game, random) {
  const point = randomRoadPoint(random);
  const dir = random() < 0.5 ? 1 : -1;
  const lane = (random() < 0.5 ? -1 : 1) * 26;
  const car = {
    x: point.axis === 'v' ? point.x + lane : point.x,
    y: point.axis === 'v' ? point.y : point.y + lane,
    angle: point.axis === 'v' ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI),
    speed: randomRange(random, TRAFFIC.minSpeed, TRAFFIC.maxSpeed),
    targetSpeed: randomRange(random, TRAFFIC.minSpeed, TRAFFIC.maxSpeed),
    color: randomChoice(random, CAR_COLORS),
    kind: 'traffic',
    axis: point.axis,
    dir,
    road: point.axis === 'v' ? point.x : point.y,
    lane,
    shift: 0, // lateral dodge, eased toward shiftTarget
    shiftTarget: 0,
    knockX: 0, knockY: 0, // a shove from a crash, decaying to zero
    spin: 0, // seconds left spinning out after a crash
    limp: false, // a shot tyre: half speed until towed
    health: 100,
    owned: false,
  };
  game.cars.push(car);
  return car;
}

function spawnPedestrian(game, random) {
  const point = randomRoadPoint(random);
  const dir = random() < 0.5 ? 1 : -1;
  const side = (random() < 0.5 ? -1 : 1) * SIDEWALK;
  const ped = {
    x: point.axis === 'v' ? point.x + side : point.x,
    y: point.axis === 'v' ? point.y : point.y + side,
    angle: point.axis === 'v' ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI),
    speed: randomRange(random, TRAFFIC.pedSpeedMin, TRAFFIC.pedSpeedMax),
    axis: point.axis,
    dir,
    road: point.axis === 'v' ? point.x : point.y,
    side,
    color: randomChoice(random, PED_SHIRTS),
    flee: 0,
    alive: true,
  };
  game.peds.push(ped);
  return ped;
}

function spawnParkedCar(game, random) {
  const point = randomRoadPoint(random);
  const along = randomRange(random, 140, WORLD.width - 140);
  const side = (random() < 0.5 ? -1 : 1) * 44;
  const car = {
    x: point.axis === 'v' ? point.x + side : along,
    y: point.axis === 'v' ? along : point.y + side,
    angle: point.axis === 'v' ? (random() < 0.5 ? Math.PI / 2 : -Math.PI / 2) : (random() < 0.5 ? 0 : Math.PI),
    speed: 0,
    targetSpeed: 0,
    color: randomChoice(random, CAR_COLORS),
    kind: 'parked',
    axis: point.axis,
    dir: 1,
    road: point.axis === 'v' ? point.x : point.y,
    lane: side,
    shift: 0,
    shiftTarget: 0,
    knockX: 0, knockY: 0,
    spin: 0,
    limp: false,
    health: 100,
    owned: false,
  };
  game.cars.push(car);
  return car;
}

function spawnPickup(game, random, kind) {
  const point = randomRoadPoint(random);
  const side = (random() < 0.5 ? -1 : 1) * SIDEWALK;
  const amount = kind === 'cash' ? randomChoice(random, [50, 75, 100, 150]) : kind === 'ammo' ? 12 : 40;
  game.pickups.push({
    x: point.axis === 'v' ? point.x + side : point.x + randomRange(random, -60, 60),
    y: point.axis === 'v' ? point.y + randomRange(random, -60, 60) : point.y + side,
    kind,
    amount,
    taken: false,
    respawn: 0,
  });
}

export function createTraffic(game) {
  const random = game.rng;
  for (let i = 0; i < TRAFFIC.cars; i += 1) spawnTrafficCar(game, random);
  for (let i = 0; i < 8; i += 1) spawnParkedCar(game, random);
  for (let i = 0; i < TRAFFIC.pedestrians; i += 1) spawnPedestrian(game, random);
  for (let i = 0; i < 8; i += 1) spawnPickup(game, random, 'cash');
  for (let i = 0; i < 6; i += 1) spawnPickup(game, random, 'ammo');
  for (let i = 0; i < 4; i += 1) spawnPickup(game, random, 'health');
}

/** The car directly ahead in the same lane, within `lookAhead`, or null. */
function carAhead(game, car, lookAhead) {
  for (const other of game.cars) {
    if (other === car || other.kind === 'parked') continue;
    // A wreck is an obstacle too: traffic queues behind it instead of
    // driving straight through it.
    if (other.axis !== car.axis || other.dir !== car.dir || other.road !== car.road) continue;
    const along = car.axis === 'v' ? (other.y - car.y) * car.dir : (other.x - car.x) * car.dir;
    const lateral = car.axis === 'v' ? Math.abs(other.x - car.x) : Math.abs(other.y - car.y);
    if (along > 0 && along < lookAhead && lateral < 34) return other;
  }
  return null;
}

/** Is the player's car ahead of this traffic car, in the same lane? */
function playerCarAhead(game, car) {
  const player = game.player;
  if (!player.inCar || !player.car) return false;
  const pc = player.car;
  const along = car.axis === 'v' ? (pc.y - car.y) * car.dir : (pc.x - car.x) * car.dir;
  if (along <= 0 || along > TRAFFIC_AVOID.range) return false;
  const lateral = car.axis === 'v' ? Math.abs(pc.x - car.x) : Math.abs(pc.y - car.y);
  return lateral < 40;
}

/**
 * Turn at a crossing: when the entity is near a crossing road and the dice
 * say so, switch it onto that road in a random direction, `offset` sideways
 * from the new road's centreline (a lane for cars, the sidewalk for
 * pedestrians). Returns true when it turned.
 */
function turnAtCrossing(entity, random, turnChance, offset, nearDist) {
  const crossing = entity.axis === 'v'
    ? H_ROADS.find((ry) => Math.abs(entity.y - ry) < nearDist)
    : V_ROADS.find((rx) => Math.abs(entity.x - rx) < nearDist);
  if (crossing === undefined || random() >= turnChance) return false;
  const newDir = random() < 0.5 ? 1 : -1;
  if (entity.axis === 'v') {
    entity.axis = 'h';
    entity.road = crossing;
    entity.y = crossing + offset;
    entity.dir = newDir;
    entity.angle = newDir > 0 ? 0 : Math.PI;
  } else {
    entity.axis = 'v';
    entity.road = crossing;
    entity.x = crossing + offset;
    entity.dir = newDir;
    entity.angle = newDir > 0 ? Math.PI / 2 : -Math.PI / 2;
  }
  return true;
}

function maybeTurn(game, car, random) {
  const lane = (random() < 0.5 ? -1 : 1) * 26;
  if (!turnAtCrossing(car, random, TRAFFIC.turnChance, lane, 22)) return;
  car.lane = lane;
  car.shift = 0;
  car.shiftTarget = 0;
}

/** Put a traffic car back on a random road (it drove off the map, or was towed). */
function relocateCar(game, car, random) {
  const point = randomRoadPoint(random);
  const dir = random() < 0.5 ? 1 : -1;
  const lane = (random() < 0.5 ? -1 : 1) * 26;
  car.axis = point.axis;
  car.dir = dir;
  car.road = point.axis === 'v' ? point.x : point.y;
  car.x = point.axis === 'v' ? point.x + lane : point.x;
  car.y = point.axis === 'v' ? point.y : point.y + lane;
  car.angle = point.axis === 'v' ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI);
  car.lane = lane;
  car.shift = 0;
  car.shiftTarget = 0;
  car.knockX = 0;
  car.knockY = 0;
  car.spin = 0;
  car.limp = false;
  car.health = 100;
  car.kind = 'traffic';
  car.speed = car.targetSpeed;
}

function updateTrafficCar(game, car, dt, random) {
  if (car.kind === 'wreck') {
    car.respawn -= dt;
    if (car.respawn <= 0) relocateCar(game, car, random);
    return;
  }
  if (car.kind !== 'traffic') return;

  // A spinning car wobbles and slows; a limping car crawls.
  if (car.spin > 0) {
    car.spin -= dt;
    car.speed = Math.max(0, car.speed - 320 * dt);
    car.angle += Math.sin(car.spin * 9) * 1.4 * dt;
  }
  const cruise = car.limp ? car.targetSpeed * 0.5 : car.targetSpeed;

  // Dodge the player's car: slow down and shift into the other lane.
  if (playerCarAhead(game, car)) {
    car.shiftTarget = car.lane > 0 ? -TRAFFIC_AVOID.shift : TRAFFIC_AVOID.shift;
  } else {
    car.shiftTarget = 0;
  }
  car.shift += (car.shiftTarget - car.shift) * Math.min(1, dt * 4);

  const ahead = carAhead(game, car, 90);
  const want = ahead ? Math.max(0, ahead.speed - 30) : cruise;
  const slowed = playerCarAhead(game, car) ? want * TRAFFIC_AVOID.slowFactor : want;
  car.speed += Math.sign(slowed - car.speed) * 160 * dt;
  car.speed = Math.max(0, car.speed);

  car.x += Math.cos(car.angle) * car.speed * dt + car.knockX * dt;
  car.y += Math.sin(car.angle) * car.speed * dt + car.knockY * dt;
  car.knockX *= Math.max(0, 1 - dt * 3);
  car.knockY *= Math.max(0, 1 - dt * 3);
  // Apply the lateral dodge to the position, relative to the road centreline.
  if (car.axis === 'v') car.x = car.road + car.lane + car.shift;
  else car.y = car.road + car.lane + car.shift;

  maybeTurn(game, car, random);
  if (car.x < -60 || car.x > WORLD.width + 60 || car.y < -60 || car.y > WORLD.height + 60) {
    relocateCar(game, car, random);
  }
}

/** Two traffic cars that overlap push apart and exchange speed. */
function collideTrafficCars(game) {
  const cars = game.cars;
  for (let i = 0; i < cars.length; i += 1) {
    const a = cars[i];
    if (a.kind !== 'traffic') continue;
    for (let j = i + 1; j < cars.length; j += 1) {
      const b = cars[j];
      if (b.kind !== 'traffic') continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      if (d >= 38 || d < 0.01) continue;
      const nx = dx / d;
      const ny = dy / d;
      const push = (38 - d) / 2;
      a.x -= nx * push;
      a.y -= ny * push;
      b.x += nx * push;
      b.y += ny * push;
      // Exchange speed along the impact normal, plus a spin for hard hits.
      const rel = Math.abs(a.speed - b.speed);
      const avg = (a.speed + b.speed) / 2;
      a.speed = avg;
      b.speed = avg;
      if (rel > 120) {
        a.spin = Math.max(a.spin, 0.6);
        b.spin = Math.max(b.spin, 0.6);
        a.knockX -= nx * 60;
        a.knockY -= ny * 60;
        b.knockX += nx * 60;
        b.knockY += ny * 60;
        game.audio.crash();
      }
    }
  }
}

/** Smash a traffic car hard enough and it becomes a smoking wreck. */
function wreckCar(game, car) {
  car.kind = 'wreck';
  car.speed = 0;
  car.respawn = WRECK_RESPAWN;
  for (let i = 0; i < 8; i += 1) {
    game.particles.push({
      x: car.x, y: car.y, vx: (Math.random() - 0.5) * 120, vy: (Math.random() - 0.5) * 120,
      life: 0.6, maxLife: 0.6, color: '#555', size: 6, kind: 'smoke',
    });
  }
}

function updatePedestrian(game, ped, dt, random) {
  if (!ped.alive) return;
  const player = game.player;
  const distPlayer = Math.hypot(ped.x - player.x, ped.y - player.y);
  if (ped.flee > 0) {
    ped.flee -= dt;
    const away = Math.atan2(ped.y - player.y, ped.x - player.x);
    ped.angle = away;
    ped.x += Math.cos(away) * 150 * dt;
    ped.y += Math.sin(away) * 150 * dt;
    collideCircle(game.city, ped, 10);
    return;
  }
  if (distPlayer < 130 && player.inCar && Math.abs(player.speed) > 180) ped.flee = 2.5;
  ped.x += Math.cos(ped.angle) * ped.speed * dt;
  ped.y += Math.sin(ped.angle) * ped.speed * dt;
  // Turn at a crossing, or wander off the sidewalk and come back.
  turnAtCrossing(ped, random, 0.3, ped.side, 14);
  if (ped.x < 40 || ped.x > WORLD.width - 40 || ped.y < 40 || ped.y > WORLD.height - 40) {
    ped.dir *= -1;
    ped.angle += Math.PI;
  }
  collideCircle(game.city, ped, 10);
}

/** A pedestrian hit by the player's car: a crime, and the pedestrian goes down. */
export function hitPedestrian(game, ped) {
  ped.alive = false;
  ped.flee = 0;
  for (let i = 0; i < 10; i += 1) {
    game.particles.push({
      x: ped.x, y: ped.y,
      vx: (Math.random() - 0.5) * 160, vy: (Math.random() - 0.5) * 160,
      life: 0.5, maxLife: 0.5, color: '#e5534b', size: 4, kind: 'spark',
    });
  }
  addWanted(game, 22, 'pedestrian hit');
  game.toast('You hit a pedestrian! The cops are coming.', 2.5);
  game.audio.crash();
  // A fresh pedestrian wanders in a little later.
  setTimeout(() => {
    if (game.screen === 'play') spawnPedestrian(game, game.rng);
  }, 9000);
}

/** One step for every car, pedestrian and pickup. */
export function updateTraffic(game, dt) {
  const random = game.rng;
  for (const car of game.cars) updateTrafficCar(game, car, dt, random);
  collideTrafficCars(game);
  for (const ped of game.peds) updatePedestrian(game, ped, dt, random);

  // The player's car against pedestrians and other cars.
  const player = game.player;
  if (player.inCar && player.car) {
    const car = player.car;
    for (const ped of game.peds) {
      if (!ped.alive) continue;
      if (Math.hypot(ped.x - car.x, ped.y - car.y) < 30 && Math.abs(car.speed) > 60) {
        hitPedestrian(game, ped);
      }
    }
    for (const other of game.cars) {
      if (other === car || other.kind === 'parked' || other.kind === 'wreck') continue;
      const d = Math.hypot(other.x - car.x, other.y - car.y);
      if (d < 38 && d > 0.01) {
        const nx = (other.x - car.x) / d;
        const ny = (other.y - car.y) / d;
        const impact = Math.abs(car.speed);
        const push = (38 - d) / 2;
        other.x += nx * push;
        other.y += ny * push;
        car.x -= nx * push;
        car.y -= ny * push;
        if (impact > 120) {
          // A real crash: momentum into the other car, damage both ways.
          other.knockX += nx * impact * 0.7;
          other.knockY += ny * impact * 0.7;
          other.speed = Math.max(0, other.speed - 80);
          other.health -= Math.round(impact / 18);
          other.spin = Math.max(other.spin, 0.5);
          car.speed *= 0.65;
          car.health -= 3;
          game.audio.crash();
          game.camera.shake = Math.max(game.camera.shake, 5);
          if (other.health <= 0) {
            wreckCar(game, other);
          } else if (other.health < 50) {
            addWanted(game, 6, 'hit and run');
            game.toast('Hit and run! The cops noticed.', 2);
          }
        }
      }
    }
    // A wreck blocks the road: bounce the player's car off it.
    for (const wreck of game.cars) {
      if (wreck.kind !== 'wreck') continue;
      const d = Math.hypot(wreck.x - car.x, wreck.y - car.y);
      if (d < 38 && d > 0.01) {
        const nx = (car.x - wreck.x) / d;
        const ny = (car.y - wreck.y) / d;
        car.x = wreck.x + nx * 38;
        car.y = wreck.y + ny * 38;
        if (Math.abs(car.speed) > 200) {
          car.speed *= 0.5;
          car.health -= 5;
          game.audio.crash();
        }
      }
    }
  }

  // Wrecks smoke until the tow truck comes.
  for (const car of game.cars) {
    if (car.kind === 'wreck' && Math.random() < 0.1) {
      game.particles.push({
        x: car.x + (Math.random() - 0.5) * 16, y: car.y + (Math.random() - 0.5) * 16,
        vx: 0, vy: -26, life: 0.9, maxLife: 0.9, color: '#555', size: 7, kind: 'smoke',
      });
    }
  }

  // Pickups: respawn on a timer, collected by walking or driving over them.
  for (const pickup of game.pickups) {
    if (pickup.taken) {
      pickup.respawn -= dt;
      if (pickup.respawn <= 0) pickup.taken = false;
      continue;
    }
    const d = Math.hypot(pickup.x - player.x, pickup.y - player.y);
    if (d < 34) {
      pickup.taken = true;
      pickup.respawn = 60;
      collectPickup(game, pickup);
    }
  }
}

function collectPickup(game, pickup) {
  const player = game.player;
  if (pickup.kind === 'cash') {
    player.cash += pickup.amount;
    game.toast(`+$${pickup.amount} found on the street`, 2);
    game.audio.cash();
  } else if (pickup.kind === 'ammo') {
    player.ammo = Math.min(60, player.ammo + pickup.amount);
    game.toast(`+${pickup.amount} bullets`, 2);
    game.audio.pickup();
  } else {
    player.health = Math.min(100, player.health + pickup.amount);
    game.toast(`+${pickup.amount} health`, 2);
    game.audio.pickup();
  }
  game.particles.push({
    x: pickup.x, y: pickup.y, vx: 0, vy: -40, life: 0.6, maxLife: 0.6,
    color: '#f2c94c', size: 6, kind: 'spark',
  });
}

// Re-exported for callers that only import traffic.js.
export { isOnRoad, nearestRoadPoint };
