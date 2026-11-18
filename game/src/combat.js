// Solmar City v2 — combat: the pistol (mouse aim, click to shoot, limited
// ammo), the fists (F, or a click with an empty magazine), and the bullets
// that fly. Shooting a pedestrian or a cop is a crime; the debtors of mission
// 4 fight back on foot. New in v2: bullets can shoot out a traffic car's
// tyre — the car limps along at half speed, smoking, until it is towed — and
// the bullet's hit tests are one small helper each instead of one long loop.

import { COMBAT } from './config.js';
import { addWanted } from './police.js';
import { aimAngle } from './player.js';
import { solidAt } from './world.js';

function spawnMuzzle(game, x, y, angle) {
  for (let i = 0; i < 6; i += 1) {
    const a = angle + (Math.random() - 0.5) * 0.6;
    game.particles.push({
      x: x + Math.cos(angle) * 22, y: y + Math.sin(angle) * 22,
      vx: Math.cos(a) * (120 + Math.random() * 160), vy: Math.sin(a) * (120 + Math.random() * 160),
      life: 0.18, maxLife: 0.18, color: '#f7d774', size: 4, kind: 'spark',
    });
  }
}

export function shoot(game) {
  const player = game.player;
  if (player.inCar || player.shootCooldown > 0) return;
  if (player.ammo <= 0) {
    punch(game);
    return;
  }
  player.ammo -= 1;
  player.shootCooldown = COMBAT.shootCooldown;
  const angle = aimAngle(game);
  game.bullets.push({
    x: player.x + Math.cos(angle) * 24,
    y: player.y + Math.sin(angle) * 24,
    angle,
    speed: COMBAT.bulletSpeed,
    travelled: 0,
  });
  spawnMuzzle(game, player.x, player.y, angle);
  game.audio.gunshot();
  game.camera.shake = Math.max(game.camera.shake, 2.5);
  addWanted(game, 2, 'shots fired');
  // Nearby pedestrians run for it.
  for (const ped of game.peds) {
    if (ped.alive && Math.hypot(ped.x - player.x, ped.y - player.y) < 320) ped.flee = 3;
  }
}

export function punch(game) {
  const player = game.player;
  if (player.inCar || player.punchCooldown > 0) return;
  player.punchCooldown = COMBAT.punchCooldown;
  const angle = aimAngle(game);
  game.audio.punch();
  // Hit anything hostile or unlucky in front of the fist.
  const targets = [];
  for (const ped of game.peds) if (ped.alive) targets.push({ x: ped.x, y: ped.y, kind: 'ped', ref: ped });
  for (const debtor of game.debtors) if (debtor.alive) targets.push({ x: debtor.x, y: debtor.y, kind: 'debtor', ref: debtor });
  for (const target of targets) {
    const dx = target.x - player.x;
    const dy = target.y - player.y;
    const dist = Math.hypot(dx, dy);
    if (dist > COMBAT.punchRange) continue;
    const toTarget = Math.atan2(dy, dx);
    let diff = toTarget - angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    if (Math.abs(diff) > 0.9) continue;
    if (target.kind === 'ped') {
      target.ref.alive = false;
      addWanted(game, 15, 'assault');
      game.toast('You punched a pedestrian!', 2);
    } else {
      damageDebtor(game, target.ref, COMBAT.punchDamage);
    }
    game.particles.push({
      x: target.x, y: target.y, vx: 0, vy: 0, life: 0.3, maxLife: 0.3,
      color: '#f7d774', size: 6, kind: 'spark',
    });
  }
}

function damageDebtor(game, debtor, amount) {
  debtor.health -= amount;
  if (debtor.health <= 0) {
    debtor.alive = false;
    game.toast('One debtor down.', 2);
    game.audio.cash();
  }
}

/** A bullet hitting a traffic car: dents, and a shot tyre leaves it limping. */
function hitTrafficCar(game, car, bullet) {
  car.health -= COMBAT.bulletDamage;
  bullet.dead = true;
  if (car.health < 40 && !car.limp) {
    car.limp = true;
    game.toast('You shot out a tyre — that car is limping!', 2);
    game.particles.push({
      x: bullet.x, y: bullet.y, vx: 0, vy: 0, life: 0.3, maxLife: 0.3,
      color: '#f7d774', size: 5, kind: 'spark',
    });
  }
}

function spark(game, x, y, color = '#f7d774', size = 5) {
  game.particles.push({
    x, y, vx: 0, vy: 0, life: 0.3, maxLife: 0.3, color, size, kind: 'spark',
  });
}

/** One step for every bullet in the air. */
export function updateBullets(game, dt) {
  for (const bullet of game.bullets) {
    bullet.x += Math.cos(bullet.angle) * bullet.speed * dt;
    bullet.y += Math.sin(bullet.angle) * bullet.speed * dt;
    bullet.travelled += bullet.speed * dt;
    if (bullet.travelled > COMBAT.bulletRange) {
      bullet.dead = true;
      continue;
    }
    // Buildings stop bullets.
    if (solidAt(game.city, bullet.x, bullet.y)) {
      bullet.dead = true;
      spark(game, bullet.x, bullet.y, '#f7d774', 4);
      continue;
    }
    // Pedestrians.
    for (const ped of game.peds) {
      if (!ped.alive) continue;
      if (Math.hypot(ped.x - bullet.x, ped.y - bullet.y) < 14) {
        ped.alive = false;
        bullet.dead = true;
        addWanted(game, 22, 'someone got shot');
        game.toast('You shot a pedestrian! The cops are coming.', 2.5);
        break;
      }
    }
    if (bullet.dead) continue;
    // Debtors (mission 4).
    for (const debtor of game.debtors) {
      if (!debtor.alive) continue;
      if (Math.hypot(debtor.x - bullet.x, debtor.y - bullet.y) < 16) {
        damageDebtor(game, debtor, COMBAT.bulletDamage);
        bullet.dead = true;
        break;
      }
    }
    if (bullet.dead) continue;
    // Police cars.
    for (const car of game.police) {
      if (car.gone) continue;
      if (Math.hypot(car.x - bullet.x, car.y - bullet.y) < 24) {
        car.health -= COMBAT.bulletDamage;
        bullet.dead = true;
        addWanted(game, 12, 'shots at police');
        spark(game, bullet.x, bullet.y);
        break;
      }
    }
    if (bullet.dead) continue;
    // Traffic and parked cars take dents — and tyres.
    for (const car of game.cars) {
      if (car.kind !== 'traffic' && car.kind !== 'parked') continue;
      if (Math.hypot(car.x - bullet.x, car.y - bullet.y) < 22) {
        hitTrafficCar(game, car, bullet);
        break;
      }
    }
  }
  game.bullets = game.bullets.filter((b) => !b.dead);
}
