// Efeitos sonoros procedurais (WebAudio), sem arquivos. São stand-ins: depois
// dá para trocar por sons gravados mantendo esta mesma interface.
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;
let voices = 0;
const MAX_VOICES = 10;

function audio(): AudioContext | null {
  if (muted) return null;
  if (!ctx) {
    try {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = 0.22;
      master.connect(ctx.destination);
    } catch {
      return null;
    }
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

// aleatoriedade só cosmética (variação de tom), separada da do gameplay
const jitter = (amt: number) => 1 + (Math.random() * 2 - 1) * amt;

function tone(freq: number, end: number, dur: number, type: OscillatorType, vol: number, delay = 0) {
  const c = audio();
  if (!c || !master || voices >= MAX_VOICES) return;
  const t0 = c.currentTime + delay;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, end), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g);
  g.connect(master);
  voices++;
  osc.onended = () => {
    voices--;
  };
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noise(dur: number, vol: number, cutoff: number, delay = 0) {
  const c = audio();
  if (!c || !master || voices >= MAX_VOICES) return;
  const t0 = c.currentTime + delay;
  const n = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, n, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  const filter = c.createBiquadFilter();
  const g = c.createGain();
  src.buffer = buf;
  filter.type = 'lowpass';
  filter.frequency.value = cutoff;
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filter);
  filter.connect(g);
  g.connect(master);
  voices++;
  src.onended = () => {
    voices--;
  };
  src.start(t0);
}

export const sfx = {
  shoot: () => tone(880 * jitter(0.08), 330, 0.07, 'square', 0.04),
  hit: () => tone(240 * jitter(0.1), 120, 0.05, 'square', 0.06),
  kill: (big: boolean) => {
    if (big) {
      noise(0.18, 0.18, 1200);
      tone(160, 50, 0.25, 'sawtooth', 0.12);
    } else {
      noise(0.07, 0.1, 2500);
      tone(300 * jitter(0.12), 120, 0.08, 'triangle', 0.08);
    }
  },
  hurt: () => {
    noise(0.12, 0.2, 900);
    tone(120, 60, 0.15, 'sawtooth', 0.12);
  },
  buy: () => {
    tone(660, 660, 0.07, 'square', 0.07);
    tone(990, 990, 0.1, 'square', 0.07, 0.07);
  },
  deny: () => tone(140, 110, 0.12, 'square', 0.08),
  click: () => tone(520, 520, 0.04, 'square', 0.05),
  waveStart: () => tone(330, 660, 0.18, 'sawtooth', 0.07),
  waveEnd: () => {
    tone(523, 523, 0.1, 'triangle', 0.08);
    tone(659, 659, 0.1, 'triangle', 0.08, 0.1);
    tone(784, 784, 0.2, 'triangle', 0.08, 0.2);
  },
  ghost: () => {
    tone(110, 80, 0.6, 'sawtooth', 0.1);
    tone(114, 82, 0.6, 'sawtooth', 0.1);
  },
  ghostDown: () => {
    noise(0.4, 0.25, 1500);
    tone(200, 40, 0.5, 'sawtooth', 0.14);
    tone(784, 1568, 0.3, 'triangle', 0.09, 0.15);
  },
  death: () => {
    tone(300, 40, 0.6, 'sawtooth', 0.14);
    noise(0.4, 0.2, 700);
  },
  psycho: () => {
    tone(880, 60, 0.7, 'square', 0.09);
    tone(870, 50, 0.7, 'square', 0.09);
    noise(0.5, 0.14, 3000);
  },
  win: () => {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.14, 'triangle', 0.08, i * 0.1));
  },
  // retorna true quando o som ficou ligado
  toggleMute: () => {
    muted = !muted;
    return !muted;
  },
};
