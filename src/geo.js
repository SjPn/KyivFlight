import { heightAt } from "./elev.js";

export const CELL = 80;

const GROUND_Y = 0.16;
const DECK_Y = 4.05;
const RAMP = 52;

function refineLine(p) {
  const out = [];
  const push = (x, z) => {
    const n = out.length;
    if (n >= 2 && Math.hypot(x - out[n - 2], z - out[n - 1]) < 0.9) return;
    out.push(x, z);
  };
  const split = (x0, z0, x1, z1, depth) => {
    const h0 = heightAt(x0, z0);
    const h1 = heightAt(x1, z1);
    const L = Math.hypot(x1 - x0, z1 - z0);
    if (depth < 3 && L > 24 && Math.abs(h1 - h0) > 6) {
      const mx = (x0 + x1) * 0.5;
      const mz = (z0 + z1) * 0.5;
      split(x0, z0, mx, mz, depth + 1);
      split(mx, mz, x1, z1, depth + 1);
      return;
    }
    push(x1, z1);
  };
  if (!p || p.length < 4) return p;
  push(p[0], p[1]);
  for (let i = 0; i < p.length - 2; i += 2) split(p[i], p[i + 1], p[i + 2], p[i + 3], 0);
  return out.length >= 4 ? out : p;
}

function smoothProfile(ey) {
  const n = ey.length;
  if (n < 3) return;
  const base = ey.slice();
  const y = ey.slice();
  for (let pass = 0; pass < 2; pass++) {
    const next = y.slice();
    for (let i = 1; i < n - 1; i++) next[i] = y[i] * 0.5 + (y[i - 1] + y[i + 1]) * 0.25;
    for (let i = 1; i < n - 1; i++) y[i] = next[i];
  }
  for (let i = 1; i < n - 1; i++) ey[i] = y[i] * 0.45 + base[i] * 0.55;
}

export function roadHalf(w, cls) {
  const boost = cls === "motorway" || cls === "trunk" || cls === "primary" ? 1.35 : 1.12;
  return Math.max(3.1, (w || 6) * 0.5 * boost);
}

function prepareRoads(city) {
  const cell = 8;
  const buckets = new Map();
  const put = (x, z, item) => {
    const k = Math.round(x / cell) * 100003 + Math.round(z / cell);
    let a = buckets.get(k);
    if (!a) buckets.set(k, a = []);
    a.push(item);
  };

  for (const road of city.roads) {
    if (!road.br && road.p && road.p.length >= 4) road.p = refineLine(road.p);
    const p = road.p;
    if (!p || p.length < 4) continue;
    const n = p.length / 2;
    const along = [0];
    for (let i = 1; i < n; i++) {
      along.push(along[i - 1] + Math.hypot(p[i * 2] - p[(i - 1) * 2], p[i * 2 + 1] - p[(i - 1) * 2 + 1]));
    }
    road._along = along;
    const own = roadHalf(road.w, road.c);
    road.hw = new Array(n).fill(own);
    road.ey = new Array(n);
    for (let i = 0; i < n; i++) road.ey[i] = heightAt(p[i * 2], p[i * 2 + 1]) + 0.9;
    if (!road.br) smoothProfile(road.ey);
    if (!road.br) {
      put(p[0], p[1], { x: p[0], z: p[1], road, i: 0, ground: true });
      put(p[n * 2 - 2], p[n * 2 - 1], { x: p[n * 2 - 2], z: p[n * 2 - 1], road, i: n - 1, ground: true });
    }
  }

  const weldCell = 8;
  const weld = new Map();
  const weldVerts = [];
  const weldPut = (v) => {
    const k = Math.round(v.x / weldCell) * 100003 + Math.round(v.z / weldCell);
    let a = weld.get(k);
    if (!a) weld.set(k, a = []);
    a.push(v);
  };
  for (const road of city.roads) {
    if (road.br || !road.ey) continue;
    const p = road.p;
    const last = road.ey.length - 1;
    const ends = last > 0 ? [0, last] : [0];
    for (const i of ends) {
      const v = { road, i, x: p[i * 2], z: p[i * 2 + 1] };
      weldVerts.push(v);
      weldPut(v);
    }
  }
  for (let pass = 0; pass < 2; pass++) {
    const next = new Float64Array(weldVerts.length);
    for (let n = 0; n < weldVerts.length; n++) {
      const v = weldVerts[n];
      let sum = v.road.ey[v.i];
      let count = 1;
      const ix = Math.round(v.x / weldCell);
      const iz = Math.round(v.z / weldCell);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          const bucket = weld.get((ix + dx) * 100003 + (iz + dz));
          if (!bucket) continue;
          for (const o of bucket) {
            if (o.road === v.road) continue;
            if (Math.hypot(o.x - v.x, o.z - v.z) > 8) continue;
            sum += o.road.ey[o.i];
            count++;
          }
        }
      }
      next[n] = count > 1 ? v.road.ey[v.i] * 0.4 + sum / count * 0.6 : v.road.ey[v.i];
    }
    for (let n = 0; n < weldVerts.length; n++) weldVerts[n].road.ey[weldVerts[n].i] = next[n];
  }
  const bankAt = (x, z, fallback) => {
    let best = 42;
    let y = fallback;
    const ix = Math.round(x / weldCell);
    const iz = Math.round(z / weldCell);
    const reach = 5;
    for (let dx = -reach; dx <= reach; dx++) {
      for (let dz = -reach; dz <= reach; dz++) {
        const bucket = weld.get((ix + dx) * 100003 + (iz + dz));
        if (!bucket) continue;
        for (const o of bucket) {
          const d = Math.hypot(o.x - x, o.z - z);
          if (d < best) {
            best = d;
            y = o.road.ey[o.i];
          }
        }
      }
    }
    return y;
  };
  for (const road of city.roads) {
    if (!road.br || !road.ey) continue;
    const n = road.ey.length;
    const p = road.p;
    const total = road._along[n - 1] || 1;
    const y0 = bankAt(p[0], p[1], road.ey[0]);
    const y1 = bankAt(p[n * 2 - 2], p[n * 2 - 1], road.ey[n - 1]);
    for (let i = 0; i < n; i++) {
      const t = road._along[i] / total;
      const arch = Math.sin(Math.PI * t) * Math.min(3.5, total * 0.0025);
      road.ey[i] = y0 + (y1 - y0) * t + arch;
    }
  }

  for (const road of city.roads) {
    if (!road.ey) continue;
    const n = road.ey.length;
    const p = road.p;
    put(p[0], p[1], { x: p[0], z: p[1], road, i: 0, end: true });
    put(p[n * 2 - 2], p[n * 2 - 1], { x: p[n * 2 - 2], z: p[n * 2 - 1], road, i: n - 1, end: true });
  }

  for (const road of city.roads) {
    if (!road.hw) continue;
    const p = road.p;
    const n = road.hw.length;
    const own = road.hw[0];
    const meet = (x, z) => {
      let max = own;
      const ix = Math.round(x / cell);
      const iz = Math.round(z / cell);
      for (let dx = -3; dx <= 3; dx++) {
        for (let dz = -3; dz <= 3; dz++) {
          const a = buckets.get((ix + dx) * 100003 + (iz + dz));
          if (!a) continue;
          for (let n = 0; n < a.length; n++) {
            const b = a[n];
            if (!b.end || Math.hypot(b.x - x, b.z - z) > 18) continue;
            const hw = b.road.hw[b.i];
            if (hw > max) max = hw;
          }
        }
      }
      return max;
    };
    const h0 = meet(p[0], p[1]);
    const h1 = meet(p[n * 2 - 2], p[n * 2 - 1]);
    const total = road._along[n - 1] || 0;
    const flare = 68;
    for (let i = 0; i < n; i++) {
      const ds = road._along[i];
      const de = total - ds;
      let h = own;
      if (ds < flare) h = h0 + (own - h0) * (ds / flare);
      if (de < flare) h = Math.max(h, h1 + (own - h1) * (de / flare));
      road.hw[i] = h;
    }
    delete road._along;
  }
}

function roadGrid(roads) {
  const cell = 120;
  const grid = new Map();
  const add = (x, z, seg) => {
    const k = Math.floor(x / cell) + "," + Math.floor(z / cell);
    let a = grid.get(k);
    if (!a) grid.set(k, a = []);
    a.push(seg);
  };
  for (const road of roads) {
    if (road.br) continue;
    const p = road.p;
    if (!p) continue;
    for (let i = 0; i < p.length - 2; i += 2) {
      const x0 = p[i], z0 = p[i + 1], x1 = p[i + 2], z1 = p[i + 3];
      const L = Math.hypot(x1 - x0, z1 - z0);
      if (L < 0.4) continue;
      const seg = { x0, z0, x1, z1, L, hw: Math.max(4, (road.w || 6) * 0.55) };
      const steps = Math.ceil(L / cell);
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        add(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, seg);
      }
    }
  }
  return { grid, cell };
}

function segHit(x, z, s) {
  const vx = s.x1 - s.x0;
  const vz = s.z1 - s.z0;
  const t = Math.max(0, Math.min(1, ((x - s.x0) * vx + (z - s.z0) * vz) / (s.L * s.L || 1)));
  const px = s.x0 + vx * t;
  const pz = s.z0 + vz * t;
  return { d: Math.hypot(x - px, z - pz), px, pz, tx: vx / s.L, tz: vz / s.L };
}

function channelIndex(rivers) {
  const cell = 280;
  const grid = new Map();
  let count = 0;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  const add = (x, z, seg) => {
    const k = Math.floor(x / cell) + "," + Math.floor(z / cell);
    let a = grid.get(k);
    if (!a) grid.set(k, a = []);
    a.push(seg);
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  };
  for (const river of rivers) {
    if ((river.w || 0) < 400) continue;
    const p = river.p;
    if (!p) continue;
    for (let i = 0; i < p.length - 2; i += 2) {
      const x0 = p[i], z0 = p[i + 1], x1 = p[i + 2], z1 = p[i + 3];
      const L = Math.hypot(x1 - x0, z1 - z0);
      if (L < 1) continue;
      const seg = { x0, z0, x1, z1, L };
      count++;
      const steps = Math.ceil(L / cell);
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        add(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, seg);
      }
    }
  }
  function nearest(x, z) {
    const ix = Math.floor(x / cell);
    const iz = Math.floor(z / cell);
    let best = null;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const a = grid.get(ix + dx + "," + (iz + dz));
        if (!a) continue;
        for (let n = 0; n < a.length; n++) {
          const hit = segHit(x, z, a[n]);
          if (!best || hit.d < best.d) best = hit;
        }
      }
    }
    return best;
  }
  function touches(p) {
    if (!count || !p) return false;
    const pad = 160;
    for (let i = 0; i < p.length; i += 2) {
      const x = p[i], z = p[i + 1];
      if (x >= minX - pad && x <= maxX + pad && z >= minZ - pad && z <= maxZ + pad) return true;
    }
    return false;
  }
  return { nearest, count, touches };
}

function shoreHalf(roads, x, z, nx, nz, cap) {
  const reach = Math.ceil(cap / roads.cell) + 1;
  const ix = Math.floor(x / roads.cell);
  const iz = Math.floor(z / roads.cell);
  let best = cap;
  const seen = new Set();
  for (let gx = -reach; gx <= reach; gx++) {
    for (let gz = -reach; gz <= reach; gz++) {
      const a = roads.grid.get(ix + gx + "," + (iz + gz));
      if (!a) continue;
      for (const s of a) {
        if (seen.has(s)) continue;
        seen.add(s);
        const hit = segHit(x, z, s);
        if (hit.d > cap + 8) continue;
        const along = (hit.px - x) * nx + (hit.pz - z) * nz;
        if (along < 26) continue;
        const gap = along - s.hw - 16;
        if (gap > 28 && gap < best) best = gap;
      }
    }
  }
  return Math.max(48, Math.min(cap, best));
}

function fitWater(city) {
  const channel = channelIndex(city.rivers || []);
  if (channel.count) {
    const kept = [];
    for (const road of city.roads) {
      if (road.br) {
        kept.push(road);
        continue;
      }
      const p = road.p;
      if (!p || p.length < 4 || !channel.touches(p)) {
        kept.push(road);
        continue;
      }
      let cross = 0;
      let follow = 0;
      for (let i = 0; i < p.length - 2; i += 2) {
        const x0 = p[i], z0 = p[i + 1], x1 = p[i + 2], z1 = p[i + 3];
        const L = Math.hypot(x1 - x0, z1 - z0);
        if (L < 6) continue;
        const steps = Math.max(1, Math.ceil(L / 28));
        const rdx = (x1 - x0) / L;
        const rdz = (z1 - z0) / L;
        for (let s = 0; s <= steps; s++) {
          const t = s / steps;
          const hit = channel.nearest(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t);
          if (!hit || hit.d > 58) continue;
          const align = Math.abs(rdx * hit.tx + rdz * hit.tz);
          const bit = L / steps;
          if (align < 0.38) cross += bit;
          else follow += bit;
        }
      }
      if (cross > 90 && cross > follow * 1.4) {
        road.br = 1;
        kept.push(road);
        continue;
      }
      let part = [];
      const flush = () => {
        if (part.length >= 4) kept.push({ ...road, p: part });
        part = [];
      };
      for (let i = 0; i < p.length; i += 2) {
        const x = p[i], z = p[i + 1];
        const hit = channel.nearest(x, z);
        const wet = hit && hit.d < 58;
        if (part.length >= 2) {
          const lx = part[part.length - 2];
          const lz = part[part.length - 1];
          const mid = channel.nearest((lx + x) * 0.5, (lz + z) * 0.5);
          if (wet || (mid && mid.d < 58)) {
            flush();
            if (!wet) part.push(x, z);
            continue;
          }
        }
        if (wet) {
          flush();
          continue;
        }
        part.push(x, z);
      }
      flush();
    }
    city.roads = kept;
  }

  const banks = roadGrid(city.roads);
  for (const river of city.rivers || []) {
    const p = river.p;
    if (!p || p.length < 4) continue;
    const n = p.length / 2;
    const hl = new Array(n);
    const hr = new Array(n);
    const cap = (river.w || 80) * 0.5;
    for (let i = 0; i < n; i++) {
      const i0 = Math.max(0, i - 1);
      const i1 = Math.min(n - 1, i + 1);
      let dx = p[i1 * 2] - p[i0 * 2];
      let dz = p[i1 * 2 + 1] - p[i0 * 2 + 1];
      const L = Math.hypot(dx, dz) || 1;
      dx /= L;
      dz /= L;
      const x = p[i * 2];
      const z = p[i * 2 + 1];
      hl[i] = shoreHalf(banks, x, z, -dz, dx, cap);
      hr[i] = shoreHalf(banks, x, z, dz, -dx, cap);
    }
    for (let pass = 0; pass < 2; pass++) {
      const sl = hl.slice();
      const sr = hr.slice();
      for (let i = 1; i < n - 1; i++) {
        hl[i] = (sl[i - 1] + sl[i] * 2 + sl[i + 1]) / 4;
        hr[i] = (sr[i - 1] + sr[i] * 2 + sr[i + 1]) / 4;
      }
    }
    river.hl = hl;
    river.hr = hr;
  }
  pinShore(city);
}

function pinShore(city) {
  const cell = 220;
  const grid = new Map();
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  const add = (x, z, seg) => {
    const k = Math.floor(x / cell) + "," + Math.floor(z / cell);
    let a = grid.get(k);
    if (!a) grid.set(k, a = []);
    a.push(seg);
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  };
  for (const river of city.rivers || []) {
    if (!river.hl || !river.hr) continue;
    const p = river.p;
    for (let i = 0; i < p.length - 2; i += 2) {
      const x0 = p[i], z0 = p[i + 1], x1 = p[i + 2], z1 = p[i + 3];
      const L = Math.hypot(x1 - x0, z1 - z0);
      if (L < 1) continue;
      const seg = { river, i: i / 2, x0, z0, x1, z1, L };
      const steps = Math.ceil(L / cell);
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        add(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, seg);
      }
    }
  }
  for (const road of city.roads) {
    if (road.br) continue;
    const p = road.p;
    if (!p) continue;
    const pad = cell;
    let near = false;
    for (let i = 0; i < p.length; i += 2) {
      const x = p[i], z = p[i + 1];
      if (x >= minX - pad && x <= maxX + pad && z >= minZ - pad && z <= maxZ + pad) {
        near = true;
        break;
      }
    }
    if (!near) continue;
    const hw = Math.max(4, (road.w || 6) * 0.55);
    let stamp = 1;
    for (let i = 0; i < p.length; i += 2) {
      const x = p[i], z = p[i + 1];
      const ix = Math.floor(x / cell);
      const iz = Math.floor(z / cell);
      stamp++;
      for (let gx = -1; gx <= 1; gx++) {
        for (let gz = -1; gz <= 1; gz++) {
          const a = grid.get(ix + gx + "," + (iz + gz));
          if (!a) continue;
          for (const s of a) {
            if (s._stamp === stamp) continue;
            s._stamp = stamp;
            const vx = s.x1 - s.x0;
            const vz = s.z1 - s.z0;
            const t = Math.max(0, Math.min(1, ((x - s.x0) * vx + (z - s.z0) * vz) / (s.L * s.L || 1)));
            const px = s.x0 + vx * t;
            const pz = s.z0 + vz * t;
            const d = Math.hypot(x - px, z - pz);
            const tx = vx / s.L;
            const tz = vz / s.L;
            const side = tx * (z - pz) - tz * (x - px);
            const i0 = s.i;
            const half = side >= 0
              ? s.river.hl[i0] + (s.river.hl[i0 + 1] - s.river.hl[i0]) * t
              : s.river.hr[i0] + (s.river.hr[i0 + 1] - s.river.hr[i0]) * t;
            if (d > half - 2) continue;
            const gap = Math.max(48, d - hw - 18);
            const arr = side >= 0 ? s.river.hl : s.river.hr;
            arr[i0] = Math.min(arr[i0], gap);
            arr[i0 + 1] = Math.min(arr[i0 + 1], gap);
          }
        }
      }
    }
  }
}

export function presentEast(city) {
  const flipLine = (p) => {
    if (!p) return;
    for (let i = 0; i < p.length; i += 2) p[i] = -p[i];
  };
  for (const road of city.roads || []) flipLine(road.p);
  for (const river of city.rivers || []) flipLine(river.p);
  for (const lake of city.lakes || []) flipLine(lake);
  for (const park of city.parks || []) flipLine(park);
  flipLine(city.trees);
  for (const b of city.buildings || []) {
    b.x = -b.x;
    if (b.rot) b.rot = -b.rot;
  }
  for (const s of city.sights || []) s.x = -s.x;
  for (const t of city.towns || []) t.x = -t.x;
  if (city.spawn) {
    city.spawn.x = -city.spawn.x;
    city.spawn.h = -(city.spawn.h || 0);
  }
}

export function indexCity(city) {
  fitWater(city);
  prepareRoads(city);
  const roadCells = new Map();
  const bldCells = new Map();
  const riverCells = new Map();

  const put = (map, x, z, item) => {
    const k = Math.floor(x / CELL) + "," + Math.floor(z / CELL);
    let a = map.get(k);
    if (!a) {
      a = [];
      map.set(k, a);
    }
    a.push(item);
  };

  for (let i = 0; i < city.roads.length; i++) {
    const r = city.roads[i];
    const p = r.p;
    const lens = [];
    let total = 0;
    for (let j = 0; j < p.length - 2; j += 2) {
      const len = Math.hypot(p[j + 2] - p[j], p[j + 3] - p[j + 1]);
      lens.push(len);
      total += len;
    }
    let acc = 0;
    for (let j = 0, k = 0; j < p.length - 2; j += 2, k++) {
      const len = lens[k];
      const seg = {
        x0: p[j], z0: p[j + 1], x1: p[j + 2], z1: p[j + 3],
        w: r.w, br: r.br || 0, n: r.n || "", c: r.c, ow: r.ow || 0, i, j,
        y0: r.ey[k], y1: r.ey[k + 1], hw0: r.hw[k], hw1: r.hw[k + 1],
      };
      acc += len;
      const steps = Math.max(1, Math.ceil(len / CELL));
      for (let s = 0; s <= steps; s++) {
        put(roadCells, seg.x0 + ((seg.x1 - seg.x0) * s) / steps, seg.z0 + ((seg.z1 - seg.z0) * s) / steps, seg);
      }
    }
  }

  for (const b of city.buildings) {
    b.base = heightAt(b.x, b.z);
    const reach = Math.hypot(b.w, b.d) * 0.5;
    const seen = new Set();
    for (let x = b.x - reach; x <= b.x + reach + 0.01; x += CELL) {
      for (let z = b.z - reach; z <= b.z + reach + 0.01; z += CELL) {
        const k = Math.floor(x / CELL) + "," + Math.floor(z / CELL);
        if (seen.has(k)) continue;
        seen.add(k);
        put(bldCells, x, z, b);
      }
    }
  }

  for (const river of city.rivers) {
    const p = river.p;
    for (let j = 0; j < p.length - 2; j += 2) {
      const i0 = j / 2;
      const half = river.hl && river.hr
        ? Math.min(river.hl[i0], river.hr[i0], river.hl[i0 + 1], river.hr[i0 + 1])
        : (river.w || 40) * 0.5;
      const seg = { x0: p[j], z0: p[j + 1], x1: p[j + 2], z1: p[j + 3], w: half * 2 };
      const len = Math.hypot(seg.x1 - seg.x0, seg.z1 - seg.z0);
      const steps = Math.max(1, Math.ceil(len / CELL));
      for (let s = 0; s <= steps; s++) {
        put(riverCells, seg.x0 + ((seg.x1 - seg.x0) * s) / steps, seg.z0 + ((seg.z1 - seg.z0) * s) / steps, seg);
      }
    }
  }

  const lakes = (city.lakes || []).map((ring) => {
    let minx = Infinity, maxx = -Infinity, minz = Infinity, maxz = -Infinity;
    for (let i = 0; i < ring.length; i += 2) {
      minx = Math.min(minx, ring[i]);
      maxx = Math.max(maxx, ring[i]);
      minz = Math.min(minz, ring[i + 1]);
      maxz = Math.max(maxz, ring[i + 1]);
    }
    return { ring, minx, maxx, minz, maxz };
  });

  const graph = buildGraph(city);
  return { roadCells, bldCells, riverCells, lakes, graph };
}

function localXZ(b, x, z) {
  const yaw = -b.rot;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const dx = x - b.x;
  const dz = z - b.z;
  return {
    lx: dx * cos - dz * sin,
    lz: dx * sin + dz * cos,
  };
}

export function openStreets(city) {
  const roadCells = new Map();
  const put = (x, z, item) => {
    const k = Math.floor(x / CELL) + "," + Math.floor(z / CELL);
    let a = roadCells.get(k);
    if (!a) {
      a = [];
      roadCells.set(k, a);
    }
    a.push(item);
  };
  for (const r of city.roads) {
    const p = r.p;
    for (let j = 0; j < p.length - 2; j += 2) {
      const seg = { x0: p[j], z0: p[j + 1], x1: p[j + 2], z1: p[j + 3], w: r.w || 6, c: r.c };
      const len = Math.hypot(seg.x1 - seg.x0, seg.z1 - seg.z0);
      const steps = Math.max(1, Math.ceil(len / CELL));
      for (let s = 0; s <= steps; s++) {
        put(
          seg.x0 + ((seg.x1 - seg.x0) * s) / steps,
          seg.z0 + ((seg.z1 - seg.z0) * s) / steps,
          seg,
        );
      }
    }
  }
  const kept = [];
  for (const b of city.buildings) {
    const minSide = Math.hypot(b.x, b.z) > 18000 ? 3.4 : 6;
    let w = b.w;
    let d = b.d;
    const reach = Math.hypot(b.w, b.d) * 0.5 + 6;
    const groups = cellsAround(roadCells, b.x, b.z, Math.max(1, Math.ceil(reach / CELL)));
    const seen = new Set();
    let drop = false;
    for (const group of groups) {
      for (const seg of group) {
        if (seen.has(seg)) continue;
        seen.add(seg);
        const len = Math.hypot(seg.x1 - seg.x0, seg.z1 - seg.z0);
        const n = Math.max(1, Math.ceil(len / 12));
        const boost = seg.c === "motorway" || seg.c === "trunk" || seg.c === "primary" ? 1.35 : 1.12;
        const margin = (seg.w || 6) * 0.5 * boost + 3.2;
        for (let s = 0; s <= n; s++) {
          const x = seg.x0 + ((seg.x1 - seg.x0) * s) / n;
          const z = seg.z0 + ((seg.z1 - seg.z0) * s) / n;
          if (Math.hypot(x - b.x, z - b.z) > reach + margin) continue;
          const { lx, lz } = localXZ(b, x, z);
          const gapX = Math.abs(lx) - w * 0.5;
          const gapZ = Math.abs(lz) - d * 0.5;
          const outside = gapX > 0 && gapZ > 0 ? Math.hypot(gapX, gapZ) : Math.max(gapX, gapZ, 0);
          if (outside >= margin) continue;
          const roomX = Math.abs(lx) - margin;
          const roomZ = Math.abs(lz) - margin;
          const canX = roomX >= 3;
          const canZ = roomZ >= 3;
          if (!canX && !canZ) {
            drop = true;
            break;
          }
          if (canX && (!canZ || roomX * d >= roomZ * w)) w = Math.min(w, roomX * 2);
          else d = Math.min(d, roomZ * 2);
          if (w < minSide || d < minSide) {
            drop = true;
            break;
          }
        }
        if (drop) break;
      }
      if (drop) break;
    }
    if (drop || w < minSide || d < minSide) continue;
    if (w === b.w && d === b.d) kept.push(b);
    else kept.push({ ...b, w: Math.round(w * 10) / 10, d: Math.round(d * 10) / 10 });
  }
  city.buildings = kept;
}

const PLAZA = {
  column: 40,
  dome: 34,
  church: 28,
  gate: 22,
  mother: 32,
  arch: 24,
  market: 24,
  stadium: 38,
  palace: 18,
  station: 16,
  square: 18,
  museum: 14,
};

export function clearPlazas(city) {
  city.buildings = city.buildings.filter((b) => {
    const reach = Math.min(b.w, b.d) * 0.28;
    for (const s of city.sights) {
      const r = PLAZA[s.icon] || 0;
      if (r && Math.hypot(b.x - s.x, b.z - s.z) < r + reach) return false;
    }
    return true;
  });
}

export function cellsAround(map, x, z, rad) {
  if (map && map.kind === "grid") return map.around(x, z, rad);
  const cx = Math.floor(x / CELL);
  const cz = Math.floor(z / CELL);
  const out = [];
  for (let ix = cx - rad; ix <= cx + rad; ix++) {
    for (let iz = cz - rad; iz <= cz + rad; iz++) {
      const a = map.get(ix + "," + iz);
      if (a) out.push(a);
    }
  }
  return out;
}

export function deckY(seg, t = 0) {
  if (!seg || seg.y0 == null) return 0.16;
  return seg.y0 + (seg.y1 - seg.y0) * t;
}

function segPoint(seg, x, z) {
  const dx = seg.x1 - seg.x0;
  const dz = seg.z1 - seg.z0;
  const L2 = dx * dx + dz * dz || 1;
  let t = ((x - seg.x0) * dx + (z - seg.z0) * dz) / L2;
  t = Math.max(0, Math.min(1, t));
  return { x: seg.x0 + dx * t, z: seg.z0 + dz * t, t, dx, dz, len: Math.sqrt(L2) };
}

export function nearestRoad(index, x, z, maxDist = 48) {
  const groups = cellsAround(index.roadCells, x, z, Math.max(1, Math.ceil(maxDist / CELL)));
  let best = null;
  let bestD = Infinity;
  for (const group of groups) {
    for (const seg of group) {
      const q = segPoint(seg, x, z);
      const d = Math.hypot(x - q.x, z - q.z);
      const limit = Math.max(maxDist, seg.w * 0.5 + 3);
      if (d < limit && d < bestD) {
        bestD = d;
        best = {
          dist: d,
          x: q.x,
          z: q.z,
          t: q.t,
          heading: Math.atan2(q.dx, q.dz),
          y: deckY(seg, q.t),
          half: seg.hw0 == null ? undefined : seg.hw0 + (seg.hw1 - seg.hw0) * q.t,
          w: seg.w,
          name: seg.n,
          cls: seg.c,
          seg,
        };
      }
    }
  }
  return best;
}

export function streetVisual(b, index) {
  const base = b.base || 0;
  if (!index || b.k === "church") return base;
  const near = nearestRoad(index, b.x, b.z, 14);
  if (near && !near.seg?.br) {
    const hw = (near.half != null ? near.half : Math.max(3.1, (near.w || 6) * 0.55)) * 1.2;
    if (near.dist < hw + 8 && near.y - base < 3.2 && base - near.y < 1.4) return near.y - 0.04;
  }
  return base;
}

export function roadY(index, x, z) {
  const hit = nearestRoad(index, x, z, 18);
  if (!hit) return 0;
  if (hit.dist > hit.w * 0.5 + 2.2) return 0;
  return hit.y;
}

function deckHalf(seg, t) {
  const hw = seg.hw0 == null ? Math.max(3.1, (seg.w || 6) * 0.55) : seg.hw0 + (seg.hw1 - seg.hw0) * t;
  return hw * 1.2 + 0.9;
}

export function roadDeck(index, x, z, y = null) {
  const groups = cellsAround(index.roadCells, x, z, 1);
  const seen = new Set();
  const covers = [];
  for (const group of groups) {
    for (const seg of group) {
      if (seen.has(seg)) continue;
      seen.add(seg);
      const q = segPoint(seg, x, z);
      const dist = Math.hypot(x - q.x, z - q.z);
      const half = deckHalf(seg, q.t);
      if (dist > half) continue;
      covers.push({
        dist,
        x: q.x,
        z: q.z,
        t: q.t,
        heading: Math.atan2(q.dx, q.dz),
        y: deckY(seg, q.t),
        half,
        w: seg.w,
        name: seg.n,
        cls: seg.c,
        seg,
      });
    }
  }
  if (!covers.length) return null;
  if (y == null || !Number.isFinite(y)) {
    covers.sort((a, b) => a.dist - b.dist);
    return covers[0];
  }
  let best = null;
  for (const hit of covers) {
    if (hit.y > y + 1.7) continue;
    if (!best || hit.y > best.y) best = hit;
  }
  if (!best) {
    for (const hit of covers) if (!best || hit.y < best.y) best = hit;
  }
  return best;
}

export function onRoad(index, x, z, y = null) {
  return roadDeck(index, x, z, y);
}

function inRing(x, z, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 2; i < ring.length; i += 2) {
    const xi = ring[i], zi = ring[i + 1];
    const xj = ring[j], zj = ring[j + 1];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi || 1e-9) + xi) inside = !inside;
    j = i;
  }
  return inside;
}

export function waterAt(index, x, z) {
  const groups = cellsAround(index.riverCells, x, z, 6);
  for (const group of groups) {
    for (const seg of group) {
      const q = segPoint(seg, x, z);
      if (Math.hypot(x - q.x, z - q.z) < seg.w * 0.5) return true;
    }
  }
  for (const lake of index.lakes) {
    if (x < lake.minx || x > lake.maxx || z < lake.minz || z > lake.maxz) continue;
    if (inRing(x, z, lake.ring)) return true;
  }
  return false;
}

export function buildingContact(index, x, z, y, radius) {
  const groups = cellsAround(index.bldCells, x, z, 1);
  let wx = 0;
  let wz = 0;
  let hit = false;
  let roof = null;
  const seen = new Set();
  for (const group of groups) {
    for (const b of group) {
      if (seen.has(b)) continue;
      seen.add(b);
      const yaw = -b.rot;
      const cos = Math.cos(yaw);
      const sin = Math.sin(yaw);
      const { lx, lz } = localXZ(b, x, z);
      const hw = b.w * 0.5 + radius;
      const hd = b.d * 0.5 + radius;
      if (Math.abs(lx) > hw || Math.abs(lz) > hd) continue;
      const base = b.base || 0;
      const top = base + b.h;
      if (y < base - 1.2) continue;
      if (y > top + 1.4) {
        if (!roof || top > roof) roof = top;
        continue;
      }
      if (y > top - 0.2 && y < top + 1.4) {
        roof = Math.max(roof || 0, top);
        continue;
      }
      const penX = hw - Math.abs(lx);
      const penZ = hd - Math.abs(lz);
      const ox = penX < penZ ? Math.sign(lx || 1) * penX : 0;
      const oz = penX < penZ ? 0 : Math.sign(lz || 1) * penZ;
      const px = ox * cos + oz * sin;
      const pz = -ox * sin + oz * cos;
      if (px * px + pz * pz >= wx * wx + wz * wz) {
        wx = px;
        wz = pz;
      }
      hit = true;
    }
  }
  return { hit, x: wx, z: wz, roof };
}

function buildGraph(city) {
  const NODE = 30;
  const nodes = new Map();
  const at = (x, z) => {
    const ix = Math.round(x / NODE);
    const iz = Math.round(z / NODE);
    const id = ix + "," + iz;
    let n = nodes.get(id);
    if (!n) {
      n = { id, x: ix * NODE, z: iz * NODE, to: [] };
      nodes.set(id, n);
    }
    return n;
  };
  for (const r of city.roads) {
    if (r.c === "footway" || r.c === "path" || r.c === "steps" || r.c === "cycleway") continue;
    const p = r.p;
    let prev = at(p[0], p[1]);
    for (let i = 2; i < p.length; i += 2) {
      const n = at(p[i], p[i + 1]);
      if (n === prev) continue;
      const d = Math.hypot(n.x - prev.x, n.z - prev.z);
      if (d < 8 || d > 500) {
        prev = n;
        continue;
      }
      prev.to.push(n);
      if (!r.ow) n.to.push(prev);
      prev = n;
    }
  }
  return nodes;
}

export function closestNode(graph, x, z) {
  const ix = Math.round(x / 30);
  const iz = Math.round(z / 30);
  let best = null;
  let bestD = 220 * 220;
  for (let dx = -7; dx <= 7; dx++) {
    for (let dz = -7; dz <= 7; dz++) {
      const n = graph.get(ix + dx + "," + (iz + dz));
      if (!n) continue;
      const d = (n.x - x) ** 2 + (n.z - z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = n;
      }
    }
  }
  return best;
}

export function findPath(graph, x0, z0, x1, z1) {
  const a = closestNode(graph, x0, z0);
  const b = closestNode(graph, x1, z1);
  if (!a || !b) return null;
  if (a === b) return [a];
  const open = [a];
  const g = new Map([[a.id, 0]]);
  const prev = new Map();
  const seen = new Set();
  let guard = 0;
  while (open.length && guard++ < 7000) {
    let bi = 0;
    let best = Infinity;
    for (let i = 0; i < open.length; i++) {
      const n = open[i];
      const f = g.get(n.id) + Math.hypot(n.x - b.x, n.z - b.z);
      if (f < best) {
        best = f;
        bi = i;
      }
    }
    const cur = open.splice(bi, 1)[0];
    if (cur === b) break;
    if (seen.has(cur.id)) continue;
    seen.add(cur.id);
    const base = g.get(cur.id);
    for (const nxt of cur.to) {
      const ng = base + Math.hypot(nxt.x - cur.x, nxt.z - cur.z);
      if (ng < (g.get(nxt.id) ?? Infinity)) {
        g.set(nxt.id, ng);
        prev.set(nxt.id, cur);
        open.push(nxt);
      }
    }
  }
  if (!prev.has(b.id) && a !== b) return null;
  const path = [b];
  let c = b;
  while (c !== a) {
    c = prev.get(c.id);
    if (!c) return null;
    path.push(c);
  }
  path.reverse();
  return path;
}

export function randomRoadPoint(index, x, z, minD, maxD, rnd) {
  for (let attempt = 0; attempt < 80; attempt++) {
    const ang = rnd() * Math.PI * 2;
    const dist = minD + rnd() * (maxD - minD);
    const tx = x + Math.sin(ang) * dist;
    const tz = z + Math.cos(ang) * dist;
    const hit = nearestRoad(index, tx, tz, 70);
    if (hit && hit.cls !== "motorway") return hit;
  }
  return nearestRoad(index, x, z, 120);
}

export function pointInRing(x, z, ring) {
  return inRing(x, z, ring);
}
