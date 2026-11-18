// Solmar City v2 — the screenshot scenes behind ?shot=cover|street|mission|menu
// (with &seed=N). Each one poses the real game — the same player, cars, police
// and missions a player meets — at a fixed place with fixed numbers, so the
// same seed always gives the same frame. No scene is drawn specially; the
// renderer paints the posed world exactly as it paints live play. New in v2:
// the mission shot now shows the Beach Bonfire side job (crates on the sand,
// the bonfire, a timer), and the cover shot poses the radio on the chase
// track so the music chip shows.

import { SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { startMission } from './missions.js';
import { LANDMARKS } from './world.js';
import { enterCar } from './player.js';

/** Move the `index`-th traffic car onto a road near (x, y) so the frame is busy. */
function placeTrafficCar(game, index, x, y, angle, speed) {
  const traffic = game.cars.filter((c) => c.kind === 'traffic');
  const car = traffic[index];
  if (!car) return;
  car.x = x;
  car.y = y;
  car.angle = angle;
  car.speed = speed;
  car.targetSpeed = speed;
}

/** Put the `index`-th pedestrian on the sidewalk near (x, y). */
function placePedestrian(game, index, x, y, angle) {
  const peds = game.peds.filter((p) => p.alive);
  const ped = peds[index];
  if (!ped) return;
  ped.x = x;
  ped.y = y;
  ped.angle = angle;
  ped.flee = 0;
}

/** Put the player in the nearest parked car, parked at (x, y) facing `angle`. */
function putPlayerInCar(game, x, y, angle) {
  const car = game.cars.find((c) => c.kind === 'parked');
  if (!car) return null;
  car.x = x;
  car.y = y;
  car.angle = angle;
  car.speed = 0;
  game.player.x = x;
  game.player.y = y;
  enterCar(game, car);
  return car;
}

function stageCover(game) {
  game.screen = SCREEN_PLAY;
  startMission(game, 1);
  const car = putPlayerInCar(game, 1150, 750, 0);
  if (car) car.speed = 320;
  // The job is already rolling: the car is stolen, the garage is the target.
  if (game.mission) {
    game.mission.stage = 1;
    game.mission.target = { x: LANDMARKS.garage.x, y: LANDMARKS.garage.y, label: 'Deliver the car to Rosa\u2019s Garage' };
  }
  game.wanted.points = 48; // 3 stars
  game.wanted.level = 3;
  game.musicMode = 'chase'; // the radio switches to the chase track at 3 stars
  // Two patrol cars in pursuit, one pulling alongside.
  const spots = [
    { x: 980, y: 776, angle: 0, speed: 430 },
    { x: 880, y: 724, angle: 0, speed: 450 },
    { x: 1330, y: 724, angle: Math.PI, speed: 380 },
  ];
  for (const spot of spots) {
    const cop = {
      x: spot.x, y: spot.y, angle: spot.angle, speed: spot.speed,
      targetSpeed: 540, color: '#f2f4f6', kind: 'police', axis: 'h', dir: 1,
      road: 750, health: 120, owned: false, siren: 0,
    };
    game.cars.push(cop);
    game.police.push(cop);
  }
  // Traffic ahead and a crowd on the sidewalk.
  placeTrafficCar(game, 0, 1560, 724, 0, 220);
  placeTrafficCar(game, 1, 1750, 776, Math.PI, 200);
  placeTrafficCar(game, 2, 1150, 350, Math.PI / 2, 180);
  placePedestrian(game, 0, 1080, 678, 0);
  placePedestrian(game, 1, 1240, 822, Math.PI);
  placePedestrian(game, 2, 1420, 678, Math.PI / 2);
  game.camera.x = game.player.x + 80;
  game.camera.y = game.player.y;
  game.toastText = '3 stars — lose the cops!';
  game.toastTimer = 3;
}

function stageStreet(game) {
  game.screen = SCREEN_PLAY;
  game.player.x = 1550;
  game.player.y = 1150;
  game.player.angle = -Math.PI / 2;
  game.camera.x = 1550;
  game.camera.y = 1150;
  placeTrafficCar(game, 0, 1350, 1124, 0, 210);
  placeTrafficCar(game, 1, 1750, 1176, Math.PI, 190);
  placeTrafficCar(game, 2, 1524, 950, Math.PI / 2, 170);
  placeTrafficCar(game, 3, 1576, 1420, -Math.PI / 2, 200);
  placePedestrian(game, 0, 1478, 1078, 0);
  placePedestrian(game, 1, 1622, 1222, Math.PI);
  placePedestrian(game, 2, 1480, 1222, Math.PI / 2);
  placePedestrian(game, 3, 1620, 1078, -Math.PI / 2);
  placePedestrian(game, 4, 1550, 1000, 0);
  game.player.cash = 1250;
  game.toastText = 'Downtown Solmar — steal a car with E';
  game.toastTimer = 3;
}

/** The mission shot is now the Beach Bonfire side job: crates on the sand,
 * the bonfire lit, the timer running — the new content, front and centre. */
function stageMission(game) {
  game.screen = SCREEN_PLAY;
  game.missionsDone = [1]; // the side job unlocks after mission 1
  startMission(game, 6);
  const car = putPlayerInCar(game, 700, 2450, 0);
  if (car) car.speed = 180;
  if (game.mission) {
    game.mission.timer = 64;
    // One crate already collected, so the frame shows progress.
    game.mission.crates[0].taken = true;
    game.mission.cratesLeft = 4;
    game.mission.target = { x: 1400, y: 2460, label: 'Grab the crates (1/5)' };
  }
  game.wanted.points = 0;
  game.wanted.level = 0;
  game.musicMode = 'drive';
  placePedestrian(game, 0, 620, 2330, 0);
  placePedestrian(game, 1, 980, 2330, Math.PI);
  game.camera.x = game.player.x + 120;
  game.camera.y = game.player.y - 40;
  game.toastText = 'Beach Bonfire — 64 seconds, five crates';
  game.toastTimer = 3;
}

function stageMenu(game) {
  game.screen = SCREEN_TITLE;
  game.camera.x = 1550;
  game.camera.y = 1150;
  game.missionsDone = [1];
  game.player.cash = 650;
  game.bestCash = 650;
  game.sideCompletions = { 6: 2, 7: 1 }; // the title shows the side jobs' runs
}

/**
 * Pose `game` for the named shot (cover, street, mission or menu; anything else
 * is the menu) and return the screen to draw.
 */
export function stageShot(name, game) {
  if (name === 'cover') stageCover(game);
  else if (name === 'street') stageStreet(game);
  else if (name === 'mission') stageMission(game);
  else stageMenu(game);
  return game.screen;
}
