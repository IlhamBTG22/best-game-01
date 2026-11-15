// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s steps
// (several in a slow frame, none in a fast one), and the renderer paints what is there. The game
// moves between six screens: title, play, paused, upgrade, game over and win.
//
// ?seed=N fixes the wave pattern. ?shot=start|play|upgrade|end (with &seed=N) stages that scene
// instead of running the loop, paints it twice and sets window.__shotReady for a screenshot.
import { BEST_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createAudio } from './audio.js';
import { createWorld, EVENT_BOLT_HIT, EVENT_EMBER_HIT, EVENT_HIT, EVENT_KILL, EVENT_OVER, EVENT_PICKUP, EVENT_UPGRADE, EVENT_WAVE_CLEAR, EVENT_WIN } from './world.js';
import { ACTION_CONFIRM, ACTION_MUTE, ACTION_PAUSE, ACTION_PICK_1, ACTION_PICK_2, ACTION_PICK_3, createInput } from './input.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_UPGRADE, SCREEN_WIN } from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  window.__emberDebug = () => ({
    screen: scene.screen,
    score: world.state.score,
    wave: world.state.wave,
    waveState: world.state.waveState,
    offer: world.state.offer.map((u) => u.id),
    hearts: world.state.player.hearts,
    ember: world.state.ember.hp,
    enemies: world.state.enemies.filter((e) => e.active).length,
    over: world.state.over,
    won: world.state.won,
  });
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best, { aim: null, muted: audio.muted });
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas, (x, y) => renderer.toField(x, y));
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();
  let lastSound = { kill: 0, pickup: 0 };

  // Screen readers (and anyone watching the page's text) hear the screen changes and each hit.
  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    world.reset();
    world.startWave(1);
    accumulator = 0;
    screen = SCREEN_PLAY;
    audio.unlock();
    audio.wave();
    announce('Playing. Defend the ember.');
  }

  function endGame() {
    screen = SCREEN_OVER;
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    audio.over();
    announce(`Game over. Score ${world.state.score}. Best ${best}.`);
  }

  function winGame() {
    screen = SCREEN_WIN;
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    audio.win();
    announce(`You win. Score ${world.state.score}. Best ${best}.`);
  }

  function playSounds(events, now) {
    if (events & EVENT_KILL && now - lastSound.kill > 60) {
      audio.hit();
      lastSound.kill = now;
    } else if (events & EVENT_BOLT_HIT && now - lastSound.kill > 120) {
      audio.hit();
      lastSound.kill = now;
    }
    if (events & EVENT_PICKUP && now - lastSound.pickup > 90) {
      audio.pickup();
      lastSound.pickup = now;
    }
    if (events & EVENT_HIT) audio.hurt();
    if (events & EVENT_EMBER_HIT) audio.emberHit();
    if (events & EVENT_WAVE_CLEAR) audio.wave();
    if (events & EVENT_UPGRADE) audio.upgrade();
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      announce(muted ? 'Muted.' : 'Sound on.');
    }
    if (actions & ACTION_CONFIRM && (screen === SCREEN_TITLE || screen === SCREEN_OVER || screen === SCREEN_WIN)) {
      audio.unlock();
      startGame();
    } else if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Playing.');
    } else if (screen === SCREEN_UPGRADE) {
      const pick = actions & ACTION_PICK_1 ? 0 : actions & ACTION_PICK_2 ? 1 : actions & ACTION_PICK_3 ? 2 : -1;
      if (pick >= 0 && pick < world.state.offer.length) {
        const upgrade = world.state.offer[pick];
        if (world.applyUpgrade(upgrade.id)) {
          audio.upgrade();
          world.startWave(world.state.wave + 1);
          screen = SCREEN_PLAY;
          audio.wave();
          announce(`Wave ${world.state.wave}. ${upgrade.name} taken.`);
        }
      }
    }
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      if (world.state.waveState === 'idle' || world.state.waveState === 'intermission') world.startWave(1);
      world.step(STEP, { mx: 0, my: 0, aimX: 0, aimY: 0, firing: false, hasAim: false }, true);
      return;
    }
    if (screen !== SCREEN_PLAY) return;
    const move = input.move();
    const aim = input.aim();
    const willShoot = input.firing && world.state.player.fireTimer <= 0 && world.state.waveState === 'fighting';
    const events = world.step(STEP, {
      mx: move.x,
      my: move.y,
      aimX: aim ? aim.x : 0,
      aimY: aim ? aim.y : 0,
      firing: input.firing,
      hasAim: aim !== null,
    }, false);
    if (willShoot) audio.shoot();
    playSounds(events, performance.now());
    if (events & EVENT_WIN) winGame();
    else if (events & EVENT_OVER) endGame();
    else if (events & EVENT_WAVE_CLEAR) {
      screen = SCREEN_UPGRADE;
      announce(`Wave ${world.state.wave} cleared. Choose an upgrade.`);
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, best, { aim: screen === SCREEN_PLAY ? input.aim() : null, muted: audio.muted });
  }

  // Leaving the tab pauses a running game rather than letting the dark close in unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Ember Warden. Press Space or click to start.');
  window.__emberDebug = () => ({
    screen,
    score: world.state.score,
    wave: world.state.wave,
    waveState: world.state.waveState,
    hearts: world.state.player.hearts,
    ember: world.state.ember.hp,
    enemies: world.state.enemies.filter((e) => e.active).length,
    over: world.state.over,
    won: world.state.won,
  });
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
