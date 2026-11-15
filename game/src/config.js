// Every tuning number and colour in one place. The playfield is a fixed 1280x720 logical area;
// the renderer scales it to the window, so no rule below depends on the screen size.

export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** The ember crystal the player defends, at the middle of the field. */
export const EMBER = { x: 640, y: 360, radius: 34, maxHp: 12 };

export const PLAYER = {
  radius: 14,
  speed: 340,
  maxHearts: 3,
  invulnerable: 1.5,
  knockback: 260,
};

export const BOLT = {
  speed: 760,
  damage: 1,
  radius: 5,
  interval: 0.22,
  range: 620,
};

export const WAVES = 10;

/** Enemy kinds: what they look like, how they move, how tough they are. */
export const ENEMY = {
  mote: { radius: 11, hp: 1, speed: 92, score: 10, shards: 1, damage: 1, weight: 10 },
  crawler: { radius: 17, hp: 3, speed: 62, score: 20, shards: 2, damage: 1, weight: 7 },
  darter: { radius: 10, hp: 1, speed: 185, score: 25, shards: 2, damage: 1, weight: 5 },
  brute: { radius: 26, hp: 7, speed: 42, score: 50, shards: 4, damage: 2, weight: 3 },
};

/** How many of each pool exist at once; allocated once, at boot. */
export const POOL = { enemies: 56, bolts: 72, shards: 96, particles: 160 };

/** Upgrades offered between waves. `max` is how many times it can be taken. */
export const UPGRADES = [
  { id: 'damage', name: 'Ember Bolt+', text: 'Bolts deal +1 damage.', max: 4 },
  { id: 'rapid', name: 'Quick Hands', text: 'Fire 25% faster.', max: 4 },
  { id: 'swift', name: 'Swift Boots', text: 'Move 12% faster.', max: 3 },
  { id: 'heart', name: 'Warm Heart', text: '+1 max heart and heal 1.', max: 2 },
  { id: 'mend', name: 'Mend Ember', text: 'Restore 4 ember health.', max: 99 },
  { id: 'pierce', name: 'Piercing Shot', text: 'Bolts pass through +1 foe.', max: 2 },
  { id: 'twin', name: 'Twin Shot', text: 'Fire two bolts at once.', max: 1 },
  { id: 'magnet', name: 'Shard Magnet', text: 'Shards fly to you from farther away.', max: 2 },
];

export const PALETTE = {
  backdrop: '#0d0f1e',
  sky: '#141830',
  star: '#8f9bbd',
  emberCore: '#ffb347',
  emberGlow: '#ff7b2f',
  emberRing: '#ffd98a',
  player: '#ffd166',
  playerRing: '#fff3c4',
  bolt: '#ffe9a8',
  mote: '#b388ff',
  crawler: '#7e57c2',
  darter: '#e040fb',
  brute: '#5e35b1',
  shard: '#4fc3f7',
  heart: '#ff5d73',
  panel: '#1c2138',
  panelEdge: '#39406b',
  text: '#f2f0e9',
  muted: '#9aa3c0',
  gold: '#f2c94c',
  danger: '#ff5d73',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'ember-warden.best';
