// Solmar City v2 — Leo Marlow, on foot and behind the wheel: walking and
// running, stealing and driving cars, the camera that follows him, and the
// damage he takes. The car he drives is one of the world's cars (kind
// 'player'); stepping out parks it. New in v2: a hurt car handles worse — a
// lightly damaged car loses a quarter of its speed, a wrecked one half, and
// below 25 health the engine sputters — and a near miss at speed pays a
// little cash. The camera also pulls back a touch at high speed.

import { CAR, NEAR_MISS, PLAYER } from './config.js';
import { collideCircle } from './world.js';
import { addWanted } from './police.js';

export function createPlayer(x, y) {
  return {
    x, y,
    angle: -Math.PI / 2,
    health: PLAYER.maxHealth,
    cash: PLAYER.startCash,
    ammo: PLAYER.startAmmo,
    inCar: false,
    car: null,
    speed: 0,
    punchCooldown: 0,
    shootCooldown: 0,
    invulnerable: 0,
  };
}

/** Where the player is aiming: from the player toward the mouse, in world space. */
export function aimAngle(game) {
  const input = game.input;
  const cam = game.camera;
  const wx = input.mouse.x + cam.x - game.view.w / 2;
  const wy = input.mouse.y + cam.y - game.view.h / 2;
  return Math.atan2(wy - game.player.y, wx - game.player.x);
}

/** The nearest car the player could steal, within reach, or null. */
export function nearestStealableCar(game) {
  const p = game.player;
  let best = null;
  let bestD = CAR.stealRadius;
  for (const car of game.cars) {
    if (car.kind === 'police' || car.kind === 'player' || car.kind === 'wreck') continue;
    const d = Math.hypot(car.x - p.x, car.y - p.y);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}

export function enterCar(game, car) {
  const p = game.player;
  p.inCar = true;
  p.car = car;
  car.kind = 'player';
  car.speed = 0;
  if (!car.owned) {
    addWanted(game, 13, 'car stolen');
    game.toast('Car stolen — the cops noticed!', 2.5);
  }
  game.audio.unlock();
}

export function exitCar(game) {
  const p = game.player;
  const car = p.car;
  if (!car) return;
  car.kind = 'parked';
  car.owned = true;
  car.speed = 0;
  const side = car.angle + Math.PI / 2;
  p.x = car.x + Math.cos(side) * 34;
  p.y = car.y + Math.sin(side) * 34;
  collideCircle(game.city, p, PLAYER.radius);
  p.inCar = false;
  p.car = null;
  p.angle = car.angle;
}

/** Hurt the player (not through armour): returns true when he goes down. */
export function damagePlayer(game, amount) {
  const p = game.player;
  if (p.invulnerable > 0) return false;
  p.health -= amount;
  p.invulnerable = 0.5;
  game.camera.shake = Math.max(game.camera.shake, 7);
  if (p.health <= 0) {
    p.health = 0;
    return true;
  }
  return false;
}

/** How well a car drives, from its health: 1 healthy, less when hurt. */
function handlingFactor(car) {
  if (car.health >= 50) return 1;
  if (car.health >= CAR.sputterHealth) return CAR.wornHandling;
  return CAR.hurtHandling;
}

function driveCar(game, car, dt, input) {
  const move = input.moveVector();
  const forward = move.y < 0;
  const back = move.y > 0;
  const handbrake = input.handbrake();
  const handling = handlingFactor(car);
  const topSpeed = CAR.maxSpeed * handling;

  if (forward) car.speed += CAR.accel * handling * dt;
  else if (back) {
    if (car.speed > 20) car.speed -= CAR.brake * dt;
    else car.speed -= CAR.accel * 0.55 * dt;
  } else {
    car.speed -= Math.sign(car.speed) * 140 * dt;
    if (Math.abs(car.speed) < 8) car.speed = 0;
  }
  if (handbrake) {
    car.speed -= Math.sign(car.speed) * 520 * dt;
    if (Math.abs(car.speed) < 12) car.speed = 0;
  }
  // A wrecked engine sputters: brief, random losses of power.
  if (car.health < CAR.sputterHealth && Math.random() < 0.02) car.speed *= 0.6;
  car.speed = Math.max(-CAR.reverseMax, Math.min(topSpeed, car.speed));

  const steer = move.x !== 0 ? move.x : 0;
  const turnRate = (handbrake ? CAR.handbrakeTurn : CAR.turnRate) * Math.min(1, Math.abs(car.speed) / 140);
  car.angle += steer * turnRate * Math.sign(car.speed) * dt;

  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;
  const before = { x: car.x, y: car.y };
  car.x = nx;
  car.y = ny;
  const hit = collideCircle(game.city, car, CAR.radius);
  if (hit) {
    const impact = Math.abs(car.speed);
    if (impact > 170) {
      car.health -= Math.round((impact - 170) / 12);
      game.audio.crash();
      game.camera.shake = Math.max(game.camera.shake, 6);
      game.particles.push({
        x: car.x, y: car.y, vx: 0, vy: 0, life: 0.5, maxLife: 0.5,
        color: '#f7d774', size: 5, kind: 'spark',
      });
      if (game.mission && game.mission.id === 2) game.mission.crashPenalty = true;
    }
    car.speed *= 0.35;
    // Slide along the wall instead of sticking to it.
    const dx = car.x - before.x;
    const dy = car.y - before.y;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) car.speed = 0;
  }

  // Skid and exhaust particles.
  if (handbrake && Math.abs(car.speed) > 120) {
    game.particles.push({
      x: car.x - Math.cos(car.angle) * 16, y: car.y - Math.sin(car.angle) * 16,
      vx: -Math.cos(car.angle) * 30, vy: -Math.sin(car.angle) * 30,
      life: 0.6, maxLife: 0.6, color: '#cfc8b8', size: 6, kind: 'smoke',
    });
  }
  if (Math.abs(car.speed) > 60 && Math.random() < 0.35) {
    game.particles.push({
      x: car.x - Math.cos(car.angle) * 20, y: car.y - Math.sin(car.angle) * 20,
      vx: -Math.cos(car.angle) * 24, vy: -Math.sin(car.angle) * 24,
      life: 0.4, maxLife: 0.4, color: '#b8b0a0', size: 4, kind: 'smoke',
    });
  }
  // A wrecked car smokes and is about to blow.
  if (car.health < 40 && Math.random() < 0.25) {
    game.particles.push({
      x: car.x + (Math.random() - 0.5) * 20, y: car.y + (Math.random() - 0.5) * 20,
      vx: 0, vy: -30, life: 0.9, maxLife: 0.9, color: '#555', size: 7, kind: 'smoke',
    });
  }
  if (car.health <= 0) {
    explodeCar(game, car);
  }

  game.player.x = car.x;
  game.player.y = car.y;
  game.player.angle = car.angle;
  game.player.speed = car.speed;
}

/** A near miss at speed: thread past a traffic car close and fast, get paid. */
export function checkNearMiss(game) {
  const player = game.player;
  if (!player.inCar || !player.car || Math.abs(player.car.speed) < NEAR_MISS.speed) return;
  if (game.now - game.nearMissAt < NEAR_MISS.cooldown) return;
  const car = player.car;
  for (const other of game.cars) {
    if (other === car || other.kind !== 'traffic') continue;
    const d = Math.hypot(other.x - car.x, other.y - car.y);
    if (d > 36 && d < NEAR_MISS.distance) {
      game.nearMissAt = game.now;
      player.cash += NEAR_MISS.reward;
      game.toast(`Close call! +$${NEAR_MISS.reward}`, 1.6);
      game.audio.pickup();
      return;
    }
  }
}

export function explodeCar(game, car) {
  for (let i = 0; i < 22; i += 1) {
    const a = Math.random() * Math.PI * 2;
    const s = 60 + Math.random() * 220;
    game.particles.push({
      x: car.x, y: car.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      life: 0.7, maxLife: 0.7, color: i % 3 === 0 ? '#f2c94c' : '#e5534b', size: 5, kind: 'spark',
    });
  }
  game.audio.crash();
  game.camera.shake = 14;
  const idx = game.cars.indexOf(car);
  if (idx !== -1) game.cars.splice(idx, 1);
  if (game.player.car === car) {
    game.player.inCar = false;
    game.player.car = null;
    damagePlayer(game, 45);
    game.player.x = car.x + 40;
    game.player.y = car.y + 40;
  }
}

function walkPlayer(game, dt, input) {
  const p = game.player;
  const move = input.moveVector();
  const speed = input.running() ? PLAYER.runSpeed : PLAYER.walkSpeed;
  p.x += move.x * speed * dt;
  p.y += move.y * speed * dt;
  collideCircle(game.city, p, PLAYER.radius);
  if (move.x !== 0 || move.y !== 0) {
    p.angle = Math.atan2(move.y, move.x);
    p.speed = speed;
  } else {
    p.speed = 0;
  }
}

/** One step of the player, on foot or driving, plus the camera that follows. */
export function updatePlayer(game, dt, input) {
  const p = game.player;
  if (p.punchCooldown > 0) p.punchCooldown -= dt;
  if (p.shootCooldown > 0) p.shootCooldown -= dt;
  if (p.invulnerable > 0) p.invulnerable -= dt;

  if (p.inCar && p.car) driveCar(game, p.car, dt, input);
  else walkPlayer(game, dt, input);
  checkNearMiss(game);

  // Camera: ease toward the player, lead a little in the direction of travel,
  // and pull back slightly at speed so fast driving stays readable.
  const lead = p.inCar ? 60 : 24;
  const tx = p.x + Math.cos(p.angle) * lead;
  const ty = p.y + Math.sin(p.angle) * lead;
  game.camera.x += (tx - game.camera.x) * Math.min(1, dt * 5);
  game.camera.y += (ty - game.camera.y) * Math.min(1, dt * 5);
  const targetZoom = p.inCar ? 1 - Math.min(0.12, Math.abs(p.speed) / 560 * 0.12) : 1;
  game.camera.zoom += (targetZoom - game.camera.zoom) * Math.min(1, dt * 3);
  if (game.camera.shake > 0) game.camera.shake = Math.max(0, game.camera.shake - dt * 26);
}
