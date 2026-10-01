export function createAudio() {
  let ctx = null;
  let engine = null;
  let engineGain = null;
  let roarFilter = null;
  let whineFilter = null;
  let roarGain = null;
  let whineGain = null;
  let master = null;
  let threatOsc = null;
  let threatGain = null;

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

  return {
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
      engineGain.gain.setTargetAtTime(vol, now, 0.08);
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
    warn(urgent = 0) {
      ensure();
      const now = ctx.currentTime;
      const u = Math.max(0, Math.min(1, urgent || 0));
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "square";
      o.frequency.value = 640 + u * 560;
      const dur = 0.09 - u * 0.045;
      g.gain.setValueAtTime(0.04 + u * 0.02, now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      o.connect(g);
      g.connect(master);
      o.start(now);
      o.stop(now + dur + 0.01);
    },
    threat(on, urgent = 1) {
      if (!on) {
        if (!threatOsc || !ctx) return;
        const now = ctx.currentTime;
        const gain = threatGain;
        const osc = threatOsc;
        threatOsc = null;
        threatGain = null;
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);
        osc.stop(now + 0.07);
        return;
      }
      ensure();
      const u = Math.max(0, Math.min(1, urgent || 0));
      const freq = 1040 + u * 280;
      const now = ctx.currentTime;
      if (!threatOsc) {
        threatOsc = ctx.createOscillator();
        threatGain = ctx.createGain();
        threatOsc.type = "square";
        threatOsc.frequency.value = freq;
        threatGain.gain.setValueAtTime(0.0001, now);
        threatGain.gain.exponentialRampToValueAtTime(0.042, now + 0.03);
        threatOsc.connect(threatGain);
        threatGain.connect(master);
        threatOsc.start(now);
      } else {
        threatOsc.frequency.setTargetAtTime(freq, now, 0.04);
      }
    },
    flare() {
      ensure();
      const now = ctx.currentTime;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sawtooth";
      o.frequency.setValueAtTime(1680, now);
      o.frequency.exponentialRampToValueAtTime(380, now + 0.16);
      g.gain.setValueAtTime(0.03, now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
      o.connect(g);
      g.connect(master);
      o.start(now);
      o.stop(now + 0.2);
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
  };
}
