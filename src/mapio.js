const CELL = 80;
const CLASSES = [
  "", "motorway", "trunk", "primary", "secondary", "tertiary", "residential",
  "living_street", "unclassified", "service", "track", "path", "footway",
  "cycleway", "pedestrian", "road", "steps", "bridleway",
];
const KINDS = ["", "res", "fill", "com", "church", "house", "apartments", "industrial", "commercial"];

class Writer {
  constructor() {
    this.b = new Uint8Array(1 << 20);
    this.n = 0;
    this.view = new DataView(this.b.buffer);
  }
  need(extra) {
    if (this.n + extra <= this.b.length) return;
    let len = this.b.length;
    while (len < this.n + extra) len *= 2;
    const next = new Uint8Array(len);
    next.set(this.b.subarray(0, this.n));
    this.b = next;
    this.view = new DataView(next.buffer);
  }
  u8(v) { this.need(1); this.b[this.n++] = v & 255; }
  u16(v) { this.need(2); this.view.setUint16(this.n, v, true); this.n += 2; }
  u32(v) { this.need(4); this.view.setUint32(this.n, v, true); this.n += 4; }
  i32(v) { this.need(4); this.view.setInt32(this.n, v, true); this.n += 4; }
  f32(v) { this.need(4); this.view.setFloat32(this.n, v || 0, true); this.n += 4; }
  str(s) {
    const bytes = new TextEncoder().encode(s || "");
    this.u32(bytes.length);
    this.need(bytes.length);
    this.b.set(bytes, this.n);
    this.n += bytes.length;
  }
  f32s(arr) {
    const list = arr || [];
    this.u32(list.length);
    this.need(list.length * 4);
    for (let i = 0; i < list.length; i++) this.view.setFloat32(this.n + i * 4, list[i] || 0, true);
    this.n += list.length * 4;
  }
  finish() { return this.b.slice(0, this.n); }
}

class Reader {
  constructor(buf) {
    this.b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    this.n = 0;
    this.view = new DataView(this.b.buffer, this.b.byteOffset, this.b.byteLength);
    this.text = new TextDecoder();
  }
  u8() { return this.b[this.n++]; }
  u16() { const v = this.view.getUint16(this.n, true); this.n += 2; return v; }
  u32() { const v = this.view.getUint32(this.n, true); this.n += 4; return v; }
  i32() { const v = this.view.getInt32(this.n, true); this.n += 4; return v; }
  f32() { const v = this.view.getFloat32(this.n, true); this.n += 4; return v; }
  str() {
    const len = this.u32();
    const s = this.text.decode(this.b.subarray(this.n, this.n + len));
    this.n += len;
    return s;
  }
  f32s() {
    const len = this.u32();
    const out = new Float32Array(len);
    for (let i = 0; i < len; i++) out[i] = this.view.getFloat32(this.n + i * 4, true);
    this.n += len * 4;
    return out;
  }
}

function dictId(list, value) {
  const name = value || "";
  let id = list.indexOf(name);
  if (id >= 0) return id;
  if (list.length < 254) {
    list.push(name);
    return list.length - 1;
  }
  return 255;
}

function writeDict(w, list) {
  w.u16(list.length);
  for (const name of list) w.str(name);
}

function readDict(r) {
  const n = r.u16();
  const list = [];
  for (let i = 0; i < n; i++) list.push(r.str());
  return list;
}

function splitKey(key) {
  const c = key.indexOf(",");
  return [Number(key.slice(0, c)), Number(key.slice(c + 1))];
}

function unique(items) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    if (seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  return out;
}

const EMPTY = -2147483648;

function mixCell(ix, iz) {
  return (Math.imul(ix, 73856093) ^ Math.imul(iz, 19349663)) >>> 0;
}

function cellAt(grid, ix, iz) {
  let h = mixCell(ix, iz) & grid.mask;
  const keysX = grid.keysX;
  const keysZ = grid.keysZ;
  while (keysX[h] !== EMPTY) {
    if (keysX[h] === ix && keysZ[h] === iz) {
      const start = grid.start[h];
      const count = grid.count[h];
      const out = new Array(count);
      const items = grid.items;
      const objs = grid.objs;
      for (let i = 0; i < count; i++) out[i] = objs[items[start + i]];
      return out;
    }
    h = (h + 1) & grid.mask;
  }
  return null;
}

function packGrid(ix, iz, counts, items, objs) {
  const n = ix.length;
  let cap = 16;
  const need = Math.max(16, n * 2);
  while (cap < need) cap <<= 1;
  const keysX = new Int32Array(cap);
  const keysZ = new Int32Array(cap);
  keysX.fill(EMPTY);
  const start = new Int32Array(cap);
  const count = new Uint32Array(cap);
  const mask = cap - 1;
  let cursor = 0;
  for (let i = 0; i < n; i++) {
    const x = ix[i];
    const z = iz[i];
    let h = mixCell(x, z) & mask;
    while (keysX[h] !== EMPTY) h = (h + 1) & mask;
    keysX[h] = x;
    keysZ[h] = z;
    start[h] = cursor;
    count[h] = counts[i];
    cursor += counts[i];
  }
  const grid = { kind: "grid", cell: CELL, size: n, mask, keysX, keysZ, start, count, items, objs };
  grid.around = (x, z, rad) => {
    const cx = Math.floor(x / CELL);
    const cz = Math.floor(z / CELL);
    const out = [];
    for (let gx = cx - rad; gx <= cx + rad; gx++) {
      for (let gz = cz - rad; gz <= cz + rad; gz++) {
        const group = cellAt(grid, gx, gz);
        if (group) out.push(group);
      }
    }
    return out;
  };
  return grid;
}

export function encodeCity(city, index) {
  const w = new Writer();
  w.u8(75); w.u8(82); w.u8(48); w.u8(50);
  w.u16(2);
  w.u8(1);
  const classes = CLASSES.slice();
  const kinds = KINDS.slice();
  for (const road of city.roads) dictId(classes, road.c);
  for (const b of city.buildings) dictId(kinds, b.k);
  writeDict(w, classes);
  writeDict(w, kinds);

  const spawn = city.spawn || { x: 0, z: 0, h: 0 };
  w.f32(spawn.x); w.f32(spawn.z); w.f32(spawn.h || 0);

  w.u32(city.roads.length);
  for (const road of city.roads) {
    const cls = dictId(classes, road.c);
    w.u8(cls === 255 ? 255 : cls);
    if (cls === 255) w.str(road.c || "");
    w.u8((road.br ? 1 : 0) | (road.ow ? 2 : 0));
    w.f32(road.w || 0);
    w.str(road.n || "");
    const p = road.p || [];
    const n = p.length / 2;
    w.f32s(p);
    w.f32s(road.ey || new Array(n).fill(0));
    w.f32s(road.hw || new Array(n).fill(0));
  }

  w.u32(city.buildings.length);
  for (const b of city.buildings) {
    w.f32(b.x); w.f32(b.z); w.f32(b.w); w.f32(b.d); w.f32(b.h); w.f32(b.rot || 0); w.f32(b.base || 0);
    w.f32(b.deck != null ? b.deck : (b.base || 0));
    const kind = dictId(kinds, b.k);
    w.u8(kind === 255 ? 255 : kind);
    if (kind === 255) w.str(b.k || "");
  }

  const rivers = city.rivers || [];
  w.u32(rivers.length);
  for (const river of rivers) {
    w.str(river.n || "");
    w.f32(river.w || 0);
    w.f32s(river.p || []);
    w.u8(river.hl && river.hr ? 1 : 0);
    if (river.hl && river.hr) {
      w.f32s(river.hl);
      w.f32s(river.hr);
    }
  }

  const writeRings = (rings) => {
    const list = rings || [];
    w.u32(list.length);
    for (const ring of list) w.f32s(ring);
  };
  writeRings(city.lakes);
  writeRings(city.parks);
  w.f32s(city.trees || []);

  const sights = city.sights || [];
  w.u32(sights.length);
  for (const s of sights) {
    w.str(s.id || ""); w.str(s.n || ""); w.str(s.icon || ""); w.str(s.note || ""); w.str(s.kind || "");
    w.f32(s.x); w.f32(s.z);
  }
  const towns = city.towns || [];
  w.u32(towns.length);
  for (const t of towns) {
    w.str(t.n || "");
    w.f32(t.x); w.f32(t.z);
  }

  const bIndex = new Map();
  city.buildings.forEach((b, i) => bIndex.set(b, i));

  const writePointCells = (map, putId) => {
    w.u32(map.size);
    for (const [key, items] of map) {
      const [ix, iz] = splitKey(key);
      const list = unique(items);
      w.i32(ix); w.i32(iz); w.u32(list.length);
      for (const item of list) putId(item);
    }
  };
  writePointCells(index.roadCells, (seg) => {
    w.u32(seg.i || 0);
    w.u32((seg.j || 0) / 2);
  });
  writePointCells(index.bldCells, (b) => {
    w.u32(bIndex.get(b) || 0);
  });

  const riverIds = new Map();
  const riverSegs = [];
  for (const items of index.riverCells.values()) {
    for (const seg of items) {
      if (riverIds.has(seg)) continue;
      riverIds.set(seg, riverSegs.length);
      riverSegs.push(seg);
    }
  }
  w.u32(riverSegs.length);
  for (const seg of riverSegs) {
    w.f32(seg.x0); w.f32(seg.z0); w.f32(seg.x1); w.f32(seg.z1); w.f32(seg.w || 0);
  }
  writePointCells(index.riverCells, (seg) => {
    w.u32(riverIds.get(seg) || 0);
  });
  return w.finish();
}

function lakeBoxes(lakes) {
  return (lakes || []).map((ring) => {
    let minx = Infinity, maxx = -Infinity, minz = Infinity, maxz = -Infinity;
    for (let i = 0; i < ring.length; i += 2) {
      minx = Math.min(minx, ring[i]);
      maxx = Math.max(maxx, ring[i]);
      minz = Math.min(minz, ring[i + 1]);
      maxz = Math.max(maxz, ring[i + 1]);
    }
    return { ring, minx, maxx, minz, maxz };
  });
}

export function decodeCity(buf) {
  const r = new Reader(buf);
  if (r.u8() !== 75 || r.u8() !== 82 || r.u8() !== 48 || r.u8() !== 50) throw new Error("Map file is not a Kyiv chart");
  const version = r.u16();
  if (version !== 1 && version !== 2) throw new Error("Map file is from a different build");
  if (version >= 2) r.u8();
  const classes = readDict(r);
  const kinds = readDict(r);
  const city = {
    baked: 1,
    spawn: { x: r.f32(), z: r.f32(), h: r.f32() },
    roads: [],
    buildings: [],
    rivers: [],
    lakes: [],
    parks: [],
    trees: null,
    sights: [],
    towns: [],
  };
  const roadCount = r.u32();
  for (let i = 0; i < roadCount; i++) {
    let cls = r.u8();
    if (cls === 255) cls = r.str();
    else cls = classes[cls] || "";
    const flags = r.u8();
    const road = { w: r.f32(), c: cls, n: r.str(), p: r.f32s() };
    if (flags & 1) road.br = 1;
    if (flags & 2) road.ow = 1;
    road.ey = r.f32s();
    road.hw = r.f32s();
    city.roads.push(road);
  }
  const bCount = r.u32();
  for (let i = 0; i < bCount; i++) {
    const b = { x: r.f32(), z: r.f32(), w: r.f32(), d: r.f32(), h: r.f32(), rot: r.f32(), base: r.f32() };
    if (version >= 2) b.deck = r.f32();
    let kind = r.u8();
    b.k = kind === 255 ? r.str() : (kinds[kind] || "");
    city.buildings.push(b);
  }
  const riverCount = r.u32();
  for (let i = 0; i < riverCount; i++) {
    const river = { n: r.str(), w: r.f32(), p: r.f32s() };
    if (r.u8()) {
      river.hl = r.f32s();
      river.hr = r.f32s();
    }
    city.rivers.push(river);
  }
  const readRings = () => {
    const n = r.u32();
    const rings = [];
    for (let i = 0; i < n; i++) rings.push(r.f32s());
    return rings;
  };
  city.lakes = readRings();
  city.parks = readRings();
  city.trees = r.f32s();
  const sightCount = r.u32();
  for (let i = 0; i < sightCount; i++) {
    city.sights.push({ id: r.str(), n: r.str(), icon: r.str(), note: r.str(), kind: r.str(), x: r.f32(), z: r.f32() });
  }
  const townCount = r.u32();
  for (let i = 0; i < townCount; i++) city.towns.push({ n: r.str(), x: r.f32(), z: r.f32() });

  const roadObjs = [];
  const roadSeg = city.roads.map(() => []);
  const roadSegment = (i, k) => {
    const row = roadSeg[i];
    const have = row[k];
    if (have != null) return have;
    const road = city.roads[i];
    const p = road.p;
    const j = k * 2;
    const id = roadObjs.length;
    roadObjs.push({
      x0: p[j], z0: p[j + 1], x1: p[j + 2], z1: p[j + 3],
      w: road.w, br: road.br || 0, n: road.n || "", c: road.c, ow: road.ow || 0, i, j,
      y0: road.ey[k], y1: road.ey[k + 1], hw0: road.hw[k], hw1: road.hw[k + 1],
    });
    row[k] = id;
    return id;
  };
  const readGrid = (idOf, objs) => {
    const n = r.u32();
    const ix = new Int32Array(n);
    const iz = new Int32Array(n);
    const counts = new Uint32Array(n);
    let items = new Int32Array(Math.max(16, n));
    let used = 0;
    const push = (id) => {
      if (used === items.length) {
        const next = new Int32Array(items.length * 2);
        next.set(items);
        items = next;
      }
      items[used++] = id;
    };
    for (let i = 0; i < n; i++) {
      ix[i] = r.i32();
      iz[i] = r.i32();
      const count = r.u32();
      counts[i] = count;
      for (let k = 0; k < count; k++) push(idOf());
    }
    return packGrid(ix, iz, counts, items.slice(0, used), objs);
  };
  const roadCells = readGrid(() => roadSegment(r.u32(), r.u32()), roadObjs);
  const bldCells = readGrid(() => r.u32(), city.buildings);
  const riverGeom = [];
  const riverN = r.u32();
  for (let i = 0; i < riverN; i++) {
    riverGeom.push({ x0: r.f32(), z0: r.f32(), x1: r.f32(), z1: r.f32(), w: r.f32() });
  }
  const riverCells = readGrid(() => r.u32(), riverGeom);
  return {
    city,
    index: { roadCells, bldCells, riverCells, lakes: lakeBoxes(city.lakes), graph: new Map() },
  };
}

export { CELL };
