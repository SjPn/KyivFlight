/**
 * Build a compact driving map of Kyiv and Kyiv Oblast from OpenStreetMap.
 * Output: public/data/kyiv.json
 * Map data © OpenStreetMap contributors, ODbL 1.0.
 */
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { SIGHTS, TOWNS } from "./places.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = path.join(root, "tools", "cache");
const OUT = path.join(root, "public", "data", "kyiv.json");

const LAT0 = 50.4501;
const LON0 = 30.5234;
const M_LAT = 111320;
const M_LON = 111320 * Math.cos((LAT0 * Math.PI) / 180);

const project = (lat, lon) => [
  (lon - LON0) * M_LON,
  (lat - LAT0) * M_LAT,
];

const r1 = (n) => Math.round(n * 10) / 10;
const r3 = (n) => Math.round(n * 1000) / 1000;

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

const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function curlQuery(url, ql, file) {
  return new Promise((resolve, reject) => {
    const child = spawn("curl.exe", [
      "-m", "100",
      "-A", "KievRide/1.0",
      "-f",
      "-sS",
      "--data-urlencode", "data@" + ql,
      "-o", file,
      url,
    ], { windowsHide: true });
    let err = "";
    child.stderr.on("data", (d) => { err += d; });
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(err.trim() || "curl " + code))));
  });
}

async function overpass(name, query) {
  fs.mkdirSync(CACHE, { recursive: true });
  const file = path.join(CACHE, name + ".json");
  if (fs.existsSync(file) && fs.statSync(file).size > 500) {
    try {
      const cached = JSON.parse(fs.readFileSync(file, "utf8"));
      if (cached.elements) {
        console.log("cache", name, cached.elements.length);
        return cached;
      }
    } catch { /* refetch */ }
  }
  const ql = path.join(CACHE, name + ".ql");
  fs.writeFileSync(ql, query, "utf8");
  let lastErr;
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      const url = ENDPOINTS[attempt % ENDPOINTS.length];
      console.log("fetch", name, url);
      await curlQuery(url, ql, file);
      const json = JSON.parse(fs.readFileSync(file, "utf8"));
      if (!json.elements) throw new Error(json.remark || "no elements");
      console.log(" saved", name, json.elements.length);
      await sleep(4000);
      return json;
    } catch (err) {
      lastErr = err;
      console.warn(" fail", name, err.message);
      if (fs.existsSync(file)) fs.unlinkSync(file);
      const wait = /429|504|timed out/.test(err.message) ? Math.min(15000, 5000 * (attempt + 1)) : 3000;
      console.log(" wait", Math.round(wait / 1000) + "s");
      await sleep(wait);
    }
  }
  console.error(" give up", name, lastErr?.message || "");
  return { elements: [] };
}

const HW = String.raw`^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street)(_link)?$`;
const WIDE = String.raw`^(motorway|trunk|primary|secondary)(_link)?$`;
const LOCAL = String.raw`^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|track)(_link)?$`;
const HOUSE = String.raw`^(house|residential|apartments|yes|detached|semidetached_house|terrace|farm|cabin|bungalow)$`;

function qRoads(s, w, n, e, re) {
  return `[out:json][timeout:180];
way["highway"~"${re}"](${s},${w},${n},${e});
out geom;`;
}
function qBuildings(s, w, n, e) {
  return `[out:json][timeout:180];
way["building"](${s},${w},${n},${e});
out geom;`;
}
function qNature(s, w, n, e) {
  return `[out:json][timeout:180];
(
  way["waterway"="river"]["name"~"Дніпро|Десна|Ірпінь|Стугна"](${s},${w},${n},${e});
  way["leisure"~"park|garden|recreation_ground"](${s},${w},${n},${e});
  way["landuse"="forest"](${s},${w},${n},${e});
  way["natural"="water"](${s},${w},${n},${e});
);
out geom;`;
}

function gridTiles(prefix, south, west, north, east, dLat, dLon) {
  const out = [];
  let n = 0;
  for (let s = south; s < north - 1e-6; s += dLat) {
    for (let w = west; w < east - 1e-6; w += dLon) {
      out.push([
        prefix + n++,
        +s.toFixed(4),
        +w.toFixed(4),
        +Math.min(north, s + dLat).toFixed(4),
        +Math.min(east, w + dLon).toFixed(4),
      ]);
    }
  }
  return out;
}

const ROAD_TILES = [
  ["c", 50.43, 30.48, 50.48, 30.58],
  ["n", 50.48, 30.45, 50.55, 30.58],
  ["w", 50.42, 30.36, 50.5, 30.48],
  ["e", 50.4, 30.56, 50.51, 30.69],
  ["s", 50.35, 30.44, 50.43, 30.6],
  ...gridTiles("kyiv-", 50.32, 30.24, 50.59, 30.82, 0.045, 0.07),
];
const BLD_TILES = [
  ["bc", 50.435, 30.495, 50.47, 30.56],
  ["bn", 50.465, 30.48, 50.52, 30.545],
  ["be", 50.42, 30.54, 50.45, 30.59],
  ["bw", 50.43, 30.42, 50.47, 30.5],
  ...gridTiles("kb-", 50.32, 30.24, 50.59, 30.82, 0.09, 0.14),
];

function widthOf(tags) {
  const lanes = parseInt(tags.lanes || "", 10);
  const cls = (tags.highway || "").replace("_link", "");
  const base = {
    motorway: 14,
    trunk: 13,
    primary: 12,
    secondary: 9.5,
    tertiary: 8,
    unclassified: 6.5,
    residential: 6.5,
    living_street: 5.2,
    track: 4.5,
  }[cls] || 6.5;
  if (lanes >= 2 && lanes <= 8) return Math.max(base, lanes * 3.3);
  return base;
}

function simplify(pts, eps) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = 1;
  keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let maxD = 0;
    let idx = -1;
    const ax = pts[a][0], az = pts[a][1], bx = pts[b][0], bz = pts[b][1];
    const dx = bx - ax, dz = bz - az;
    const L2 = dx * dx + dz * dz || 1;
    for (let i = a + 1; i < b; i++) {
      const px = pts[i][0], pz = pts[i][1];
      const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L2));
      const d = Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (maxD > eps && idx > 0) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  const out = [];
  for (let i = 0; i < pts.length; i++) if (keep[i]) out.push(pts[i]);
  return out;
}

function wayPoints(el) {
  const g = el.geometry;
  if (!g || g.length < 2) return null;
  const pts = [];
  for (const p of g) {
    if (p.lat == null || p.lon == null) return null;
    const [x, z] = project(p.lat, p.lon);
    const prev = pts[pts.length - 1];
    if (prev && Math.hypot(prev[0] - x, prev[1] - z) < 1.2) continue;
    pts.push([x, z]);
  }
  return pts.length >= 2 ? pts : null;
}

function closed(pts) {
  if (pts.length < 4) return false;
  const a = pts[0], b = pts[pts.length - 1];
  return Math.hypot(a[0] - b[0], a[1] - b[1]) < 3;
}

function areaOf(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    a += pts[i][0] * pts[j][1] - pts[j][0] * pts[i][1];
  }
  return Math.abs(a) / 2;
}

function buildingOf(pts, tags, rnd) {
  const ring = closed(pts) ? pts.slice(0, -1) : pts;
  if (ring.length < 3) return null;
  let best = 0, ang = 0;
  for (let i = 0; i < ring.length; i++) {
    const j = (i + 1) % ring.length;
    const dx = ring[j][0] - ring[i][0];
    const dz = ring[j][1] - ring[i][1];
    const l = dx * dx + dz * dz;
    if (l > best) {
      best = l;
      ang = Math.atan2(dx, dz);
    }
  }
  const c = Math.cos(-ang), s = Math.sin(-ang);
  let cx = 0, cz = 0;
  for (const p of ring) { cx += p[0]; cz += p[1]; }
  cx /= ring.length; cz /= ring.length;
  let minx = 1e9, maxx = -1e9, minz = 1e9, maxz = -1e9;
  for (const p of ring) {
    const dx = p[0] - cx, dz = p[1] - cz;
    const rx = dx * c - dz * s;
    const rz = dx * s + dz * c;
    if (rx < minx) minx = rx;
    if (rx > maxx) maxx = rx;
    if (rz < minz) minz = rz;
    if (rz > maxz) maxz = rz;
  }
  const w = maxx - minx, d = maxz - minz;
  const area = areaOf(ring);
  const rural = Math.hypot(cx, cz) > 18000;
  if (rural) {
    if (w < 4 || d < 4 || w > 80 || d > 80) return null;
    if (area < 28 || area > 4000) return null;
  } else if (w < 6 || d < 6 || w > 180 || d > 180 || area < 70 || area > 20000) return null;
  let h = 0;
  if (tags.height) h = parseFloat(String(tags.height).replace(",", "."));
  if (!(h > 3 && h < 240) && tags["building:levels"]) {
    const lv = parseFloat(tags["building:levels"]);
    if (lv > 0 && lv < 80) h = lv * 3.15;
  }
  if (!(h > 3)) {
    const t = tags.building || "";
    if (t === "church" || t === "cathedral") h = 26;
    else if (t === "industrial" || t === "warehouse") h = 9;
    else if (t === "retail" || t === "commercial" || t === "supermarket") h = 11;
    else if (t === "apartments") h = 16 + rnd() * 16;
    else if (t === "garage" || t === "shed") return null;
    else if (rural && (t === "house" || t === "detached" || t === "semidetached_house" || t === "terrace" || t === "cabin" || t === "bungalow" || t === "farm" || t === "yes")) h = 4.6 + rnd() * 3.6;
    else h = 8 + rnd() * 14;
  }
  const kind = /church|cathedral/.test(tags.building || "") ? "church"
    : /commercial|retail|office/.test(tags.building || "") ? "com" : "res";
  return { x: r1(cx), z: r1(cz), w: r1(w), d: r1(d), h: r1(h), rot: r3(ang), k: kind };
}

function packLine(pts) {
  const p = [];
  for (const [x, z] of pts) { p.push(r1(x), r1(z)); }
  return p;
}

function roadKey(pts, name) {
  const a = pts[0][0].toFixed(0) + "," + pts[0][1].toFixed(0);
  const b = pts[pts.length - 1][0].toFixed(0) + "," + pts[pts.length - 1][1].toFixed(0);
  const lo = a < b ? a : b;
  const hi = a < b ? b : a;
  return lo + ">" + hi + "|" + (name || "") + "|" + pts.length;
}

const roads = [];
const roadSeen = new Set();
const buildings = [];
const bldSeen = new Set();
const rivers = [];
const parks = [];
const lakes = [];

function addRoad(el) {
  const tags = el.tags || {};
  if (tags.construction) return;
  let pts = wayPoints(el);
  if (!pts) return;
  const far = Math.hypot(pts[0][0], pts[0][1]) > 18000;
  pts = simplify(pts, far ? 6.5 : 2.4);
  if (pts.length < 2) return;
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  if (len < 12) return;
  const name = tags.name || tags["name:uk"] || "";
  const key = roadKey(pts, name);
  if (roadSeen.has(key)) return;
  roadSeen.add(key);
  const cls = (tags.highway || "residential").replace("_link", "");
  const road = {
    p: packLine(pts),
    w: r1(widthOf(tags)),
    c: cls,
  };
  if (name) road.n = name;
  const lanes = parseInt(tags.lanes || "", 10);
  if (lanes >= 1 && lanes <= 8) road.ln = lanes;
  if (tags.oneway === "yes" || tags.oneway === "1") road.ow = 1;
  if (tags.bridge && tags.bridge !== "no") road.br = 1;
  roads.push(road);
}

function addBuilding(el, rnd) {
  const tags = el.tags || {};
  const pts = wayPoints(el);
  if (!pts) return;
  const b = buildingOf(pts, tags, rnd);
  if (!b) return;
  const key = b.x.toFixed(0) + "," + b.z.toFixed(0);
  if (bldSeen.has(key)) return;
  bldSeen.add(key);
  buildings.push(b);
}

function addNature(el) {
  const tags = el.tags || {};
  let pts = wayPoints(el);
  if (!pts) return;
  if (tags.waterway === "river") {
    pts = simplify(pts, 18);
    if (pts.length < 2) return;
    const name = tags.name || "";
    const wide = /Дніпро/.test(name) ? 780 : /Десна/.test(name) ? 180 : 70;
    rivers.push({ p: packLine(pts), w: wide, n: name });
    return;
  }
  if (!closed(pts)) return;
  pts = simplify(pts, 8);
  const area = areaOf(pts);
  if (tags.natural === "water" || tags.water) {
    if (area > 2500 && area < 800000) lakes.push(packLine(pts));
    return;
  }
  if (area > 1200 && area < 900000 && parks.length < 700) parks.push(packLine(pts));
}

function pointInRing(x, z, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 2; i < ring.length; i += 2) {
    const xi = ring[i], zi = ring[i + 1];
    const xj = ring[j], zj = ring[j + 1];
    const intersect = zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi + 1e-9) + xi;
    if (intersect) inside = !inside;
    j = i;
  }
  return inside;
}

function nearWater(x, z) {
  for (const river of rivers) {
    const p = river.p;
    const hw = river.w * 0.45;
    for (let i = 0; i < p.length; i += 8) {
      const dx = p[i] - x;
      const dz = p[i + 1] - z;
      if (dx * dx + dz * dz < hw * hw) return true;
    }
  }
  return false;
}

function capSpread(list, maxCount) {
  if (list.length <= maxCount) return list;
  let cell = 50;
  let buckets = new Map();
  while (cell <= 320) {
    buckets = new Map();
    for (const b of list) {
      const k = (Math.floor(b.x / cell)) + "," + Math.floor(b.z / cell);
      let bucket = buckets.get(k);
      if (!bucket) buckets.set(k, bucket = []);
      bucket.push(b);
    }
    if (buckets.size <= maxCount * 0.72) break;
    cell += 25;
  }
  console.log("oblast cell", cell, "m, places", buckets.size);
  const kept = [];
  for (let round = 0; kept.length < maxCount; round++) {
    let added = 0;
    for (const bucket of buckets.values()) {
      if (round < bucket.length) {
        kept.push(bucket[round]);
        added++;
        if (kept.length >= maxCount) break;
      }
    }
    if (!added) break;
  }
  return kept;
}

function capBuckets(list, maxCount) {
  if (list.length <= maxCount) return list;
  const cell = 80;
  const buckets = new Map();
  for (const b of list) {
    const k = (Math.floor(b.x / cell)) + "," + Math.floor(b.z / cell);
    let bucket = buckets.get(k);
    if (!bucket) buckets.set(k, bucket = []);
    bucket.push(b);
  }
  const kept = [];
  for (let round = 0; kept.length < maxCount; round++) {
    let added = 0;
    for (const bucket of buckets.values()) {
      if (round < bucket.length) {
        kept.push(bucket[round]);
        added++;
        if (kept.length >= maxCount) break;
      }
    }
    if (!added) break;
  }
  return kept;
}

function thinBuildings(maxCity, maxRural, splitAt) {
  const prior = buildings.slice(0, splitAt);
  const extra = buildings.slice(splitAt);
  const core = [];
  const fringe = [];
  for (const b of prior) {
    if (b.x > -22000 && b.x < 24000 && b.z > -16000 && b.z < 18000) core.push(b);
    else fringe.push(b);
  }
  const keptCore = capBuckets(core, maxCity);
  const keptRural = capSpread(fringe.concat(extra), maxRural);
  buildings.length = 0;
  for (let i = 0; i < keptCore.length; i++) buildings.push(keptCore[i]);
  for (let i = 0; i < keptRural.length; i++) buildings.push(keptRural[i]);
  console.log("buildings kyiv", keptCore.length, "of", core.length, "oblast", keptRural.length, "of", fringe.length + extra.length);
}

function fillerBuildings(rnd) {
  const occ = new Set(bldSeen);
  let added = 0;
  for (const road of roads) {
    if (road.c !== "residential" && road.c !== "tertiary" && road.c !== "living_street") continue;
    const p = road.p;
    for (let i = 0; i < p.length - 2; i += 2) {
      const x0 = p[i], z0 = p[i + 1], x1 = p[i + 2], z1 = p[i + 3];
      const L = Math.hypot(x1 - x0, z1 - z0);
      if (L < 20) continue;
      const steps = Math.max(1, Math.floor(L / 58));
      for (let s = 0; s < steps; s++) {
        if (added > 16000) return;
        if (rnd() > 0.72) continue;
        const t = (s + 0.5) / steps;
        const x = x0 + (x1 - x0) * t;
        const z = z0 + (z1 - z0) * t;
        const side = rnd() > 0.5 ? 1 : -1;
        const nx = (-(z1 - z0) / L) * side;
        const nz = ((x1 - x0) / L) * side;
        const off = road.w * 0.5 * 1.2 + 16 + rnd() * 6;
        const ox = x + nx * off;
        const oz = z + nz * off;
        if (nearWater(ox, oz)) continue;
        const key = ox.toFixed(0) + "," + oz.toFixed(0);
        const cell = (Math.round(ox / 42) ) + "," + Math.round(oz / 42);
        if (occ.has(key) || occ.has(cell)) continue;
        occ.add(cell);
        const ang = Math.atan2(x1 - x0, z1 - z0);
        buildings.push({
          x: r1(ox),
          z: r1(oz),
          w: r1(12 + rnd() * 16),
          d: r1(10 + rnd() * 18),
          h: r1(8 + rnd() * 22),
          rot: r3(ang),
          k: "fill",
        });
        added++;
      }
    }
  }
  console.log("filler buildings", added);
}

function treesFrom(rnd) {
  const trees = [];
  const push = (x, z) => {
    if (trees.length > 11000) return;
    if (nearWater(x, z)) return;
    trees.push(r1(x), r1(z));
  };
  for (const ring of parks) {
    if (trees.length > 11000) break;
    let minx = 1e9, maxx = -1e9, minz = 1e9, maxz = -1e9;
    for (let i = 0; i < ring.length; i += 2) {
      minx = Math.min(minx, ring[i]); maxx = Math.max(maxx, ring[i]);
      minz = Math.min(minz, ring[i + 1]); maxz = Math.max(maxz, ring[i + 1]);
    }
    const area = Math.max(1, (maxx - minx) * (maxz - minz));
    const tries = Math.min(80, Math.floor(area / 1800));
    for (let t = 0; t < tries; t++) {
      const x = minx + rnd() * (maxx - minx);
      const z = minz + rnd() * (maxz - minz);
      if (pointInRing(x, z, ring)) push(x, z);
    }
  }
  for (const road of roads) {
    if (trees.length > 11000) break;
    if (road.c === "motorway" || road.c === "motorway_link") continue;
    const p = road.p;
    for (let i = 0; i < p.length - 2 && trees.length < 11000; i += 2) {
      const x0 = p[i], z0 = p[i + 1], x1 = p[i + 2], z1 = p[i + 3];
      const L = Math.hypot(x1 - x0, z1 - z0);
      if (L < 16 || rnd() > 0.55) continue;
      const side = rnd() > 0.5 ? 1 : -1;
      const nx = (-(z1 - z0) / L) * side;
      const nz = ((x1 - x0) / L) * side;
      const off = road.w * 0.5 * 1.25 + 6.5 + rnd() * 2;
      push(x0 + (x1 - x0) * 0.5 + nx * off, z0 + (z1 - z0) * 0.5 + nz * off);
    }
  }
  return trees;
}

function snapSpawn(x, z) {
  let best = null, bd = 1e12;
  for (const road of roads) {
    if (road.c === "service" || road.c === "footway") continue;
    const p = road.p;
    const mx = p[0], mz = p[1];
    if (Math.hypot(mx - x, mz - z) > 4000 && Math.hypot(p[p.length - 2] - x, p[p.length - 1] - z) > 4000) {
      // still check if any point is close via bbox
    }
    for (let i = 0; i < p.length - 2; i += 2) {
      const x0 = p[i], z0 = p[i + 1], x1 = p[i + 2], z1 = p[i + 3];
      if (Math.min(x0, x1) > x + 80 || Math.max(x0, x1) < x - 80) continue;
      if (Math.min(z0, z1) > z + 80 || Math.max(z0, z1) < z - 80) continue;
      const dx = x1 - x0, dz = z1 - z0;
      const L2 = dx * dx + dz * dz || 1;
      let t = ((x - x0) * dx + (z - z0) * dz) / L2;
      t = Math.max(0, Math.min(1, t));
      const px = x0 + dx * t, pz = z0 + dz * t;
      const d = Math.hypot(px - x, pz - z);
      if (d < bd) {
        bd = d;
        best = { x: r1(px), z: r1(pz), h: r3(Math.atan2(dx, dz)) };
      }
    }
  }
  return best || { x: r1(x), z: r1(z), h: 0 };
}

async function main() {
  const rnd = mulberry32(20260930);
  console.log("root", root);

  const HW_TILES = [
    ["nw", 50.33, 29.9, 50.62, 30.55],
    ["ne", 50.33, 30.55, 50.62, 31.08],
    ["sw", 50.05, 29.9, 50.33, 30.55],
    ["se", 50.05, 30.55, 50.33, 31.08],
    ["far-s", 49.72, 29.55, 50.06, 30.7],
    ["far-se", 49.72, 30.7, 50.06, 31.9],
    ["far-w", 50.05, 29.4, 50.7, 29.92],
    ["far-e", 50.05, 31.05, 50.7, 31.95],
    ["far-n", 50.6, 29.9, 50.9, 31.2],
  ];
  for (const [id, s, w, n, e] of HW_TILES) {
    const hw = await overpass("hw-" + id, qRoads(s, w, n, e, WIDE));
    for (const el of hw.elements || []) if (el.type === "way") addRoad(el);
  }

  for (const [id, s, w, n, e] of ROAD_TILES) {
    const data = await overpass("roads-" + id, qRoads(s, w, n, e, HW));
    for (const el of data.elements || []) if (el.type === "way") addRoad(el);
  }

  for (const [name, lat, lon] of TOWNS) {
    const s = lat - 0.012, n = lat + 0.012, w = lon - 0.018, e = lon + 0.018;
    const id = "town-" + name;
    const data = await overpass(id, `[out:json][timeout:120];
(
  way["highway"~"${HW}"](${s},${w},${n},${e});
  way["building"](${s},${w},${n},${e});
);
out geom;`);
    for (const el of data.elements || []) {
      if (el.type !== "way") continue;
      if (el.tags?.highway) addRoad(el);
      else if (el.tags?.building) addBuilding(el, rnd);
    }
  }

  for (const [id, s, w, n, e] of BLD_TILES) {
    const data = await overpass("bld-" + id, qBuildings(s, w, n, e));
    for (const el of data.elements || []) if (el.type === "way") addBuilding(el, rnd);
  }

  const cityBuildingCount = buildings.length;
  const oblast = gridTiles("ob-", 49.45, 29.25, 51.05, 32.15, 0.32, 0.38)
    .filter((t) => {
      const lat = (t[1] + t[3]) / 2;
      const lon = (t[2] + t[4]) / 2;
      return !(lat > 50.32 && lat < 50.59 && lon > 30.24 && lon < 30.82);
    });
  console.log("oblast tiles", oblast.length);
  const northGap = [
    ["ob35a", 50.73, 30.39, 50.89, 30.58],
    ["ob35b", 50.73, 30.58, 50.89, 30.77],
    ["ob35c", 50.89, 30.39, 51.05, 30.58],
    ["ob35d", 50.89, 30.58, 51.05, 30.77],
  ];
  for (const [id, s, w, n, e] of oblast.concat(northGap)) {
    const data = await overpass(id, `[out:json][timeout:180];
(
  way["highway"~"${LOCAL}"](${s},${w},${n},${e});
  way["building"~"${HOUSE}"](${s},${w},${n},${e});
);
out geom;`);
    for (const el of data.elements || []) {
      if (el.type !== "way") continue;
      if (el.tags?.highway) addRoad(el);
      else if (el.tags?.building) addBuilding(el, rnd);
    }
  }

  const riversQ = await overpass("rivers", `[out:json][timeout:90];
way["waterway"="river"]["name"~"Дніпро|Десна|Ірпінь"](50.2,30.15,50.62,30.9);
out geom;`);
  for (const el of riversQ.elements || []) if (el.type === "way") addNature(el);
  const parksQ = await overpass("parks", `[out:json][timeout:90];
(
  way["leisure"~"park|garden"](50.39,30.4,50.53,30.67);
  way["natural"="water"](50.42,30.48,50.48,30.63);
);
out geom;`);
  for (const el of parksQ.elements || []) if (el.type === "way") addNature(el);

  thinBuildings(64000, 100000, cityBuildingCount);
  if (!rivers.length) {
    const spine = [[50.59, 30.5], [50.54, 30.53], [50.49, 30.555], [50.45, 30.572], [50.41, 30.595], [50.36, 30.63]];
    rivers.push({ p: packLine(spine.map(([lat, lon]) => project(lat, lon))), w: 720, n: "Дніпро" });
  }
  fillerBuildings(rnd);

  const [sx, sz] = project(50.4492, 30.5222);
  const spawn = snapSpawn(sx, sz);
  const sights = SIGHTS.map(([id, name, lat, lon, icon, note]) => {
    const [x, z] = project(lat, lon);
    return { id, n: name, x: r1(x), z: r1(z), icon, note, kind: "sight" };
  });
  const towns = TOWNS.map(([n, lat, lon]) => {
    const [x, z] = project(lat, lon);
    return { n, x: r1(x), z: r1(z) };
  });

  const city = {
    attribution: "Map data © OpenStreetMap contributors, ODbL 1.0. https://www.openstreetmap.org/copyright",
    frame: { lat0: LAT0, lon0: LON0 },
    spawn,
    roads,
    buildings,
    rivers,
    lakes,
    parks,
    trees: treesFrom(rnd),
    sights,
    towns,
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(city));
  const mb = (fs.statSync(OUT).size / 1048576).toFixed(1);
  console.log("roads", roads.length, "buildings", buildings.length, "rivers", rivers.length, "parks", parks.length, "trees", city.trees.length / 2);
  console.log("wrote", OUT, mb, "MB");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
