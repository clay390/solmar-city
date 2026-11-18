// Solmar City v2 — drawing only: the city, its people and cars, the HUD with
// its minimap, and the title, pause, phone, busted and wasted screens. Canvas
// 2D, top-down, warm sun-soaked colours. Nothing here changes the game — it
// only paints it. The painters are split small on purpose: one helper per
// thing (a road strip, a building, a tree, a car, a person), so the world is
// painted by composing them. New in v2: the title screen lists the five
// story jobs and the two side jobs side by side; the phone shows all seven;
// the HUD shows the radio track that is playing and a red ring that fills
// while the police are arresting Leo on foot; side-job crates, the bonfire
// and the warehouse are drawn in the world; the off-screen mission arrow is
// drawn in screen space (in v1 it was drawn inside the world transform and
// landed in the wrong place); and the camera pulls back a touch at speed.

import {
  FONT, H_ROADS, MUSIC, PALETTE, V_ROADS, WORLD,
} from './config.js';
import { drawMinimap } from './minimap.js';
import { MISSION_DEFS, isUnlocked, missionObjective } from './missions.js';
import { wantedLevel } from './police.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_BUSTED = 'busted';
export const SCREEN_WASTED = 'wasted';

const ROAD_HALF = 56;

/** A cheap deterministic hash for scattering grass patches. */
function hash2(x, y) {
  const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return h - Math.floor(h);
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const view = { w: 1280, h: 800, dpr: 1 };
  const fonts = new Map();

  // Deterministic grass patches so the ground is not one flat colour.
  const grassPatches = [];
  for (let i = 0; i < 260; i += 1) {
    grassPatches.push({
      x: hash2(i, 3) * WORLD.width,
      y: hash2(i, 11) * 2300,
      r: 14 + hash2(i, 7) * 46,
      light: hash2(i, 5) > 0.5,
    });
  }

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    view.dpr = dpr;
    view.w = window.innerWidth;
    view.h = window.innerHeight;
    canvas.width = Math.round(view.w * dpr);
    canvas.height = Math.round(view.h * dpr);
    canvas.style.width = `${view.w}px`;
    canvas.style.height = `${view.h}px`;
  }

  function text(value, x, y, size, color, align = 'left', baseline = 'alphabetic') {
    if (!fonts.has(size)) fonts.set(size, `600 ${size}px ${FONT}`);
    ctx.font = fonts.get(size);
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = baseline;
    ctx.fillText(value, x, y);
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawStar(cx, cy, r, filled) {
    ctx.beginPath();
    for (let i = 0; i < 10; i += 1) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rad = i % 2 === 0 ? r : r * 0.45;
      const px = cx + Math.cos(a) * rad;
      const py = cy + Math.sin(a) * rad;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = filled ? PALETTE.gold : 'rgba(255,255,255,0.22)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function inView(game, x, y, margin) {
    const cam = game.camera;
    return x > cam.x - view.w / 2 - margin && x < cam.x + view.w / 2 + margin
      && y > cam.y - view.h / 2 - margin && y < cam.y + view.h / 2 + margin;
  }

  /** The visible rectangle of the world, with a margin for things half on screen. */
  function viewRect(game, margin = 40) {
    const cam = game.camera;
    return {
      x0: cam.x - view.w / 2 - margin,
      y0: cam.y - view.h / 2 - margin,
      x1: cam.x + view.w / 2 + margin,
      y1: cam.y + view.h / 2 + margin,
    };
  }

  // ---- the ground -------------------------------------------------------

  function paintGround(game) {
    const r = viewRect(game);
    ctx.fillStyle = PALETTE.grass;
    ctx.fillRect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0);
    for (const p of grassPatches) {
      if (p.x < r.x0 - 60 || p.x > r.x1 + 60 || p.y < r.y0 - 60 || p.y > r.y1 + 60) continue;
      ctx.fillStyle = p.light ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    // Park, plaza paving, port concrete.
    const park = game.city.park;
    ctx.fillStyle = PALETTE.park;
    ctx.fillRect(park.x0, park.y0, park.x1 - park.x0, park.y1 - park.y0);
    ctx.fillStyle = PALETTE.plaza;
    ctx.fillRect(1480, 680, 240, 140);
    ctx.fillStyle = PALETTE.port;
    ctx.fillRect(game.city.portX, 0, WORLD.width - game.city.portX, game.city.beachY);
    // Beach and sea.
    ctx.fillStyle = PALETTE.sand;
    ctx.fillRect(r.x0, game.city.beachY, r.x1 - r.x0, game.city.waterY - game.city.beachY);
    ctx.fillStyle = PALETTE.waterDeep;
    if (r.y1 > game.city.waterY) ctx.fillRect(r.x0, game.city.waterY, r.x1 - r.x0, r.y1 - game.city.waterY);
    ctx.fillStyle = PALETTE.water;
    ctx.fillRect(r.x0, game.city.waterY, r.x1 - r.x0, 60);
    // Animated wave lines.
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i += 1) {
      const wy = game.city.waterY + 24 + i * 26;
      if (wy > r.y1) break;
      ctx.beginPath();
      const startX = Math.max(r.x0, 0);
      const endX = Math.min(r.x1, WORLD.width);
      for (let x = startX; x < endX; x += 40) {
        const yy = wy + Math.sin(x * 0.02 + game.time * 1.4 + i) * 4;
        if (x === startX) ctx.moveTo(x, yy);
        else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
  }

  /** One road: sidewalk, asphalt, and the dashed centre line. */
  function paintRoadStrip(at, vertical, span) {
    const [from, to] = span;
    if (vertical) {
      ctx.fillStyle = PALETTE.sidewalk;
      ctx.fillRect(at - ROAD_HALF - 16, from, ROAD_HALF * 2 + 32, to - from);
      ctx.fillStyle = PALETTE.road;
      ctx.fillRect(at - ROAD_HALF, from, ROAD_HALF * 2, to - from);
      ctx.strokeStyle = PALETTE.lane;
      ctx.lineWidth = 3;
      ctx.setLineDash([26, 30]);
      ctx.beginPath();
      ctx.moveTo(at, from);
      ctx.lineTo(at, to);
      ctx.stroke();
      ctx.setLineDash([]);
    } else {
      ctx.fillStyle = PALETTE.sidewalk;
      ctx.fillRect(from, at - ROAD_HALF - 16, to - from, ROAD_HALF * 2 + 32);
      ctx.fillStyle = PALETTE.road;
      ctx.fillRect(from, at - ROAD_HALF, to - from, ROAD_HALF * 2);
      ctx.strokeStyle = PALETTE.lane;
      ctx.lineWidth = 3;
      ctx.setLineDash([26, 30]);
      ctx.beginPath();
      ctx.moveTo(from, at);
      ctx.lineTo(to, at);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  function paintRoads(game) {
    const r = viewRect(game, 60);
    for (const rx of V_ROADS) {
      if (rx < r.x0 - 80 || rx > r.x1 + 80) continue;
      paintRoadStrip(rx, true, [Math.max(r.y0, 0), Math.min(r.y1, WORLD.height)]);
    }
    for (const ry of H_ROADS) {
      if (ry < r.y0 - 80 || ry > r.y1 + 80) continue;
      paintRoadStrip(ry, false, [Math.max(r.x0, 0), Math.min(r.x1, WORLD.width)]);
    }
  }

  // ---- the city -----------------------------------------------------------

  function paintBuilding(b) {
    // Soft south-east shadow, then the roof.
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(b.x + 7, b.y + 9, b.w, b.h);
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.fillRect(b.x + 6, b.y + 6, b.w - 12, b.h - 12);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(b.x + 10, b.y + 10, 18, 12);
    ctx.fillRect(b.x + b.w - 28, b.y + b.h - 22, 18, 12);
    if (b.tall) {
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(b.x + b.w - 14, b.y + 14, 8, b.h - 28);
      text(b.name, b.x + b.w / 2, b.y + b.h / 2, 15, 'rgba(255,255,255,0.85)', 'center', 'middle');
    }
    if (b.name === 'Port Warehouse') {
      text('PORT WAREHOUSE', b.x + b.w / 2, b.y + b.h / 2, 14, 'rgba(255,255,255,0.9)', 'center', 'middle');
    }
  }

  function paintContainer(c) {
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.fillRect(c.x + 4, c.y + 5, c.w, c.h);
    ctx.fillStyle = c.color;
    ctx.fillRect(c.x, c.y, c.w, c.h);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(c.x + 4, c.y + 4, c.w - 8, 5);
  }

  function paintTree(t) {
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.arc(t.x + 4, t.y + 5, t.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3f7d3a';
    ctx.beginPath();
    ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#5da244';
    ctx.beginPath();
    ctx.arc(t.x - 3, t.y - 3, t.r * 0.6, 0, Math.PI * 2);
    ctx.fill();
  }

  /** The bonfire pit on the beach: a stone ring and a flickering flame. */
  function paintBonfire(game) {
    const bonfire = game.city.bonfire;
    if (!inView(game, bonfire.x, bonfire.y, 60)) return;
    ctx.fillStyle = '#8a8078';
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(bonfire.x + Math.cos(a) * bonfire.r, bonfire.y + Math.sin(a) * bonfire.r, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    const flicker = 1 + Math.sin(game.time * 7) * 0.15 + Math.sin(game.time * 13.7) * 0.08;
    ctx.fillStyle = PALETTE.bonfire;
    ctx.beginPath();
    ctx.moveTo(bonfire.x - 12 * flicker, bonfire.y + 8);
    ctx.lineTo(bonfire.x, bonfire.y - 22 * flicker);
    ctx.lineTo(bonfire.x + 12 * flicker, bonfire.y + 8);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath();
    ctx.moveTo(bonfire.x - 6 * flicker, bonfire.y + 8);
    ctx.lineTo(bonfire.x, bonfire.y - 10 * flicker);
    ctx.lineTo(bonfire.x + 6 * flicker, bonfire.y + 8);
    ctx.closePath();
    ctx.fill();
  }

  function paintCity(game) {
    for (const pond of game.city.ponds) {
      if (!inView(game, pond.x, pond.y, pond.r)) continue;
      ctx.fillStyle = PALETTE.pond;
      ctx.beginPath();
      ctx.arc(pond.x, pond.y, pond.r, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const b of game.city.buildings) {
      if (inView(game, b.x + b.w / 2, b.y + b.h / 2, Math.max(b.w, b.h))) paintBuilding(b);
    }
    for (const c of game.city.containers) {
      if (inView(game, c.x + c.w / 2, c.y + c.h / 2, 80)) paintContainer(c);
    }
    for (const t of game.city.trees) {
      if (inView(game, t.x, t.y, t.r + 10)) paintTree(t);
    }
    paintBonfire(game);
  }

  // ---- things that move ---------------------------------------------------

  function paintCar(car, isPlayer) {
    ctx.save();
    ctx.translate(car.x, car.y);
    // A wreck sits crooked and charred.
    ctx.rotate(car.kind === 'wreck' ? 0.35 : car.angle);
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    roundRect(-22 + 4, -10 + 5, 46, 22, 8);
    ctx.fill();
    ctx.fillStyle = car.kind === 'wreck' ? '#3a3a3a' : car.color;
    roundRect(-23, -11, 46, 22, 8);
    ctx.fill();
    // Roof and windows.
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    roundRect(-8, -9, 18, 18, 5);
    ctx.fill();
    ctx.fillStyle = '#bcd6e8';
    ctx.fillRect(8, -8, 5, 16);
    ctx.fillRect(-14, -8, 4, 16);
    if (car.kind === 'police') {
      ctx.fillStyle = PALETTE.policeBlue;
      ctx.fillRect(-4, -11, 8, 22);
      const flash = Math.floor(performance.now() / 260) % 2 === 0;
      ctx.fillStyle = flash ? '#ff3b30' : '#2b5fd9';
      ctx.beginPath();
      ctx.arc(-2, -7, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = flash ? '#2b5fd9' : '#ff3b30';
      ctx.beginPath();
      ctx.arc(-2, 7, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    if (car.kind === 'target') {
      ctx.strokeStyle = '#fff3c4';
      ctx.lineWidth = 2;
      roundRect(-23, -11, 46, 22, 8);
      ctx.stroke();
    }
    if (car.limp) {
      // A flat tyre: the car sits low on one corner.
      ctx.fillStyle = '#1c1c1c';
      ctx.beginPath();
      ctx.arc(14, 10, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    // Headlights.
    ctx.fillStyle = '#fff2b0';
    ctx.fillRect(21, -8, 3, 4);
    ctx.fillRect(21, 4, 3, 4);
    if (isPlayer) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      roundRect(-23, -11, 46, 22, 8);
      ctx.stroke();
    }
    ctx.restore();
  }

  function paintPerson(x, y, angle, shirt, label) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.arc(3, 4, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = shirt;
    ctx.beginPath();
    ctx.arc(0, 0, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e8b98a';
    ctx.beginPath();
    ctx.arc(0, 0, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(angle) * 13, Math.sin(angle) * 13);
    ctx.stroke();
    if (label) text(label, 0, -20, 15, '#ffffff', 'center');
    ctx.restore();
  }

  function paintPickup(pickup) {
    if (pickup.taken) return;
    const bob = Math.sin(performance.now() / 300 + pickup.x) * 2;
    ctx.save();
    ctx.translate(pickup.x, pickup.y + bob);
    if (pickup.kind === 'cash') {
      ctx.fillStyle = '#3f9e4d';
      ctx.beginPath();
      ctx.arc(0, 0, 11, 0, Math.PI * 2);
      ctx.fill();
      text('$', 0, 5, 15, '#ffffff', 'center', 'middle');
    } else if (pickup.kind === 'ammo') {
      ctx.fillStyle = '#3a3f4a';
      ctx.fillRect(-9, -7, 18, 14);
      ctx.fillStyle = PALETTE.gold;
      ctx.fillRect(-6, -3, 3, 8);
      ctx.fillRect(-1, -3, 3, 8);
      ctx.fillRect(4, -3, 3, 8);
    } else {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#e5534b';
      ctx.fillRect(-2.5, -7, 5, 14);
      ctx.fillRect(-7, -2.5, 14, 5);
    }
    ctx.restore();
  }

  /** A side-job crate: a wooden box with a gold stripe, bobbing gently. */
  function paintCrate(crate) {
    if (crate.taken) return;
    const bob = Math.sin(performance.now() / 300 + crate.x) * 2;
    ctx.save();
    ctx.translate(crate.x, crate.y + bob);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(-11, -9, 24, 24);
    ctx.fillStyle = PALETTE.crate;
    ctx.fillRect(-13, -13, 26, 26);
    ctx.strokeStyle = '#6e4525';
    ctx.lineWidth = 2;
    ctx.strokeRect(-13, -13, 26, 26);
    ctx.beginPath();
    ctx.moveTo(-13, -13);
    ctx.lineTo(13, 13);
    ctx.moveTo(13, -13);
    ctx.lineTo(-13, 13);
    ctx.stroke();
    ctx.fillStyle = PALETTE.gold;
    ctx.fillRect(-13, -3, 26, 6);
    ctx.restore();
  }

  function paintMissionMarker(game) {
    const mission = game.mission;
    if (!mission || !mission.target) return;
    const t = mission.target;
    const marker = mission.side ? PALETTE.orange : PALETTE.gold;
    const pulse = 1 + Math.sin(game.time * 5) * 0.12;
    ctx.save();
    ctx.translate(t.x, t.y);
    ctx.fillStyle = mission.side ? 'rgba(232, 163, 76, 0.16)' : 'rgba(242, 201, 76, 0.16)';
    ctx.fillRect(-14, -260, 28, 260);
    ctx.strokeStyle = marker;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 34 * pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = marker;
    ctx.beginPath();
    ctx.moveTo(0, -16);
    ctx.lineTo(12, 0);
    ctx.lineTo(0, 16);
    ctx.lineTo(-12, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /** The arrow that points at the mission target when it is off-screen — drawn
   * in screen space, after the world transform is undone. */
  function paintOffscreenArrow(game) {
    const mission = game.mission;
    if (!mission || !mission.target) return;
    const t = mission.target;
    const cam = game.camera;
    const sx = t.x - cam.x + view.w / 2;
    const sy = t.y - cam.y + view.h / 2;
    if (sx >= 0 && sx <= view.w && sy >= 0 && sy <= view.h) return;
    const cx = view.w / 2;
    const cy = view.h / 2;
    const angle = Math.atan2(sy - cy, sx - cx);
    const ax = cx + Math.cos(angle) * (view.w / 2 - 50);
    const ay = cy + Math.sin(angle) * (view.h / 2 - 50);
    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(angle);
    ctx.fillStyle = mission.side ? PALETTE.orange : PALETTE.gold;
    ctx.beginPath();
    ctx.moveTo(16, 0);
    ctx.lineTo(-10, -11);
    ctx.lineTo(-10, 11);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function paintParticles(game) {
    for (const p of game.particles) {
      const a = Math.max(0, p.life / p.maxLife);
      ctx.globalAlpha = p.kind === 'smoke' ? a * 0.5 : a;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      const radius = p.kind === 'smoke' ? p.size * (1.6 - a * 0.6) : p.size * a + 1;
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  /** Everything that moves, sorted by height so near things overlap far ones. */
  function collectDrawables(game) {
    const list = [];
    for (const car of game.cars) list.push({ y: car.y, kind: 'car', ref: car });
    for (const ped of game.peds) if (ped.alive) list.push({ y: ped.y, kind: 'ped', ref: ped });
    for (const debtor of game.debtors) if (debtor.alive) list.push({ y: debtor.y, kind: 'debtor', ref: debtor });
    if (!game.player.inCar) list.push({ y: game.player.y, kind: 'player', ref: game.player });
    list.sort((a, b) => a.y - b.y);
    return list;
  }

  function paintEntities(game) {
    for (const d of collectDrawables(game)) {
      if (d.kind === 'car') paintCar(d.ref, d.ref.kind === 'player');
      else if (d.kind === 'ped') paintPerson(d.ref.x, d.ref.y, d.ref.angle, d.ref.color);
      else if (d.kind === 'debtor') paintPerson(d.ref.x, d.ref.y, d.ref.angle, '#b0523f', '!');
      else if (d.kind === 'player') {
        const p = d.ref;
        paintPerson(p.x, p.y, p.angle, PALETTE.player);
        // A white ring so Leo is easy to spot in a crowd.
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 15, 0, Math.PI * 2);
        ctx.stroke();
        // The bust ring: red, filling while a patrol car arrests Leo.
        if (game.bustProgress > 0) {
          ctx.strokeStyle = PALETTE.red;
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 22, -Math.PI / 2, -Math.PI / 2 + game.bustProgress * Math.PI * 2);
          ctx.stroke();
          text('BUSTED?', p.x, p.y - 30, 13, PALETTE.red, 'center');
        }
        // Aim line: where the pistol points.
        if (!p.inCar) {
          const aim = game.aimWorldAngle !== undefined ? game.aimWorldAngle : p.angle;
          ctx.strokeStyle = 'rgba(255,255,255,0.5)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(p.x + Math.cos(aim) * 16, p.y + Math.sin(aim) * 16);
          ctx.lineTo(p.x + Math.cos(aim) * 34, p.y + Math.sin(aim) * 34);
          ctx.stroke();
        }
      }
    }
    // Bullets on top.
    ctx.fillStyle = '#fff2b0';
    for (const b of game.bullets) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ---- the HUD ------------------------------------------------------------

  /** Cash, health, ammo — top left. */
  function paintHudStatus(game) {
    const p = game.player;
    ctx.fillStyle = PALETTE.hudPanel;
    roundRect(14, 12, 282, 84, 10);
    ctx.fill();
    text(`$${Math.round(p.cash).toLocaleString('en-US')}`, 28, 44, 30, PALETTE.hudText);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    roundRect(28, 58, 170, 12, 6);
    ctx.fill();
    ctx.fillStyle = p.health > 30 ? PALETTE.green : PALETTE.red;
    roundRect(28, 58, 170 * Math.max(0, p.health / 100), 12, 6);
    ctx.fill();
    text(`HEALTH ${Math.round(p.health)}`, 206, 70, 13, PALETTE.hudMuted);
    text(`AMMO ${p.ammo}`, 28, 88, 14, PALETTE.hudMuted);
  }

  /** Wanted stars, top right, with the radio track underneath. */
  function paintHudWanted(game) {
    const level = wantedLevel(game.wanted.points);
    ctx.fillStyle = PALETTE.hudPanel;
    roundRect(view.w - 224, 12, 210, 52, 10);
    ctx.fill();
    if (level > 0) text('WANTED', view.w - 210, 34, 14, PALETTE.red);
    else text('CLEAN', view.w - 210, 34, 14, PALETTE.hudMuted);
    for (let i = 0; i < 5; i += 1) drawStar(view.w - 196 + i * 26, 44, 10, i < level);
    // The radio: what is playing right now — the live track when audio is
    // unlocked, otherwise the track the game has selected for this moment.
    const track = (game.audio && game.audio.nowPlaying())
      || (game.musicMode && MUSIC[game.musicMode] ? MUSIC[game.musicMode].name : null);
    if (track) {
      ctx.fillStyle = PALETTE.hudPanel;
      roundRect(view.w - 224, 70, 210, 30, 8);
      ctx.fill();
      text(`♪ ${track.toUpperCase()}`, view.w - 210, 90, 13, PALETTE.gold);
    }
  }

  /** Mission objective, top centre. */
  function paintHudObjective(game) {
    const objective = missionObjective(game);
    if (!objective) return;
    const label = `${game.mission.name.toUpperCase()} — ${objective.text} · ${objective.distance}m`;
    ctx.font = `600 16px ${FONT}`;
    const w = ctx.measureText(label).width + 36;
    ctx.fillStyle = PALETTE.hudPanel;
    roundRect((view.w - w) / 2, 12, w, 40, 10);
    ctx.fill();
    text(label, view.w / 2, 38, 16, objective.side ? PALETTE.orange : PALETTE.gold, 'center');
  }

  function drawHud(game) {
    const p = game.player;
    paintHudStatus(game);
    paintHudWanted(game);
    paintHudObjective(game);

    // Minimap, bottom left.
    drawMinimap(ctx, game, 20, view.h - 168, 200, 140);

    // Speed, bottom right, when driving.
    if (p.inCar && p.car) {
      const kmh = Math.round(Math.abs(p.car.speed) * 0.32);
      ctx.fillStyle = PALETTE.hudPanel;
      roundRect(view.w - 174, view.h - 96, 160, 82, 10);
      ctx.fill();
      text(`${kmh}`, view.w - 94, view.h - 34, 34, PALETTE.hudText, 'center');
      text('km/h', view.w - 94, view.h - 18, 13, PALETTE.hudMuted, 'center');
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      roundRect(view.w - 158, view.h - 82, 128, 8, 4);
      ctx.fill();
      ctx.fillStyle = p.car.health > 30 ? PALETTE.green : PALETTE.red;
      roundRect(view.w - 158, view.h - 82, 128 * Math.max(0, p.car.health / 100), 8, 4);
      ctx.fill();
    }

    // Context hint, bottom centre.
    let hint = 'WASD move · Shift run · E steal car · Click shoot · F punch · H horn · M phone · Esc pause · N mute';
    if (p.inCar) hint = 'WASD drive · Space handbrake · H horn · E step out · M phone · Esc pause';
    text(hint, view.w / 2, view.h - 14, 13, 'rgba(244,241,232,0.75)', 'center');

    // Toast.
    if (game.toastTimer > 0 && game.toastText) {
      const a = Math.min(1, game.toastTimer);
      ctx.globalAlpha = a;
      ctx.font = `600 18px ${FONT}`;
      const w = ctx.measureText(game.toastText).width + 36;
      ctx.fillStyle = PALETTE.hudPanel;
      roundRect((view.w - w) / 2, 64, w, 38, 10);
      ctx.fill();
      text(game.toastText, view.w / 2, 90, 18, PALETTE.hudText, 'center');
      ctx.globalAlpha = 1;
    }
  }

  // ---- screens ------------------------------------------------------------

  function drawPanel(title, lines, prompt, accent) {
    const width = 640;
    const lineH = 30;
    const height = 150 + lines.length * lineH;
    const x = (view.w - width) / 2;
    const y = (view.h - height) / 2;
    ctx.fillStyle = 'rgba(8, 10, 16, 0.82)';
    roundRect(x, y, width, height, 16);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = 1;
    roundRect(x, y, width, height, 16);
    ctx.stroke();
    text(title, view.w / 2, y + 62, 44, accent || PALETTE.hudText, 'center');
    for (let i = 0; i < lines.length; i += 1) {
      text(lines[i], view.w / 2, y + 108 + i * lineH, 19, PALETTE.hudMuted, 'center');
    }
    if (prompt) text(prompt, view.w / 2, y + height - 30, 20, PALETTE.gold, 'center');
  }

  /** One job row on the title screen: name, reward, status, and the brief. */
  function paintJobRow(game, def, x, y) {
    const done = game.missionsDone.includes(def.id);
    const open = isUnlocked(game, def.id);
    const runs = game.sideCompletions[def.id] || 0;
    let mark = '🔒 LOCKED';
    if (done) mark = '✓ DONE';
    else if (open) mark = def.side && runs > 0 ? `○ OPEN · ${runs}× DONE` : '○ OPEN';
    const color = done ? PALETTE.green : open ? PALETTE.hudText : PALETTE.hudMuted;
    text(`${def.id}. ${def.name} — $${def.reward}  ${mark}`, x, y, 17, color, 'left');
    text(def.brief, x, y + 22, 13, PALETTE.hudMuted, 'left');
  }

  function drawTitle(game) {
    // A sun-soaked gradient sky over the city backdrop.
    const g = ctx.createLinearGradient(0, 0, 0, view.h * 0.55);
    g.addColorStop(0, 'rgba(255, 176, 92, 0.55)');
    g.addColorStop(1, 'rgba(255, 176, 92, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, view.w, view.h * 0.55);
    ctx.fillStyle = 'rgba(8, 10, 16, 0.45)';
    ctx.fillRect(0, 0, view.w, view.h);
    text('SOLMAR CITY', view.w / 2, 118, 72, '#ffd98a', 'center');
    text('An open-world crime story — sun, sea and bad decisions', view.w / 2, 152, 20, PALETTE.hudText, 'center');
    text('Leo Marlow drives for Ms. Vega. Seven jobs. One city. No brakes.', view.w / 2, 180, 16, PALETTE.hudMuted, 'center');

    const story = MISSION_DEFS.filter((d) => !d.side);
    const side = MISSION_DEFS.filter((d) => d.side);
    const panelW = 960;
    const panelH = 44 + story.length * 52 + 86;
    const px = (view.w - panelW) / 2;
    const py = 210;
    ctx.fillStyle = 'rgba(8, 10, 16, 0.78)';
    roundRect(px, py, panelW, panelH, 14);
    ctx.fill();
    // Two columns: story jobs on the left, side jobs on the right.
    text('TONIGHT\u2019S JOBS', px + 26, py + 34, 18, PALETTE.gold, 'left');
    text('SIDE JOBS — REPEATABLE', px + 490, py + 34, 18, PALETTE.orange, 'left');
    for (let i = 0; i < story.length; i += 1) {
      paintJobRow(game, story[i], px + 26, py + 62 + i * 52);
    }
    for (let i = 0; i < side.length; i += 1) {
      paintJobRow(game, side[i], px + 490, py + 62 + i * 52);
    }
    text('WASD move · Shift run · E steal a car · Mouse aim, click to shoot · F punch · H horn', view.w / 2, py + panelH - 52, 16, PALETTE.hudMuted, 'center');
    text('M phone (missions) · Esc pause · N mute', view.w / 2, py + panelH - 28, 16, PALETTE.hudMuted, 'center');

    const saved = game.bestCash > 0 || game.missionsDone.length > 0;
    const prompt = saved
      ? `Saved: $${Math.round(game.player.cash)} in pocket · ${game.missionsDone.length}/5 story jobs done · best $${Math.round(game.bestCash)} — Press ENTER to play`
      : 'Press ENTER to play';
    text(prompt, view.w / 2, py + panelH + 44, 20, PALETTE.gold, 'center');
  }

  function drawPhone(game) {
    ctx.fillStyle = 'rgba(8, 10, 16, 0.6)';
    ctx.fillRect(0, 0, view.w, view.h);
    const width = 660;
    const height = 120 + MISSION_DEFS.length * 62;
    const x = (view.w - width) / 2;
    const y = (view.h - height) / 2;
    ctx.fillStyle = 'rgba(12, 16, 24, 0.94)';
    roundRect(x, y, width, height, 16);
    ctx.fill();
    text('📱  MS. VEGA — JOBS', view.w / 2, y + 48, 24, PALETTE.gold, 'center');
    for (let i = 0; i < MISSION_DEFS.length; i += 1) {
      const def = MISSION_DEFS[i];
      const done = game.missionsDone.includes(def.id);
      const open = isUnlocked(game, def.id);
      const active = game.mission && game.mission.id === def.id;
      const rowY = y + 84 + i * 62;
      if (active) {
        ctx.fillStyle = 'rgba(242, 201, 76, 0.16)';
        roundRect(x + 14, rowY - 8, width - 28, 52, 8);
        ctx.fill();
      }
      const status = done ? '✓ DONE' : active ? '▶ ACTIVE' : open ? '○ OPEN' : '🔒 LOCKED';
      const tag = def.side ? ' ◆ SIDE' : '';
      const color = done ? PALETTE.green : def.side ? PALETTE.orange : open ? PALETTE.hudText : PALETTE.hudMuted;
      text(`${def.id}. ${def.name}${tag} — $${def.reward}`, x + 30, rowY + 10, 18, color, 'left');
      text(status, x + width - 30, rowY + 10, 16, color, 'right');
      text(def.brief, x + 30, rowY + 32, 14, PALETTE.hudMuted, 'left');
    }
    text('Press 1–7 to start a job · M or Esc to close', view.w / 2, y + height - 22, 16, PALETTE.hudMuted, 'center');
  }

  /** Paint one frame for the screen the game is on. */
  function draw(game) {
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.fillStyle = '#0b0e14';
    ctx.fillRect(0, 0, view.w, view.h);
    const shakeX = game.camera.shake > 0 ? (Math.random() - 0.5) * game.camera.shake : 0;
    const shakeY = game.camera.shake > 0 ? (Math.random() - 0.5) * game.camera.shake : 0;
    const zoom = game.camera.zoom || 1;
    ctx.save();
    ctx.translate(view.w / 2 - game.camera.x + shakeX, view.h / 2 - game.camera.y + shakeY);
    ctx.scale(zoom, zoom);
    paintGround(game);
    paintRoads(game);
    paintCity(game);
    for (const pickup of game.pickups) {
      if (inView(game, pickup.x, pickup.y, 30)) paintPickup(pickup);
    }
    if (game.mission && game.mission.side) {
      for (const crate of game.mission.crates) {
        if (inView(game, crate.x, crate.y, 40)) paintCrate(crate);
      }
    }
    paintMissionMarker(game);
    paintEntities(game);
    paintParticles(game);
    ctx.restore();
    paintOffscreenArrow(game);

    if (game.screen === SCREEN_TITLE) {
      drawTitle(game);
    } else {
      drawHud(game);
      if (game.screen === SCREEN_PAUSED) {
        drawPanel('PAUSED', ['The city waits for no one — except right now.', 'Your progress is saved.'], 'Press Esc or P to resume');
      } else if (game.screen === SCREEN_BUSTED) {
        drawPanel('BUSTED!', ['The Solmar PD caught up with you.', `You lost $${game.lostCash} in fines.`], 'Press R to get back out there', PALETTE.policeBlue);
      } else if (game.screen === SCREEN_WASTED) {
        drawPanel('WASTED', ['Leo went down. The city keeps moving.', `You lost $${game.lostCash}.`], 'Press R to get back up', PALETTE.red);
      }
      if (game.phoneOpen) drawPhone(game);
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, view };
}
