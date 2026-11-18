// Solmar City v2 — the live minimap in the HUD's corner: the whole city shrunk
// down — roads, the sea, the park, the player, police, traffic and the mission
// marker. New in v2: side jobs get an orange marker instead of gold, the
// crates of a side job show as orange dots, and the bonfire and warehouse
// show as small flame and box icons so the delivery points are findable
// without opening the phone.

import { H_ROADS, PALETTE, V_ROADS, WORLD } from './config.js';
import { LANDMARKS } from './world.js';

/** Draw the minimap into the rectangle (x, y, w, h) of the screen. */
export function drawMinimap(ctx, game, x, y, w, h) {
  const sx = w / WORLD.width;
  const sy = h / WORLD.height;
  const px = (wx) => x + wx * sx;
  const py = (wy) => y + wy * sy;

  ctx.save();
  ctx.fillStyle = 'rgba(10, 14, 20, 0.78)';
  ctx.fillRect(x - 4, y - 4, w + 8, h + 8);
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();

  // Land and sea.
  ctx.fillStyle = '#5d8a48';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = PALETTE.water;
  ctx.fillRect(x, py(game.city.waterY), w, h - py(game.city.waterY) + y);
  ctx.fillStyle = PALETTE.sand;
  ctx.fillRect(x, py(game.city.beachY), w, py(game.city.waterY) - py(game.city.beachY));

  // Park.
  ctx.fillStyle = '#4d7a3a';
  ctx.fillRect(px(game.city.park.x0), py(game.city.park.y0), (game.city.park.x1 - game.city.park.x0) * sx, (game.city.park.y1 - game.city.park.y0) * sy);

  // Roads.
  ctx.strokeStyle = '#3d3f4a';
  ctx.lineWidth = Math.max(2, 112 * sx);
  ctx.beginPath();
  for (const rx of V_ROADS) {
    ctx.moveTo(px(rx), py(0));
    ctx.lineTo(px(rx), py(WORLD.height));
  }
  for (const ry of H_ROADS) {
    ctx.moveTo(px(0), py(ry));
    ctx.lineTo(px(WORLD.width), py(ry));
  }
  ctx.stroke();

  // Buildings.
  ctx.fillStyle = 'rgba(30, 30, 38, 0.85)';
  for (const b of game.city.buildings) {
    ctx.fillRect(px(b.x), py(b.y), Math.max(2, b.w * sx), Math.max(2, b.h * sy));
  }

  // The bonfire pit and the warehouse door: delivery points for the side jobs.
  ctx.fillStyle = PALETTE.bonfire;
  ctx.beginPath();
  ctx.arc(px(LANDMARKS.bonfire.x), py(LANDMARKS.bonfire.y), 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PALETTE.warehouse;
  ctx.fillRect(px(LANDMARKS.warehouseDoor.x) - 2, py(LANDMARKS.warehouseDoor.y) - 2, 4, 4);

  // Traffic cars.
  ctx.fillStyle = '#d8d8d8';
  for (const car of game.cars) {
    if (car.kind === 'traffic') ctx.fillRect(px(car.x) - 1, py(car.y) - 1, 2, 2);
  }

  // Police: flashing blue dots.
  const flash = Math.floor(game.time * 4) % 2 === 0;
  ctx.fillStyle = flash ? '#3f8cff' : '#ff4d4d';
  for (const car of game.police) {
    ctx.beginPath();
    ctx.arc(px(car.x), py(car.y), 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // Side-job crates: orange dots while a side job is running.
  if (game.mission && game.mission.side) {
    ctx.fillStyle = PALETTE.orange;
    for (const crate of game.mission.crates) {
      if (crate.taken) continue;
      ctx.fillRect(px(crate.x) - 1.5, py(crate.y) - 1.5, 3, 3);
    }
  }

  // Mission marker: a pulsing ring — gold for story jobs, orange for side jobs.
  if (game.mission && game.mission.target) {
    const marker = game.mission.side ? PALETTE.orange : PALETTE.gold;
    const pulse = 3 + Math.sin(game.time * 5) * 1.5;
    ctx.strokeStyle = marker;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(px(game.mission.target.x), py(game.mission.target.y), pulse + 3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = marker;
    ctx.beginPath();
    ctx.arc(px(game.mission.target.x), py(game.mission.target.y), 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // The player: a white dot with a direction tick.
  const p = game.player;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(px(p.x), py(p.y), 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(px(p.x), py(p.y));
  ctx.lineTo(px(p.x) + Math.cos(p.angle) * 8, py(p.y) + Math.sin(p.angle) * 8);
  ctx.stroke();

  // The camera's view, as a faint rectangle.
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.lineWidth = 1;
  ctx.strokeRect(
    px(game.camera.x - game.view.w / 2), py(game.camera.y - game.view.h / 2),
    game.view.w * sx, game.view.h * sy,
  );

  ctx.restore();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x - 4, y - 4, w + 8, h + 8);
}
