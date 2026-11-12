/**
 * Win celebration: confetti over the whole screen plus a short fanfare.
 * Each player picks the confetti style in Settings (it only changes their own
 * screen). Everything is drawn and played by code, so there are no picture
 * or sound files to download.
 */

export type CelebrationStyle = 'cannons' | 'lucky' | 'chips' | 'fireworks';
export const CELEBRATION_STYLES: CelebrationStyle[] = ['cannons', 'lucky', 'chips', 'fireworks'];

// ---------------------------------------------------------------- sound ---

let ctx: AudioContext | null = null;
let master: GainNode | null = null;

function audio(): AudioContext | null {
  try {
    if (!ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      // A compressor lets the fanfare be loud without crackling.
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.knee.value = 8;
      comp.ratio.value = 6;
      comp.attack.value = 0.003;
      comp.release.value = 0.2;
      master = ctx.createGain();
      master.gain.value = 0.8;
      master.connect(comp).connect(ctx.destination);
    }
    if (ctx.state !== 'running') void ctx.resume().catch(() => undefined);
    return ctx;
  } catch {
    return null;
  }
}

/**
 * Phones only allow sound after the person has touched the page. Call this
 * once at start-up: the first tap anywhere switches sound on, so a win later
 * (even someone else's) can be heard.
 */
export function unlockAudioOnFirstTouch(): void {
  const unlock = (): void => {
    const c = audio();
    if (c && c.state === 'running') {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    }
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
}

/** The win fanfare: "da-da-da-DAAA" (sound D, louder). */
export function playFanfare(): void {
  const c = audio();
  if (!c || !master) return;
  const t = c.currentTime + 0.05;
  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.value = 2;
  filter.frequency.setValueAtTime(1000, t);
  filter.frequency.linearRampToValueAtTime(3600, t + 0.6);
  filter.frequency.exponentialRampToValueAtTime(1400, t + 1.5);
  const boost = c.createGain();
  boost.gain.value = 2.6;
  filter.connect(boost).connect(master);
  const G4 = 392;
  const C5 = 523.25;
  const notes: [number, number, number][] = [[G4, 0, 0.13], [G4, 0.15, 0.13], [G4, 0.3, 0.13], [C5, 0.45, 0.9]];
  for (const [n, at, d] of notes) {
    [n, n * 1.26, n * 1.5].forEach((freq, j) => {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = 'sawtooth';
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t + at);
      g.gain.exponentialRampToValueAtTime(j ? 0.09 : 0.15, t + at + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + at + d);
      o.connect(g).connect(filter);
      o.start(t + at);
      o.stop(t + at + d + 0.05);
    });
  }
}

// ------------------------------------------------------------- confetti ---

interface Particle {
  kind: 'paper' | 'streamer' | 'coin' | 'spark';
  x: number;
  y: number;
  vx: number;
  vy: number;
  drag: number;
  grav: number;
  life: number;
  age: number;
  color: string;
  // paper
  w?: number;
  h?: number;
  rot?: number;
  vr?: number;
  flip?: number;
  vf?: number;
  // streamer
  len?: number;
  wave?: number;
  vw?: number;
  // coin
  r?: number;
  spin?: number;
  vs?: number;
  // spark
  trail?: [number, number][];
}

const PARTY = ['#f5c542', '#e8463f', '#3fa7e8', '#6fd08c', '#b46be8', '#ff8fb1', '#ffffff'];
const LUCKY = ['#d42a2a', '#f5c542', '#ffde7a', '#b8121b'];
const rand = (a: number, b: number): number => a + Math.random() * (b - a);
const pick = <T,>(list: T[]): T => list[Math.floor(Math.random() * list.length)]!;

let canvas: HTMLCanvasElement | null = null;
let parts: Particle[] = [];
let running = false;
let last = 0;
let W = 0;
let H = 0;
let timers: ReturnType<typeof setTimeout>[] = [];

/** Bigger pieces on bigger screens. */
const S = (): number => Math.max(0.7, Math.min(Math.min(W, H * 1.6) / 700, 1.6));

function paper(x: number, y: number, vx: number, vy: number, colors: string[]): Particle {
  return { kind: 'paper', x, y, vx, vy, w: rand(6, 11) * S(), h: rand(9, 16) * S(), rot: rand(0, 6.28), vr: rand(-6, 6), flip: rand(0, 6.28), vf: rand(5, 12), color: pick(colors), drag: 0.985, grav: 260, life: rand(3, 4.2), age: 0 };
}
function streamer(x: number, y: number, colors: string[]): Particle {
  return { kind: 'streamer', x, y, vx: rand(-20, 20), vy: rand(40, 110), len: rand(26, 46) * S(), wave: rand(0, 6.28), vw: rand(4, 8), color: pick(colors), drag: 1, grav: 30, life: 4.5, w: 3.2 * S(), age: 0 };
}
function coin(x: number, y: number, vx: number, vy: number): Particle {
  return { kind: 'coin', x, y, vx, vy, r: rand(6, 10) * S(), spin: rand(0, 6.28), vs: rand(6, 12), color: '#f5c542', drag: 0.99, grav: 520, life: 3.6, age: 0 };
}
function spark(x: number, y: number, angle: number, speed: number, color: string): Particle {
  return { kind: 'spark', x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, color, drag: 0.955, grav: 90, life: rand(1.1, 1.7), trail: [], age: 0 };
}

const LAUNCH: Record<CelebrationStyle, () => void> = {
  // A: colourful paper shoots up from both bottom corners.
  cannons: () => {
    const n = Math.round(90 * Math.min(1.5, S()));
    for (let i = 0; i < n; i++) parts.push(paper(0, H, rand(160, 420) * S(), -rand(380, 640) * S(), PARTY));
    for (let i = 0; i < n; i++) parts.push(paper(W, H, -rand(160, 420) * S(), -rand(380, 640) * S(), PARTY));
  },
  // B: red and gold paper and ribbons rain from the top.
  lucky: () => {
    for (let i = 0; i < 140; i++) parts.push(paper(rand(0, W), rand(-H * 0.6, -10), rand(-30, 30), rand(30, 120), LUCKY));
    for (let i = 0; i < 30; i++) parts.push(streamer(rand(0, W), rand(-H * 0.5, -20), LUCKY));
  },
  // D: yellow chips burst up from the middle and bounce.
  chips: () => {
    for (let i = 0; i < 80; i++) parts.push(coin(W / 2 + rand(-30, 30), H * 0.62, rand(-340, 340) * S(), -rand(300, 650) * S()));
  },
  // E: three bursts of sparks, one after another.
  fireworks: () => {
    const boom = (x: number, y: number, colors: string[]): void => {
      for (let i = 0; i < 80; i++) parts.push(spark(x, y, rand(0, 6.28), rand(60, 260) * S(), pick(colors)));
      start();
    };
    boom(W * 0.25, H * 0.28, ['#f5c542', '#ffde7a', '#ffffff']);
    timers.push(setTimeout(() => boom(W * 0.75, H * 0.25, ['#e8463f', '#ff8fb1', '#ffffff']), 380));
    timers.push(setTimeout(() => boom(W * 0.5, H * 0.18, ['#3fa7e8', '#6fd08c', '#f5c542']), 760));
  },
};

function draw(g: CanvasRenderingContext2D, p: Particle): void {
  g.globalAlpha = Math.max(0, Math.min(1, (p.life - p.age) / 0.6));
  if (p.kind === 'paper') {
    g.save();
    g.translate(p.x, p.y);
    g.rotate(p.rot!);
    g.scale(1, Math.cos(p.flip!));
    g.fillStyle = p.color;
    g.fillRect(-p.w! / 2, -p.h! / 2, p.w!, p.h!);
    g.restore();
  } else if (p.kind === 'streamer') {
    g.strokeStyle = p.color;
    g.lineWidth = p.w!;
    g.lineCap = 'round';
    g.beginPath();
    for (let i = 0; i <= 10; i++) {
      const k = i / 10;
      const yy = p.y - k * p.len!;
      const xx = p.x + Math.sin(p.wave! + k * 5) * 6 * S();
      if (i) g.lineTo(xx, yy);
      else g.moveTo(xx, yy);
    }
    g.stroke();
  } else if (p.kind === 'coin') {
    g.save();
    g.translate(p.x, p.y);
    g.scale(Math.abs(Math.cos(p.spin!)) * 0.85 + 0.15, 1);
    g.fillStyle = '#c99a1e';
    g.beginPath();
    g.arc(0, 1.5, p.r!, 0, 6.28);
    g.fill();
    g.fillStyle = '#f5c542';
    g.beginPath();
    g.arc(0, 0, p.r!, 0, 6.28);
    g.fill();
    g.restore();
  } else {
    g.strokeStyle = p.color;
    g.lineWidth = 2 * S();
    g.beginPath();
    p.trail!.forEach((pt, i) => (i ? g.lineTo(pt[0], pt[1]) : g.moveTo(pt[0], pt[1])));
    g.lineTo(p.x, p.y);
    g.stroke();
    g.fillStyle = p.color;
    g.beginPath();
    g.arc(p.x, p.y, 1.8 * S(), 0, 6.28);
    g.fill();
  }
  g.globalAlpha = 1;
}

function frame(now: number): void {
  if (!canvas) return;
  const g = canvas.getContext('2d')!;
  const dt = Math.min(0.033, (now - last) / 1000 || 0.016);
  last = now;
  g.clearRect(0, 0, W, H);
  parts = parts.filter((p) => (p.age += dt) < p.life);
  for (const p of parts) {
    if (p.kind === 'spark') {
      p.trail!.push([p.x, p.y]);
      if (p.trail!.length > 6) p.trail!.shift();
    }
    p.vx *= p.drag;
    p.vy = p.vy * p.drag + p.grav * dt;
    if (p.kind === 'paper') p.vy = Math.min(p.vy, 150 * S());
    if (p.kind === 'streamer') {
      p.wave! += p.vw! * dt;
      p.vy = Math.min(p.vy, 120 * S());
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.rot !== undefined) p.rot += p.vr! * dt;
    if (p.flip !== undefined) p.flip += p.vf! * dt;
    if (p.spin !== undefined) p.spin += p.vs! * dt;
    if (p.kind === 'coin' && p.y > H - p.r!) {
      p.y = H - p.r!;
      p.vy *= -0.45;
      p.vx *= 0.8;
    }
    draw(g, p);
  }
  if (parts.length) requestAnimationFrame(frame);
  else stop();
}

function start(): void {
  if (running) return;
  running = true;
  last = performance.now();
  requestAnimationFrame(frame);
}

function stop(): void {
  running = false;
  parts = [];
  canvas?.remove();
  canvas = null;
}

/** Throw confetti over the whole screen in this style (it never blocks taps). */
export function throwConfetti(style: CelebrationStyle): void {
  timers.forEach(clearTimeout);
  timers = [];
  parts = [];
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.className = 'celebration';
    canvas.setAttribute('aria-hidden', 'true');
    document.body.appendChild(canvas);
  }
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  canvas.getContext('2d')!.setTransform(dpr, 0, 0, dpr, 0, 0);
  (LAUNCH[style] ?? LAUNCH.cannons)();
  start();
}

/** Someone won: confetti in this player's chosen style, and the fanfare. */
export function celebrate(style: CelebrationStyle): void {
  throwConfetti(style);
  playFanfare();
}
