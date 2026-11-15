// Drawing only: the world's state and the current screen in, pixels out. The 1280x720 playfield
// is scaled to fit the window and centred, the margin filled with the backdrop colour. Flat
// shapes, glow by layered alpha, canvas text for the HUD and the panels. Text that holds a
// number is rebuilt only when the number changes, so a frame allocates nothing.

import { EMBER, FIELD, FONT, PALETTE, PLAYER } from './config.js';
import { KIND_BRUTE, KIND_CRAWLER, KIND_DARTER, KIND_MOTE } from './world.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_UPGRADE = 'upgrade';
export const SCREEN_OVER = 'over';
export const SCREEN_WIN = 'win';

/** The panel's width; its height grows with its lines. */
const PANEL = { width: 640, top: 150, line: 34, bottom: 76 };
const CARD = { width: 340, height: 200, gap: 26, top: 250 };

function cachedLabel(prefix) {
  let value = -1;
  let text = '';
  return function label(next) {
    if (next !== value) {
      value = next;
      text = prefix + next;
    }
    return text;
  };
}

/** A fixed starfield, so the backdrop never changes between frames. */
function makeStars() {
  let a = 1337;
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const stars = [];
  for (let i = 0; i < 90; i += 1) {
    stars.push({ x: next() * FIELD.width, y: next() * FIELD.height, r: 0.6 + next() * 1.4, a: 0.25 + next() * 0.55 });
  }
  return stars;
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const stars = makeStars();
  const scoreLabel = cachedLabel('Score ');
  const waveLabel = cachedLabel('Wave ');
  const finalLabel = cachedLabel('Score ');
  const bestLabel = cachedLabel('Best ');
  const shardsLabel = cachedLabel('');

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
  }

  /** Convert a client (mouse) point to playfield coordinates. */
  function toField(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    const px = (clientX - rect.left) * ratio;
    const py = (clientY - rect.top) * ratio;
    return { x: (px - view.x) / view.scale, y: (py - view.y) / view.scale };
  }

  const fonts = new Map();
  function text(value, x, y, size, color, align) {
    if (!fonts.has(size)) fonts.set(size, `${size}px ${FONT}`);
    context.font = fonts.get(size);
    context.fillStyle = color;
    context.textAlign = align;
    context.fillText(value, x, y);
  }

  function circle(x, y, radius, color) {
    context.fillStyle = color;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }

  function diamond(x, y, radius, color) {
    context.fillStyle = color;
    context.beginPath();
    context.moveTo(x, y - radius);
    context.lineTo(x + radius, y);
    context.lineTo(x, y + radius);
    context.lineTo(x - radius, y);
    context.closePath();
    context.fill();
  }

  function drawStars() {
    for (const star of stars) {
      context.globalAlpha = star.a;
      context.fillStyle = PALETTE.star;
      context.fillRect(star.x, star.y, star.r, star.r);
    }
    context.globalAlpha = 1;
  }

  function drawEmber(state, time) {
    const pulse = 1 + Math.sin(time * 2.2) * 0.06;
    const glow = context.createRadialGradient(EMBER.x, EMBER.y, 4, EMBER.x, EMBER.y, 110 * pulse);
    glow.addColorStop(0, 'rgba(255, 123, 47, 0.55)');
    glow.addColorStop(0.5, 'rgba(255, 123, 47, 0.16)');
    glow.addColorStop(1, 'rgba(255, 123, 47, 0)');
    context.fillStyle = glow;
    context.fillRect(EMBER.x - 120, EMBER.y - 120, 240, 240);
    diamond(EMBER.x, EMBER.y, EMBER.radius * pulse, PALETTE.emberCore);
    diamond(EMBER.x, EMBER.y, EMBER.radius * 0.55 * pulse, PALETTE.emberRing);
    // Ember health ring: a full ring at full health, shrinking as it is bitten.
    const frac = state.ember.hp / state.ember.maxHp;
    context.strokeStyle = frac > 0.4 ? PALETTE.emberRing : PALETTE.danger;
    context.lineWidth = 4;
    context.beginPath();
    context.arc(EMBER.x, EMBER.y, EMBER.radius + 12, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
    context.stroke();
  }

  function drawEnemy(e, time) {
    const bob = Math.sin(time * 3 + e.wobble) * 2;
    if (e.kind === KIND_MOTE) {
      circle(e.x, e.y + bob, e.radius, PALETTE.mote);
      circle(e.x, e.y + bob, e.radius * 0.45, '#d1b3ff');
    } else if (e.kind === KIND_CRAWLER) {
      context.save();
      context.translate(e.x, e.y + bob);
      context.rotate(Math.PI / 4);
      context.fillStyle = PALETTE.crawler;
      context.fillRect(-e.radius * 0.7, -e.radius * 0.7, e.radius * 1.4, e.radius * 1.4);
      context.restore();
      circle(e.x, e.y + bob, e.radius * 0.3, '#e1bee7');
    } else if (e.kind === KIND_DARTER) {
      const angle = Math.atan2(e.vy, e.vx);
      context.save();
      context.translate(e.x, e.y);
      context.rotate(angle);
      context.fillStyle = PALETTE.darter;
      context.beginPath();
      context.moveTo(e.radius + 6, 0);
      context.lineTo(-e.radius, -e.radius * 0.9);
      context.lineTo(-e.radius, e.radius * 0.9);
      context.closePath();
      context.fill();
      context.restore();
    } else if (e.kind === KIND_BRUTE) {
      context.fillStyle = PALETTE.brute;
      context.beginPath();
      for (let i = 0; i < 6; i += 1) {
        const angle = (Math.PI / 3) * i + Math.PI / 6;
        const px = e.x + Math.cos(angle) * e.radius;
        const py = e.y + Math.sin(angle) * e.radius;
        if (i === 0) context.moveTo(px, py);
        else context.lineTo(px, py);
      }
      context.closePath();
      context.fill();
      circle(e.x, e.y, e.radius * 0.4, '#7e57c2');
    }
    if (e.hp < e.maxHp) {
      const width = e.radius * 2;
      context.fillStyle = 'rgba(0, 0, 0, 0.45)';
      context.fillRect(e.x - width / 2, e.y - e.radius - 10, width, 5);
      context.fillStyle = PALETTE.danger;
      context.fillRect(e.x - width / 2, e.y - e.radius - 10, width * (e.hp / e.maxHp), 5);
    }
  }

  function drawField(state, time) {
    context.fillStyle = PALETTE.sky;
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    drawStars();
    drawEmber(state, time);
    for (const shard of state.shards) {
      if (!shard.active) continue;
      const twinkle = 0.75 + Math.sin(time * 6 + shard.x) * 0.25;
      context.globalAlpha = twinkle;
      diamond(shard.x, shard.y, 7, PALETTE.shard);
      context.globalAlpha = 1;
    }
    for (const e of state.enemies) {
      if (e.active) drawEnemy(e, time);
    }
    for (const b of state.bolts) {
      if (!b.active) continue;
      circle(b.x, b.y, 5, PALETTE.bolt);
      circle(b.x, b.y, 2.5, '#ffffff');
    }
    for (const p of state.particles) {
      if (!p.active) continue;
      context.globalAlpha = Math.max(0, p.life / p.maxLife);
      circle(p.x, p.y, p.size, p.color);
    }
    context.globalAlpha = 1;

    const player = state.player;
    if (player.invulnerable === 0 || Math.floor(player.invulnerable * 10) % 2 === 1) {
      const glow = context.createRadialGradient(player.x, player.y, 2, player.x, player.y, 42);
      glow.addColorStop(0, 'rgba(255, 209, 102, 0.5)');
      glow.addColorStop(1, 'rgba(255, 209, 102, 0)');
      context.fillStyle = glow;
      context.fillRect(player.x - 44, player.y - 44, 88, 88);
      circle(player.x, player.y, PLAYER.radius, PALETTE.player);
      circle(player.x, player.y, PLAYER.radius * 0.55, PALETTE.playerRing);
    }
  }

  function drawHud(state, muted) {
    context.textBaseline = 'top';
    text(scoreLabel(state.score), 24, 18, 28, PALETTE.text, 'left');
    text(waveLabel(state.wave), FIELD.width / 2, 18, 28, PALETTE.text, 'center');
    // Hearts, top right.
    const heartX = FIELD.width - 24;
    for (let i = 0; i < state.player.maxHearts; i += 1) {
      const x = heartX - i * 34;
      const y = 30;
      context.fillStyle = i < state.player.hearts ? PALETTE.heart : 'rgba(255, 93, 115, 0.25)';
      context.beginPath();
      context.arc(x - 6, y, 7, 0, Math.PI * 2);
      context.arc(x + 6, y, 7, 0, Math.PI * 2);
      context.fill();
      context.beginPath();
      context.moveTo(x - 12, y + 2);
      context.lineTo(x + 12, y + 2);
      context.lineTo(x, y + 14);
      context.closePath();
      context.fill();
    }
    // Ember health bar, under the hearts.
    const barX = FIELD.width - 24 - 190;
    const barY = 56;
    context.fillStyle = 'rgba(0, 0, 0, 0.45)';
    context.fillRect(barX, barY, 190, 12);
    const frac = state.ember.hp / state.ember.maxHp;
    context.fillStyle = frac > 0.4 ? PALETTE.emberCore : PALETTE.danger;
    context.fillRect(barX, barY, 190 * frac, 12);
    text('EMBER', barX - 10, 52, 18, PALETTE.muted, 'right');
    // Shards, bottom left.
    diamond(36, FIELD.height - 28, 8, PALETTE.shard);
    text(shardsLabel(state.shardsCollected), 52, FIELD.height - 40, 22, PALETTE.text, 'left');
    if (muted) text('Muted (M)', FIELD.width - 24, FIELD.height - 40, 18, PALETTE.muted, 'right');
  }

  function drawPanel(title, lines, prompt) {
    const height = PANEL.top + lines.length * PANEL.line + PANEL.bottom;
    const x = (FIELD.width - PANEL.width) / 2;
    const y = (FIELD.height - height) / 2;
    context.fillStyle = PALETTE.panel;
    context.fillRect(x, y, PANEL.width, height);
    context.strokeStyle = PALETTE.panelEdge;
    context.lineWidth = 2;
    context.strokeRect(x, y, PANEL.width, height);
    context.textBaseline = 'alphabetic';
    text(title, FIELD.width / 2, y + 78, 48, PALETTE.text, 'center');
    for (let index = 0; index < lines.length; index += 1) {
      text(lines[index], FIELD.width / 2, y + PANEL.top + index * PANEL.line, 22, PALETTE.muted, 'center');
    }
    text(prompt, FIELD.width / 2, y + height - 38, 24, PALETTE.gold, 'center');
  }

  function drawUpgrade(state, best) {
    const total = CARD.width * 3 + CARD.gap * 2;
    const startX = (FIELD.width - total) / 2;
    const boxes = [];
    text(`Wave ${state.wave} cleared!  Choose an upgrade.`, FIELD.width / 2, 120, 36, PALETTE.text, 'center');
    text(`Score ${state.score}   Best ${best}`, FIELD.width / 2, 168, 22, PALETTE.muted, 'center');
    for (let i = 0; i < state.offer.length; i += 1) {
      const upgrade = state.offer[i];
      const x = startX + i * (CARD.width + CARD.gap);
      const y = CARD.top;
      boxes.push({ x, y, width: CARD.width, height: CARD.height });
      context.fillStyle = PALETTE.panel;
      context.fillRect(x, y, CARD.width, CARD.height);
      context.strokeStyle = PALETTE.panelEdge;
      context.lineWidth = 2;
      context.strokeRect(x, y, CARD.width, CARD.height);
      context.textBaseline = 'alphabetic';
      text(`[${i + 1}]`, x + CARD.width / 2, y + 44, 22, PALETTE.gold, 'center');
      text(upgrade.name, x + CARD.width / 2, y + 88, 28, PALETTE.text, 'center');
      // Wrap the upgrade text to two lines at most.
      const words = upgrade.text.split(' ');
      let line = '';
      const lines = [];
      for (const word of words) {
        if ((line + ' ' + word).trim().length > 26) {
          lines.push(line.trim());
          line = word;
        } else line += ' ' + word;
      }
      lines.push(line.trim());
      for (let li = 0; li < lines.length; li += 1) {
        text(lines[li], x + CARD.width / 2, y + 130 + li * 28, 20, PALETTE.muted, 'center');
      }
    }
    text('Click a card, or press 1, 2 or 3', FIELD.width / 2, CARD.top + CARD.height + 48, 22, PALETTE.gold, 'center');
    window.__emberCards = (px, py) => {
      for (let i = 0; i < boxes.length; i += 1) {
        const box = boxes[i];
        if (px >= box.x && px <= box.x + box.width && py >= box.y && py <= box.y + box.height) return i + 1;
      }
      return 0;
    };
  }

  const TITLE_LINES = [
    'Defend the last ember. The dark is coming for it.',
    'Move with WASD or arrows. Aim with the mouse.',
    'Hold click to fire. Foes that reach the ember bite it.',
    'Lose the ember, or all your hearts, and the light goes out.',
    'Clear 10 waves to win. Between waves, choose one upgrade.',
    '',
  ];
  const PAUSED_LINES = ['The dark will wait for you.'];
  const OVER_LINES = ['', '', ''];

  /** Paint one frame: the field, then the HUD or a panel for the screen the game is on. */
  function draw(state, screen, best, extras) {
    const time = state.elapsed;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    drawField(state, time);
    if (screen === SCREEN_TITLE) {
      TITLE_LINES[5] = bestLabel(best);
      drawPanel('EMBER WARDEN', TITLE_LINES, 'Press Space or click to start');
      return;
    }
    drawHud(state, extras.muted);
    if (screen === SCREEN_UPGRADE) {
      drawUpgrade(state, best);
      return;
    }
    if (screen === SCREEN_PAUSED) {
      drawPanel('Paused', PAUSED_LINES, 'Press P to resume');
      return;
    }
    if (screen === SCREEN_OVER) {
      OVER_LINES[0] = state.ember.hp <= 0 ? 'The ember has gone out.' : 'The warden has fallen.';
      OVER_LINES[1] = `You reached wave ${state.wave} with ${finalLabel(state.score)}`;
      OVER_LINES[2] = bestLabel(best);
      drawPanel('Game over', OVER_LINES, 'Press Space or click to play again');
      return;
    }
    if (screen === SCREEN_WIN) {
      drawPanel('The ember burns on!', [`You cleared all 10 waves with ${finalLabel(state.score)}`, bestLabel(best), ''], 'Press Space or click to play again');
      return;
    }
    // SCREEN_PLAY: draw the aim reticle at the mouse.
    if (extras.aim) {
      context.strokeStyle = 'rgba(255, 233, 168, 0.8)';
      context.lineWidth = 2;
      context.beginPath();
      context.arc(extras.aim.x, extras.aim.y, 12, 0, Math.PI * 2);
      context.stroke();
      context.beginPath();
      context.moveTo(extras.aim.x - 18, extras.aim.y);
      context.lineTo(extras.aim.x - 8, extras.aim.y);
      context.moveTo(extras.aim.x + 8, extras.aim.y);
      context.lineTo(extras.aim.x + 18, extras.aim.y);
      context.moveTo(extras.aim.x, extras.aim.y - 18);
      context.lineTo(extras.aim.x, extras.aim.y - 8);
      context.moveTo(extras.aim.x, extras.aim.y + 8);
      context.lineTo(extras.aim.x, extras.aim.y + 18);
      context.stroke();
    }
  }

  resize();
  window.addEventListener('resize', resize);
  window.__emberCards = () => 0;
  return { draw, toField };
}
