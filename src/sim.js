import { fieldAt, nearestField } from "./airfields.js?v=2";

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function loadSave() {
  try {
    return JSON.parse(localStorage.getItem("kievride-v1") || "{}");
  } catch {
    return {};
  }
}

function say(sim, title, sub = "", seconds = 2.6) {
  sim.banner = title;
  sim.bannerSub = sub;
  sim.bannerT = seconds;
}

export function createSim(city, index, flight = false) {
  const saved = loadSave();
  return {
    city,
    index,
    rnd: mulberry32((Date.now() ^ 0x9e3779b9) >>> 0),
    flight: !!flight,
    fields: city.fields || [],
    landed: new Set(saved.landed || []),
    money: saved.money ?? 50,
    visited: new Set(saved.visited || []),
    objective: null,
    pin: null,
    banner: "",
    bannerSub: "",
    bannerT: 0,
    toast: "",
    toastT: 0,
    fineFlash: 0,
    visitFlash: 0,
    campaign: 0,
    sortieId: "",
    phase: "fight",
    step: "guns",
    token: 0,
    plan: null,
    cards: [],
    cleared: new Set(),
    cue: "",
    flareCue: 0,
    hold: 0,
    limit: null,
    voiced: {},
    line: null,
    killsGot: 0,
    killsNeed: 0,
    openChart: false,
    closeChart: false,
    booted: false,
    grades: { ...(saved.grades || {}) },
    hits: 0,
    sortieT: 0,
    failTitle: "",
  };
}

const MISSILE_LOAD = 8;
const GUN_LOAD = 300;
const FLARE_LOAD = 24;
const SLOW = 120 / 3.6;

const CHAIN = [
  { id: "first", title: "First flight", blurb: "Guns, then a lock" },
  { id: "riverpass", title: "Over the river", blurb: "Under 800 m" },
  { id: "pairintro", title: "The pair", blurb: "Two drones, one jet" },
];

const BOARD = [
  { id: "fence", title: "Fence", blurb: "Three drones, east fields" },
  { id: "river", title: "River", blurb: "Drones along the Dnipro" },
  { id: "overflight", title: "Overflight", blurb: "Maidan, under 800 m" },
  { id: "intercept", title: "Intercept", blurb: "Catch the fast drone" },
  { id: "escort", title: "Escort", blurb: "Stay with the airliner" },
  { id: "pair", title: "Pair", blurb: "Two jets from the east" },
];

function meta(id) {
  return CHAIN.find((s) => s.id === id) || BOARD.find((s) => s.id === id) || { id, title: "Sortie", blurb: "" };
}

function setObj(sim, title, text, bar, dist, time) {
  sim.objective = {
    title,
    text: text || "",
    bar: Math.max(0, Math.min(1, bar || 0)),
    dist: dist == null ? null : dist,
    time: time == null ? null : time,
  };
}

function offer(sim, id, text, pri) {
  if (sim.voiced[id]) return;
  sim.line = { id, text, pri };
}

function homePad(sim) {
  return sim.fields.find((f) => f.icao === "UKKK") || sim.fields[0];
}

function pinHome(sim, player) {
  const pad = homePad(sim);
  if (!pad) {
    sim.pin = null;
    return 0;
  }
  sim.pin = { id: pad.id, n: "Zhuliany", x: pad.x, z: pad.z, note: pad.icao };
  return Math.hypot(player.x - pad.x, player.z - pad.z);
}

function ahead(player, dist, side = 0) {
  const h = player.heading || 0;
  return {
    x: player.x + Math.sin(h) * dist + Math.cos(h) * side,
    z: player.z + Math.cos(h) * dist - Math.sin(h) * side,
  };
}

function orbit(x, z, radius, n = 4) {
  const points = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    points.push({ x: x + Math.sin(a) * radius, z: z + Math.cos(a) * radius });
  }
  return points;
}

function droneAt(x, z, opt = {}) {
  const points = opt.points || orbit(x, z, opt.radius || 700, opt.n || 4);
  const first = points[0];
  return {
    x,
    z,
    h: Math.atan2(first.x - x, first.z - z),
    agl: opt.agl ?? 240,
    fast: !!opt.fast,
    pace: opt.pace ?? SLOW,
    points,
    leave: !!opt.leave,
    hunt: !!opt.hunt,
    hp: opt.hp ?? (opt.fast ? 64 : 36),
  };
}

function widestRiver(city) {
  let best = null;
  let bestW = 0;
  for (const river of city.rivers || []) {
    const w = river.w || 0;
    if (w >= bestW && river.p && river.p.length >= 8) {
      bestW = w;
      best = river;
    }
  }
  return best;
}

function riverPoints(city) {
  const fallback = [
    { x: -4500, z: -6000 },
    { x: -5200, z: -1500 },
    { x: -3800, z: 3500 },
    { x: -6000, z: 8000 },
  ];
  const river = widestRiver(city);
  if (!river) return fallback;
  const inside = [];
  const p = river.p;
  for (let i = 0; i < p.length; i += 2) {
    const x = p[i];
    const z = p[i + 1];
    if (Math.abs(x) < 20000 && Math.abs(z) < 16000) inside.push({ x, z });
  }
  if (inside.length < 4) return fallback;
  const pick = (t) => inside[Math.min(inside.length - 1, Math.floor(t * (inside.length - 1)))];
  const raw = [pick(0.18), pick(0.4), pick(0.62), pick(0.84)];
  const spaced = [raw[0]];
  for (const pt of raw.slice(1)) {
    const prev = spaced[spaced.length - 1];
    if (Math.hypot(pt.x - prev.x, pt.z - prev.z) > 900) spaced.push(pt);
  }
  return spaced.length >= 3 ? spaced : fallback;
}

function riverMark(city) {
  const pts = riverPoints(city);
  let best = pts[0];
  let bestD = 1e18;
  for (const pt of pts) {
    const d = Math.hypot(pt.x, pt.z);
    if (d < bestD) {
      bestD = d;
      best = pt;
    }
  }
  return { id: "dnipro", n: "Dnipro", x: best.x, z: best.z, note: "Under 800 m" };
}

function blank(sim) {
  sim.token += 1;
  return { token: sim.token, drones: [], civils: [], bandits: 0 };
}

function clearLesson(sim) {
  for (const id of ["plus", "pull", "guns", "lock", "land", "bandit"]) delete sim.voiced[id];
  sim.line = null;
}

function beginSortie(sim, player, id) {
  const info = meta(id);
  sim.sortieId = id;
  sim.phase = "fight";
  sim.step = "guns";
  sim.hold = 0;
  sim.limit = null;
  sim.killsGot = 0;
  sim.killsNeed = 0;
  sim.hits = 0;
  sim.sortieT = 0;
  sim.failTitle = "";
  sim.cue = "";
  player.weapon = 1;
  clearLesson(sim);
  const plan = { drones: [], civils: [], bandits: 0 };
  if (id === "first") {
    const p = ahead(player, 1100, 180);
    plan.drones = [droneAt(p.x, p.z, { agl: 200, radius: 380, pace: 90 / 3.6, hp: 24 })];
  } else if (id === "riverpass") {
    sim.pin = riverMark(sim.city);
    const mid = {
      x: (player.x + sim.pin.x) * 0.5,
      z: (player.z + sim.pin.z) * 0.5,
    };
    plan.drones = [droneAt(mid.x, mid.z, { agl: 320, radius: 600, pace: SLOW, hp: 36 })];
  } else if (id === "pairintro") {
    sim.killsNeed = 3;
    plan.drones = [
      droneAt(-2500, 1800, { agl: 280, radius: 900, pace: SLOW }),
      droneAt(-4200, -2200, { agl: 360, radius: 800, pace: SLOW }),
    ];
    plan.bandits = 1;
  } else if (id === "fence") {
    sim.killsNeed = 3;
    plan.drones = [
      droneAt(-12000, -1800, { agl: 220, radius: 700, pace: SLOW }),
      droneAt(-15000, 2800, { agl: 280, radius: 800, pace: SLOW }),
      droneAt(-10800, 7200, { agl: 340, radius: 650, pace: SLOW }),
    ];
  } else if (id === "river") {
    sim.killsNeed = 3;
    const pts = riverPoints(sim.city);
    plan.drones = pts.slice(0, 3).map((pt, i) => {
      const path = [];
      for (let k = 0; k < pts.length; k++) path.push(pts[(i + k) % pts.length]);
      return droneAt(pt.x, pt.z, { agl: 260 + i * 70, pace: SLOW, points: path, hp: 36 });
    });
  } else if (id === "overflight") {
    sim.pin = { id: "maidan", n: "Maidan", x: 0, z: 0, note: "Under 800 m" };
  } else if (id === "intercept") {
    sim.killsNeed = 1;
    sim.limit = 100;
    const path = [
      { x: -4000, z: 2000 },
      { x: -1200, z: -2500 },
      { x: 2200, z: -9000 },
    ];
    plan.drones = [droneAt(path[0].x, path[0].z, {
      fast: true,
      agl: 640,
      pace: 720 / 3.6,
      points: path.slice(1),
      leave: true,
      hp: 48,
    })];
  } else if (id === "escort") {
    sim.killsNeed = 2;
    plan.civils = [{
      x: 2800,
      z: -1800,
      h: Math.atan2(-12000 - 2800, -800 - (-1800)),
      agl: 860,
      speed: 70,
      points: [{ x: -4000, z: -900 }, { x: -14000, z: 1200 }],
    }];
    plan.drones = [
      droneAt(-1800, 400, { hunt: true, agl: 780, pace: 95, hp: 36 }),
      droneAt(-600, -2600, { hunt: true, agl: 620, pace: 100, hp: 36 }),
    ];
  } else if (id === "pair") {
    sim.killsNeed = 2;
    plan.bandits = 2;
  }
  sim.token += 1;
  plan.token = sim.token;
  sim.plan = plan;
  setObj(sim, info.title, info.blurb, 0, null, null);
  refreshCards(sim);
}

function pinCraft(sim, player, role) {
  let best = null;
  let bestD = 1e18;
  for (const a of sim.craft || []) {
    if (!a.alive) continue;
    if (role && a.role !== role) continue;
    if (!role && a.role !== "drone" && a.role !== "bandit") continue;
    const d = Math.hypot(a.x - player.x, a.z - player.z);
    if (d < bestD) {
      bestD = d;
      best = a;
    }
  }
  if (!best) {
    sim.pin = null;
    return null;
  }
  const name = best.role === "bandit" ? "Jet" : best.role === "civil" ? "Airliner" : "Drone";
  sim.pin = { id: "t" + best.id, n: name, x: best.x, z: best.z };
  return bestD;
}

function enterLand(sim, player, title, sub) {
  if (sim.phase !== "fight") return;
  sim.phase = "land";
  sim.limit = null;
  say(sim, title, sub, 3);
  offer(sim, "land", "Land to rearm.", 2);
  const dist = pinHome(sim, player);
  setObj(sim, "Land to rearm", "Zhuliany", 1, dist, null);
}

function failSortie(sim, title) {
  if (sim.phase !== "fight") return;
  sim.phase = "fail";
  sim.limit = null;
  sim.failTitle = title;
  sim.plan = blank(sim);
  sim.pin = null;
  sim.cue = "B · retry";
  say(sim, title, "B · retry", 3.2);
  setObj(sim, title, "B · retry", 0, null, null);
}

const PAR = {
  first: 180,
  riverpass: 160,
  pairintro: 240,
  fence: 200,
  river: 220,
  overflight: 140,
  intercept: 90,
  escort: 200,
  pair: 220,
};
const LETTERS = ["D", "C", "B", "A", "S"];

function letterRank(letter) {
  const i = LETTERS.indexOf(letter);
  return i < 0 ? -1 : i;
}

function gradeLetter(sim, clean) {
  const par = PAR[sim.sortieId] || 180;
  const t = sim.sortieT || par;
  let score = t <= par * 0.75 ? 4 : t <= par ? 3 : t <= par * 1.35 ? 2 : 1;
  if (sim.hits > 0) score -= 1;
  if (!clean) score -= 1;
  return LETTERS[Math.max(0, score)];
}

function writeGrades(sim) {
  try {
    const saved = loadSave();
    saved.grades = sim.grades;
    localStorage.setItem("kievride-v1", JSON.stringify(saved));
  } catch {
    /* the card still shows the letter this session */
  }
}

function stampGrade(sim, player) {
  const clean = (player.lastTouch ?? 1) < 0.42;
  const letter = gradeLetter(sim, clean);
  const prev = sim.grades[sim.sortieId];
  if (letterRank(letter) > letterRank(prev)) {
    sim.grades[sim.sortieId] = letter;
    writeGrades(sim);
  }
  return { letter, best: sim.grades[sim.sortieId] || letter };
}

function completeSortie(sim, player) {
  const graded = stampGrade(sim, player);
  const gradeLine = graded.letter === graded.best ? "Grade " + graded.letter : "Grade " + graded.letter + " · best " + graded.best;
  const chainIndex = CHAIN.findIndex((s) => s.id === sim.sortieId);
  if (sim.campaign < CHAIN.length && chainIndex === sim.campaign) {
    sim.campaign += 1;
    if (sim.campaign < CHAIN.length) {
      const next = CHAIN[sim.campaign];
      say(sim, next.title, gradeLine, 3.4);
      beginSortie(sim, player, next.id);
      return;
    }
  } else if (BOARD.some((s) => s.id === sim.sortieId)) {
    sim.cleared.add(sim.sortieId);
  }
  say(sim, gradeLine, "Pick one on the chart", 3.4);
  sim.phase = "pick";
  sim.sortieId = "";
  sim.plan = blank(sim);
  sim.pin = null;
  sim.cue = "M · chart";
  sim.openChart = true;
  setObj(sim, "Pick a sortie", "Chart", 0, null, null);
  refreshCards(sim);
}

function onKills(sim, player, n) {
  if (sim.sortieId === "first") {
    if (sim.step === "guns") {
      sim.step = "lock";
      const far = ahead(player, 6500, 500);
      sim.token += 1;
      sim.plan = {
        token: sim.token,
        drones: [droneAt(far.x, far.z, { agl: 460, radius: 1100, pace: 150 / 3.6, hp: 36 })],
        civils: [],
        bandits: 0,
      };
      player.weapon = 1;
      offer(sim, "lock", "Lock.", 3);
      return;
    }
    if (sim.step === "lock") enterLand(sim, player, "Drone down", "Land to rearm");
    return;
  }
  if (!sim.killsNeed) return;
  sim.killsGot += n;
  if (sim.killsGot >= sim.killsNeed) enterLand(sim, player, "Splash", "Land to rearm");
}

function tickPass(sim, player, dt, title, text) {
  const pin = sim.pin;
  const dist = pin ? Math.hypot(player.x - pin.x, player.z - pin.z) : 99999;
  const agl = player.agl ?? 9999;
  const inside = player.flying && !player.wrecked && dist < 700 && agl > 50 && agl < 800;
  if (inside) sim.hold += dt;
  else sim.hold = Math.max(0, sim.hold - dt * 0.35);
  setObj(sim, title, text, sim.hold / 2.2, dist, null);
  if (sim.hold >= 2.2) enterLand(sim, player, "Pass complete", "Land to rearm");
}

function tickFight(sim, player, dt) {
  const info = meta(sim.sortieId);
  if (sim.sortieId === "first") {
    pinCraft(sim, player, "drone");
    setObj(sim, "First flight", sim.step === "lock" ? "Lock" : "Guns", sim.step === "lock" ? 0.5 : 0, null, null);
    return;
  }
  if (sim.sortieId === "riverpass") {
    if (!sim.pin || sim.pin.id !== "dnipro") sim.pin = riverMark(sim.city);
    tickPass(sim, player, dt, "Over the river", "Under 800 m");
    return;
  }
  if (sim.sortieId === "overflight") {
    if (!sim.pin || sim.pin.id !== "maidan") sim.pin = { id: "maidan", n: "Maidan", x: 0, z: 0, note: "Under 800 m" };
    tickPass(sim, player, dt, "Overflight", "Maidan, under 800 m");
    return;
  }
  if (sim.sortieId === "escort") {
    const dist = pinCraft(sim, player, "civil");
    setObj(sim, "Escort", "Stay with the airliner", sim.killsNeed ? sim.killsGot / sim.killsNeed : 0, dist, null);
    return;
  }
  if (sim.sortieId === "intercept") {
    pinCraft(sim, player, "drone");
    setObj(sim, "Intercept", "Crossing south", sim.killsNeed ? sim.killsGot / sim.killsNeed : 0, null, sim.limit);
    return;
  }
  pinCraft(sim, player);
  const text = sim.sortieId === "pair" ? "Two jets, east" : info.blurb;
  setObj(sim, info.title, text, sim.killsNeed ? sim.killsGot / sim.killsNeed : 0, null, null);
}

function tickLand(sim, player, title) {
  const dist = pinHome(sim, player);
  setObj(sim, title, "Zhuliany", 1, dist, null);
}

function onApproach(sim, player) {
  return player.flying && !player.wrecked && (player.agl ?? 999) < 180;
}

function tickVoice(sim, player) {
  if (sim.flareCue > 0) {
    sim.cue = "C · flares";
    return;
  }
  if (sim.phase === "fail") {
    sim.cue = "B · retry";
    return;
  }
  if (sim.phase === "pick") {
    sim.cue = "M · chart";
    return;
  }
  if (sim.sortieId === "first" && sim.phase === "fight") {
    const kmh = Math.abs(player.speed) * 3.6;
    const vr = player.flaps > 0.5 ? 70 : 140;
    if (!player.flying && kmh < 40) {
      sim.cue = "Hold plus";
      offer(sim, "plus", "Hold plus.", 2);
    } else if (!player.flying && kmh >= vr) {
      sim.cue = "Pull up";
      offer(sim, "pull", "Pull up.", 3);
    } else if (player.flying && sim.step === "guns") {
      sim.cue = player.weapon ? "Alt · gun" : "Guns · Space";
      offer(sim, "guns", "Gun.", 3);
    } else if (player.flying && sim.step === "lock") {
      sim.cue = "Lock · Space";
    } else sim.cue = "";
    return;
  }
  if (sim.sortieId === "escort" && sim.phase === "fight" && player.flying && sim.pin) {
    const dist = Math.hypot(player.x - sim.pin.x, player.z - sim.pin.z);
    if (dist > 2800) {
      sim.cue = "Stay close";
      return;
    }
  }
  if (onApproach(sim, player)) {
    if (player.gearDown === false) {
      sim.cue = "G · gear";
      offer(sim, "gear", "Gear down.", 2);
      return;
    }
    if (!(player.flaps > 0.5) && !player.jets) {
      sim.cue = "F · flaps";
      offer(sim, "flaps", "Flaps.", 1);
      return;
    }
  }
  sim.cue = "";
}

function refreshCards(sim) {
  if (sim.campaign < CHAIN.length) {
    sim.cards = CHAIN.map((c, i) => ({
      id: c.id,
      title: c.title,
      blurb: c.blurb,
      state: i < sim.campaign ? "done" : i === sim.campaign ? "now" : "locked",
      pick: false,
      grade: sim.grades[c.id] || "",
    }));
    return;
  }
  sim.cards = BOARD.map((c) => ({
    id: c.id,
    title: c.title,
    blurb: c.blurb,
    state: sim.sortieId === c.id && sim.phase !== "pick" ? "now" : sim.cleared.has(c.id) ? "done" : "open",
    pick: true,
    grade: sim.grades[c.id] || "",
  }));
}

function rearm(player) {
  if (player.missiles == null) player.missiles = MISSILE_LOAD;
  if (player.rounds == null) player.rounds = GUN_LOAD;
  if (player.flares == null) player.flares = FLARE_LOAD;
  const short = player.missiles < MISSILE_LOAD || player.rounds < GUN_LOAD || player.flares < FLARE_LOAD;
  player.missiles = MISSILE_LOAD;
  player.rounds = GUN_LOAD;
  player.flares = FLARE_LOAD;
  return short;
}

export function armSortie(sim, player) {
  if (sim.booted) return;
  sim.booted = true;
  beginSortie(sim, player, "first");
}

export function restartSortie(sim, player) {
  if (!sim.booted || !sim.sortieId || sim.phase === "pick") return;
  beginSortie(sim, player, sim.sortieId);
}

export function pickSortie(sim, player, id) {
  if (sim.campaign < CHAIN.length) return;
  if (!BOARD.some((s) => s.id === id)) return;
  if (player.flying) {
    sim.toast = "Land to pick a sortie";
    sim.toastT = 1.6;
    return;
  }
  beginSortie(sim, player, id);
  say(sim, meta(id).title, meta(id).blurb, 2.8);
  sim.closeChart = true;
}

export function updateSim(sim, player, dt, fx) {
  dt = Math.min(dt, 0.05);
  if (sim.bannerT > 0) sim.bannerT -= dt;
  if (sim.toastT > 0) sim.toastT -= dt;
  if (sim.fineFlash > 0) sim.fineFlash -= dt;
  if (sim.visitFlash > 0) sim.visitFlash -= dt;
  if (sim.flareCue > 0) sim.flareCue -= dt;
  if (player.crashed) sim.noReload = 1.8;
  if (sim.noReload > 0) sim.noReload -= dt;
  if (!sim.booted) armSortie(sim, player);
  if (sim.phase === "fight" || sim.phase === "land") sim.sortieT += dt;
  if (fx?.hit && (sim.phase === "fight" || sim.phase === "land")) sim.hits += 1;
  if (sim.limit != null && sim.phase === "fight") sim.limit -= dt;
  if (fx && sim.phase === "fight") {
    if (fx.kills) onKills(sim, player, fx.kills);
    if (sim.phase === "fight" && fx.escortHit && sim.sortieId === "escort") failSortie(sim, "Airliner hit");
    if (sim.phase === "fight" && fx.escaped && sim.sortieId === "intercept") failSortie(sim, "He got away");
    if (sim.phase === "fight" && sim.sortieId === "intercept" && sim.limit != null && sim.limit <= 0) {
      failSortie(sim, "He got away");
    }
  }
  if (sim.phase === "fight") tickFight(sim, player, dt);
  else if (sim.phase === "land") tickLand(sim, player, "Land to rearm");
  else if (sim.phase === "fail") {
    sim.pin = null;
    setObj(sim, sim.failTitle || "Retry", "B · retry", 0, null, null);
  }
  else {
    sim.pin = null;
    sim.cue = "M · chart";
    setObj(sim, "Pick a sortie", "Chart", 0, null, null);
  }
  tickVoice(sim, player);
  const pad = fieldAt(sim.fields, player.x, player.z);
  const down = !player.flying && !!pad && !(sim.noReload > 0);
  if (down && sim.wasAir) {
    const short = rearm(player);
    if (sim.phase === "land") completeSortie(sim, player);
    else if (sim.phase === "fail") beginSortie(sim, player, sim.sortieId);
    else if (short) say(sim, "Rearmed", "8 missiles · 300 rounds · flares");
  }
  sim.wasAir = !!player.flying;
  refreshCards(sim);
}

export function retryHint(sim) {
  return !!sim.retry;
}

export function clearRetry(sim) {
  sim.retry = false;
}

export function nearestSight(sim, x, z) {
  let best = null;
  let bestD = 1e12;
  for (const s of sim.city.sights) {
    const d = Math.hypot(s.x - x, s.z - z);
    if (d < bestD) {
      bestD = d;
      best = { ...s, dist: d, seen: sim.visited.has(s.id) };
    }
  }
  return best;
}
