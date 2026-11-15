// The screenshot scenes behind ?shot=start|play|upgrade|end. Each one plays the real rules
// forward from a fresh world for a fixed stretch, steered by an autopilot, so the frame is what
// a short game really looks like and the same seed always gives the same frame.

import { EMBER, FIELD, STEP } from './config.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE, SCREEN_UPGRADE } from './render.js';

const START_SECONDS = 4;
const PLAY_WAVE = 5;
const PLAY_AFTER_SECONDS = 15;
const UPGRADE_WAVE = 2;
const END_LIMIT_SECONDS = 600;
const SAMPLE_LIMIT = 60 * 600;

/** The autopilot's steering: keep clear of the nearest foe, chase the nearest shard, else close
 *  in to firing range; aim at the nearest foe and fire while one is in range. */
function pilot(state) {
  const player = state.player;
  let foe = null;
  let foeDist = Infinity;
  for (const e of state.enemies) {
    if (!e.active) continue;
    const dx = e.x - player.x;
    const dy = e.y - player.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < foeDist) { foeDist = d; foe = e; }
  }
  let shard = null;
  let shardDist = Infinity;
  for (const s of state.shards) {
    if (!s.active) continue;
    const dx = s.x - player.x;
    const dy = s.y - player.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < shardDist) { shardDist = d; shard = s; }
  }
  let mx = 0;
  let my = 0;
  if (foe !== null && foeDist < 150) {
    mx = player.x - foe.x;
    my = player.y - foe.y;
  } else if (shard !== null && shardDist < 320) {
    mx = shard.x - player.x;
    my = shard.y - player.y;
  } else if (foe !== null) {
    mx = foe.x - player.x;
    my = foe.y - player.y;
  } else {
    mx = EMBER.x - player.x;
    my = EMBER.y - player.y;
  }
  const len = Math.hypot(mx, my) || 1;
  const aim = foe !== null ? { x: foe.x, y: foe.y } : { x: player.x, y: player.y - 100 };
  return {
    mx: mx / len,
    my: my / len,
    aimX: aim.x,
    aimY: aim.y,
    firing: foe !== null && foeDist < 620,
    hasAim: true,
  };
}

/** The end scene's pilot: it stands its ground and shoots, but never moves, so the dark
 *  closes in — after it has scored a few kills, as a hurried player would. */
function standAndShoot(state) {
  const player = state.player;
  let foe = null;
  let foeDist = Infinity;
  for (const e of state.enemies) {
    if (!e.active) continue;
    const dx = e.x - player.x;
    const dy = e.y - player.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < foeDist) { foeDist = d; foe = e; }
  }
  const aim = foe !== null ? { x: foe.x, y: foe.y } : { x: player.x, y: player.y - 100 };
  return { mx: 0, my: 0, aimX: aim.x, aimY: aim.y, firing: foe !== null && foeDist < 620, hasAim: true };
}

/** A pilot that never moves and never fires, for the title backdrop. */
function stillInput() {
  return { mx: 0, my: 0, aimX: FIELD.width / 2, aimY: 100, firing: false, hasAim: false };
}

/**
 * Set `world` to the named scene (start, play, upgrade or end; any other name is start) and
 * return the screen to draw over it and the best score to show.
 */
export function stageShot(name, world) {
  world.reset();
  if (name !== 'play' && name !== 'upgrade' && name !== 'end') {
    world.startWave(1);
    for (let index = 0; index < START_SECONDS / STEP; index += 1) world.step(STEP, stillInput(), true);
    return { screen: SCREEN_TITLE, best: 0 };
  }
  if (name === 'end') {
    world.startWave(1);
    for (let index = 0; index < END_LIMIT_SECONDS / STEP; index += 1) {
      world.step(STEP, standAndShoot(world.state), false);
      if (world.state.over) break;
      if (world.state.waveState === 'intermission') world.startWave(world.state.wave + 1);
    }
    return { screen: SCREEN_OVER, best: world.state.score };
  }
  if (name === 'upgrade') {
    world.startWave(1);
    for (let index = 0; index < SAMPLE_LIMIT; index += 1) {
      world.step(STEP, pilot(world.state), false);
      if (world.state.over) break;
      if (world.state.waveState === 'intermission' && world.state.wave >= UPGRADE_WAVE) break;
      if (world.state.waveState === 'intermission') world.startWave(world.state.wave + 1);
    }
    return { screen: SCREEN_UPGRADE, best: world.state.score };
  }
  // play: survive to the target wave, then keep the busiest frame seen: the autopilot kills
  // faster than the wave spawns, so the densest moment is mid-wave, not the end of it. The
  // snapshot is restored before returning, so the painted frame is that moment.
  world.startWave(1);
  let waveStart = -1;
  let bestSnapshot = null;
  let bestAlive = -1;
  for (let index = 0; index < SAMPLE_LIMIT; index += 1) {
    world.step(STEP, pilot(world.state), false);
    if (world.state.over) break;
    if (world.state.waveState === 'intermission') {
      const offered = world.state.offer;
      if (offered.length > 0) world.applyUpgrade(offered[0].id);
      world.startWave(world.state.wave + 1);
      continue;
    }
    if (world.state.wave === PLAY_WAVE && waveStart < 0) waveStart = world.state.elapsed;
    if (waveStart >= 0) {
      let alive = 0;
      for (const e of world.state.enemies) if (e.active) alive += 1;
      if (alive > bestAlive) {
        bestAlive = alive;
        bestSnapshot = structuredClone(world.state);
      }
      if (world.state.elapsed - waveStart >= PLAY_AFTER_SECONDS) break;
    }
  }
  if (bestSnapshot !== null) {
    for (const key of Object.keys(bestSnapshot)) world.state[key] = bestSnapshot[key];
  }
  return { screen: SCREEN_PLAY, best: world.state.score };
}
