// Solmar City v2 — keyboard and mouse input. Keys are held in a set; one-shot
// actions (pressed this frame: enter a car, open the phone, pause, shoot, punch,
// honk, mute, restart, and the seven job keys) are queued as a bitmask that the
// loop drains once per step, so a tap is never missed or doubled. New in v2:
// Digit6 and Digit7 start the two side jobs, and H sounds the horn.

export const ACTION_ENTER_CAR = 1;
export const ACTION_PHONE = 2;
export const ACTION_PAUSE = 4;
export const ACTION_CONFIRM = 8;
export const ACTION_RESTART = 16;
export const ACTION_MUTE = 32;
export const ACTION_PUNCH = 64;
export const ACTION_MISSION_1 = 128;
export const ACTION_MISSION_2 = 256;
export const ACTION_MISSION_3 = 512;
export const ACTION_MISSION_4 = 1024;
export const ACTION_MISSION_5 = 2048;
export const ACTION_MISSION_6 = 4096;
export const ACTION_MISSION_7 = 8192;
export const ACTION_HONK = 16384;

/** The seven job keys, in order, so the loop can map a bit to a job id. */
export const MISSION_ACTIONS = [
  ACTION_MISSION_1, ACTION_MISSION_2, ACTION_MISSION_3, ACTION_MISSION_4,
  ACTION_MISSION_5, ACTION_MISSION_6, ACTION_MISSION_7,
];

const KEY_ACTIONS = {
  KeyE: ACTION_ENTER_CAR,
  KeyM: ACTION_PHONE,
  Escape: ACTION_PAUSE,
  KeyP: ACTION_PAUSE,
  Enter: ACTION_CONFIRM,
  KeyR: ACTION_RESTART,
  KeyN: ACTION_MUTE,
  KeyF: ACTION_PUNCH,
  KeyH: ACTION_HONK,
  Digit1: ACTION_MISSION_1,
  Digit2: ACTION_MISSION_2,
  Digit3: ACTION_MISSION_3,
  Digit4: ACTION_MISSION_4,
  Digit5: ACTION_MISSION_5,
  Digit6: ACTION_MISSION_6,
  Digit7: ACTION_MISSION_7,
};

export function createInput(canvas) {
  const keys = new Set();
  let actions = 0;
  const mouse = { x: 0, y: 0, down: false, clicked: false, clickedX: 0, clickedY: 0 };

  function onKeyDown(event) {
    if (event.repeat) return;
    keys.add(event.code);
    const action = KEY_ACTIONS[event.code];
    if (action) {
      actions |= action;
      event.preventDefault();
    }
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) {
      event.preventDefault();
    }
  }

  function onKeyUp(event) {
    keys.delete(event.code);
  }

  function onMouseMove(event) {
    const rect = canvas.getBoundingClientRect();
    mouse.x = event.clientX - rect.left;
    mouse.y = event.clientY - rect.top;
  }

  function onMouseDown(event) {
    if (event.button !== 0) return;
    onMouseMove(event);
    mouse.down = true;
    mouse.clicked = true;
    mouse.clickedX = mouse.x;
    mouse.clickedY = mouse.y;
  }

  function onMouseUp() {
    mouse.down = false;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', () => keys.clear());
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  return {
    keys,
    mouse,

    /** Held movement keys as a unit vector (x right, y down), or {x:0,y:0}. */
    moveVector() {
      let x = 0;
      let y = 0;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
      if (keys.has('KeyW') || keys.has('ArrowUp')) y -= 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) y += 1;
      if (x !== 0 && y !== 0) {
        const inv = 1 / Math.SQRT2;
        x *= inv;
        y *= inv;
      }
      return { x, y };
    },

    running() {
      return keys.has('ShiftLeft') || keys.has('ShiftRight');
    },

    handbrake() {
      return keys.has('Space');
    },

    /** Drain the queued one-shot actions. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },

    /** Drain a mouse click (screen coordinates), or null. */
    takeClick() {
      if (!mouse.clicked) return null;
      mouse.clicked = false;
      return { x: mouse.clickedX, y: mouse.clickedY };
    },
  };
}
