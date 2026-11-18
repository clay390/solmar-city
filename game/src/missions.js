// Solmar City v2 — the jobs: five story jobs for Ms. Vega, the fixer who runs
// Solmar from her tower, plus two side jobs that pay cash and can be run again
// and again. Each job has stages, a marker on the map and a cash reward;
// finishing a story job unlocks the next, and the save remembers which are
// done. New in v2: the side jobs — Beach Bonfire (gather five crates washed up
// on the beach and bring them to the bonfire) and Port Shuffle (three cargo
// crates at the port, delivered to the warehouse) — and mission 3, Heat Wave,
// now builds heat faster: every crime counts extra while it is active, so
// reaching three stars takes minutes, not a grind.

import { BEACH_Y, HEAT_BOOST, SIDE } from './config.js';
import { LANDMARKS } from './world.js';
import { addWanted, wantedLevel } from './police.js';
import { saveGame } from './save.js';

export const MISSION_DEFS = [
  {
    id: 1,
    name: 'Hot Wheels',
    giver: 'Ms. Vega',
    brief: 'Steal any car and deliver it to Rosa\u2019s Garage. Quick and quiet.',
    reward: 400,
    side: false,
  },
  {
    id: 2,
    name: 'Sunset Run',
    giver: 'Ms. Vega',
    brief: 'A package, three drops, 120 seconds. Drive fast, don\u2019t crash.',
    reward: 600,
    side: false,
  },
  {
    id: 3,
    name: 'Heat Wave',
    giver: 'Ms. Vega',
    brief: 'Make some noise until the heat hits 3 stars — then vanish. Lose the cops.',
    reward: 800,
    side: false,
  },
  {
    id: 4,
    name: 'Collect the Debt',
    giver: 'Ms. Vega',
    brief: 'Three deadbeats at Marlin Plaza owe the house. Collect — fists or pistol.',
    reward: 900,
    side: false,
  },
  {
    id: 5,
    name: 'The Marina Heist',
    giver: 'Ms. Vega',
    brief: 'Steal the gold coupe at the Port Gate. Bring it to Sunset Marina.',
    reward: 1500,
    side: false,
  },
  {
    id: 6,
    name: 'Beach Bonfire',
    giver: 'Bonfire Crew',
    brief: 'Five crates washed up on the beach. Grab them in 90s.',
    reward: SIDE.beachReward,
    side: true,
  },
  {
    id: 7,
    name: 'Port Shuffle',
    giver: 'Dock Foreman',
    brief: 'Three cargo crates at the port. Deliver them in 150s.',
    reward: SIDE.portReward,
    side: true,
  },
];

/** Mission 2's drop points, in order, all on roads. */
const RUN_CHECKPOINTS = [
  { x: 2350, y: 750, label: 'Drop 1 — Palm Row' },
  { x: 750, y: 1950, label: 'Drop 2 — Old Docks' },
  { x: 2750, y: 2250, label: 'Drop 3 — South Beach' },
];

/** The five beach crates, spread along the sand east of the bonfire. */
const BEACH_CRATES = [
  { x: 500, y: BEACH_Y + 50 },
  { x: 1400, y: BEACH_Y + 80 },
  { x: 2000, y: BEACH_Y + 50 },
  { x: 2600, y: BEACH_Y + 80 },
  { x: 3100, y: BEACH_Y + 50 },
];

/** The three port crates, on the open lane beside the container yard. */
const PORT_CRATES = [
  { x: 3260, y: 500 },
  { x: 3260, y: 1200 },
  { x: 3260, y: 1950 },
];

export function isUnlocked(game, id) {
  if (id === 1) return true;
  if (id === 6) return game.missionsDone.includes(1);
  if (id === 7) return game.missionsDone.includes(2);
  return game.missionsDone.includes(id - 1);
}

/** Is a side job (repeatable, not part of the story)? */
export function isSideJob(id) {
  const def = MISSION_DEFS.find((m) => m.id === id);
  return !!def && def.side;
}

export function startMission(game, id) {
  const def = MISSION_DEFS.find((m) => m.id === id);
  if (!def || !isUnlocked(game, id)) return false;
  if (game.mission) return false;
  const mission = {
    id: def.id,
    name: def.name,
    reward: def.reward,
    side: def.side,
    stage: 0,
    target: null,
    timer: 0,
    checkpoints: [],
    checkpoint: 0,
    debtorsLeft: 0,
    crates: [],
    cratesLeft: 0,
  };
  if (id === 1) {
    mission.target = { x: LANDMARKS.garage.x, y: LANDMARKS.garage.y, label: 'Steal a car' };
  } else if (id === 2) {
    mission.checkpoints = RUN_CHECKPOINTS;
    mission.timer = 120;
    mission.target = { x: RUN_CHECKPOINTS[0].x, y: RUN_CHECKPOINTS[0].y, label: RUN_CHECKPOINTS[0].label };
  } else if (id === 3) {
    mission.target = { x: game.player.x, y: game.player.y, label: 'Raise the heat to 3 stars' };
  } else if (id === 4) {
    mission.target = { x: LANDMARKS.plaza.x, y: LANDMARKS.plaza.y, label: 'Go to Marlin Plaza' };
  } else if (id === 5) {
    mission.target = { x: LANDMARKS.portGate.x, y: LANDMARKS.portGate.y, label: 'Steal the gold coupe at the Port Gate' };
    const gold = {
      x: LANDMARKS.portGate.x + 60, y: LANDMARKS.portGate.y + 40,
      angle: 0, speed: 0, targetSpeed: 0,
      color: '#f2c94c', kind: 'target', axis: 'h', dir: 1,
      road: LANDMARKS.portGate.y, health: 100, owned: false,
    };
    game.cars.push(gold);
    mission.goldCar = gold;
  } else if (id === 6) {
    mission.crates = BEACH_CRATES.map((c) => ({ x: c.x, y: c.y, taken: false }));
    mission.cratesLeft = mission.crates.length;
    mission.timer = SIDE.beachSeconds;
    mission.target = { x: mission.crates[0].x, y: mission.crates[0].y, label: 'Grab the washed-up crates (0/5)' };
  } else if (id === 7) {
    mission.crates = PORT_CRATES.map((c) => ({ x: c.x, y: c.y, taken: false }));
    mission.cratesLeft = mission.crates.length;
    mission.timer = SIDE.portSeconds;
    mission.target = { x: mission.crates[0].x, y: mission.crates[0].y, label: 'Grab the cargo crates (0/3)' };
  }
  game.mission = mission;
  game.toast(`${def.name} — ${def.brief}`, 4);
  game.audio.ui();
  return true;
}

function completeMission(game) {
  const mission = game.mission;
  if (!mission) return;
  game.player.cash += mission.reward;
  if (mission.side) {
    game.sideCompletions[mission.id] = (game.sideCompletions[mission.id] || 0) + 1;
    game.toast(`${mission.name} complete! +$${mission.reward} (run #${game.sideCompletions[mission.id]})`, 4);
    game.audio.sideDone();
  } else {
    game.missionsDone.push(mission.id);
    game.toast(`${mission.name} complete! +$${mission.reward}`, 4);
    game.audio.missionDone();
  }
  game.mission = null;
  game.heatBoost = 1;
  saveGame(game);
  if (mission.id === 5) {
    game.storyComplete = true;
    game.toast('Story complete — Solmar is yours, Leo.', 5);
  }
}

function failMission(game, reason) {
  const mission = game.mission;
  if (!mission) return;
  game.toast(`${mission.name} failed — ${reason}`, 3.5);
  game.mission = null;
  game.heatBoost = 1;
}

function spawnDebtors(game) {
  const plaza = LANDMARKS.plaza;
  game.debtors = [];
  for (let i = 0; i < 3; i += 1) {
    const angle = (i / 3) * Math.PI * 2;
    game.debtors.push({
      x: plaza.x + Math.cos(angle) * 90,
      y: plaza.y + Math.sin(angle) * 90,
      angle,
      speed: 120,
      health: 100,
      alive: true,
      punchCooldown: 0,
    });
  }
  game.mission.debtorsLeft = 3;
  game.mission.stage = 1;
  game.mission.target = { x: plaza.x, y: plaza.y, label: 'Deal with the debtors (0/3 down)' };
  game.toast('The debtors are here. They don\u2019t want to pay.', 3);
}

function updateDebtors(game, dt) {
  const player = game.player;
  for (const debtor of game.debtors) {
    if (!debtor.alive) continue;
    if (debtor.punchCooldown > 0) debtor.punchCooldown -= dt;
    const dx = player.x - debtor.x;
    const dy = player.y - debtor.y;
    const dist = Math.hypot(dx, dy) || 1;
    debtor.angle = Math.atan2(dy, dx);
    if (dist > 44) {
      debtor.x += Math.cos(debtor.angle) * debtor.speed * dt;
      debtor.y += Math.sin(debtor.angle) * debtor.speed * dt;
    } else if (debtor.punchCooldown <= 0 && !player.inCar) {
      debtor.punchCooldown = 1.0;
      player.health -= 8;
      game.camera.shake = Math.max(game.camera.shake, 5);
      game.audio.punch();
      game.toast('A debtor landed a punch!', 1.5);
      if (player.health <= 0) player.health = 0;
    }
  }
}

/** One step of a side job: collect the crates, then deliver them. */
function updateSideMission(game, dt) {
  const mission = game.mission;
  const player = game.player;
  mission.timer -= dt;
  if (mission.timer <= 0) {
    failMission(game, 'out of time');
    return;
  }
  if (mission.stage === 0) {
    // Collect: walk or drive over a crate to pick it up.
    const next = mission.crates.find((c) => !c.taken);
    if (!next) {
      mission.stage = 1;
      const door = mission.id === 6
        ? { x: LANDMARKS.bonfire.x, y: LANDMARKS.bonfire.y, label: 'Bring the crates to the bonfire' }
        : { x: LANDMARKS.warehouseDoor.x, y: LANDMARKS.warehouseDoor.y, label: 'Deliver the crates to the warehouse' };
      mission.target = door;
      game.toast('All crates grabbed — now deliver them!', 2.5);
      return;
    }
    if (Math.hypot(player.x - next.x, player.y - next.y) < SIDE.collectRadius) {
      next.taken = true;
      mission.cratesLeft -= 1;
      game.audio.cash();
      game.particles.push({
        x: next.x, y: next.y, vx: 0, vy: -40, life: 0.6, maxLife: 0.6,
        color: '#f2c94c', size: 6, kind: 'spark',
      });
      const total = mission.crates.length;
      const got = total - mission.cratesLeft;
      if (mission.cratesLeft > 0) {
        const following = mission.crates.find((c) => !c.taken);
        mission.target = { x: following.x, y: following.y, label: `Grab the crates (${got}/${total})` };
      }
      game.toast(`Crate ${got}/${total} — ${Math.ceil(mission.timer)}s left`, 1.8);
    }
  } else {
    // Deliver: reach the bonfire or the warehouse door.
    if (Math.hypot(player.x - mission.target.x, player.y - mission.target.y) < 90) {
      completeMission(game);
    }
  }
}

/** One step of the active mission: stages, timers, win and fail checks. */
export function updateMission(game, dt) {
  const mission = game.mission;
  if (!mission) return;
  const player = game.player;

  if (mission.side) {
    updateSideMission(game, dt);
    return;
  }

  if (mission.id === 1) {
    if (mission.stage === 0) {
      if (player.inCar) {
        mission.stage = 1;
        mission.target = { x: LANDMARKS.garage.x, y: LANDMARKS.garage.y, label: 'Deliver the car to Rosa\u2019s Garage' };
        game.toast('Got the car. Now bring it to the garage.', 2.5);
      }
    } else if (player.inCar && Math.hypot(player.x - LANDMARKS.garage.x, player.y - LANDMARKS.garage.y) < 110) {
      completeMission(game);
    }
  } else if (mission.id === 2) {
    mission.timer -= dt;
    if (mission.timer <= 0) {
      failMission(game, 'out of time');
      return;
    }
    const cp = mission.checkpoints[mission.checkpoint];
    if (Math.hypot(player.x - cp.x, player.y - cp.y) < 100) {
      mission.checkpoint += 1;
      game.audio.cash();
      if (mission.checkpoint >= mission.checkpoints.length) {
        completeMission(game);
      } else {
        const next = mission.checkpoints[mission.checkpoint];
        mission.target = { x: next.x, y: next.y, label: next.label };
        game.toast(`Drop ${mission.checkpoint} done — ${Math.ceil(mission.timer)}s left`, 2);
      }
    }
  } else if (mission.id === 3) {
    if (mission.stage === 0) {
      // Building heat: every crime counts extra while this stage is active.
      game.heatBoost = HEAT_BOOST;
      mission.target = { x: player.x, y: player.y, label: `Raise the heat to 3 stars (now ${wantedLevel(game.wanted.points)})` };
      if (wantedLevel(game.wanted.points) >= 3) {
        mission.stage = 1;
        game.heatBoost = 1;
        game.toast('3 stars! Now lose them — get clear and stay clear.', 3);
      }
    } else if (wantedLevel(game.wanted.points) === 0) {
      completeMission(game);
    }
  } else if (mission.id === 4) {
    if (mission.stage === 0) {
      if (Math.hypot(player.x - LANDMARKS.plaza.x, player.y - LANDMARKS.plaza.y) < 160) {
        spawnDebtors(game);
      }
    } else {
      updateDebtors(game, dt);
      const left = game.debtors.filter((d) => d.alive).length;
      mission.debtorsLeft = left;
      mission.target = { x: LANDMARKS.plaza.x, y: LANDMARKS.plaza.y, label: `Deal with the debtors (${3 - left}/3 down)` };
      if (left === 0) completeMission(game);
    }
  } else if (mission.id === 5) {
    if (mission.stage === 0) {
      if (player.inCar && player.car === mission.goldCar) {
        mission.stage = 1;
        mission.target = { x: LANDMARKS.marina.x, y: LANDMARKS.marina.y, label: 'Deliver the coupe to Sunset Marina' };
        addWanted(game, 55, 'the gold coupe is gone');
        game.toast('The coupe is yours — and every cop in Solmar knows it.', 3.5);
      }
    } else if (player.inCar && player.car === mission.goldCar
      && Math.hypot(player.x - LANDMARKS.marina.x, player.y - LANDMARKS.marina.y) < 130) {
      completeMission(game);
    }
  }
}

/** The HUD line for the active mission: objective text and distance in metres. */
export function missionObjective(game) {
  const mission = game.mission;
  if (!mission || !mission.target) return null;
  const dist = Math.round(Math.hypot(game.player.x - mission.target.x, game.player.y - mission.target.y) / 10);
  let text = mission.target.label;
  if (mission.id === 2 || mission.side) text += ` — ${Math.ceil(mission.timer)}s`;
  return { text, distance: dist, x: mission.target.x, y: mission.target.y, side: mission.side };
}
