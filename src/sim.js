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
  };
}

const SORTIE_KILLS = 4;
const MISSILE_LOAD = 8;
const GUN_LOAD = 300;
const FLARE_LOAD = 24;

function updateSortie(sim, player, dt) {
  if (player.missiles == null) player.missiles = MISSILE_LOAD;
  if (player.rounds == null) player.rounds = GUN_LOAD;
  if (player.flares == null) player.flares = FLARE_LOAD;
  if (sim.sortieNeed == null) sim.sortieNeed = SORTIE_KILLS;
  if (sim.sortieGot == null) sim.sortieGot = 0;
  if (player.crashed) sim.noReload = 1.8;
  if (sim.noReload > 0) sim.noReload -= dt;
  const left = Math.max(0, sim.sortieNeed - sim.sortieGot);
  if (left > 0) {
    sim.objective = {
      title: "Shoot down " + left,
      text: "",
      dist: null,
      bar: sim.sortieGot / sim.sortieNeed,
    };
    sim.pin = null;
  } else {
    const pad = nearestField(sim.fields, player.x, player.z);
    const dist = pad ? Math.hypot(player.x - pad.x, player.z - pad.z) : 0;
    sim.objective = {
      title: "Land to rearm",
      text: pad?.name || "runway",
      dist,
      bar: 1,
    };
    sim.pin = pad ? { id: pad.id, n: pad.name, x: pad.x, z: pad.z, note: pad.icao } : null;
  }
  const pad = fieldAt(sim.fields, player.x, player.z);
  const down = !player.flying && !!pad && !(sim.noReload > 0);
  if (down && sim.wasAir) {
    const short = player.missiles < MISSILE_LOAD || player.rounds < GUN_LOAD || player.flares < FLARE_LOAD;
    player.missiles = MISSILE_LOAD;
    player.rounds = GUN_LOAD;
    player.flares = FLARE_LOAD;
    if (left <= 0) {
      say(sim, "Sortie complete", "Rearmed");
      sim.sortieGot = 0;
    } else if (short) say(sim, "Rearmed", "8 missiles · 300 rounds · flares");
  }
  sim.wasAir = !!player.flying;
}

export function updateSim(sim, player, dt) {
  dt = Math.min(dt, 0.05);
  if (sim.bannerT > 0) sim.bannerT -= dt;
  if (sim.toastT > 0) sim.toastT -= dt;
  if (sim.fineFlash > 0) sim.fineFlash -= dt;
  if (sim.visitFlash > 0) sim.visitFlash -= dt;
  updateSortie(sim, player, dt);
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
