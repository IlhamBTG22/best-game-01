// Keyboard and pointer input. Held keys give a movement direction and a firing state; one-shot
// presses (start, restart, pause, mute, upgrade picks) are queued as bit flags and taken once
// by the loop, so a press between two frames is never lost and never counted twice. The mouse
// aims: its position over the canvas, in playfield coordinates, is where bolts fly.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_MUTE = 4;
export const ACTION_PICK_1 = 8;
export const ACTION_PICK_2 = 16;
export const ACTION_PICK_3 = 32;

const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const MUTE = new Set(['KeyM']);
const PICKS = new Map([['Digit1', ACTION_PICK_1], ['Digit2', ACTION_PICK_2], ['Digit3', ACTION_PICK_3], ['Numpad1', ACTION_PICK_1], ['Numpad2', ACTION_PICK_2], ['Numpad3', ACTION_PICK_3]]);

export function createInput(canvas, toField) {
  let left = false;
  let right = false;
  let up = false;
  let down = false;
  let firing = false;
  let mouseX = 0;
  let mouseY = 0;
  let mouseIn = false;
  let actions = 0;
  let clickedCard = 0;

  window.addEventListener('keydown', (event) => {
    if (LEFT.has(event.code)) left = true;
    else if (RIGHT.has(event.code)) right = true;
    else if (UP.has(event.code)) up = true;
    else if (DOWN.has(event.code)) down = true;
    else if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (MUTE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_MUTE;
    } else if (PICKS.has(event.code)) {
      if (!event.repeat) actions |= PICKS.get(event.code);
    } else return;
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    if (LEFT.has(event.code)) left = false;
    else if (RIGHT.has(event.code)) right = false;
    else if (UP.has(event.code)) up = false;
    else if (DOWN.has(event.code)) down = false;
  });
  // A key released while the tab is hidden never sends keyup: let go of everything on blur.
  window.addEventListener('blur', () => {
    left = false;
    right = false;
    up = false;
    down = false;
    firing = false;
  });
  canvas.addEventListener('pointermove', (event) => {
    const point = toField(event.clientX, event.clientY);
    mouseX = point.x;
    mouseY = point.y;
    mouseIn = true;
  });
  canvas.addEventListener('pointerdown', (event) => {
    const point = toField(event.clientX, event.clientY);
    mouseX = point.x;
    mouseY = point.y;
    mouseIn = true;
    if (event.button === 0) firing = true;
    // A click on an upgrade card is a pick; the renderer owns the card boxes.
    clickedCard = window.__emberCards ? window.__emberCards(mouseX, mouseY) : 0;
    if (clickedCard > 0) actions |= clickedCard === 1 ? ACTION_PICK_1 : clickedCard === 2 ? ACTION_PICK_2 : ACTION_PICK_3;
    else actions |= ACTION_CONFIRM;
  });
  window.addEventListener('pointerup', (event) => {
    if (event.button === 0) firing = false;
  });

  return {
    /** Movement direction, each axis -1, 0 or 1 (normalized by the caller). */
    move() {
      return { x: (right ? 1 : 0) - (left ? 1 : 0), y: (down ? 1 : 0) - (up ? 1 : 0) };
    },
    /** Where the mouse aims, in playfield coordinates; null until the mouse has moved. */
    aim() {
      return mouseIn ? { x: mouseX, y: mouseY } : null;
    },
    get firing() {
      return firing;
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
