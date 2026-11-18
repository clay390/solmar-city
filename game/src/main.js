// Solmar City v2 — boot and the one loop: input is read every frame, the world
// advances in fixed 1/60 s steps, and the renderer paints what is there. The
// game moves between five screens: title, play, paused, busted and wasted,
// with a phone overlay for the mission list. ?seed=N fixes the city;
// ?shot=cover|street|mission|menu (with &seed=N) stages that scene instead of
// running the loop, paints it twice and sets window.__shotReady for a
// screenshot. New in v2: the radio follows the game (cruise on the title
// screen, drive while working or driving, chase at three stars and up), H
// sounds the horn — and honking at a nearby patrol car is a crime — and the
// phone takes seven job keys instead of five.

import { STEP } from './config.js';
import { createRandom } from './random.js';
import { createCity, LANDMARKS } from './world.js';
import { createPlayer, updatePlayer, nearestStealableCar, enterCar, exitCar, aimAngle } from './player.js';
import { createTraffic, updateTraffic } from './traffic.js';
import { updatePolice, wantedLevel, addWanted } from './police.js';
import { startMission, updateMission } from './missions.js';
import { shoot, punch, updateBullets } from './combat.js';
import { createAudio } from './audio.js';
import { loadSave, saveGame } from './save.js';
import {
  ACTION_CONFIRM, ACTION_ENTER_CAR, ACTION_HONK, ACTION_MUTE,
  ACTION_PAUSE, ACTION_PHONE, ACTION_PUNCH, ACTION_RESTART, MISSION_ACTIONS,
  createInput,
} from './input.js';
import { createRenderer, SCREEN_BUSTED, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WASTED } from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

/** The radio track for the moment: cruise on the title, chase in the heat. */
function pickMusicMode(game) {
  if (game.screen === SCREEN_TITLE) return 'cruise';
  if (game.screen !== SCREEN_PLAY) return 'off';
  if (game.wanted.level >= 3) return 'chase';
  if (game.mission || (game.player.inCar && game.player.car)) return 'drive';
  return 'cruise';
}

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const renderer = createRenderer(canvas);

function createGame() {
  const rng = createRandom(seed);
  const city = createCity(rng);
  const game = {
    seed,
    rng,
    city,
    player: createPlayer(LANDMARKS.plaza.x, LANDMARKS.plaza.y),
    cars: [],
    peds: [],
    police: [],
    bullets: [],
    pickups: [],
    particles: [],
    debtors: [],
    wanted: { points: 0, level: 0, loseTimer: 0 },
    mission: null,
    missionsDone: [],
    sideCompletions: {},
    storyComplete: false,
    camera: { x: LANDMARKS.plaza.x, y: LANDMARKS.plaza.y, shake: 0, zoom: 1 },
    screen: SCREEN_TITLE,
    phoneOpen: false,
    toastText: '',
    toastTimer: 0,
    time: 0,
    now: 0,
    lostCash: 0,
    bestCash: 0,
    penaltyApplied: false,
    bustProgress: 0,
    heatBoost: 1,
    musicMode: 'cruise',
    nearMissAt: -99,
    view: renderer.view,
    aimWorldAngle: -Math.PI / 2,
  };
  game.toast = (text, seconds) => {
    game.toastText = text;
    game.toastTimer = seconds;
  };
  game.input = createInput(canvas);
  game.audio = createAudio();
  createTraffic(game);
  const save = loadSave();
  if (save) {
    game.player.cash = save.cash > 0 ? save.cash : game.player.cash;
    game.missionsDone = save.missionsDone;
    game.sideCompletions = save.sideCompletions || {};
    game.bestCash = save.bestCash;
  }
  return game;
}

function updateParticles(game, dt) {
  for (const p of game.particles) {
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 1 - 2.2 * dt;
    p.vy *= 1 - 2.2 * dt;
  }
  game.particles = game.particles.filter((p) => p.life > 0);
}

function applyPenalty(game) {
  const player = game.player;
  game.lostCash = Math.min(Math.round(player.cash), Math.max(200, Math.round(player.cash * 0.2)));
  player.cash -= game.lostCash;
  game.penaltyApplied = true;
  game.mission = null;
  game.heatBoost = 1;
  game.bustProgress = 0;
  saveGame(game);
}

function respawn(game) {
  const player = game.player;
  if (player.inCar) exitCar(game);
  player.x = LANDMARKS.hospital.x;
  player.y = LANDMARKS.hospital.y;
  player.health = 100;
  player.ammo = Math.max(player.ammo, 6);
  game.wanted.points = 0;
  game.wanted.level = 0;
  game.wanted.loseTimer = 0;
  game.bustProgress = 0;
  game.heatBoost = 1;
  for (const car of game.police) car.gone = true;
  game.police = [];
  game.cars = game.cars.filter((c) => !c.gone);
  game.camera.x = player.x;
  game.camera.y = player.y;
  game.penaltyApplied = false;
  game.screen = SCREEN_PLAY;
  game.toast('Back on the street. Stay sharp, Leo.', 3);
  saveGame(game);
}

/** H: sound the horn. Near a patrol car it is also a crime. */
function honk(game) {
  game.audio.honk();
  const nearCop = game.police.some((car) => !car.gone
    && Math.hypot(car.x - game.player.x, car.y - game.player.y) < 500);
  if (nearCop) addWanted(game, 2, 'honking at the cops');
}

/** The title screen: traffic rolls behind it, the camera drifts over the
 * plaza, the radio plays the cruise track. Enter starts the game. */
function handleTitleScreen(game, dt, actions) {
  updateTraffic(game, dt);
  updateParticles(game, dt);
  game.camera.x = LANDMARKS.plaza.x + Math.sin(game.time * 0.06) * 320;
  game.camera.y = LANDMARKS.plaza.y + Math.cos(game.time * 0.045) * 220;
  game.musicMode = pickMusicMode(game);
  game.audio.update(0, 0, dt, game.musicMode);
  if (actions & ACTION_CONFIRM) {
    game.audio.unlock();
    game.audio.ui();
    game.screen = SCREEN_PLAY;
    game.toast('Welcome to Solmar. Press M for Ms. Vega\u2019s jobs.', 4);
    announce('Playing. Press M for the mission phone.');
  }
}

/** The pause screen: Esc, P or Enter resumes. */
function handlePausedScreen(game, actions) {
  if (actions & (ACTION_PAUSE | ACTION_CONFIRM)) {
    game.screen = SCREEN_PLAY;
    announce('Playing.');
  }
}

/** Busted or wasted: take the fine once, then R gets Leo back out. */
function handleEndScreen(game, actions) {
  if (!game.penaltyApplied) applyPenalty(game);
  if (actions & ACTION_RESTART) {
    game.audio.ui();
    respawn(game);
    announce('Playing.');
  }
}

/** The phone overlay: M or Esc closes it; a job key starts that job. */
function handlePhone(game, dt, actions) {
  if (actions & (ACTION_PHONE | ACTION_PAUSE)) {
    game.phoneOpen = false;
  } else {
    for (let i = 0; i < MISSION_ACTIONS.length; i += 1) {
      if (actions & MISSION_ACTIONS[i]) {
        if (startMission(game, i + 1)) game.phoneOpen = false;
        else game.toast('Finish the job before it to unlock the next.', 2);
        break;
      }
    }
  }
  updateParticles(game, dt);
}

function stepGame(game, dt) {
  game.time += dt;
  game.now += dt;
  if (game.toastTimer > 0) game.toastTimer -= dt;
  const input = game.input;
  const actions = input.takeActions();
  const player = game.player;

  if (actions & ACTION_MUTE) {
    const muted = game.audio.toggleMute();
    game.toast(muted ? 'Sound off' : 'Sound on', 1.5);
  }

  // The screens that are not play: each handles its own keys and returns.
  if (game.screen === SCREEN_TITLE) {
    handleTitleScreen(game, dt, actions);
    return;
  }
  if (game.screen === SCREEN_PAUSED) {
    handlePausedScreen(game, actions);
    return;
  }
  if (game.screen === SCREEN_BUSTED || game.screen === SCREEN_WASTED) {
    handleEndScreen(game, actions);
    return;
  }

  // SCREEN_PLAY from here.
  if (game.phoneOpen) {
    handlePhone(game, dt, actions);
    return;
  }

  if (actions & ACTION_PAUSE) {
    game.screen = SCREEN_PAUSED;
    saveGame(game);
    announce('Paused.');
    return;
  }
  if (actions & ACTION_PHONE) {
    game.phoneOpen = true;
    game.audio.ui();
    return;
  }
  if (actions & ACTION_ENTER_CAR) {
    if (player.inCar) exitCar(game);
    else {
      const car = nearestStealableCar(game);
      if (car) enterCar(game, car);
      else game.toast('No car close enough to steal.', 1.5);
    }
  }
  if (actions & ACTION_PUNCH) punch(game);
  if (actions & ACTION_HONK) honk(game);

  game.aimWorldAngle = aimAngle(game);
  updatePlayer(game, dt, input);
  updateTraffic(game, dt);
  updatePolice(game, dt);
  updateMission(game, dt);
  updateBullets(game, dt);
  updateParticles(game, dt);
  // Shoot while the mouse is held, and also on a quick click: a click that
  // lands between two frames is queued by takeClick, so it is never missed.
  const clicked = input.takeClick();
  if (input.mouse.down || clicked) shoot(game);

  const drivingSpeed = player.inCar && player.car ? Math.abs(player.car.speed) : 0;
  game.musicMode = pickMusicMode(game);
  game.audio.update(drivingSpeed, wantedLevel(game.wanted.points), dt, game.musicMode);

  if (player.health <= 0 && game.screen === SCREEN_PLAY) {
    game.screen = SCREEN_WASTED;
    game.audio.busted();
    announce('Wasted. Press R to continue.');
  }
}

function announce(message) {
  status.textContent = message;
}

function runShot(game, name) {
  stageShot(name, game);
  let painted = 0;
  function paint() {
    renderer.draw(game);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame(game) {
  let accumulator = 0;
  let last = performance.now();

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    while (accumulator >= STEP) {
      stepGame(game, STEP);
      accumulator -= STEP;
    }
    renderer.draw(game);
  }

  // Leaving the tab pauses a running game rather than letting the cops close in unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && game.screen === SCREEN_PLAY) {
      game.screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Solmar City. Press Enter to play.');
  requestAnimationFrame(frame);
}

const game = createGame();

// A tiny live handle for play-testing: the player, the heat, the job, the money.
window.__solmar = {
  get x() { return Math.round(game.player.x); },
  get y() { return Math.round(game.player.y); },
  get inCar() { return game.player.inCar; },
  get wanted() { return wantedLevel(game.wanted.points); },
  get mission() { return game.mission ? game.mission.id : 0; },
  get cash() { return Math.round(game.player.cash); },
  get health() { return Math.round(game.player.health); },
  get ammo() { return game.player.ammo; },
  get screen() { return game.screen; },
  get police() { return game.police.length; },
  get speed() { return game.player.inCar && game.player.car ? Math.round(Math.abs(game.player.car.speed)) : 0; },
  get music() { return game.musicMode; },
  get sideJobs() { return (game.sideCompletions[6] || 0) + (game.sideCompletions[7] || 0); },
  get bust() { return Math.round(game.bustProgress * 100) / 100; },
};
window.__game = game;

if (shot) runShot(game, shot);
else runGame(game);
