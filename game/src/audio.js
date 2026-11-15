// Sound, synthesized with WebAudio: no audio files are shipped. The context is created on
// the first key or click (a browser will not play sound before a gesture), and every effect is
// a short oscillator or noise burst with its own gain envelope. Mute with M.

export function createAudio() {
  let context = null;
  let muted = false;
  let noiseBuffer = null;

  function ensure() {
    if (context !== null) return context;
    try {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return null;
      context = new Ctor();
      noiseBuffer = context.createBuffer(1, context.sampleRate * 0.2, context.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    } catch {
      context = null;
    }
    return context;
  }

  function tone(freq, endFreq, seconds, type, volume, delay = 0) {
    if (muted) return;
    const ctx = ensure();
    if (ctx === null) return;
    try {
      const t0 = ctx.currentTime + delay;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      if (endFreq !== freq) osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), t0 + seconds);
      gain.gain.setValueAtTime(volume, t0);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + seconds);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + seconds + 0.02);
    } catch {
      // Sound is garnish: a failure here must never break the game.
    }
  }

  function noise(seconds, volume, lowpass, delay = 0) {
    if (muted) return;
    const ctx = ensure();
    if (ctx === null || noiseBuffer === null) return;
    try {
      const t0 = ctx.currentTime + delay;
      const source = ctx.createBufferSource();
      source.buffer = noiseBuffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = lowpass;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(volume, t0);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + seconds);
      source.connect(filter).connect(gain).connect(ctx.destination);
      source.start(t0);
      source.stop(t0 + seconds + 0.02);
    } catch {
      // Sound is garnish: a failure here must never break the game.
    }
  }

  return {
    /** Call from a key or click handler so the browser allows sound. */
    unlock() {
      ensure();
    },
    toggleMute() {
      muted = !muted;
      return muted;
    },
    get muted() {
      return muted;
    },
    shoot() {
      tone(920, 420, 0.07, 'square', 0.05);
    },
    hit() {
      noise(0.12, 0.16, 900);
      tone(160, 70, 0.14, 'triangle', 0.14);
    },
    hurt() {
      tone(220, 90, 0.25, 'sawtooth', 0.12);
      noise(0.2, 0.12, 500);
    },
    pickup() {
      tone(1320, 1320, 0.07, 'sine', 0.07);
      tone(1760, 1760, 0.09, 'sine', 0.05, 0.05);
    },
    emberHit() {
      tone(110, 55, 0.3, 'sawtooth', 0.16);
      noise(0.25, 0.14, 400);
    },
    wave() {
      tone(220, 220, 0.16, 'sawtooth', 0.1);
      tone(330, 330, 0.22, 'sawtooth', 0.1, 0.14);
    },
    upgrade() {
      tone(523, 523, 0.09, 'sine', 0.08);
      tone(659, 659, 0.09, 'sine', 0.08, 0.08);
      tone(784, 784, 0.14, 'sine', 0.08, 0.16);
    },
    over() {
      tone(392, 392, 0.2, 'triangle', 0.12);
      tone(311, 311, 0.2, 'triangle', 0.12, 0.18);
      tone(233, 220, 0.42, 'triangle', 0.12, 0.36);
    },
    win() {
      tone(523, 523, 0.12, 'sine', 0.09);
      tone(659, 659, 0.12, 'sine', 0.09, 0.1);
      tone(784, 784, 0.12, 'sine', 0.09, 0.2);
      tone(1047, 1047, 0.28, 'sine', 0.09, 0.3);
    },
  };
}
