const STATIONS = [
  { name: "Dnipro FM", scale: [0, 2, 4, 7, 9], tempo: 132, wave: "square" },
  { name: "Podil", scale: [0, 3, 5, 7, 10], tempo: 96, wave: "triangle" },
  { name: "Khreshchatyk", scale: [0, 4, 5, 7, 11], tempo: 120, wave: "square" },
  { name: "Night on Obolon", scale: [0, 3, 5, 10, 12], tempo: 78, wave: "sine" },
  { name: "Boryspil", scale: [0, 2, 3, 7, 8], tempo: 126, wave: "sawtooth" },
];

export function createAudio() {
  let ctx = null;
  let engine = null;
  let engineGain = null;
  let roarFilter = null;
  let whineFilter = null;
  let roarGain = null;
  let whineGain = null;
  let master = null;
  let radioGain = null;
  let station = 0;
  let radioOn = false;
  let timer = 0;
  let step = 0;

  function ensure() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    engineGain = ctx.createGain();
    engineGain.gain.value = 0;

    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let brown = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      brown = brown * 0.98 + white * 0.02;
      data[i] = brown * 8;
    }
    const air = ctx.createBufferSource();
    air.buffer = buf;
    air.loop = true;
    roarFilter = ctx.createBiquadFilter();
    roarFilter.type = "lowpass";
    roarFilter.frequency.value = 180;
    roarGain = ctx.createGain();
    roarGain.gain.value = 0.6;
    whineFilter = ctx.createBiquadFilter();
    whineFilter.type = "bandpass";
    whineFilter.frequency.value = 320;
    whineFilter.Q.value = 3.4;
    whineGain = ctx.createGain();
    whineGain.gain.value = 0.2;
    air.connect(roarFilter);
    roarFilter.connect(roarGain);
    roarGain.connect(engineGain);
    air.connect(whineFilter);
    whineFilter.connect(whineGain);
    whineGain.connect(engineGain);
    air.start();

    engine = ctx.createOscillator();
    engine.type = "sine";
    engine.frequency.value = 52;
    const rumble = ctx.createGain();
    rumble.gain.value = 0.35;
    engine.connect(rumble);
    rumble.connect(engineGain);
    engine.start();

    engineGain.connect(master);
    radioGain = ctx.createGain();
    radioGain.gain.value = 0;
    radioGain.connect(master);
  }

  function burst(seconds, color) {
    const n = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let brown = 0;
    for (let i = 0; i < n; i++) {
      const white = Math.random() * 2 - 1;
      brown = brown * color + white * (1 - color);
      const env = Math.pow(1 - i / n, 1.35);
      data[i] = brown * env * 2.2;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    return src;
  }

  function tone(freq, dur, type, gain, when) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(gain, when);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    osc.connect(g);
    g.connect(radioGain);
    osc.start(when);
    osc.stop(when + dur + 0.02);
  }

  function schedule() {
    if (!ctx || !radioOn) return;
    const st = STATIONS[station];
    const beat = 60 / st.tempo;
    const now = ctx.currentTime;
    if (timer < now + 0.2) timer = now + 0.05;
    const base = 196;
    while (timer < now + 1.4) {
      const degree = st.scale[step % st.scale.length];
      const oct = step % 16 < 8 ? 1 : 2;
      const freq = base * 2 ** (degree / 12) * (oct === 2 && step % 4 === 0 ? 0.5 : 1);
      tone(freq, beat * 0.85, st.wave, 0.08, timer);
      if (step % 2 === 0) tone(base / 2, beat * 0.4, "sine", 0.05, timer);
      timer += beat;
      step++;
    }
  }

  return {
    stations: STATIONS,
    get station() { return station; },
    get radioOn() { return radioOn; },
    unlock() {
      ensure();
      ctx.resume();
    },
    setDrive(speed, jets, flying) {
      if (!ctx) return;
      const kmh = Math.abs(speed) * 3.6;
      const burn = !!jets;
      const air = flying || kmh > 40;
      const now = ctx.currentTime;
      const roarF = (burn ? 640 : air ? 260 : 150) + Math.min(380, kmh * 0.12);
      const whineF = Math.min(burn ? 2400 : 860, (air ? 240 : 150) + kmh * (burn ? 0.85 : 0.32));
      roarFilter.frequency.setTargetAtTime(roarF, now, 0.1);
      whineFilter.frequency.setTargetAtTime(Math.max(80, whineF), now, 0.08);
      whineFilter.Q.setTargetAtTime(burn ? 8 : 3.6, now, 0.12);
      engine.frequency.setTargetAtTime(Math.min(burn ? 110 : 78, 42 + kmh * 0.035), now, 0.12);
      roarGain.gain.setTargetAtTime(burn ? 1 : 0.62, now, 0.1);
      whineGain.gain.setTargetAtTime(burn ? 0.7 : air ? 0.28 : 0.12, now, 0.1);
      const vol = Math.min(0.42, (air ? 0.08 : 0.05) + Math.min(kmh, 2400) / 7800 + (burn ? 0.12 : 0));
      engineGain.gain.setTargetAtTime(radioOn ? vol * 0.5 : vol, now, 0.08);
    },
    shot(missile) {
      ensure();
      const now = ctx.currentTime;
      if (missile) {
        const src = burst(0.42, 0.92);
        const f = ctx.createBiquadFilter();
        f.type = "bandpass";
        f.Q.value = 1.4;
        f.frequency.setValueAtTime(280, now);
        f.frequency.exponentialRampToValueAtTime(1400, now + 0.18);
        f.frequency.exponentialRampToValueAtTime(180, now + 0.4);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.22, now);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);
        src.connect(f);
        f.connect(g);
        g.connect(master);
        src.start(now);
        return;
      }
      const src = burst(0.045, 0.2);
      const f = ctx.createBiquadFilter();
      f.type = "highpass";
      f.frequency.value = 900;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.16, now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
      src.connect(f);
      f.connect(g);
      g.connect(master);
      src.start(now);
    },
    boom() {
      ensure();
      const now = ctx.currentTime;
      const src = burst(0.7, 0.97);
      const f = ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.setValueAtTime(2200, now);
      f.frequency.exponentialRampToValueAtTime(70, now + 0.62);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.72, now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.72);
      src.connect(f);
      f.connect(g);
      g.connect(master);
      src.start(now);
      const o = ctx.createOscillator();
      const og = ctx.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(78, now);
      o.frequency.exponentialRampToValueAtTime(26, now + 0.55);
      og.gain.setValueAtTime(0.48, now);
      og.gain.exponentialRampToValueAtTime(0.0001, now + 0.58);
      o.connect(og);
      og.connect(master);
      o.start(now);
      o.stop(now + 0.62);
    },
    stall() {
      ensure();
      const now = ctx.currentTime;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "square";
      o.frequency.setValueAtTime(520, now);
      o.frequency.setValueAtTime(360, now + 0.08);
      g.gain.setValueAtTime(0.05, now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
      o.connect(g);
      g.connect(master);
      o.start(now);
      o.stop(now + 0.18);
    },
    warn() {
      ensure();
      const now = ctx.currentTime;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "square";
      o.frequency.value = 740;
      g.gain.setValueAtTime(0.045, now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.07);
      o.connect(g);
      g.connect(master);
      o.start(now);
      o.stop(now + 0.08);
    },
    say(line) {
      ensure();
      const talk = window.speechSynthesis;
      if (!talk || !line) return;
      const utter = new SpeechSynthesisUtterance(line);
      utter.lang = "en-US";
      utter.rate = 1.04;
      utter.pitch = 0.82;
      utter.volume = 0.95;
      const voice = talk.getVoices().find((v) => /en[-_]US/i.test(v.lang)) || talk.getVoices().find((v) => /^en/i.test(v.lang));
      if (voice) utter.voice = voice;
      talk.cancel();
      talk.speak(utter);
    },
    lock() {
      ensure();
      const now = ctx.currentTime;
      for (let i = 0; i < 2; i++) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = "square";
        o.frequency.value = 920;
        const t = now + i * 0.09;
        g.gain.setValueAtTime(0.04, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
        o.connect(g);
        g.connect(master);
        o.start(t);
        o.stop(t + 0.07);
      }
    },
    horn() {
      ensure();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "square";
      o.frequency.value = 420;
      g.gain.setValueAtTime(0.12, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
      o.connect(g);
      g.connect(master);
      o.start();
      o.stop(ctx.currentTime + 0.4);
    },
    blip(freq = 660) {
      if (!ctx) return;
      tone(freq, 0.12, "square", 0.07, ctx.currentTime);
    },
    toggleRadio() {
      ensure();
      radioOn = !radioOn;
      radioGain.gain.setTargetAtTime(radioOn ? 1 : 0, ctx.currentTime, 0.05);
      if (radioOn) {
        timer = 0;
        schedule();
      }
      return radioOn;
    },
    nextStation() {
      ensure();
      station = (station + 1) % STATIONS.length;
      step = 0;
      timer = 0;
      if (!radioOn) {
        radioOn = true;
        radioGain.gain.setTargetAtTime(1, ctx.currentTime, 0.05);
      }
      return STATIONS[station];
    },
    tick() {
      if (radioOn) schedule();
    },
  };
}
