// The game's rules and state, with no drawing and no browser in it: the warden, the ember,
// the waves of shadow creatures, bolts, shards, particles and the upgrades between waves.
// step() advances one fixed step and returns what happened as bit flags, so the caller can
// react (and play sounds) without the world knowing about screens or sound. Pools are
// allocated once, at boot; nothing here allocates after createWorld returns.

import { BOLT, EMBER, ENEMY, FIELD, PLAYER, POOL, UPGRADES, WAVES } from './config.js';

export const KIND_MOTE = 'mote';
export const KIND_CRAWLER = 'crawler';
export const KIND_DARTER = 'darter';
export const KIND_BRUTE = 'brute';

export const EVENT_HIT = 1;
export const EVENT_EMBER_HIT = 2;
export const EVENT_KILL = 4;
export const EVENT_PICKUP = 8;
export const EVENT_WAVE_CLEAR = 16;
export const EVENT_OVER = 32;
export const EVENT_WIN = 64;
export const EVENT_UPGRADE = 128;
export const EVENT_BOLT_HIT = 256;

function distance(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

export function createWorld(random) {
  const player = {
    x: FIELD.width / 2, y: 560, vx: 0, vy: 0,
    hearts: PLAYER.maxHearts, maxHearts: PLAYER.maxHearts, invulnerable: 0,
    fireTimer: 0, speed: PLAYER.speed, damage: BOLT.damage,
    fireInterval: BOLT.interval, pierce: 0, twin: false, magnet: 120,
  };
  const ember = { hp: EMBER.maxHp, maxHp: EMBER.maxHp };
  const enemies = [];
  for (let i = 0; i < POOL.enemies; i += 1) {
    enemies.push({ active: false, kind: KIND_MOTE, x: 0, y: 0, vx: 0, vy: 0, hp: 1, maxHp: 1, radius: 10, speed: 0, score: 0, shards: 0, damage: 1, wobble: 0, touchTimer: 0 });
  }
  const bolts = [];
  for (let i = 0; i < POOL.bolts; i += 1) {
    bolts.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, damage: 1, pierce: 0, travelled: 0 });
  }
  const shards = [];
  for (let i = 0; i < POOL.shards; i += 1) {
    shards.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, value: 5 });
  }
  const particles = [];
  for (let i = 0; i < POOL.particles; i += 1) {
    particles.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, color: '#ffffff', size: 3 });
  }
  const state = {
    player, ember, enemies, bolts, shards, particles,
    score: 0, kills: 0, shardsCollected: 0, wave: 0, elapsed: 0,
    waveState: 'idle', offer: [], taken: {}, spawnQueue: [], spawnTimer: 0,
    over: false, won: false,
  };

  function reset() {
    player.x = FIELD.width / 2;
    player.y = 560;
    player.vx = 0;
    player.vy = 0;
    player.hearts = PLAYER.maxHearts;
    player.maxHearts = PLAYER.maxHearts;
    player.invulnerable = 0;
    player.fireTimer = 0;
    player.speed = PLAYER.speed;
    player.damage = BOLT.damage;
    player.fireInterval = BOLT.interval;
    player.pierce = 0;
    player.twin = false;
    player.magnet = 120;
    ember.hp = EMBER.maxHp;
    ember.maxHp = EMBER.maxHp;
    for (const e of enemies) e.active = false;
    for (const b of bolts) b.active = false;
    for (const s of shards) s.active = false;
    for (const p of particles) p.active = false;
    state.score = 0;
    state.kills = 0;
    state.shardsCollected = 0;
    state.wave = 0;
    state.elapsed = 0;
    state.waveState = 'idle';
    state.offer = [];
    state.taken = {};
    state.spawnQueue = [];
    state.spawnTimer = 0;
    state.over = false;
    state.won = false;
  }

  function burst(x, y, color, count, speed) {
    let made = 0;
    for (let i = 0; i < particles.length && made < count; i += 1) {
      const p = particles[i];
      if (p.active) continue;
      const angle = random() * Math.PI * 2;
      const v = speed * (0.4 + random() * 0.8);
      p.active = true;
      p.x = x;
      p.y = y;
      p.vx = Math.cos(angle) * v;
      p.vy = Math.sin(angle) * v;
      p.maxLife = 0.35 + random() * 0.35;
      p.life = p.maxLife;
      p.color = color;
      p.size = 2 + random() * 3;
      made += 1;
    }
  }

  function free(pool) {
    for (let i = 0; i < pool.length; i += 1) if (!pool[i].active) return pool[i];
    return null;
  }

  function spawnEnemy(kind) {
    const slot = free(enemies);
    if (slot === null) return;
    const spec = ENEMY[kind];
    const edge = Math.floor(random() * 4);
    const margin = 30;
    let x = 0;
    let y = 0;
    if (edge === 0) { x = margin + random() * (FIELD.width - margin * 2); y = -margin; }
    else if (edge === 1) { x = margin + random() * (FIELD.width - margin * 2); y = FIELD.height + margin; }
    else if (edge === 2) { x = -margin; y = margin + random() * (FIELD.height - margin * 2); }
    else { x = FIELD.width + margin; y = margin + random() * (FIELD.height - margin * 2); }
    const hpBonus = kind === KIND_BRUTE ? Math.floor((state.wave - 1) / 3) : kind === KIND_CRAWLER ? Math.floor((state.wave - 1) / 4) : 0;
    const speedScale = 1 + 0.05 * (state.wave - 1);
    slot.active = true;
    slot.kind = kind;
    slot.x = x;
    slot.y = y;
    slot.vx = 0;
    slot.vy = 0;
    slot.maxHp = spec.hp + hpBonus;
    slot.hp = slot.maxHp;
    slot.radius = spec.radius;
    slot.speed = spec.speed * speedScale;
    slot.score = spec.score;
    slot.shards = spec.shards;
    slot.damage = spec.damage;
    slot.wobble = random() * Math.PI * 2;
    slot.touchTimer = 0;
  }

  function buildWave(number) {
    const count = 8 + 4 * number;
    const queue = [];
    let total = 0;
    const weights = [
      [KIND_MOTE, ENEMY.mote.weight],
      [KIND_CRAWLER, ENEMY.crawler.weight],
      [KIND_DARTER, number >= 2 ? ENEMY.darter.weight : 0],
      [KIND_BRUTE, number >= 3 ? ENEMY.brute.weight : 0],
    ];
    for (const [, weight] of weights) total += weight;
    for (let i = 0; i < count; i += 1) {
      let roll = random() * total;
      let kind = KIND_MOTE;
      for (const [candidate, weight] of weights) {
        roll -= weight;
        if (roll <= 0) { kind = candidate; break; }
      }
      queue.push(kind);
    }
    // Shuffle the queue so the wave does not arrive in clumps of one kind.
    for (let i = queue.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      const tmp = queue[i];
      queue[i] = queue[j];
      queue[j] = tmp;
    }
    return queue;
  }

  function startWave(number) {
    state.wave = number;
    state.spawnQueue = buildWave(number);
    state.spawnTimer = 0.6;
    state.waveState = 'fighting';
  }

  function pickOffer() {
    const available = UPGRADES.filter((u) => (state.taken[u.id] || 0) < u.max);
    const pool = available.length > 0 ? available : [UPGRADES.find((u) => u.id === 'mend')];
    const picked = [];
    const copy = pool.slice();
    while (picked.length < 3 && copy.length > 0) {
      const index = Math.floor(random() * copy.length);
      picked.push(copy.splice(index, 1)[0]);
    }
    state.offer = picked;
    state.waveState = 'intermission';
  }

  function applyUpgrade(id) {
    const def = UPGRADES.find((u) => u.id === id);
    if (!def || state.waveState !== 'intermission') return false;
    if (!state.offer.some((u) => u.id === id)) return false;
    state.taken[id] = (state.taken[id] || 0) + 1;
    if (id === 'damage') player.damage += 1;
    else if (id === 'rapid') player.fireInterval *= 0.8;
    else if (id === 'swift') player.speed *= 1.12;
    else if (id === 'heart') { player.maxHearts += 1; player.hearts = Math.min(player.maxHearts, player.hearts + 1); }
    else if (id === 'mend') ember.hp = Math.min(ember.maxHp, ember.hp + 4);
    else if (id === 'pierce') player.pierce += 1;
    else if (id === 'twin') player.twin = true;
    else if (id === 'magnet') player.magnet *= 1.6;
    state.offer = [];
    return true;
  }

  function fireBolt(angle) {
    const slot = free(bolts);
    if (slot === null) return;
    slot.active = true;
    slot.x = player.x + Math.cos(angle) * (PLAYER.radius + 6);
    slot.y = player.y + Math.sin(angle) * (PLAYER.radius + 6);
    slot.vx = Math.cos(angle) * BOLT.speed;
    slot.vy = Math.sin(angle) * BOLT.speed;
    slot.damage = player.damage;
    slot.pierce = player.pierce;
    slot.travelled = 0;
  }

  function nearestEnemy() {
    let best = null;
    let bestDist = Infinity;
    for (const e of enemies) {
      if (!e.active) continue;
      const d = distance(e.x, e.y, player.x, player.y);
      if (d < bestDist) { bestDist = d; best = e; }
    }
    return best;
  }

  function dropShards(x, y, count) {
    for (let i = 0; i < count; i += 1) {
      const slot = free(shards);
      if (slot === null) return;
      const angle = random() * Math.PI * 2;
      const v = 60 + random() * 120;
      slot.active = true;
      slot.x = x;
      slot.y = y;
      slot.vx = Math.cos(angle) * v;
      slot.vy = Math.sin(angle) * v;
      slot.value = 5;
    }
  }

  function killEnemy(e) {
    e.active = false;
    state.kills += 1;
    state.score += e.score;
    dropShards(e.x, e.y, e.shards);
    burst(e.x, e.y, '#b388ff', e.kind === KIND_BRUTE ? 18 : 8, 220);
  }

  /**
   * One fixed step. `input` is {mx, my, aimX, aimY, firing, hasAim}. With `harmless` set (the
   * title screen's backdrop) creatures drift but nothing touches the player or the ember and
   * nothing scores. Returns event bit flags.
   */
  function step(dt, input, harmless) {
    let events = 0;
    state.elapsed += dt;

    // --- Player movement (with knockback decay) ---
    const len = Math.hypot(input.mx, input.my);
    const nx = len > 0 ? input.mx / len : 0;
    const ny = len > 0 ? input.my / len : 0;
    player.x += (nx * player.speed + player.vx) * dt;
    player.y += (ny * player.speed + player.vy) * dt;
    player.vx *= Math.max(0, 1 - 8 * dt);
    player.vy *= Math.max(0, 1 - 8 * dt);
    player.x = Math.min(FIELD.width - PLAYER.radius - 4, Math.max(PLAYER.radius + 4, player.x));
    player.y = Math.min(FIELD.height - PLAYER.radius - 4, Math.max(PLAYER.radius + 4, player.y));
    if (player.invulnerable > 0) player.invulnerable = Math.max(0, player.invulnerable - dt);

    // --- Firing ---
    player.fireTimer -= dt;
    if (input.firing && player.fireTimer <= 0 && state.waveState === 'fighting') {
      let angle = null;
      if (input.hasAim) angle = Math.atan2(input.aimY - player.y, input.aimX - player.x);
      else {
        const target = nearestEnemy();
        if (target) angle = Math.atan2(target.y - player.y, target.x - player.x);
      }
      if (angle !== null) {
        fireBolt(angle);
        if (player.twin) {
          fireBolt(angle - 0.1);
          fireBolt(angle + 0.1);
        }
        player.fireTimer = player.fireInterval;
      }
    }

    // --- Spawning ---
    if (state.waveState === 'fighting' && state.spawnQueue.length > 0) {
      state.spawnTimer -= dt;
      if (state.spawnTimer <= 0) {
        spawnEnemy(state.spawnQueue.shift());
        state.spawnTimer = Math.max(0.35, 1.15 - 0.08 * state.wave);
      }
    }

    // --- Enemies ---
    let alive = 0;
    for (const e of enemies) {
      if (!e.active) continue;
      alive += 1;
      if (e.touchTimer > 0) e.touchTimer -= dt;
      e.wobble += dt * 3;
      let tx = EMBER.x - e.x;
      let ty = EMBER.y - e.y;
      if (e.kind === KIND_DARTER) {
        tx = player.x - e.x;
        ty = player.y - e.y;
        const wob = Math.sin(e.wobble) * 0.7;
        const tl = Math.hypot(tx, ty) || 1;
        const px = -ty / tl;
        const py = tx / tl;
        tx = tx / tl + px * wob;
        ty = ty / tl + py * wob;
      }
      const tl = Math.hypot(tx, ty) || 1;
      e.x += (tx / tl) * e.speed * dt;
      e.y += (ty / tl) * e.speed * dt;

      // Reaches the ember: it bites the ember and dies.
      const dEmber = distance(e.x, e.y, EMBER.x, EMBER.y);
      if (dEmber < EMBER.radius + e.radius * 0.6) {
        e.active = false;
        alive -= 1;
        burst(e.x, e.y, '#ff7b2f', 10, 200);
        if (!harmless) {
          ember.hp -= e.damage;
          events |= EVENT_EMBER_HIT;
          if (ember.hp <= 0) {
            ember.hp = 0;
            state.over = true;
            events |= EVENT_OVER;
          }
        }
        continue;
      }

      // Touches the player: a heart, a knockback, a short breather.
      if (!harmless && player.invulnerable === 0 && e.touchTimer <= 0) {
        const dPlayer = distance(e.x, e.y, player.x, player.y);
        if (dPlayer < e.radius + PLAYER.radius) {
          player.hearts -= 1;
          player.invulnerable = PLAYER.invulnerable;
          const push = Math.atan2(player.y - e.y, player.x - e.x);
          player.vx = Math.cos(push) * PLAYER.knockback;
          player.vy = Math.sin(push) * PLAYER.knockback;
          e.touchTimer = 0.9;
          e.x -= Math.cos(push) * 40;
          e.y -= Math.sin(push) * 40;
          burst(player.x, player.y, '#ff5d73', 10, 240);
          events |= EVENT_HIT;
          if (player.hearts <= 0) {
            player.hearts = 0;
            state.over = true;
            events |= EVENT_OVER;
          }
        }
      }
    }

    // --- Bolts ---
    for (const b of bolts) {
      if (!b.active) continue;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.travelled += BOLT.speed * dt;
      if (b.travelled > BOLT.range || b.x < -20 || b.x > FIELD.width + 20 || b.y < -20 || b.y > FIELD.height + 20) {
        b.active = false;
        continue;
      }
      for (const e of enemies) {
        if (!e.active) continue;
        if (distance(b.x, b.y, e.x, e.y) > e.radius + 5) continue;
        e.hp -= b.damage;
        burst(b.x, b.y, '#ffe9a8', 4, 160);
        if (e.hp <= 0) {
          killEnemy(e);
          events |= EVENT_KILL;
        } else {
          events |= EVENT_BOLT_HIT;
        }
        if (b.pierce > 0) {
          b.pierce -= 1;
        } else {
          b.active = false;
        }
        break;
      }
    }

    // --- Shards drift, then fly to the player ---
    for (const s of shards) {
      if (!s.active) continue;
      const d = distance(s.x, s.y, player.x, player.y);
      if (d < player.magnet) {
        const pull = 900 * (1 - d / (player.magnet + 1)) + 300;
        s.vx += ((player.x - s.x) / (d || 1)) * pull * dt;
        s.vy += ((player.y - s.y) / (d || 1)) * pull * dt;
      } else {
        s.vx *= Math.max(0, 1 - 3 * dt);
        s.vy *= Math.max(0, 1 - 3 * dt);
      }
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      if (d < 26) {
        s.active = false;
        state.score += s.value;
        state.shardsCollected += 1;
        events |= EVENT_PICKUP;
      }
    }

    // --- Particles fade ---
    for (const p of particles) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) { p.active = false; continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.max(0, 1 - 2 * dt);
      p.vy *= Math.max(0, 1 - 2 * dt);
    }

    // --- Wave clear ---
    if (state.waveState === 'fighting' && state.spawnQueue.length === 0 && alive === 0 && !state.over) {
      state.score += 50 * state.wave;
      if (state.wave >= WAVES) {
        state.won = true;
        state.waveState = 'idle';
        events |= EVENT_WIN;
      } else {
        pickOffer();
        events |= EVENT_WAVE_CLEAR;
      }
    }

    return events;
  }

  reset();
  return { state, reset, step, startWave, applyUpgrade, burst };
}
