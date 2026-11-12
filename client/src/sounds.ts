/**
 * Sound effects, made in the browser (no sound files).
 *
 * Window break ("big pane"): a short bright hit with no low thump, then a shower of glass
 * shards, each ringing briefly at its own pitch, thinning out over about two seconds, in
 * a little room echo. Played the first time in a hand that someone draws a flower that
 * doesn't score for them.
 *
 * Phones only allow sound after the player has touched the screen, so the sound system
 * is switched on at the first tap.
 */

let ctx: AudioContext | null = null;
let noiseBuf: AudioBuffer | null = null;
let roomBuf: AudioBuffer | null = null;

function audio(): AudioContext | null {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx ??= new AC();
    // 'interrupted' (iPad, after the screen locks) also needs waking, not just 'suspended'.
    if (ctx.state !== 'running') void ctx.resume().catch(() => undefined);
    return ctx;
  } catch {
    return null;
  }
}

/**
 * Switch sound on at the first tap or click (phones need this). iPads and iPhones only
 * allow sound to start from a touch, and they can pause it again after the screen locks
 * or the app is switched away from. So: every tap tries to wake it, until it's running.
 */
export function unlockSoundOnFirstTap(): void {
  const wake = (): void => {
    const a = audio();
    if (!a) return;
    // Playing a silent sound inside the touch is what iPad Safari needs to unlock audio.
    const silent = a.createBuffer(1, 1, a.sampleRate);
    const src = a.createBufferSource();
    src.buffer = silent;
    src.connect(a.destination);
    src.start(0);
    if (a.state === 'running') {
      window.removeEventListener('pointerdown', wake);
      window.removeEventListener('keydown', wake);
    }
  };
  window.addEventListener('pointerdown', wake);
  window.addEventListener('keydown', wake);
}

const rnd = (a: number, b: number): number => a + Math.random() * (b - a);

function noise(a: AudioContext): AudioBufferSourceNode {
  if (!noiseBuf) {
    noiseBuf = a.createBuffer(1, a.sampleRate * 2, a.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const s = a.createBufferSource();
  s.buffer = noiseBuf;
  return s;
}

/** A little room echo around the sound. */
function room(a: AudioContext, out: AudioNode, amount: number): AudioNode {
  if (!roomBuf) {
    const len = Math.floor(a.sampleRate * 0.9);
    roomBuf = a.createBuffer(2, len, a.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = roomBuf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.5);
    }
  }
  const conv = a.createConvolver();
  conv.buffer = roomBuf;
  const wet = a.createGain();
  wet.gain.value = amount;
  const input = a.createGain();
  input.connect(out);
  input.connect(conv).connect(wet).connect(out);
  return input;
}

/** The first hit: very short and bright (nothing below 1.5 kHz). */
function impact(a: AudioContext, out: AudioNode, t: number, gain: number): void {
  const n = noise(a);
  const hp = a.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 1500;
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.002);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
  n.connect(hp).connect(g).connect(out);
  n.start(t, Math.random());
  n.stop(t + 0.1);
  const n2 = noise(a);
  const bp = a.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 3200;
  bp.Q.value = 1.2;
  const g2 = a.createGain();
  g2.gain.setValueAtTime(gain * 0.6, t);
  g2.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
  n2.connect(bp).connect(g2).connect(out);
  n2.start(t, Math.random());
  n2.stop(t + 0.25);
}

/** One shard: a tiny click, then a short ring with a few uneven overtones. */
function shard(a: AudioContext, out: AudioNode, t: number, gain: number): void {
  const f0 = rnd(1800, 6500);
  const decay = rnd(0.03, 0.22) * (3000 / f0 + 0.5);
  [1, 2.32, 4.25, 6.63].forEach((ratio, k) => {
    const f = f0 * ratio * rnd(0.98, 1.02);
    if (f > 15000) return;
    const o = a.createOscillator();
    o.type = 'sine';
    o.frequency.value = f;
    const g = a.createGain();
    const amp = gain * [1, 0.45, 0.25, 0.12][k]!;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(amp, t + 0.001);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay / (1 + k * 0.6));
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + decay + 0.02);
  });
  const n = noise(a);
  const bp = a.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = f0;
  bp.Q.value = 6;
  const g = a.createGain();
  g.gain.setValueAtTime(gain * 0.8, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.012);
  n.connect(bp).connect(g).connect(out);
  n.start(t, Math.random());
  n.stop(t + 0.03);
}

function shower(a: AudioContext, out: AudioNode, t: number, len: number, count: number, loud: number): void {
  for (let i = 0; i < count; i++) {
    const k = Math.pow(Math.random(), 2.2);
    shard(a, out, t + k * len, loud * rnd(0.4, 1) * (1 - k * 0.75));
  }
}

/** A window breaking (about 2 seconds). */
export function playWindowBreak(volume = 0.5): void {
  const a = audio();
  if (!a) return;
  // If the sound was paused (e.g. the screen locked), wake it first, then play.
  if (a.state === 'running') playOn(a, volume);
  else void a.resume().then(() => playOn(a, volume)).catch(() => undefined);
}

function playOn(a: AudioContext, volume: number): void {
  const master = a.createGain();
  master.gain.value = volume;
  master.connect(a.destination);
  const out = room(a, master, 0.35);
  const t = a.currentTime + 0.02;
  impact(a, out, t, 1);
  shower(a, out, t + 0.005, 0.5, 50, 0.13);
  shower(a, out, t + 0.25, 1.6, 45, 0.08);
}
