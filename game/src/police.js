// Solmar City v2 — the wanted system and the Solmar police: crimes raise the
// wanted level from 0 to 5 stars, patrol cars spawn and chase the player,
// ramming his car or arresting him on foot. Outrun them far enough for long
// enough and the heat dies down. New in v2: the arrest is a real mechanic
// instead of a coin flip. A patrol car that reaches Leo on foot brakes, stops
// beside him and fills a bust meter — run and the meter drains, stand still
// and it fills fast; full means busted. At 4-5 stars the patrol cars are
// faster and hunt in pairs, and while mission 3 is building heat every crime
// counts extra and patrol cars arrive sooner.

import { BUST, CAR, HEAT_BOOST, POLICE, WANTED_LEVELS } from './config.js';
import { collideCircle, nearestRoadPoint } from './world.js';
import { randomRange } from './random.js';
import { explodeCar } from './player.js';

export function wantedLevel(points) {
  let level = 0;
  for (let i = 0; i < WANTED_LEVELS.length; i += 1) {
    if (points >= WANTED_LEVELS[i]) level = i + 1;
  }
  return level;
}

/**
 * Add wanted points for a crime; returns the new star level. While mission 3
 * is building heat the points are multiplied (see HEAT_BOOST in config.js).
 */
export function addWanted(game, points, reason) {
  const boost = game.heatBoost || 1;
  game.wanted.points = Math.min(100, game.wanted.points + points * boost);
  const level = wantedLevel(game.wanted.points);
  if (level > game.wanted.level) {
    game.wanted.level = level;
    game.wanted.loseTimer = 0;
    if (level >= 2) game.toast(`Wanted level ${level} — ${reason}`, 2.5);
  }
  return level;
}

function spawnPoliceCar(game, random) {
  const player = game.player;
  // Appear on a road a little way off, in a random direction.
  const angle = random() * Math.PI * 2;
  const dist = randomRange(random, 480, 720);
  const point = nearestRoadPoint(
    Math.max(120, Math.min(3480, player.x + Math.cos(angle) * dist)),
    Math.max(120, Math.min(2580, player.y + Math.sin(angle) * dist)),
  );
  const car = {
    x: point.x, y: point.y,
    angle: Math.atan2(player.y - point.y, player.x - point.x),
    speed: 240,
    targetSpeed: POLICE.chaseSpeed,
    color: '#f2f4f6',
    kind: 'police',
    axis: point.axis,
    dir: 1,
    road: point.axis === 'v' ? point.x : point.y,
    health: 120,
    owned: false,
    siren: random() < 0.5 ? 0 : 1,
  };
  game.cars.push(car);
  game.police.push(car);
  return car;
}

/** Steer a patrol car toward the player, limited so it looks like driving. */
function steerToward(car, tx, ty, dt, maxTurn = 2.4) {
  const wantAngle = Math.atan2(ty - car.y, tx - car.x);
  let diff = wantAngle - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  car.angle += Math.max(-maxTurn * dt, Math.min(maxTurn * dt, diff));
}

function updatePoliceCar(game, car, dt) {
  const player = game.player;
  const dx = player.x - car.x;
  const dy = player.y - car.y;
  const dist = Math.hypot(dx, dy) || 1;
  const level = game.wanted.level;

  if (!player.inCar && dist < 260) {
    // Arrest approach: close in, brake to a stop beside Leo, fill the bust meter.
    steerToward(car, player.x, player.y, dt, 3.2);
    const target = dist < BUST.radius + 14 ? 0 : BUST.arrestSpeed;
    car.speed += (target - car.speed) * Math.min(1, dt * 3.2);
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;
    collideCircle(game.city, car, CAR.radius);
    if (dist < BUST.radius && car.speed < 120) {
      game.bustProgress = Math.min(1, game.bustProgress + dt / BUST.holdSeconds);
      if (game.bustProgress >= 1) {
        game.screen = 'busted';
        game.audio.busted();
        return;
      }
    } else if (dist < BUST.radius && player.invulnerable <= 0) {
      // A fast patrol car that clips Leo on foot hurts him instead of busting.
      player.health -= 15;
      player.invulnerable = 0.8;
      game.camera.shake = Math.max(game.camera.shake, 8);
      game.audio.crash();
      game.bustProgress = Math.min(1, game.bustProgress + 0.25);
      if (player.health <= 0) player.health = 0;
    }
  } else {
    // Chase: hunt the car, faster at 4-5 stars.
    steerToward(car, player.x, player.y, dt);
    const hot = level >= 4 ? POLICE.chaseSpeedHot : POLICE.chaseSpeed;
    car.speed += (hot - car.speed) * Math.min(1, dt * 0.8);
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;
    const hit = collideCircle(game.city, car, CAR.radius);
    if (hit) car.speed *= 0.6;

    if (dist < POLICE.bustRadius && player.inCar && player.car) {
      // Ram: damage the player's car and shove it.
      player.car.health -= POLICE.ramDamage * dt * 3;
      player.car.speed *= 1 - 0.6 * dt;
      game.camera.shake = Math.max(game.camera.shake, 4);
      if (Math.random() < 0.2) game.audio.crash();
      if (player.car.health <= 0) explodeCar(game, player.car);
    }
  }

  // A police car far behind gives up and despawns.
  if (dist > 1600) {
    car.gone = true;
  }
  // Smoke when badly damaged.
  if (car.health < 50 && Math.random() < 0.2) {
    game.particles.push({
      x: car.x, y: car.y, vx: 0, vy: -26, life: 0.8, maxLife: 0.8,
      color: '#555', size: 7, kind: 'smoke',
    });
  }
  if (car.health <= 0) {
    car.gone = true;
    for (let i = 0; i < 14; i += 1) {
      const a = Math.random() * Math.PI * 2;
      game.particles.push({
        x: car.x, y: car.y, vx: Math.cos(a) * 140, vy: Math.sin(a) * 140,
        life: 0.6, maxLife: 0.6, color: '#f7d774', size: 5, kind: 'spark',
      });
    }
    addWanted(game, 0, ''); // refresh level display
  }
}

/** One step of the wanted system: spawn, chase, lose the heat, clean up. */
export function updatePolice(game, dt) {
  const wanted = game.wanted;
  const level = wantedLevel(wanted.points);
  wanted.level = level;
  const random = game.rng;

  // Spawn up to one patrol car per star (plus one), capped; at 4-5 stars they
  // come in pairs, and during mission 3's heat build-up they arrive sooner.
  const wantCount = level === 0 ? 0 : Math.min(POLICE.maxCars, level + (level >= 4 ? 2 : 1));
  const alive = game.police.filter((c) => !c.gone);
  const buildingHeat = game.mission && game.mission.id === 3 && game.mission.stage === 0;
  const spawnRate = buildingHeat ? POLICE.heatSpawnRate : POLICE.spawnRate;
  if (alive.length < wantCount && Math.random() < dt * spawnRate) {
    spawnPoliceCar(game, random);
  }

  let nearest = Infinity;
  for (const car of game.police) {
    if (car.gone) continue;
    updatePoliceCar(game, car, dt);
    if (game.screen !== 'play') return;
    const d = Math.hypot(car.x - game.player.x, car.y - game.player.y);
    if (d < nearest) nearest = d;
  }

  // Running away drains the bust meter — once per frame, from the nearest
  // patrol car, not once per car (a distant second cop must not cancel the
  // one standing beside Leo).
  if (nearest > BUST.drainRadius) {
    game.bustProgress = Math.max(0, game.bustProgress - dt / BUST.holdSeconds);
  }

  // Lose the heat: no police car close for a while, stars tick down.
  if (level > 0 && nearest > POLICE.loseDistance) {
    wanted.loseTimer += dt;
    if (wanted.loseTimer > POLICE.loseSeconds) {
      wanted.points = Math.max(0, wanted.points - 30 * dt);
      if (wanted.points === 0) game.toast('You lost the cops. Heat is off.', 2.5);
    }
  } else {
    wanted.loseTimer = 0;
  }

  // Clean up despawned or wrecked patrol cars.
  if (game.police.some((c) => c.gone)) {
    game.police = game.police.filter((c) => !c.gone);
    game.cars = game.cars.filter((c) => !c.gone);
  }
}

// Re-exported so missions.js can read the heat multiplier from one place.
export { HEAT_BOOST };
