export function createAudio() {
  let ctx = null;
  let engine = null;
  let engineGain = null;
  let roarFilter = null;
  let whineFilter = null;
  let roarGain = null;
  let whineGain = null;
  let master = null;
  let blade = null;
  let bladeGain = null;
  let quietUntil = 0;
  let quietPri = 0;
  let cabinVoice = null;
  let callToken = 0;
  let cabinSrc = null;
  const clipCache = new Map();
  let voiceOn = true;
  try { voiceOn = localStorage.getItem("kievride-voice") !== "0"; } catch { /* keep talking */ }

  function voiceScore(v) {
    const name = v.name || "";
    const lang = v.lang || "";
    const blob = lang + " " + name;
    if (/en-IN|india|heera|ravi|kalpana|neerja|swara|irina|pavel/i.test(blob)) return -1;
    if (!/en-US|en-GB|en-AU/i.test(lang)) return -1;
    let score = /en-US/i.test(lang) ? 30 : /en-GB/i.test(lang) ? 18 : 8;
    if (/aria|jenny|zira|samantha|google us english/i.test(name)) score += 80;
    else if (/ana|hazel|libby|sonia|susan|serena|moira|karen|fiona|kate/i.test(name)) score += 50;
    if (/natural/i.test(name)) score += 12;
    if (/female/i.test(name)) score += 12;
    if (/david|mark\b|guy|george|daniel|ryan|\bmale\b/i.test(name)) score -= 25;
    if (v.localService) score += 3;
    return score;
  }

  function pickVoice() {
    if (typeof speechSynthesis === "undefined") return null;
    const voices = speechSynthesis.getVoices?.() || [];
    let best = null;
    let bestScore = 0;
    for (const v of voices) {
      const score = voiceScore(v);
      if (score > bestScore) {
        bestScore = score;
        best = v;
      }
    }
    if (best) cabinVoice = best;
    return cabinVoice;
  }
  if (typeof speechSynthesis !== "undefined") {
    pickVoice();
    speechSynthesis.addEventListener?.("voiceschanged", pickVoice);
  }
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

    blade = ctx.createOscillator();
    blade.type = "triangle";
    blade.frequency.value = 180;
    bladeGain = ctx.createGain();
    bladeGain.gain.value = 0;
    blade.connect(bladeGain);
    bladeGain.connect(engineGain);
    blade.start();

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

  function clipSlug(text) {
    return String(text).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  }

  function stopCabin() {
    if (!cabinSrc) return;
    try { cabinSrc.stop(); } catch { /* already ended */ }
    cabinSrc = null;
  }

  function playCabin(buffer) {
    ensure();
    stopCabin();
    const src = ctx.createBufferSource();
    const gain = ctx.createGain();
    gain.gain.value = 0.92;
    src.buffer = buffer;
    src.connect(gain);
    gain.connect(ctx.destination);
    cabinSrc = src;
    src.onended = () => { if (cabinSrc === src) cabinSrc = null; };
    if (ctx.state === "suspended") ctx.resume();
    src.start();
  }

  function loadClip(text) {
    const slug = clipSlug(text);
    if (clipCache.has(slug)) return clipCache.get(slug);
    const pending = fetch("/voice/" + slug + ".wav")
      .then((res) => {
        if (!res.ok) throw new Error("missing");
        return res.arrayBuffer();
      })
      .then((raw) => {
        ensure();
        return ctx.decodeAudioData(raw.slice(0));
      })
      .catch(() => null);
    clipCache.set(slug, pending);
    return pending;
  }

  function speakFallback(text) {
    if (typeof speechSynthesis === "undefined") return;
    const voice = pickVoice();
    if (!voice) return;
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = "en-US";
    utter.rate = 0.96;
    utter.pitch = 1;
    utter.volume = 1;
    utter.voice = voice;
    if (speechSynthesis.paused) speechSynthesis.resume();
    speechSynthesis.speak(utter);
  }

  return {
    unlock() {
      ensure();
      ctx.resume();
    },
    setDrive(speed, jets, flying, throttle = 0) {
      if (!ctx) return;
      const kmh = Math.abs(speed) * 3.6;
      const thr = Math.max(0, Math.min(1, throttle || 0));
      const burn = !!jets;
      const air = flying || kmh > 35;
      const spool = 0.28 + thr * 0.72;
      const now = ctx.currentTime;
      const roarF = 160 + Math.min(640, kmh * 0.28) + spool * 50;
      const whineF = (burn ? 900 : 420) + spool * (burn ? 1100 : 520) + Math.min(burn ? 1400 : 360, kmh * (burn ? 0.4 : 0.14));
      const bladeF = (burn ? 240 : 120) + spool * (burn ? 280 : 150) + Math.min(burn ? 420 : 160, kmh * 0.08);
      roarFilter.frequency.setTargetAtTime(roarF, now, 0.12);
      whineFilter.frequency.setTargetAtTime(Math.max(140, whineF), now, 0.08);
      whineFilter.Q.setTargetAtTime(burn ? 6.5 : 4.2, now, 0.12);
      engine.frequency.setTargetAtTime(62 + spool * 28 + Math.min(36, kmh * 0.012), now, 0.1);
      blade.frequency.setTargetAtTime(bladeF, now, 0.08);
      roarGain.gain.setTargetAtTime(air ? 0.28 + Math.min(0.38, kmh / 1100) : 0.1 + thr * 0.12, now, 0.1);
      whineGain.gain.setTargetAtTime((air ? 0.1 : 0.04) + spool * (burn ? 0.42 : 0.24), now, 0.08);
      bladeGain.gain.setTargetAtTime(thr > 0.04 || air ? 0.16 + spool * 0.28 : 0.02, now, 0.1);
      const vol = Math.min(0.4, 0.045 + spool * 0.09 + Math.min(kmh, 1800) / 11000 + (burn ? 0.06 : 0));
      engineGain.gain.setTargetAtTime(vol, now, 0.08);
    },
    shot(missile) {
      ensure();
      const now = ctx.currentTime;
      if (missile) {
        const src = burst(0.7, 0.94);
        const f = ctx.createBiquadFilter();
        f.type = "bandpass";
        f.Q.value = 0.7;
        f.frequency.setValueAtTime(140, now);
        f.frequency.exponentialRampToValueAtTime(2200, now + 0.22);
        f.frequency.exponentialRampToValueAtTime(90, now + 0.68);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.42, now);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.7);
        src.connect(f);
        f.connect(g);
        g.connect(master);
        src.start(now);
        const o = ctx.createOscillator();
        const og = ctx.createGain();
        o.type = "sine";
        o.frequency.setValueAtTime(96, now);
        o.frequency.exponentialRampToValueAtTime(34, now + 0.45);
        og.gain.setValueAtTime(0.36, now);
        og.gain.exponentialRampToValueAtTime(0.0001, now + 0.48);
        o.connect(og);
        og.connect(master);
        o.start(now);
        o.stop(now + 0.5);
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
    voiceOn() { return voiceOn; },
    toggleVoice() {
      voiceOn = !voiceOn;
      if (!voiceOn) {
        if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
        stopCabin();
      }
      try { localStorage.setItem("kievride-voice", voiceOn ? "1" : "0"); } catch { /* private mode */ }
      return voiceOn;
    },
    callout(text, priority = 0) {
      if (!voiceOn) return true;
      if (!text) return false;
      const now = performance.now();
      if (now < quietUntil && priority < quietPri) return false;
      quietPri = priority;
      quietUntil = now + 1050;
      const mine = ++callToken;
      if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
      stopCabin();
      loadClip(text).then((buffer) => {
        if (mine !== callToken) return;
        if (buffer) playCabin(buffer);
        else speakFallback(text);
      });
      return true;
    },
    touch(firm = 0.3) {
      ensure();
      const now = ctx.currentTime;
      const hard = Math.max(0.18, Math.min(1, firm || 0));
      const src = burst(0.26 + hard * 0.2, 0.62);
      const f = ctx.createBiquadFilter();
      f.type = "bandpass";
      f.Q.value = 5;
      f.frequency.setValueAtTime(2100, now);
      f.frequency.exponentialRampToValueAtTime(380, now + 0.22);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.06 + hard * 0.2, now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.28 + hard * 0.12);
      src.connect(f);
      f.connect(g);
      g.connect(master);
      src.start(now);
      const thud = burst(0.1, 0.92);
      const low = ctx.createBiquadFilter();
      low.type = "lowpass";
      low.frequency.value = 280;
      const tg = ctx.createGain();
      tg.gain.setValueAtTime(0.08 + hard * 0.1, now);
      tg.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
      thud.connect(low);
      low.connect(tg);
      tg.connect(master);
      thud.start(now);
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
