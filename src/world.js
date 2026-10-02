import * as THREE from "three";
import { heightAt } from "./elev.js";
import { buildingContact, cellsAround, nearestRoad, onRoad, roadDeck, streetVisual, waterAt } from "./geo.js?v=70";
import { fieldAt } from "./airfields.js?v=2";
import { createCombat } from "./combat.js?v=22";

const CLASS_COLOR = {
  motorway: [1, 1, 1],
  trunk: [0.98, 0.98, 1],
  primary: [0.96, 0.97, 0.99],
  secondary: [0.94, 0.95, 0.97],
  tertiary: [0.9, 0.91, 0.94],
  residential: [0.88, 0.89, 0.92],
  living_street: [0.84, 0.85, 0.88],
  unclassified: [0.9, 0.91, 0.93],
};

const TIMES = [
  { bg: 0xd7c4a4, fog: 0xe7d7bc, sun: 0xffc98a, elev: 24, az: 70, intensity: 1.3, amb: 0.82, emit: 0.04 },
  { bg: 0x7eb6ea, fog: 0xd7e8f8, sun: 0xfff4d2, elev: 20, az: -86, intensity: 1.35, amb: 0.62, emit: 0 },
  { bg: 0x6a7aa3, fog: 0xa8b4cc, sun: 0xffb07a, elev: 14, az: -80, intensity: 0.95, amb: 0.62, emit: 0.28 },
];

function canvasTex(draw, w, h, repeat) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
  }
  t.anisotropy = 8;
  return t;
}

function roadTexture() {
  return canvasTex((g, w, h) => {
    g.fillStyle = "#2c323a";
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2800; i++) {
      const shade = 36 + ((i * 17) % 40);
      g.fillStyle = `rgb(${shade},${shade + 2},${shade + 4})`;
      g.fillRect((i * 53) % w, (i * 29) % h, (i % 3) + 1, 1);
    }
    g.fillStyle = "rgba(18,20,24,0.35)";
    g.fillRect(0, h * 0.08, w, h * 0.1);
    g.fillRect(0, h * 0.82, w, h * 0.1);
    g.fillStyle = "rgba(255,255,255,0.05)";
    g.fillRect(0, h * 0.46, w, 2);
  }, 128, 64, true);
}

function pavingTexture() {
  return canvasTex((g, w, h) => {
    g.fillStyle = "#8d8983";
    g.fillRect(0, 0, w, h);
    const tones = ["#c4bfb6", "#b7b2a9", "#d0cbc2", "#aea89f"];
    for (let y = 0; y < h; y += 32) {
      for (let x = 0; x < w; x += 32) {
        g.fillStyle = tones[(x / 32 + y / 16) % tones.length];
        g.fillRect(x + 1, y + 1, 30, 30);
        g.fillStyle = "rgba(255,255,255,0.12)";
        g.fillRect(x + 2, y + 2, 12, 2);
      }
    }
  }, 128, 128, true);
}

function windowTexture() {
  return canvasTex((g, w, h) => {
    g.fillStyle = "#efe4d4";
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#e3d5c2";
    for (let x = 0; x < w; x += 32) g.fillRect(x, 0, 3, h);
    const floor = 40;
    for (let y = 0; y < h - 36; y += floor) {
      g.fillStyle = "#d9cbb8";
      g.fillRect(0, y, w, 5);
      if (y > 0 && (y / floor) % 2 === 0) {
        g.fillStyle = "#8d8478";
        g.fillRect(4, y + 22, w - 8, 3);
        g.fillStyle = "#6f8f62";
        g.fillRect(8, y + 18, 14, 4);
      }
      for (let x = 8; x < w - 6; x += 32) {
        g.fillStyle = "#f7f2ea";
        g.fillRect(x, y + 8, 16, 22);
        const lit = (x * 3 + y * 5) % 13 > 5;
        g.fillStyle = lit ? "#d5e6f6" : "#1b2834";
        g.fillRect(x + 2, y + 10, 12, 16);
        g.fillStyle = "rgba(255,255,255,0.4)";
        g.fillRect(x + 2, y + 10, 3, 16);
      }
    }
    g.fillStyle = "#24303c";
    g.fillRect(0, h - 34, w, 34);
    g.fillStyle = "#b9d7ea";
    for (let x = 6; x < w; x += 24) g.fillRect(x, h - 28, 16, 18);
    g.fillStyle = "#f2c14e";
    g.fillRect(0, h - 36, w, 3);
  }, 128, 256, true);
}

function landTexture() {
  return canvasTex((g, w, h) => {
    g.fillStyle = "#f4f2ea";
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 160; i++) {
      const x = (i * 89) % w;
      const y = (i * 47) % h;
      const rad = 12 + (i % 6) * 9;
      const shade = 198 + (i % 5) * 10;
      g.fillStyle = `rgba(${shade - 16},${shade},${shade - 30},0.2)`;
      g.beginPath();
      g.ellipse(x, y, rad, rad * 0.55, (i % 7) * 0.35, 0, Math.PI * 2);
      g.fill();
    }
    g.strokeStyle = "rgba(50,62,32,0.08)";
    g.lineWidth = 1;
    for (let y = 3; y < h; y += 6) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(w, y + ((y / 6) % 2));
      g.stroke();
    }
  }, 256, 256, true);
}

function roofTexture() {
  return canvasTex((g, w, h) => {
    g.fillStyle = "#f2f2f2";
    g.fillRect(0, 0, w, h);
    g.strokeStyle = "#6a6a6a";
    g.lineWidth = 2;
    for (let y = 0; y < h; y += 10) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(w, y);
      g.stroke();
      const shift = (y / 10) % 2 ? 8 : 0;
      for (let x = shift; x < w; x += 16) {
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x, y + 10);
        g.stroke();
      }
    }
  }, 64, 64, true);
}

function pushStrip(buf, x0, z0, x1, z1, nx, nz, a, b, y0, y1 = y0) {
  buf.push(
    x0 + nx * a, y0, z0 + nz * a,
    x1 + nx * b, y1, z1 + nz * b,
    x0 + nx * b, y0, z0 + nz * b,
    x0 + nx * a, y0, z0 + nz * a,
    x1 + nx * a, y1, z1 + nz * a,
    x1 + nx * b, y1, z1 + nz * b,
  );
}

function upNormals(geo) {
  const n = geo.getAttribute("position").count;
  const normals = new Float32Array(n * 3);
  for (let i = 1; i < normals.length; i += 3) normals[i] = 1;
  geo.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
}

function roadVisualHalf(w, cls) {
  const boost = cls === "motorway" || cls === "trunk" || cls === "primary" ? 1.35 : 1.12;
  return Math.max(3.1, (w || 6) * 0.5 * boost);
}

const CURB_W = 0.22;
const WALK_W = 2.2;
const SHOULDER_W = 1.6;
const STEP_H = 0.16;
const VERGE = 6.4;

function roadAsphalt(road) {
  const seg = road.seg;
  const t = road.t || 0;
  if (seg && seg.hw0 != null) return (seg.hw0 + ((seg.hw1 ?? seg.hw0) - seg.hw0) * t) * 1.2;
  return Math.max(3.1, (road.w || 6) * 0.55) * 1.2;
}

function streetTop(dist, asphalt, y, groundH, raised) {
  if (raised) return dist <= asphalt + 0.35 ? y : groundH;
  if (dist <= asphalt) return y;
  const walkOut = asphalt + CURB_W + WALK_W;
  if (dist <= walkOut) return y + STEP_H;
  const shelf = y - 0.05;
  const shoulderEnd = walkOut + SHOULDER_W;
  if (dist <= shoulderEnd) {
    const t = (dist - walkOut) / SHOULDER_W;
    return y + STEP_H + (shelf - (y + STEP_H)) * t;
  }
  const t = Math.min(1, (dist - shoulderEnd) / VERGE);
  return shelf + (groundH - shelf) * t;
}

function pushWall(pos, nrm, x0, z0, x1, z1, nx, nz, off0, off1, y0, y1, h) {
  const ax = x0 + nx * off0;
  const az = z0 + nz * off0;
  const bx = x1 + nx * off1;
  const bz = z1 + nz * off1;
  const verts = [
    ax, y0, az, bx, y1, bz, bx, y1 + h, bz,
    ax, y0, az, bx, y1 + h, bz, ax, y0 + h, az,
  ];
  pos.push(...verts);
  for (let i = 0; i < 6; i++) nrm.push(nx, 0, nz);
  const lip = 0.28;
  pos.push(
    ax, y0 + h, az,
    bx, y1 + h, bz,
    bx - nx * lip, y1 + h, bz - nz * lip,
    ax, y0 + h, az,
    bx - nx * lip, y1 + h, bz - nz * lip,
    ax - nx * lip, y0 + h, az - nz * lip,
  );
  for (let i = 0; i < 6; i++) nrm.push(0, 1, 0);
}

const ROAD_CHUNK = 4800;
const CHUNK_REFRESH = 800;
const CHUNK_PAD = 2500;

function freezeStatic(obj) {
  obj.matrixAutoUpdate = false;
  obj.matrixWorldAutoUpdate = false;
  obj.updateMatrix();
  obj.matrixWorld.copy(obj.matrix);
  obj.matrixWorldNeedsUpdate = false;
  const children = obj.children;
  for (let i = 0; i < children.length; i++) freezeStatic(children[i]);
}

function childSphere(child) {
  if (child.boundingSphere && child.boundingSphere.radius >= 0) return child.boundingSphere;
  const geo = child.geometry;
  if (!geo) return null;
  if (!geo.boundingSphere) geo.computeBoundingSphere();
  if (!geo.boundingSphere || geo.boundingSphere.radius < 0) return null;
  return geo.boundingSphere;
}

function coverChunk(chunk) {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  const children = chunk.children;
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    const s = childSphere(child);
    if (!s) continue;
    const cx = s.center.x + child.position.x;
    const cy = s.center.y + child.position.y;
    const cz = s.center.z + child.position.z;
    const r = s.radius;
    if (cx - r < minX) minX = cx - r;
    if (cy - r < minY) minY = cy - r;
    if (cz - r < minZ) minZ = cz - r;
    if (cx + r > maxX) maxX = cx + r;
    if (cy + r > maxY) maxY = cy + r;
    if (cz + r > maxZ) maxZ = cz + r;
  }
  chunk.userData.cx = minX === Infinity ? 0 : (minX + maxX) * 0.5;
  chunk.userData.cz = minZ === Infinity ? 0 : (minZ + maxZ) * 0.5;
  chunk.userData.r = minX === Infinity ? 0 : 0.5 * Math.hypot(maxX - minX, maxY - minY, maxZ - minZ);
}

function parkChunks(root, chunks) {
  const parked = [];
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    if (!chunk.children.length) continue;
    coverChunk(chunk);
    freezeStatic(chunk);
    parked.push(chunk);
  }
  root.userData.parked = parked;
  root.userData.shown = new Uint8Array(parked.length);
  root.userData.ax = Infinity;
  root.userData.az = Infinity;
  root.userData.far = -1;
}

function showNear(root, x, z, far) {
  const parked = root.userData.parked;
  if (!parked) return;
  if (Math.hypot(x - root.userData.ax, z - root.userData.az) < CHUNK_REFRESH && Math.abs(far - root.userData.far) < 1000) return;
  root.userData.ax = x;
  root.userData.az = z;
  root.userData.far = far;
  const shown = root.userData.shown;
  const limit = far + CHUNK_PAD;
  for (let i = 0; i < parked.length; i++) {
    const chunk = parked[i];
    const dx = chunk.userData.cx - x;
    const dz = chunk.userData.cz - z;
    const reach = limit + chunk.userData.r;
    const on = dx * dx + dz * dz <= reach * reach;
    if (on && !shown[i]) {
      root.add(chunk);
      shown[i] = 1;
    } else if (!on && shown[i]) {
      root.remove(chunk);
      shown[i] = 0;
    }
  }
}

function emptyRoadPack() {
  return {
    positions: [], colors: [], uvs: [], marks: [],
    railPos: [], railNrm: [],
    curbPos: [], curbNrm: [],
    walkPos: [], walkUv: [],
    vergePos: [],
    fencePos: [], fenceNrm: [],
    lamps: [],
  };
}

function makeRoads(city, index, flight) {
  const packs = new Map();
  const packAt = (x, z) => {
    const ix = Math.floor(x / ROAD_CHUNK);
    const iz = Math.floor(z / ROAD_CHUNK);
    const key = ix + "," + iz;
    let pack = packs.get(key);
    if (!pack) {
      pack = emptyRoadPack();
      packs.set(key, pack);
    }
    return pack;
  };
  let positions;
  let colors;
  let uvs;
  let marks;
  let railPos;
  let railNrm;
  let curbPos;
  let curbNrm;
  let walkPos;
  let walkUv;
  let vergePos;
  let fencePos;
  let fenceNrm;
  let lamps;
  const bind = (x, z) => {
    const pack = packAt(x, z);
    positions = pack.positions;
    colors = pack.colors;
    uvs = pack.uvs;
    marks = pack.marks;
    railPos = pack.railPos;
    railNrm = pack.railNrm;
    curbPos = pack.curbPos;
    curbNrm = pack.curbNrm;
    walkPos = pack.walkPos;
    walkUv = pack.walkUv;
    vergePos = pack.vergePos;
    fencePos = pack.fencePos;
    fenceNrm = pack.fenceNrm;
    lamps = pack.lamps;
  };
  const dashTaken = new Set();
  const railSegs = [];
  const pads = new Map();
  const padPut = (x, z, y, r) => {
    const k = Math.round(x / 14) + "," + Math.round(z / 14);
    const pad = pads.get(k);
    if (!pad || r > pad.r) pads.set(k, { x, z, y, r });
  };
  for (const road of city.roads) {
    if (flight && road.c === "track") continue;
    const col = CLASS_COLOR[road.c] || CLASS_COLOR.residential;
    const p = road.p;
    if (!p || p.length < 4) continue;
    const nPts = p.length / 2;
    const halfAt = (i) => (road.hw ? road.hw[i] : roadVisualHalf(road.w, road.c)) * 1.2;
    const yAt = (i) => (road.ey ? road.ey[i] : 0.16);
    const withWalk = pavedClasses(road.c) && road.c !== "motorway";
    let dist = 0;
    let lampRun = 18;
    for (let k = 0; k < nPts - 1; k++) {
      const x0 = p[k * 2], z0 = p[k * 2 + 1], x1 = p[(k + 1) * 2], z1 = p[(k + 1) * 2 + 1];
      const dx = x1 - x0, dz = z1 - z0;
      const L = Math.hypot(dx, dz);
      if (L < 0.35) {
        dist += L;
        continue;
      }
      bind((x0 + x1) * 0.5, (z0 + z1) * 0.5);
      const nx = -dz / L, nz = dx / L;
      const hw0 = halfAt(k), hw1 = halfAt(k + 1);
      const y0 = yAt(k), y1 = yAt(k + 1);
      const streetSide = (s) => {
        const nxs = nx * s;
        const nzs = nz * s;
        const ax = x0 + nxs * hw0;
        const az = z0 + nzs * hw0;
        const bx = x1 + nxs * hw1;
        const bz = z1 + nzs * hw1;
        const ax2 = x0 + nxs * (hw0 + CURB_W);
        const az2 = z0 + nzs * (hw0 + CURB_W);
        const bx2 = x1 + nxs * (hw1 + CURB_W);
        const bz2 = z1 + nzs * (hw1 + CURB_W);
        const lift0 = y0 + STEP_H;
        const lift1 = y1 + STEP_H;
        curbPos.push(ax, y0, az, bx, y1, bz, bx, lift1, bz, ax, y0, az, bx, lift1, bz, ax, lift0, az);
        for (let i = 0; i < 6; i++) curbNrm.push(nxs, 0, nzs);
        curbPos.push(ax, lift0, az, bx, lift1, bz, bx2, lift1, bz2, ax, lift0, az, bx2, lift1, bz2, ax2, lift0, az2);
        for (let i = 0; i < 6; i++) curbNrm.push(0, 1, 0);
        const wx0 = x0 + nxs * (hw0 + CURB_W + WALK_W);
        const wz0 = z0 + nzs * (hw0 + CURB_W + WALK_W);
        const wx1 = x1 + nxs * (hw1 + CURB_W + WALK_W);
        const wz1 = z1 + nzs * (hw1 + CURB_W + WALK_W);
        walkPos.push(ax2, lift0, az2, bx2, lift1, bz2, wx1, lift1, wz1, ax2, lift0, az2, wx1, lift1, wz1, wx0, lift0, wz0);
        const u0 = dist / 2.4;
        const u1 = (dist + L) / 2.4;
        walkUv.push(u0, 0, u1, 0, u1, 1, u0, 0, u1, 1, u0, 1);
        const shelf0 = y0 - 0.05;
        const shelf1 = y1 - 0.05;
        const sx0 = x0 + nxs * (hw0 + CURB_W + WALK_W + SHOULDER_W);
        const sz0 = z0 + nzs * (hw0 + CURB_W + WALK_W + SHOULDER_W);
        const sx1 = x1 + nxs * (hw1 + CURB_W + WALK_W + SHOULDER_W);
        const sz1 = z1 + nzs * (hw1 + CURB_W + WALK_W + SHOULDER_W);
        vergePos.push(wx0, lift0, wz0, wx1, lift1, wz1, sx1, shelf1, sz1, wx0, lift0, wz0, sx1, shelf1, sz1, sx0, shelf0, sz0);
        const gy0 = heightAt(sx0 + nxs * VERGE, sz0 + nzs * VERGE);
        const gy1 = heightAt(sx1 + nxs * VERGE, sz1 + nzs * VERGE);
        const vx0 = sx0 + nxs * VERGE;
        const vz0 = sz0 + nzs * VERGE;
        const vx1 = sx1 + nxs * VERGE;
        const vz1 = sz1 + nzs * VERGE;
        vergePos.push(sx0, shelf0, sz0, sx1, shelf1, sz1, vx1, gy1, vz1, sx0, shelf0, sz0, vx1, gy1, vz1, vx0, gy0, vz0);
        if (marked) {
          const top = 0.78;
          const thin = 0.05;
          fencePos.push(
            wx0, lift0, wz0, wx1, lift1, wz1, wx1, lift1 + top, wz1,
            wx0, lift0, wz0, wx1, lift1 + top, wz1, wx0, lift0 + top, wz0,
          );
          for (let i = 0; i < 6; i++) fenceNrm.push(nxs, 0, nzs);
          fencePos.push(
            wx0, lift0 + top, wz0,
            wx1, lift1 + top, wz1,
            wx1 - nxs * thin, lift1 + top, wz1 - nzs * thin,
            wx0, lift0 + top, wz0,
            wx1 - nxs * thin, lift1 + top, wz1 - nzs * thin,
            wx0 - nxs * thin, lift0 + top, wz0 - nzs * thin,
          );
          for (let i = 0; i < 6; i++) fenceNrm.push(0, 1, 0);
        }
      };
      const L0x = x0 + nx * hw0, L0z = z0 + nz * hw0;
      const R0x = x0 - nx * hw0, R0z = z0 - nz * hw0;
      const L1x = x1 + nx * hw1, L1z = z1 + nz * hw1;
      const R1x = x1 - nx * hw1, R1z = z1 - nz * hw1;
      positions.push(L0x, y0, L0z, L1x, y1, L1z, R1x, y1, R1z, L0x, y0, L0z, R1x, y1, R1z, R0x, y0, R0z);
      for (let c = 0; c < 6; c++) colors.push(col[0], col[1], col[2]);
      const u0 = dist / 6, u1 = (dist + L) / 6;
      uvs.push(u0, 0, u1, 0, u1, 1, u0, 0, u1, 1, u0, 1);
      const marked = road.c === "motorway" || road.c === "trunk" || road.c === "primary" || road.c === "secondary";
      if (marked && !flight) {
        for (let t = 2.2; t < L - 1; t += 8) {
          const a = t;
          const b = Math.min(L - 0.4, t + 2.5);
          const ax = x0 + (dx / L) * a;
          const az = z0 + (dz / L) * a;
          const bx = x0 + (dx / L) * b;
          const bz = z0 + (dz / L) * b;
          const mx = (ax + bx) * 0.5;
          const mz = (az + bz) * 0.5;
          const cell = (Math.round(mx / 2.4) + 80000) * 160001 + Math.round(mz / 2.4);
          if (dashTaken.has(cell)) continue;
          dashTaken.add(cell);
          const line = 0.14;
          const dy = y0 + (y1 - y0) * ((a + b) * 0.5 / L) + 0.04;
          marks.push(
            ax + nx * line, dy, az + nz * line,
            bx - nx * line, dy, bz - nz * line,
            ax - nx * line, dy, az - nz * line,
            ax + nx * line, dy, az + nz * line,
            bx + nx * line, dy, bz + nz * line,
            bx - nx * line, dy, bz - nz * line,
          );
        }
      }
      const drop = Math.max(y0 - heightAt(x0, z0), y1 - heightAt(x1, z1));
      const raised = !!(road.br || drop > 2.5);
      if (withWalk && !raised && !flight) {
        const sideOpen = (s) => {
          if (!index) return true;
          const nxs = nx * s;
          const nzs = nz * s;
          const mid = (hw0 + hw1) * 0.5 + CURB_W + WALK_W * 0.55;
          const hit = nearestRoad(index, (x0 + x1) * 0.5 + nxs * mid, (z0 + z1) * 0.5 + nzs * mid, 12);
          if (!hit) return true;
          return hit.dist > roadAsphalt(hit) * 0.82 || Math.abs(hit.y - (y0 + y1) * 0.5) > 2.4;
        };
        if (sideOpen(1)) streetSide(1);
        if (sideOpen(-1)) streetSide(-1);
        lampRun += L;
        if (lampRun > 36 && lamps.length < 3800 && Math.hypot(x1, z1) < 7800 && marked) {
          lampRun = 0;
          const off = hw1 + CURB_W + 0.45;
          lamps.push({ x: x1 - nx * off, y: y1, z: z1 - nz * off, rot: Math.atan2(-nz, nx) });
        }
      }
      if (raised) {
        const bar = 0.88;
        pushWall(railPos, railNrm, x0, z0, x1, z1, nx, nz, hw0, hw1, y0, y1, bar);
        pushWall(railPos, railNrm, x0, z0, x1, z1, -nx, -nz, hw0, hw1, y0, y1, bar);
        railSegs.push({ x0, z0, x1, z1, nx, nz, hw0, hw1, y0, y1 });
      }
      dist += L;
    }
    padPut(p[0], p[1], yAt(0), halfAt(0));
    padPut(p[nPts * 2 - 2], p[nPts * 2 - 1], yAt(nPts - 1), halfAt(nPts - 1));
    for (let k = 1; k < nPts - 1; k++) {
      const ax = p[k * 2] - p[(k - 1) * 2];
      const az = p[k * 2 + 1] - p[(k - 1) * 2 + 1];
      const bx = p[(k + 1) * 2] - p[k * 2];
      const bz = p[(k + 1) * 2 + 1] - p[k * 2 + 1];
      const la = Math.hypot(ax, az) || 1;
      const lb = Math.hypot(bx, bz) || 1;
      if (ax / la * bx / lb + az / la * bz / lb < 0.62) padPut(p[k * 2], p[k * 2 + 1], yAt(k), halfAt(k));
    }
  }
  const asphalt = [0.9, 0.91, 0.94];
  for (const pad of pads.values()) {
    bind(pad.x, pad.z);
    const steps = 8;
    for (let s = 0; s < steps; s++) {
      const a0 = (s / steps) * Math.PI * 2;
      const a1 = ((s + 1) / steps) * Math.PI * 2;
      positions.push(
        pad.x, pad.y, pad.z,
        pad.x + Math.cos(a0) * pad.r, pad.y, pad.z + Math.sin(a0) * pad.r,
        pad.x + Math.cos(a1) * pad.r, pad.y, pad.z + Math.sin(a1) * pad.r,
      );
      colors.push(asphalt[0], asphalt[1], asphalt[2], asphalt[0], asphalt[1], asphalt[2], asphalt[0], asphalt[1], asphalt[2]);
      uvs.push(0, 0, 1, 0, 1, 1);
    }
  }
  const roadMat = new THREE.MeshLambertMaterial({
    map: roadTexture(),
    color: 0xffffff,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const curbMat = new THREE.MeshLambertMaterial({ color: 0xd4d0c8, side: THREE.DoubleSide });
  const walkMat = new THREE.MeshLambertMaterial({ map: pavingTexture(), color: 0xffffff });
  const vergeMat = new THREE.MeshLambertMaterial({ color: 0x3c7a46, side: THREE.DoubleSide });
  const fenceMat = new THREE.MeshLambertMaterial({ color: 0x4f86a6, side: THREE.DoubleSide });
  const markMat = new THREE.MeshBasicMaterial({ color: 0xf3efe4, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const railMat = new THREE.MeshLambertMaterial({ color: 0xc5c8ce, side: THREE.DoubleSide });
  const lampMat = new THREE.MeshLambertMaterial({ color: 0x2e343c });
  const pole = new THREE.CylinderGeometry(0.07, 0.09, 4.4, 5);
  pole.translate(0, 2.2, 0);
  const arm = new THREE.BoxGeometry(0.85, 0.06, 0.06);
  arm.translate(0.38, 4.35, 0);
  const head = new THREE.BoxGeometry(0.62, 0.08, 0.24);
  head.translate(0.78, 4.22, 0);
  const lampGeo = joinGeos([pole, arm, head]);
  const root = new THREE.Group();
  root.frustumCulled = false;
  const chunks = [];
  for (const pack of packs.values()) {
    const chunk = new THREE.Group();
    chunk.frustumCulled = false;
    if (pack.positions.length) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(pack.positions, 3));
      geo.setAttribute("color", new THREE.Float32BufferAttribute(pack.colors, 3));
      geo.setAttribute("uv", new THREE.Float32BufferAttribute(pack.uvs, 2));
      upNormals(geo);
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, roadMat);
      mesh.receiveShadow = true;
      mesh.renderOrder = 1;
      chunk.add(mesh);
    }
    const curb = meshPos(pack.curbPos, curbMat, pack.curbNrm);
    if (curb) {
      curb.frustumCulled = true;
      curb.geometry.computeBoundingSphere();
      curb.renderOrder = 2;
      chunk.add(curb);
    }
    if (pack.walkPos.length) {
      const wgeo = new THREE.BufferGeometry();
      wgeo.setAttribute("position", new THREE.Float32BufferAttribute(pack.walkPos, 3));
      wgeo.setAttribute("uv", new THREE.Float32BufferAttribute(pack.walkUv, 2));
      upNormals(wgeo);
      wgeo.computeBoundingSphere();
      const walkMesh = new THREE.Mesh(wgeo, walkMat);
      walkMesh.receiveShadow = true;
      walkMesh.renderOrder = 2;
      chunk.add(walkMesh);
    }
    const verge = meshPos(pack.vergePos, vergeMat);
    if (verge) {
      verge.frustumCulled = true;
      verge.geometry.computeBoundingSphere();
      chunk.add(verge);
    }
    const fence = meshPos(pack.fencePos, fenceMat, pack.fenceNrm);
    if (fence) {
      fence.frustumCulled = true;
      fence.geometry.computeBoundingSphere();
      fence.renderOrder = 2;
      chunk.add(fence);
    }
    if (pack.lamps.length) {
      const lampMesh = new THREE.InstancedMesh(lampGeo, lampMat, pack.lamps.length);
      const dummy = new THREE.Object3D();
      for (let i = 0; i < pack.lamps.length; i++) {
        const lamp = pack.lamps[i];
        dummy.position.set(lamp.x, lamp.y, lamp.z);
        dummy.rotation.set(0, lamp.rot, 0);
        dummy.updateMatrix();
        lampMesh.setMatrixAt(i, dummy.matrix);
      }
      lampMesh.instanceMatrix.needsUpdate = true;
      lampMesh.computeBoundingSphere();
      chunk.add(lampMesh);
    }
    if (pack.marks.length) {
      const mgeo = new THREE.BufferGeometry();
      mgeo.setAttribute("position", new THREE.Float32BufferAttribute(pack.marks, 3));
      mgeo.computeBoundingSphere();
      const mark = new THREE.Mesh(mgeo, markMat);
      mark.position.y = 0.03;
      mark.renderOrder = 3;
      chunk.add(mark);
    }
    if (pack.railPos.length) {
      const rgeo = new THREE.BufferGeometry();
      rgeo.setAttribute("position", new THREE.Float32BufferAttribute(pack.railPos, 3));
      rgeo.setAttribute("normal", new THREE.Float32BufferAttribute(pack.railNrm, 3));
      rgeo.computeBoundingSphere();
      const rails = new THREE.Mesh(rgeo, railMat);
      rails.renderOrder = 2;
      chunk.add(rails);
    }
    if (chunk.children.length) chunks.push(chunk);
  }
  parkChunks(root, chunks);
  return { mesh: root, rails: railSegs };
}

function reverseRiver(river) {
  const n = river.p.length / 2;
  const p = [];
  const hl = river.hl ? [] : null;
  const hr = river.hr ? [] : null;
  for (let i = n - 1; i >= 0; i--) {
    p.push(river.p[i * 2], river.p[i * 2 + 1]);
    if (hl) {
      hl.push(river.hl[i]);
      hr.push(river.hr[i]);
    }
  }
  return { p, hl, hr, w: river.w, n: river.n };
}

function copyPath(src) {
  const out = new Array(src.length);
  for (let i = 0; i < src.length; i++) out[i] = src[i];
  return out;
}

function catRiver(a, b) {
  const p = copyPath(a.p);
  const hl = a.hl && b.hl ? copyPath(a.hl) : null;
  const hr = a.hr && b.hr ? copyPath(a.hr) : null;
  const n = b.p.length / 2;
  for (let i = 1; i < n; i++) {
    p.push(b.p[i * 2], b.p[i * 2 + 1]);
    if (hl) {
      hl.push(b.hl[i]);
      hr.push(b.hr[i]);
    }
  }
  return { p, hl, hr, w: a.w || b.w, n: a.n || b.n };
}

function stitchRivers(rivers) {
  const groups = new Map();
  for (const river of rivers || []) {
    if (!river.p || river.p.length < 4) continue;
    const key = river.n || "";
    let list = groups.get(key);
    if (!list) groups.set(key, list = []);
    list.push({ p: river.p, hl: river.hl || null, hr: river.hr || null, w: river.w, n: river.n });
  }
  const out = [];
  const touch = (p, i, q, j) => Math.hypot(p[i] - q[j], p[i + 1] - q[j + 1]) < 20;
  for (const list of groups.values()) {
    const unused = list.slice();
    while (unused.length) {
      let cur = unused.pop();
      let grew = true;
      while (grew) {
        grew = false;
        for (let i = 0; i < unused.length; i++) {
          let other = unused[i];
          const a0 = 0;
          const a1 = cur.p.length - 2;
          const b0 = 0;
          const b1 = other.p.length - 2;
          let next = null;
          if (touch(cur.p, a1, other.p, b0)) next = catRiver(cur, other);
          else if (touch(cur.p, a1, other.p, b1)) next = catRiver(cur, reverseRiver(other));
          else if (touch(cur.p, a0, other.p, b1)) next = catRiver(other, cur);
          else if (touch(cur.p, a0, other.p, b0)) next = catRiver(reverseRiver(other), cur);
          if (!next) continue;
          cur = next;
          unused.splice(i, 1);
          grew = true;
          break;
        }
      }
      out.push(cur);
    }
  }
  return out;
}

function riverSurface(river) {
  const src = river.p;
  const n = src.length / 2;
  if (n < 2) return [];
  const samples = [];
  const pushSample = (x, z, l, r) => {
    const prev = samples[samples.length - 1];
    if (prev && Math.hypot(x - prev.x, z - prev.z) < 8) return;
    samples.push({ x, z, y: heightAt(x, z) + 1.2, l, r });
  };
  for (let i = 0; i < n - 1; i++) {
    const x0 = src[i * 2];
    const z0 = src[i * 2 + 1];
    const x1 = src[(i + 1) * 2];
    const z1 = src[(i + 1) * 2 + 1];
    const L = Math.hypot(x1 - x0, z1 - z0);
    if (L < 0.5) continue;
    const steps = Math.max(1, Math.ceil(L / 100));
    let l0 = river.hl ? river.hl[i] : (river.w || 80) * 0.5;
    let l1 = river.hl ? river.hl[Math.min(n - 1, i + 1)] : (river.w || 80) * 0.5;
    let r0 = river.hr ? river.hr[i] : (river.w || 80) * 0.5;
    let r1 = river.hr ? river.hr[Math.min(n - 1, i + 1)] : (river.w || 80) * 0.5;
    if ((river.w || 0) >= 400) {
      l0 = Math.max(l0, 420);
      l1 = Math.max(l1, 420);
      r0 = Math.max(r0, 420);
      r1 = Math.max(r1, 420);
    }
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      pushSample(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, l0 + (l1 - l0) * t, r0 + (r1 - r0) * t);
    }
  }
  const last = n - 1;
  pushSample(
    src[last * 2],
    src[last * 2 + 1],
    Math.max(river.hl ? river.hl[last] : (river.w || 80) * 0.5, (river.w || 0) >= 400 ? 420 : 0),
    Math.max(river.hr ? river.hr[last] : (river.w || 80) * 0.5, (river.w || 0) >= 400 ? 420 : 0),
  );
  const positions = [];
  const left = [];
  const right = [];
  for (let i = 0; i < samples.length; i++) {
    const prev = samples[Math.max(0, i - 1)];
    const next = samples[Math.min(samples.length - 1, i + 1)];
    let dx = next.x - prev.x;
    let dz = next.z - prev.z;
    const L = Math.hypot(dx, dz) || 1;
    dx /= L;
    dz /= L;
    const s = samples[i];
    left.push([s.x - dz * s.l, s.y, s.z + dx * s.l]);
    right.push([s.x + dz * s.r, s.y, s.z - dx * s.r]);
    const rad = Math.max(s.l, s.r);
    const wedges = 8;
    for (let k = 0; k < wedges; k++) {
      const a0 = (k / wedges) * Math.PI * 2;
      const a1 = ((k + 1) / wedges) * Math.PI * 2;
      positions.push(
        s.x, s.y, s.z,
        s.x + Math.cos(a0) * rad, s.y, s.z + Math.sin(a0) * rad,
        s.x + Math.cos(a1) * rad, s.y, s.z + Math.sin(a1) * rad,
      );
    }
  }
  for (let i = 0; i < left.length - 1; i++) {
    const a = left[i];
    const b = right[i];
    const c = right[i + 1];
    const d = left[i + 1];
    positions.push(...a, ...c, ...b, ...a, ...d, ...c);
  }
  return positions;
}

function fan(ring, y) {
  if (ring.length < 6) return [];
  let cx = 0, cz = 0, n = 0;
  for (let i = 0; i < ring.length; i += 2) {
    cx += ring[i];
    cz += ring[i + 1];
    n++;
  }
  cx /= n;
  cz /= n;
  const yAt = typeof y === "function" ? y : () => y;
  const positions = [];
  for (let i = 0; i < ring.length - 2; i += 2) {
    positions.push(cx, yAt(cx, cz), cz, ring[i], yAt(ring[i], ring[i + 1]), ring[i + 1], ring[i + 2], yAt(ring[i + 2], ring[i + 3]), ring[i + 3]);
  }
  return positions;
}

function pavedClasses(cls) {
  return cls === "motorway" || cls === "trunk" || cls === "primary" || cls === "secondary" || cls === "tertiary" || cls === "residential" || cls === "living_street" || cls === "unclassified";
}

function meshPos(positions, material, normals) {
  if (!positions.length) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  if (normals) geo.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  else upNormals(geo);
  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;
  return mesh;
}

function meshFrom(positions, color, opacity = 1) {
  if (!positions.length) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshLambertMaterial({
    color,
    transparent: opacity < 1,
    opacity,
    depthWrite: opacity > 0.9,
    side: THREE.DoubleSide,
  });
  return new THREE.Mesh(geo, mat);
}

function tuneWindows(mat) {
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying float vStory;")
      .replace(
        "#include <uv_vertex>",
        `#include <uv_vertex>
         vStory = position.y;
         #ifdef USE_INSTANCING
           vMapUv *= vec2(max(length(instanceMatrix[0].xyz), length(instanceMatrix[2].xyz)) * 0.08, length(instanceMatrix[1].xyz) * 0.16);
         #endif`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vStory;")
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
         if (vStory < 0.13) {
           diffuseColor.rgb = mix(diffuseColor.rgb * vec3(0.42, 0.52, 0.6), vec3(0.12, 0.16, 0.22), 0.62);
         } else if (vStory < 0.19) {
           diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.7, 0.34), 0.7);
         } else if (vStory > 0.9) {
           diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.97, 0.93, 0.84), 0.55);
         }`,
      );
  };
}

const CITY_LAT = 50.4501;
const CITY_LON = 30.5234;
const CITY_M_LAT = 111320;
const CITY_M_LON = 111320 * Math.cos((CITY_LAT * Math.PI) / 180);

function worldXZ(lat, lon) {
  return [(CITY_LON - lon) * CITY_M_LON, (lat - CITY_LAT) * CITY_M_LAT];
}

function districtOf(x, z) {
  const lat = CITY_LAT + z / CITY_M_LAT;
  const lon = CITY_LON - x / CITY_M_LON;
  if (lat > 50.35 && lat < 50.405 && lon > 30.46 && lon < 30.55) return "forest";
  if (lat > 50.53 && lat < 50.60 && lon > 30.30 && lon < 30.47) return "forest";
  if (lat > 50.438 && lat < 50.492 && lon > 30.538 && lon < 30.592) return "forest";
  if (lat > 50.458 && lat < 50.485 && lon > 30.500 && lon < 30.540) return "podil";
  if (lat > 50.440 && lat < 50.462 && lon > 30.500 && lon < 30.548) return "upper";
  if (lat > 50.486 && lat < 50.545 && lon > 30.45 && lon < 30.545) return "obolon";
  if (lon > 30.575 && lat > 50.38 && lat < 50.56) return "left";
  return "";
}

function makeBuildings(city, index) {
  const all = city.buildings;
  if (!all.length) return null;
  const buckets = new Map();
  for (const b of all) {
    const key = Math.floor(b.x / ROAD_CHUNK) + "," + Math.floor(b.z / ROAD_CHUNK);
    let bucket = buckets.get(key);
    if (!bucket) buckets.set(key, bucket = []);
    bucket.push(b);
  }
  const geo = new THREE.BoxGeometry(1, 1, 1);
  geo.translate(0, 0.5, 0);
  const roofGeo = new THREE.BoxGeometry(1, 1, 1);
  roofGeo.translate(0, 0.5, 0);
  const plinthGeo = new THREE.BoxGeometry(1, 1, 1);
  plinthGeo.translate(0, 0.5, 0);
  const corniceGeo = new THREE.BoxGeometry(1, 1, 1);
  corniceGeo.translate(0, 0.5, 0);
  const bandGeo = new THREE.BoxGeometry(1, 1, 1);
  bandGeo.translate(0, 0.5, 0);
  const mat = new THREE.MeshLambertMaterial({ map: windowTexture(), color: 0xffffff });
  tuneWindows(mat);
  const roofMat = new THREE.MeshLambertMaterial({
    map: roofTexture(),
    color: 0xffffff,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const plinthMat = new THREE.MeshLambertMaterial({ color: 0xcfc6b8 });
  const corniceMat = new THREE.MeshLambertMaterial({ color: 0xf4efe6 });
  const bandMat = new THREE.MeshLambertMaterial({ color: 0xb7b0a4 });
  const root = new THREE.Group();
  root.frustumCulled = false;
  const chunks = [];
  let wallMesh = null;
  for (const list of buckets.values()) {
  const mesh = new THREE.InstancedMesh(geo, mat, list.length);
  const roofs = new THREE.InstancedMesh(roofGeo, roofMat, list.length);
  const plinths = new THREE.InstancedMesh(plinthGeo, plinthMat, list.length);
  const cornices = new THREE.InstancedMesh(corniceGeo, corniceMat, list.length);
  let bandCount = 0;
  for (let i = 0; i < list.length; i++) {
    const b = list[i];
    if (b.h > 10 && b.w > 7 && b.d > 7 && b.k !== "church") bandCount++;
  }
  const bands = new THREE.InstancedMesh(bandGeo, bandMat, Math.max(1, bandCount * 2));
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const walls = [0xf6efe4, 0xf0d7a4, 0xf7f4ee, 0xe7c4a8, 0xd5ddd8, 0xc9d4c4, 0xe8d0c0, 0xb9c6d4];
  const roofCols = [0x8a3a32, 0x4e565f, 0x6a4034, 0x3c4a44, 0x6e5344, 0x5a4038];
  let band = 0;
  for (let i = 0; i < list.length; i++) {
    const b = list[i];
    const zone = Math.abs((Math.floor(b.x / 160) * 3 + Math.floor(b.z / 140) * 7) | 0);
    let vw = b.w;
    let vd = b.d;
    let h = b.h;
    const place = districtOf(b.x, b.z);
    let wall = walls[zone % walls.length];
    let roof = roofCols[zone % roofCols.length];
    if (b.k === "church") {
      wall = 0xf6f1e6;
      roof = 0xd7a441;
    } else if (h > 45) {
      wall = 0xd5e3ef;
      roof = 0x8ea4b8;
    } else if (place === "upper") {
      wall = [0xf7f1e4, 0xf3e6d0, 0xefe4cc, 0xf8f4ea][zone % 4];
      roof = [0x8d342c, 0xa34538, 0x7a3028][zone % 3];
    } else if (place === "podil") {
      wall = [0xe8d2ae, 0xdfc49a, 0xf0dcc0][zone % 3];
      roof = 0x6b382c;
      if (h < 40) h = Math.min(h, 15);
    } else if (place === "obolon") {
      wall = 0xd7e0ea;
      roof = 0x8d98a4;
      if (h >= 12 && h < 50 && vw > 12 && vd > 12) h = Math.max(h, 30 + (zone % 4) * 8);
    } else if (place === "left") {
      wall = [0xc8ced6, 0xb7bec8, 0xd0d4da][zone % 3];
      roof = 0x747c86;
      if (h > 8 && h < 40) {
        if (vw >= vd && vw < vd * 2.4) vw *= 1.4;
        else if (vd > vw && vd < vw * 2.4) vd *= 1.4;
      }
    } else if (place === "forest") {
      wall = 0x6e8b62;
      roof = 0x3e5c3c;
      if (h > 7) h = 7;
    } else {
      if (Math.hypot(b.x, b.z) < 420) wall = [0xf7f1e4, 0xe9dcc4, 0xf3e2c0, 0xefe8dc][zone % 4];
      if (b.k === "com") wall = 0xd5e0ea;
    }
    const base = b.deck != null ? b.deck : streetVisual(b, index);
    dummy.position.set(b.x, base, b.z);
    dummy.rotation.set(0, -b.rot, 0);
    dummy.scale.set(vw, h, vd);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    color.setHex(wall);
    mesh.setColorAt(i, color);
    const rh = Math.max(0.45, Math.min(1.6, h * 0.045));
    dummy.position.set(b.x, base + h - 0.02, b.z);
    dummy.scale.set(vw * 1.07, rh, vd * 1.07);
    dummy.updateMatrix();
    roofs.setMatrixAt(i, dummy.matrix);
    color.setHex(roof);
    roofs.setColorAt(i, color);
    dummy.position.set(b.x, base, b.z);
    dummy.scale.set(vw * 1.04, Math.min(1.15, h * 0.08), vd * 1.04);
    dummy.updateMatrix();
    plinths.setMatrixAt(i, dummy.matrix);
    color.setHex(b.k === "com" ? 0x8ea0b0 : 0xc8bfb2);
    plinths.setColorAt(i, color);
    dummy.position.set(b.x, base + h - 0.4, b.z);
    dummy.scale.set(vw * 1.03, 0.26, vd * 1.03);
    dummy.updateMatrix();
    cornices.setMatrixAt(i, dummy.matrix);
    color.setHex(0xf6f1e8);
    cornices.setColorAt(i, color);
    if (b.h > 10 && b.w > 7 && b.d > 7 && b.k !== "church") {
      const yaw = -b.rot;
      const ox = Math.cos(yaw) * (vw * 0.5 + 0.22);
      const oz = -Math.sin(yaw) * (vw * 0.5 + 0.22);
      for (const lift of [0.42, 0.68]) {
        dummy.position.set(b.x + ox, base + h * lift, b.z + oz);
        dummy.scale.set(0.55, 0.12, Math.max(2.2, vd * 0.72));
        dummy.updateMatrix();
        bands.setMatrixAt(band, dummy.matrix);
        color.setHex(zone % 2 ? 0xc4bbae : 0x9aa7b2);
        bands.setColorAt(band, color);
        band++;
      }
    }
  }
  bands.count = band;
  for (const part of [mesh, roofs, plinths, cornices, bands]) {
    part.instanceMatrix.needsUpdate = true;
    if (part.instanceColor) part.instanceColor.needsUpdate = true;
    part.receiveShadow = true;
    part.castShadow = false;
    if (part.count > 0) part.computeBoundingSphere();
  }
  const group = new THREE.Group();
  group.frustumCulled = false;
  group.add(mesh, plinths, roofs, cornices, bands);
  if (!wallMesh) wallMesh = mesh;
  chunks.push(group);
  }
  parkChunks(root, chunks);
  root.userData.walls = wallMesh;
  return root;
}

function makeTrees(city, step, index) {
  const pts = city.trees || [];
  const total = Math.floor(pts.length / 2);
  const count = Math.max(1, Math.ceil(total / step));
  const crownGeo = new THREE.IcosahedronGeometry(1, 1);
  const puffGeo = new THREE.IcosahedronGeometry(0.72, 0);
  const poplarGeo = new THREE.ConeGeometry(0.62, 3.1, 6);
  poplarGeo.translate(0, 1.55, 0);
  const trunkGeo = new THREE.CylinderGeometry(0.1, 0.18, 1, 6);
  const crownMat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
  const puffMat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
  const poplarMat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6a4e3c });
  const crowns = new THREE.InstancedMesh(crownGeo, crownMat, count);
  const puffs = new THREE.InstancedMesh(puffGeo, puffMat, count);
  const poplars = new THREE.InstancedMesh(poplarGeo, poplarMat, count);
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, count);
  const parts = [crowns, puffs, poplars, trunks];
  for (const mesh of parts) mesh.frustumCulled = false;
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const greens = [0x3e8c42, 0x2f7a38, 0x4e9a48, 0x246b34, 0x5aa64a];
  const tall = [0x2c7340, 0x1f6232, 0x347a3c];
  let nBroad = 0;
  let nPop = 0;
  let nTrunk = 0;
  for (let i = 0; i < total; i += step) {
    const x = pts[i * 2];
    const z = pts[i * 2 + 1];
    const s = 1.15 + ((i * 17) % 8) / 10;
    const poplar = i % 5 === 0;
    let gy = heightAt(x, z);
    if (index) {
      const hit = nearestRoad(index, x, z, 16);
      if (hit) {
        const hw = (hit.half != null ? hit.half : Math.max(3.1, (hit.w || 6) * 0.55)) * 1.2;
        const raised = !!(hit.seg?.br || hit.y - gy > 2.5);
        if (hit.dist < hw + 0.55) continue;
        if (raised && hit.dist < hw + 3) continue;
        gy = streetTop(hit.dist, hw, hit.y, gy, raised);
      }
    }
    if (poplar) {
      if (nPop >= count) continue;
      dummy.position.set(x, gy, z);
      dummy.rotation.set(0, i * 0.2, 0);
      dummy.scale.set(s * 0.85, s * 1.35, s * 0.85);
      dummy.updateMatrix();
      poplars.setMatrixAt(nPop, dummy.matrix);
      color.setHex(tall[i % tall.length]);
      poplars.setColorAt(nPop, color);
      dummy.position.set(x, gy + 0.55, z);
      dummy.scale.set(0.7, 2.4 * s, 0.7);
      dummy.updateMatrix();
      trunks.setMatrixAt(nTrunk, dummy.matrix);
      nTrunk++;
      nPop++;
    } else {
      if (nBroad >= count) continue;
      dummy.position.set(x, gy + 1.7 * s, z);
      dummy.rotation.set(0, i, 0);
      dummy.scale.set(s * 1.55, s * 1.15, s * 1.55);
      dummy.updateMatrix();
      crowns.setMatrixAt(nBroad, dummy.matrix);
      color.setHex(greens[i % greens.length]);
      crowns.setColorAt(nBroad, color);
      dummy.position.set(x, gy + 2.55 * s, z);
      dummy.scale.set(s * 0.95, s * 0.72, s * 0.95);
      dummy.updateMatrix();
      puffs.setMatrixAt(nBroad, dummy.matrix);
      color.setHex(greens[(i + 2) % greens.length]);
      puffs.setColorAt(nBroad, color);
      dummy.position.set(x, gy + 0.45, z);
      dummy.scale.set(1, 1.15, 1);
      dummy.updateMatrix();
      trunks.setMatrixAt(nTrunk, dummy.matrix);
      nTrunk++;
      nBroad++;
    }
  }
  crowns.count = nBroad;
  puffs.count = nBroad;
  poplars.count = nPop;
  trunks.count = nTrunk;
  for (const mesh of parts) {
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }
  return { parts, crowns, puffs, poplars, trunks };
}

function put(g, geo, mat, x, y, z) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  g.add(m);
  return m;
}

function namePlate(text, aerial = false) {
  const c = document.createElement("canvas");
  c.width = aerial ? 1024 : 640;
  c.height = aerial ? 256 : 160;
  const ctx = c.getContext("2d");
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.fillStyle = "rgba(10,14,22,0.78)";
  const pad = aerial ? 28 : 12;
  ctx.fillRect(pad, aerial ? 40 : 36, c.width - pad * 2, aerial ? 176 : 96);
  ctx.fillStyle = aerial ? "#f4f7fb" : "#f2c14e";
  const size = aerial ? (text.length > 12 ? 92 : 118) : (text.length > 18 ? 40 : 52);
  ctx.font = `700 ${size}px system-ui, Segoe UI, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, c.width / 2, c.height / 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sp.scale.set(aerial ? 280 : 42, aerial ? 70 : 10.5, 1);
  sp.renderOrder = aerial ? 12 : 6;
  return sp;
}

function onion(g, mat, r, x, y, z) {
  const dome = put(g, new THREE.SphereGeometry(r, 12, 8), mat, x, y, z);
  dome.scale.y = 1.35;
  put(g, new THREE.CylinderGeometry(r * 0.08, r * 0.08, r * 1.3, 5), mat, x, y + r * 1.45, z);
  put(g, new THREE.BoxGeometry(r * 0.7, r * 0.08, r * 0.08), mat, x, y + r * 1.7, z);
}

function cathedral(g, walls, gold, w, d, h, domes) {
  put(g, new THREE.BoxGeometry(w, h, d), walls, 0, h * 0.5, 0);
  put(g, new THREE.BoxGeometry(w * 0.55, h * 0.45, d * 0.7), walls, 0, h + h * 0.15, 0);
  onion(g, gold, domes, 0, h + h * 0.55, 0);
  onion(g, gold, domes * 0.55, -w * 0.28, h + 1.2, -d * 0.18);
  onion(g, gold, domes * 0.55, w * 0.28, h + 1.2, -d * 0.18);
  onion(g, gold, domes * 0.48, -w * 0.28, h + 0.8, d * 0.22);
  onion(g, gold, domes * 0.48, w * 0.28, h + 0.8, d * 0.22);
}

function clearOfRunway(x, z, halfX, halfZ, fields) {
  for (const f of fields || []) {
    const fx = Math.sin(f.h);
    const fz = Math.cos(f.h);
    const rx = Math.cos(f.h);
    const rz = -Math.sin(f.h);
    const along = (x - f.x) * fx + (z - f.z) * fz;
    const lat = (x - f.x) * rx + (z - f.z) * rz;
    const halfAlong = Math.abs(halfX * fx) + Math.abs(halfZ * fz);
    const halfLat = Math.abs(halfX * rx) + Math.abs(halfZ * rz);
    const hw = Math.max(14, (f.wid || 30) * 0.5);
    if (Math.abs(along) > f.len * 0.5 + halfAlong) continue;
    const limit = hw + 20 + halfLat;
    if (Math.abs(lat) >= limit) continue;
    const sign = lat < 0 ? -1 : 1;
    const shift = sign * limit - lat;
    x += rx * shift;
    z += rz * shift;
  }
  return { x, z };
}

function landmark(sight) {
  const g = new THREE.Group();
  const id = sight.id;
  const icon = sight.icon;
  const stone = new THREE.MeshLambertMaterial({ color: 0xf3efe6 });
  const gold = new THREE.MeshLambertMaterial({ color: 0xe3b423, emissive: 0x8a6a12, emissiveIntensity: 0.18 });
  const brick = new THREE.MeshLambertMaterial({ color: 0x8d4a32 });
  const blue = new THREE.MeshLambertMaterial({ color: 0x2f5f9a });
  const glass = new THREE.MeshLambertMaterial({ color: 0xc5d7e6, transparent: true, opacity: 0.85 });
  let top = 24;
  const plaza = (r) => put(g, new THREE.CylinderGeometry(r, r, 0.28, 24), new THREE.MeshLambertMaterial({ color: 0xddd4c6 }), 0, 0.2, 0);

  if (id === "maidan" || icon === "column") {
    plaza(18);
    put(g, new THREE.CylinderGeometry(7.5, 8.2, 2.2, 16), stone, 0, 1.1, 0);
    put(g, new THREE.CylinderGeometry(1.35, 1.7, 52, 12), stone, 0, 28, 0);
    put(g, new THREE.CylinderGeometry(2.4, 2.4, 1.2, 12), gold, 0, 54.5, 0);
    put(g, new THREE.ConeGeometry(1.1, 7.5, 7), gold, 0, 59, 0);
    put(g, new THREE.BoxGeometry(0.35, 6, 3.2), gold, 1.1, 60, 0);
    top = 68;
  } else if (id === "lavra") {
    plaza(34);
    cathedral(g, stone, gold, 42, 30, 20, 6.4);
    put(g, new THREE.CylinderGeometry(6.2, 8, 78, 10), stone, 26, 39, 10);
    onion(g, gold, 6.4, 26, 86, 10);
    top = 108;
  } else if (id === "mykhailivsky") {
    plaza(26);
    cathedral(g, blue, gold, 40, 28, 18, 6.8);
    put(g, new THREE.CylinderGeometry(4, 5, 40, 8), blue, -22, 20, 8);
    onion(g, gold, 4.2, -22, 44, 8);
    top = 62;
  } else if (id === "sophia" || icon === "dome") {
    plaza(16);
    cathedral(g, stone, gold, 26, 18, 13, 3.6);
    put(g, new THREE.CylinderGeometry(2.4, 3, 28, 8), stone, 16, 14, 8);
    onion(g, gold, 2.4, 16, 30, 8);
    top = 36;
  } else if (icon === "church") {
    plaza(12);
    cathedral(g, stone, gold, 16, 12, 10, 2.8);
    put(g, new THREE.CylinderGeometry(1.6, 2, 18, 8), stone, 10, 9, 0);
    onion(g, gold, 1.7, 10, 20, 0);
    top = 28;
  } else if (id === "goldengate" || icon === "gate") {
    plaza(12);
    put(g, new THREE.BoxGeometry(5, 16, 8), brick, -7, 8, 0);
    put(g, new THREE.BoxGeometry(5, 16, 8), brick, 7, 8, 0);
    put(g, new THREE.BoxGeometry(9, 3.2, 8), brick, 0, 14.2, 0);
    put(g, new THREE.BoxGeometry(8, 6, 7), stone, 0, 18.5, 0);
    onion(g, gold, 2.6, 0, 24, 0);
    top = 32;
  } else if (id === "motherland" || icon === "mother") {
    plaza(28);
    put(g, new THREE.CylinderGeometry(18, 24, 10, 8), stone, 0, 5, 0);
    put(g, new THREE.CylinderGeometry(4.6, 10, 52, 7), stone, 0, 36, 0);
    put(g, new THREE.SphereGeometry(4.6, 8, 6), stone, 0, 66, 0);
    put(g, new THREE.BoxGeometry(1.4, 36, 1.4), gold, 3.4, 82, 0);
    put(g, new THREE.BoxGeometry(16, 18, 1.2), new THREE.MeshLambertMaterial({ color: 0xc4552a }), -7, 46, 0.8);
    top = 108;
  } else if (icon === "arch") {
    put(g, new THREE.TorusGeometry(48, 3.6, 10, 28, Math.PI), gold, 0, 0, 0);
    put(g, new THREE.BoxGeometry(5, 8, 5), stone, -48, 4, 0);
    put(g, new THREE.BoxGeometry(5, 8, 5), stone, 48, 4, 0);
    top = 58;
  } else if (id === "bessarabka" || icon === "market") {
    plaza(14);
    put(g, new THREE.BoxGeometry(26, 10, 20), stone, 0, 5, 0);
    put(g, new THREE.CylinderGeometry(7, 7, 4, 12), stone, 0, 12, 0);
    const dome = put(g, new THREE.SphereGeometry(7.2, 14, 10), glass, 0, 16, 0);
    dome.scale.y = 0.7;
    for (const [x, z] of [[-13, -10], [13, -10], [-13, 10], [13, 10]]) {
      put(g, new THREE.BoxGeometry(3, 14, 3), stone, x, 7, z);
      onion(g, gold, 1.3, x, 15, z);
    }
    top = 24;
  } else if (icon === "stadium") {
    put(g, new THREE.CylinderGeometry(120, 136, 24, 24), new THREE.MeshLambertMaterial({ color: 0xd8dde4 }), 0, 12, 0);
    put(g, new THREE.CylinderGeometry(74, 74, 1.4, 24), new THREE.MeshLambertMaterial({ color: 0x3d8f45 }), 0, 24.2, 0);
    const ring = put(g, new THREE.TorusGeometry(112, 3.4, 8, 28), new THREE.MeshLambertMaterial({ color: 0xf4f7fb }), 0, 26, 0);
    ring.rotation.x = Math.PI / 2;
    top = 32;
  } else if (icon === "bridge") {
    put(g, new THREE.BoxGeometry(2.4, 28, 2.4), stone, -14, 14, 8);
    put(g, new THREE.BoxGeometry(2.4, 28, 2.4), stone, 14, 14, 8);
    put(g, new THREE.BoxGeometry(30, 1.1, 1.4), stone, 0, 26, 8);
    top = 32;
  } else if (icon === "palace" || icon === "station") {
    plaza(icon === "station" ? 16 : 12);
    put(g, new THREE.BoxGeometry(32, 14, 16), stone, 0, 7, 0);
    put(g, new THREE.BoxGeometry(34, 1.4, 18), id === "opera" ? gold : blue, 0, 14.6, 0);
    put(g, new THREE.BoxGeometry(8, 8, 8), stone, 0, 18, 0);
    if (icon === "palace") onion(g, gold, 2.2, 0, 24, 0);
    for (let i = -3; i <= 3; i++) put(g, new THREE.CylinderGeometry(0.4, 0.4, 9, 6), stone, i * 4, 4.5, 8.2);
    top = icon === "palace" ? 30 : 20;
  } else if (icon === "plane") {
    put(g, new THREE.BoxGeometry(54, 9, 16), new THREE.MeshLambertMaterial({ color: 0xe8eef4 }), 0, 4.5, 0);
    put(g, new THREE.BoxGeometry(78, 1.1, 14), blue, 0, 9.2, 0);
    put(g, new THREE.BoxGeometry(8, 6, 22), blue, -8, 8, 0);
    g.userData.foot = [39, 11];
    top = 16;
  } else if (icon === "island") {
    put(g, new THREE.SphereGeometry(12, 8, 5), new THREE.MeshLambertMaterial({ color: 0x2f8a48, flatShading: true }), 0, 2, 0);
    top = 14;
  } else if (icon === "square") {
    plaza(14);
    put(g, new THREE.CylinderGeometry(4.5, 4.5, 1.1, 14), stone, 0, 0.7, 0);
    put(g, new THREE.CylinderGeometry(1.2, 1.6, 3.2, 8), stone, 0, 2.4, 0);
    put(g, new THREE.SphereGeometry(1.1, 8, 6), blue, 0, 4.4, 0);
    top = 12;
  } else {
    plaza(8);
    put(g, new THREE.BoxGeometry(5, 14, 5), stone, 0, 7, 0);
    put(g, new THREE.ConeGeometry(2.4, 4, 6), gold, 0, 16, 0);
    top = 22;
  }
  const plate = namePlate(sight.n);
  plate.position.y = top + 7;
  g.add(plate);
  g.userData.top = top;
  g.userData.plate = plate;
  return g;
}

function boxGeo(w, h, d, x, y, z) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
}

function joinGeos(list) {
  const positions = [];
  const normals = [];
  for (const src of list) {
    const g = src.index ? src.toNonIndexed() : src;
    positions.push(...g.getAttribute("position").array);
    const n = g.getAttribute("normal");
    if (n) normals.push(...n.array);
    src.dispose();
    if (g !== src) g.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  if (normals.length) geo.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  return geo;
}

function runwayDesignator(h) {
  let deg = (-h * 180) / Math.PI;
  deg = ((deg % 360) + 360) % 360;
  let n = Math.round(deg / 10);
  if (n <= 0 || n > 36) n = 36;
  let m = n + 18;
  if (m > 36) m -= 36;
  return [n, m];
}

const runwayDigits = new Map();
function runwayDigitMaterial(n) {
  const key = String(n).padStart(2, "0");
  if (runwayDigits.has(key)) return runwayDigits.get(key);
  const tex = canvasTex((g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = "#f4f7fb";
    g.font = "700 150px sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(key, w / 2, h / 2);
  }, 128, 192, false);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide });
  runwayDigits.set(key, mat);
  return mat;
}

function addRibbon(buf, x, z, fx, fz, rx, rz, stations, lat0, lat1, lift = 0) {
  for (let i = 0; i < stations.length - 1; i++) {
    const a0 = stations[i].a;
    const a1 = stations[i + 1].a;
    const y0 = stations[i].y + lift;
    const y1 = stations[i + 1].y + lift;
    const p = (a, y, lat) => buf.push(x + fx * a + rx * lat, y, z + fz * a + rz * lat);
    p(a0, y0, lat0);
    p(a1, y1, lat0);
    p(a1, y1, lat1);
    p(a0, y0, lat0);
    p(a1, y1, lat1);
    p(a0, y0, lat1);
  }
}

function addQuad(buf, x, z, y, fx, fz, rx, rz, a0, a1, lat0, lat1) {
  const p = (a, lat) => buf.push(x + fx * a + rx * lat, y, z + fz * a + rz * lat);
  p(a0, lat0);
  p(a1, lat0);
  p(a1, lat1);
  p(a0, lat0);
  p(a1, lat1);
  p(a0, lat1);
}

function makeRunways(fields) {
  const shoulder = [];
  const asphalt = [];
  const white = [];
  const yellow = [];
  const lights = [];
  const group = new THREE.Group();
  const hangars = [];
  const terminals = [];
  const tanks = [];
  const towers = [];
  const socks = [];
  const digitGeo = new THREE.PlaneGeometry(14, 22);
  for (const f of fields) {
    const n = Math.max(1, Math.ceil(f.len / 36));
    const fx = Math.sin(f.h);
    const fz = Math.cos(f.h);
    const rx = Math.cos(f.h);
    const rz = -Math.sin(f.h);
    const hw = Math.max(14, f.wid * 0.5);
    const stations = [];
    for (let i = 0; i <= n; i++) {
      const a = -f.len / 2 + (f.len * i) / n;
      stations.push({ a, y: heightAt(f.x + fx * a, f.z + fz * a) + 1.48 });
    }
    addRibbon(shoulder, f.x, f.z, fx, fz, rx, rz, stations, -(hw + 9), hw + 9, -0.08);
    addRibbon(asphalt, f.x, f.z, fx, fz, rx, rz, stations, -hw, hw, 0);
    addRibbon(white, f.x, f.z, fx, fz, rx, rz, stations, hw - 1.35, hw - 0.55, 0.06);
    addRibbon(white, f.x, f.z, fx, fz, rx, rz, stations, -(hw - 0.55), -(hw - 1.35), 0.06);
    for (let i = 0; i < n; i += 2) addRibbon(white, f.x, f.z, fx, fz, rx, rz, stations.slice(i, i + 2), -0.55, 0.55, 0.08);
    const yAt = (a) => heightAt(f.x + fx * a, f.z + fz * a) + 1.48;
    const keys = 8;
    const slot = (hw * 2) / keys;
    for (const end of [-1, 1]) {
      const base = end < 0 ? -f.len / 2 + 6 : f.len / 2 - 34;
      const yBar = yAt(base + 14) + 0.08;
      for (let s = 0; s < keys; s += 2) {
        const lat0 = -hw + s * slot + slot * 0.18;
        addQuad(white, f.x, f.z, yBar, fx, fz, rx, rz, base, base + 28, lat0, lat0 + slot * 0.64);
      }
    }
    const aim = Math.min(f.len * 0.22, 280);
    const yAim = yAt(-aim + 20) + 0.08;
    addQuad(white, f.x, f.z, yAim, fx, fz, rx, rz, -aim, -aim + 42, -hw * 0.55, -hw * 0.55 + 3.2);
    addQuad(white, f.x, f.z, yAim, fx, fz, rx, rz, -aim, -aim + 42, hw * 0.55 - 3.2, hw * 0.55);
    const taxi0 = -f.len / 2 + 70;
    const taxi1 = taxi0 + Math.min(320, f.len * 0.4);
    const taxiN = Math.max(1, Math.ceil((taxi1 - taxi0) / 40));
    const taxiStations = [];
    for (let i = 0; i <= taxiN; i++) {
      const a = taxi0 + ((taxi1 - taxi0) * i) / taxiN;
      taxiStations.push({ a, y: yAt(a) });
    }
    const taxi = hw + 6;
    addRibbon(asphalt, f.x, f.z, fx, fz, rx, rz, taxiStations, taxi, taxi + 14, -0.02);
    addRibbon(yellow, f.x, f.z, fx, fz, rx, rz, taxiStations, taxi + 6.1, taxi + 7.9, 0.06);
    addRibbon(shoulder, f.x, f.z, fx, fz, rx, rz, taxiStations, hw + 16, hw + 86, -0.05);
    const [numA, numB] = runwayDesignator(f.h);
    for (const [num, along, turn] of [[numA, -f.len / 2 + 78, Math.PI], [numB, f.len / 2 - 78, 0]]) {
      const x = f.x + fx * along;
      const z = f.z + fz * along;
      const plate = new THREE.Mesh(digitGeo, runwayDigitMaterial(num));
      plate.position.set(x, heightAt(x, z) + 1.5, z);
      plate.rotation.order = "YXZ";
      plate.rotation.y = f.h + turn;
      plate.rotation.x = -Math.PI / 2;
      plate.renderOrder = 5;
      group.add(plate);
    }
    const stepL = 70;
    const nL = Math.max(2, Math.floor(f.len / stepL));
    for (let i = 0; i <= nL; i++) {
      const a = -f.len / 2 + (f.len * i) / nL;
      for (const side of [-1, 1]) {
        const x = f.x + fx * a + rx * side * (hw + 3);
        const z = f.z + fz * a + rz * side * (hw + 3);
        lights.push(x, heightAt(x, z) + 1.7, z);
      }
    }
    for (let k = 0; k < 3; k++) {
      const along = -f.len / 2 + 140 + k * 38;
      const lat = hw + 46;
      const x = f.x + fx * along + rx * lat;
      const z = f.z + fz * along + rz * lat;
      hangars.push({ x, y: heightAt(x, z) + 1.4, z, h: f.h });
    }
    const termAlong = -f.len / 2 + 250;
    const termLat = hw + 78;
    const termX = f.x + fx * termAlong + rx * termLat;
    const termZ = f.z + fz * termAlong + rz * termLat;
    terminals.push({ x: termX, y: heightAt(termX, termZ) + 1.4, z: termZ, h: f.h });
    for (let k = 0; k < 2; k++) {
      const along = -f.len / 2 + 300 + k * 16;
      const lat = hw + 62;
      const x = f.x + fx * along + rx * lat;
      const z = f.z + fz * along + rz * lat;
      tanks.push({ x, y: heightAt(x, z) + 1.5, z });
    }
    const tAlong = -f.len / 2 + 210;
    const tLat = hw + 78;
    const tx = f.x + fx * tAlong + rx * tLat;
    const tz = f.z + fz * tAlong + rz * tLat;
    towers.push({ x: tx, y: heightAt(tx, tz) + 1.4, z: tz, h: f.h });
    const sAlong = -f.len / 2 + 120;
    const sx = f.x + fx * sAlong + rx * (hw + 16);
    const sz = f.z + fz * sAlong + rz * (hw + 16);
    socks.push({ x: sx, y: heightAt(sx, sz) + 1.4, z: sz });
  }
  const shoulderMesh = meshPos(shoulder, new THREE.MeshBasicMaterial({ color: 0x6a735c, side: THREE.DoubleSide, fog: false }));
  const stripMesh = meshPos(asphalt, new THREE.MeshBasicMaterial({ color: 0x2a3140, side: THREE.DoubleSide, fog: false }));
  const whiteMesh = meshPos(white, new THREE.MeshBasicMaterial({ color: 0xf4f7fb, side: THREE.DoubleSide, fog: false }));
  const yellowMesh = meshPos(yellow, new THREE.MeshBasicMaterial({ color: 0xf2c14e, side: THREE.DoubleSide, fog: false }));
  for (const mesh of [shoulderMesh, stripMesh, whiteMesh, yellowMesh]) {
    if (!mesh) continue;
    mesh.renderOrder = mesh === whiteMesh || mesh === yellowMesh ? 4 : 3;
    group.add(mesh);
  }
  if (lights.length) {
    const lamp = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.7, 0.45, 0.7),
      new THREE.MeshBasicMaterial({ color: 0xfff6d2, fog: false }),
      lights.length / 3,
    );
    const dummy = new THREE.Object3D();
    for (let i = 0; i < lights.length; i += 3) {
      dummy.position.set(lights[i], lights[i + 1], lights[i + 2]);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      lamp.setMatrixAt(i / 3, dummy.matrix);
    }
    lamp.count = lights.length / 3;
    lamp.instanceMatrix.needsUpdate = true;
    lamp.frustumCulled = false;
    group.add(lamp);
  }
  if (hangars.length) {
    const box = new THREE.InstancedMesh(new THREE.BoxGeometry(28, 9, 18), new THREE.MeshLambertMaterial({ color: 0xc5bfb2 }), hangars.length);
    const door = new THREE.InstancedMesh(new THREE.BoxGeometry(16, 6.2, 0.4), new THREE.MeshLambertMaterial({ color: 0x2a313c }), hangars.length);
    const roof = new THREE.InstancedMesh(new THREE.BoxGeometry(29, 1.1, 19), new THREE.MeshLambertMaterial({ color: 0x8d7340 }), hangars.length);
    const dummy = new THREE.Object3D();
    hangars.forEach((h, i) => {
      dummy.position.set(h.x, h.y + 4.5, h.z);
      dummy.rotation.set(0, h.h, 0);
      dummy.updateMatrix();
      box.setMatrixAt(i, dummy.matrix);
      dummy.position.set(h.x + Math.sin(h.h) * 9.2, h.y + 3.4, h.z + Math.cos(h.h) * 9.2);
      dummy.updateMatrix();
      door.setMatrixAt(i, dummy.matrix);
      dummy.position.set(h.x, h.y + 9.2, h.z);
      dummy.updateMatrix();
      roof.setMatrixAt(i, dummy.matrix);
    });
    for (const mesh of [box, door, roof]) {
      mesh.count = hangars.length;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.frustumCulled = false;
      group.add(mesh);
    }
  }
  if (terminals.length) {
    const hall = new THREE.InstancedMesh(new THREE.BoxGeometry(34, 6, 16), new THREE.MeshLambertMaterial({ color: 0xd7d0c4 }), terminals.length);
    const glass = new THREE.InstancedMesh(new THREE.BoxGeometry(30, 2.2, 0.4), new THREE.MeshLambertMaterial({ color: 0x9ec4de }), terminals.length);
    const dummy = new THREE.Object3D();
    terminals.forEach((t, i) => {
      dummy.rotation.set(0, t.h, 0);
      dummy.position.set(t.x, t.y + 3, t.z);
      dummy.updateMatrix();
      hall.setMatrixAt(i, dummy.matrix);
      dummy.position.set(t.x + Math.sin(t.h) * 8, t.y + 3.2, t.z + Math.cos(t.h) * 8);
      dummy.updateMatrix();
      glass.setMatrixAt(i, dummy.matrix);
    });
    hall.count = glass.count = terminals.length;
    hall.instanceMatrix.needsUpdate = glass.instanceMatrix.needsUpdate = true;
    hall.frustumCulled = glass.frustumCulled = false;
    group.add(hall, glass);
  }
  if (tanks.length) {
    const tank = new THREE.InstancedMesh(new THREE.CylinderGeometry(4.2, 4.2, 7, 12), new THREE.MeshLambertMaterial({ color: 0xe7e1d4 }), tanks.length);
    const band = new THREE.InstancedMesh(new THREE.CylinderGeometry(4.35, 4.35, 0.7, 12), new THREE.MeshLambertMaterial({ color: 0xf2c14e }), tanks.length);
    const dummy = new THREE.Object3D();
    tanks.forEach((t, i) => {
      dummy.rotation.set(0, 0, 0);
      dummy.position.set(t.x, t.y + 3.5, t.z);
      dummy.updateMatrix();
      tank.setMatrixAt(i, dummy.matrix);
      dummy.position.set(t.x, t.y + 5.2, t.z);
      dummy.updateMatrix();
      band.setMatrixAt(i, dummy.matrix);
    });
    tank.count = band.count = tanks.length;
    tank.instanceMatrix.needsUpdate = band.instanceMatrix.needsUpdate = true;
    tank.frustumCulled = band.frustumCulled = false;
    group.add(tank, band);
  }
  if (towers.length) {
    const shaft = new THREE.InstancedMesh(new THREE.BoxGeometry(3.4, 18, 3.4), new THREE.MeshLambertMaterial({ color: 0xd9d3c6 }), towers.length);
    const cab = new THREE.InstancedMesh(new THREE.BoxGeometry(7.2, 3.1, 7.2), new THREE.MeshLambertMaterial({ color: 0xb7d7ea }), towers.length);
    const mast = new THREE.InstancedMesh(new THREE.BoxGeometry(0.28, 5.5, 0.28), new THREE.MeshLambertMaterial({ color: 0x1b212b }), towers.length);
    const dummy = new THREE.Object3D();
    towers.forEach((t, i) => {
      dummy.rotation.set(0, 0, 0);
      dummy.position.set(t.x, t.y + 9, t.z);
      dummy.updateMatrix();
      shaft.setMatrixAt(i, dummy.matrix);
      dummy.position.set(t.x, t.y + 19.2, t.z);
      dummy.updateMatrix();
      cab.setMatrixAt(i, dummy.matrix);
      dummy.position.set(t.x, t.y + 23.2, t.z);
      dummy.updateMatrix();
      mast.setMatrixAt(i, dummy.matrix);
    });
    for (const mesh of [shaft, cab, mast]) {
      mesh.count = towers.length;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.frustumCulled = false;
      group.add(mesh);
    }
  }
  if (socks.length) {
    const pole = new THREE.InstancedMesh(new THREE.BoxGeometry(0.18, 7, 0.18), new THREE.MeshLambertMaterial({ color: 0xdedede }), socks.length);
    const cone = new THREE.InstancedMesh(new THREE.BoxGeometry(0.7, 0.7, 2.4), new THREE.MeshLambertMaterial({ color: 0xe4453a }), socks.length);
    const dummy = new THREE.Object3D();
    socks.forEach((s, i) => {
      dummy.rotation.set(0, 0, 0);
      dummy.position.set(s.x, s.y + 3.5, s.z);
      dummy.updateMatrix();
      pole.setMatrixAt(i, dummy.matrix);
      dummy.position.set(s.x, s.y + 6.6, s.z + 1);
      dummy.updateMatrix();
      cone.setMatrixAt(i, dummy.matrix);
    });
    pole.count = cone.count = socks.length;
    pole.instanceMatrix.needsUpdate = cone.instanceMatrix.needsUpdate = true;
    pole.frustumCulled = cone.frustumCulled = false;
    group.add(pole, cone);
  }
  return group;
}

function shell(profile, material) {
  const mesh = new THREE.Mesh(new THREE.LatheGeometry(profile, 22), material);
  mesh.rotation.x = Math.PI / 2;
  mesh.castShadow = true;
  return mesh;
}

function plate(verts, material) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  geo.setIndex([
    0, 1, 2, 0, 2, 3,
    4, 6, 5, 4, 7, 6,
    0, 5, 1, 0, 4, 5,
    1, 5, 6, 1, 6, 2,
    2, 6, 7, 2, 7, 3,
    3, 7, 4, 3, 4, 0,
  ]);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = true;
  return mesh;
}

function makePlane() {
  const g = new THREE.Group();
  const paint = new THREE.MeshPhongMaterial({ color: 0x0057b8, specular: 0x9ec4ea, shininess: 46, side: THREE.DoubleSide });
  const accent = new THREE.MeshPhongMaterial({ color: 0xffd100, shininess: 28, side: THREE.DoubleSide });
  const dark = new THREE.MeshPhongMaterial({ color: 0x232830, shininess: 18 });
  const glass = new THREE.MeshPhongMaterial({ color: 0xb7d4ea, transparent: true, opacity: 0.55, shininess: 90 });
  const fuse = shell([
    new THREE.Vector2(0.05, 0),
    new THREE.Vector2(0.28, 0.45),
    new THREE.Vector2(0.58, 1.5),
    new THREE.Vector2(0.82, 3.1),
    new THREE.Vector2(0.92, 5.6),
    new THREE.Vector2(0.86, 8.2),
    new THREE.Vector2(0.64, 10.4),
    new THREE.Vector2(0.38, 12.1),
    new THREE.Vector2(0.16, 13.15),
  ], paint);
  fuse.position.set(0, 1.55, -6.15);
  const radome = new THREE.Mesh(new THREE.ConeGeometry(0.2, 1.15, 14), dark);
  radome.rotation.x = Math.PI / 2;
  radome.position.set(0, 1.55, 7.15);
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.62, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.52), glass);
  canopy.scale.set(0.82, 0.72, 1.65);
  canopy.position.set(0, 2.12, 2.55);
  const frame = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.035, 8, 18), dark);
  frame.rotation.x = Math.PI / 2;
  frame.scale.set(0.85, 1.3, 0.7);
  frame.position.set(0, 2.18, 2.15);
  const roundel = new THREE.Mesh(new THREE.CircleGeometry(0.15, 16), accent);
  roundel.position.set(0.94, 1.55, 0.4);
  roundel.rotation.y = Math.PI / 2;
  const roundelIn = new THREE.Mesh(new THREE.CircleGeometry(0.065, 12), paint);
  roundelIn.position.set(0.96, 1.55, 0.4);
  roundelIn.rotation.y = Math.PI / 2;
  const roundelL = roundel.clone();
  roundelL.position.x = -0.94;
  roundelL.rotation.y = -Math.PI / 2;
  const roundelInL = roundelIn.clone();
  roundelInL.position.x = -0.96;
  roundelInL.rotation.y = -Math.PI / 2;
  const cheat = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.05, 2.1), accent);
  cheat.position.set(0.9, 1.66, -0.05);
  const cheatL = cheat.clone();
  cheatL.position.x = -0.9;
  const sash = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.026, 8, 24), accent);
  sash.rotation.y = Math.PI / 2;
  sash.position.set(0, 1.55, 0.35);
  const mix = (a, b, t) => a + (b - a) * t;
  const HINGE = 0.7;
  const wingStation = (span, s) => ({
    xLe: span * s,
    xTe: span * 0.94 * s,
    zLe: mix(1.15, -0.7, s),
    zTe: mix(-1.85, -1.55, s),
    yLeT: mix(0.055, 0.02, s),
    yTeT: mix(0.045, 0.015, s),
    yLeB: mix(-0.04, -0.012, s),
    yTeB: mix(-0.03, -0.01, s),
  });
  const chordAt = (st, t) => ({
    x: mix(st.xLe, st.xTe, t),
    z: mix(st.zLe, st.zTe, t),
    yT: mix(st.yLeT, st.yTeT, t),
    yB: mix(st.yLeB, st.yTeB, t),
  });
  const quadVerts = (corners) => {
    const v = [];
    for (const p of corners) v.push(p.x, p.yT, p.z);
    for (const p of corners) v.push(p.x, p.yB, p.z);
    return v;
  };
  const wingCorners = (span, s0, s1, t0, t1) => [
    chordAt(wingStation(span, s0), t0),
    chordAt(wingStation(span, s1), t0),
    chordAt(wingStation(span, s1), t1),
    chordAt(wingStation(span, s0), t1),
  ];
  const wingVerts = (span) => quadVerts(wingCorners(span, 0, 1, 0, HINGE - 0.012));
  const hinged = (corners) => {
    const inn = corners[0];
    const out = corners[1];
    const origin = new THREE.Vector3(inn.x, (inn.yT + inn.yB) * 0.5, inn.z);
    const xAxis = new THREE.Vector3(out.x - inn.x, (out.yT + out.yB) * 0.5 - origin.y, out.z - inn.z);
    if (xAxis.lengthSq() < 1e-8) xAxis.set(1, 0, 0);
    xAxis.normalize();
    const yAxis = new THREE.Vector3(0, 1, 0);
    xAxis.addScaledVector(yAxis, -xAxis.dot(yAxis)).normalize();
    const zAxis = new THREE.Vector3().crossVectors(xAxis, yAxis).normalize();
    const aft = corners[3];
    const fwd = new THREE.Vector3(inn.x - aft.x, 0, inn.z - aft.z);
    if (zAxis.dot(fwd) < 0) {
      zAxis.negate();
      xAxis.negate();
    }
    const basis = new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis);
    const inv = basis.clone().invert();
    const local = corners.map((p) => ({
      top: new THREE.Vector3(p.x, p.yT, p.z).sub(origin).applyMatrix4(inv),
      bot: new THREE.Vector3(p.x, p.yB, p.z).sub(origin).applyMatrix4(inv),
    }));
    const verts = [];
    for (const p of local) verts.push(p.top.x, p.top.y, p.top.z);
    for (const p of local) verts.push(p.bot.x, p.bot.y, p.bot.z);
    const mesh = plate(verts, paint);
    const group = new THREE.Group();
    group.position.copy(origin);
    group.quaternion.setFromRotationMatrix(basis);
    group.add(mesh);
    return { group, mesh, local };
  };
  const swept = (sign) => {
    const pivot = new THREE.Group();
    pivot.position.set(sign * 0.72, 1.42, 0.05);
    const span = sign * 7.15;
    const wing = plate(wingVerts(span), paint);
    const fence = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.22, 0.42), accent);
    fence.position.set(sign * 5.7, 0.12, -1.05);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.012, 0.1), accent);
    stripe.position.set(sign * 2.05, 0.058, -0.62);
    const flap = hinged(wingCorners(span, 0.07, 0.4, HINGE, 1));
    const gap = plate(quadVerts(wingCorners(span, 0.4, 0.5, HINGE, 1)), paint);
    const aileron = hinged(wingCorners(span, 0.5, 0.86, HINGE, 1));
    aileron.mesh.userData.sign = sign;
    const tip = plate(quadVerts(wingCorners(span, 0.86, 1, HINGE, 1)), paint);
    const markSpan = 2.45;
    const le = 1.15 + (markSpan / 7.15) * -1.85;
    const te = -1.85 + (markSpan / 6.72) * 0.3;
    const mark = new THREE.Mesh(new THREE.CircleGeometry(0.28, 16), accent);
    mark.rotation.x = -Math.PI / 2;
    mark.position.set(sign * markSpan, 0.052, (le + te) / 2);
    const markIn = new THREE.Mesh(new THREE.CircleGeometry(0.12, 12), paint);
    markIn.rotation.x = -Math.PI / 2;
    markIn.position.set(sign * markSpan, 0.064, (le + te) / 2);
    pivot.add(wing, fence, stripe, flap.group, gap, aileron.group, tip, mark, markIn);
    pivot.userData.flap = flap.mesh;
    pivot.userData.aileron = aileron.mesh;
    return pivot;
  };
  const wingL = swept(-1);
  const wingR = swept(1);
  const glove = plate([
    0, 0.06, 1.7,
    2.15, 0.04, 0.15,
    1.9, 0.03, -1.35,
    0, 0.05, -1.15,
    0, -0.05, 1.7,
    2.15, -0.02, 0.15,
    1.9, -0.015, -1.35,
    0, -0.04, -1.15,
  ], paint);
  glove.position.set(0.15, 1.4, -0.05);
  const gloveL = glove.clone();
  gloveL.scale.x = -1;
  gloveL.position.x = -0.15;
  const stabStation = (s) => ({
    xLe: mix(0, 2.35, s),
    xTe: mix(0, 2.15, s),
    zLe: mix(0.55, -0.15, s),
    zTe: mix(-0.7, -0.85, s),
    yLeT: mix(0.03, 0.015, s),
    yTeT: mix(0.025, 0.01, s),
    yLeB: mix(-0.02, -0.01, s),
    yTeB: mix(-0.018, -0.008, s),
  });
  const stabAt = (s, t) => chordAt(stabStation(s), t);
  const stab = plate(quadVerts([
    stabAt(0, 0), stabAt(1, 0), stabAt(1, HINGE - 0.012), stabAt(0, HINGE - 0.012),
  ]), paint);
  stab.position.set(0.15, 1.62, -5.15);
  const stabL = stab.clone();
  stabL.scale.x = -1;
  stabL.position.x = -0.15;
  const finGeo = [
    0, 0, 0.85,
    0, 1.85, -0.25,
    0, 1.62, -1.25,
    0, 0, -0.72,
    0.09, 0, 0.85,
    0.09, 1.85, -0.25,
    0.09, 1.62, -1.25,
    0.09, 0, -0.72,
  ];
  const finL = plate(finGeo, paint);
  finL.position.set(-0.72, 1.7, -4.55);
  finL.rotation.z = 0.18;
  const finCapL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 0.24), accent);
  finCapL.position.set(0.045, 1.7, -0.3);
  const finStripeL = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.8, 0.06), accent);
  finStripeL.position.set(0.05, 1.05, -0.28);
  finL.add(finCapL, finStripeL);
  const finR = plate(finGeo, paint);
  finR.position.set(0.72, 1.7, -4.55);
  finR.rotation.z = -0.18;
  const finCapR = finCapL.clone();
  const finStripeR = finStripeL.clone();
  finR.add(finCapR, finStripeR);
  const nacelleGeo = new THREE.CylinderGeometry(0.4, 0.5, 3.5, 16);
  const nacelleL = new THREE.Mesh(nacelleGeo, dark);
  nacelleL.rotation.x = Math.PI / 2;
  nacelleL.position.set(-1.15, 1.02, -1.35);
  const nacelleR = nacelleL.clone();
  nacelleR.position.x = 1.15;
  const lipGeo = new THREE.TorusGeometry(0.4, 0.055, 8, 16);
  const lipL = new THREE.Mesh(lipGeo, dark);
  lipL.position.set(-1.15, 1.02, 0.42);
  const lipR = lipL.clone();
  lipR.position.x = 1.15;
  const nozzleGeo = new THREE.TorusGeometry(0.36, 0.07, 8, 18);
  const metal = new THREE.MeshPhongMaterial({ color: 0xc5ced6, shininess: 70 });
  const nozzleL = new THREE.Mesh(nozzleGeo, metal);
  nozzleL.position.set(-1.15, 1.02, -3.12);
  const nozzleR = nozzleL.clone();
  nozzleR.position.x = 1.15;
  const flameMat = new THREE.MeshBasicMaterial({ color: 0x9ec4de, fog: false });
  const flameL = new THREE.Mesh(new THREE.ConeGeometry(0.28, 2.2, 10), flameMat);
  flameL.rotation.x = -Math.PI / 2;
  flameL.position.set(-1.15, 1.02, -4.15);
  const flameR = flameL.clone();
  flameR.position.x = 1.15;
  const plugMat = new THREE.MeshPhongMaterial({ color: 0x12161c });
  const plugL = new THREE.Mesh(new THREE.ConeGeometry(0.27, 0.7, 12), plugMat);
  plugL.rotation.x = -Math.PI / 2;
  plugL.position.set(-1.15, 1.02, -3.32);
  const plugR = plugL.clone();
  plugR.position.x = 1.15;
  const spine = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.028, 2.3), accent);
  spine.position.set(0, 2.45, 0.12);
  const elevator = (sign) => {
    const local = [0.04, 0.96].map((s) => [stabAt(s, HINGE), stabAt(s, 1)]);
    const corners = [local[0][0], local[1][0], local[1][1], local[0][1]].map((p) => ({
      x: sign * p.x,
      z: p.z,
      yT: p.yT,
      yB: p.yB,
    }));
    const piece = hinged(corners);
    piece.group.position.x += sign * 0.15;
    piece.group.position.y += 1.62;
    piece.group.position.z += -5.15;
    return piece;
  };
  const elevR = elevator(1);
  const elevL = elevator(-1);
  const gear = new THREE.Group();
  const tire = new THREE.MeshLambertMaterial({ color: 0x1a1e24 });
  const hub = new THREE.MeshLambertMaterial({ color: 0xc5ccd6 });
  let noseLeg = null;
  for (const [x, z] of [[0, 4.4], [-1.15, -0.4], [1.15, -0.4]]) {
    const legGroup = new THREE.Group();
    legGroup.position.set(x, 0, z);
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.22, 14), tire);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(0, 0.34, 0);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.24, 8), hub);
    cap.rotation.z = Math.PI / 2;
    cap.position.set(0, 0.34, 0);
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.85, 8), dark);
    strut.position.set(0, 0.72, 0);
    legGroup.add(wheel, cap, strut);
    gear.add(legGroup);
    if (x === 0) noseLeg = legGroup;
  }
  gear.userData.nose = noseLeg;
  gear.userData.t = 1;
  g.add(
    fuse, radome, canopy, frame, roundel, roundelIn, roundelL, roundelInL, cheat, cheatL, sash,
    glove, gloveL, wingL, wingR, stab, stabL, elevL.group, elevR.group,
    finL, finR,
    nacelleL, nacelleR, lipL, lipR, nozzleL, nozzleR, plugL, plugR, flameL, flameR,
    spine, gear,
  );
  g.userData.gear = gear;
  g.userData.jets = [flameL, flameR];
  g.userData.flameMat = flameMat;
  g.userData.wingL = wingL;
  g.userData.wingR = wingR;
  g.userData.flaps = [wingL.userData.flap, wingR.userData.flap];
  g.userData.ailerons = [wingL.userData.aileron, wingR.userData.aileron];
  g.userData.elevators = [elevL.mesh, elevR.mesh];
  g.userData.sweep = 0;
  g.userData.flapT = 0;
  return g;
}

function flatDisc(lat, lon, rx, rz, color, lift) {
  const [x, z] = worldXZ(lat, lon);
  const geo = new THREE.CircleGeometry(1, 32);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color }));
  mesh.position.set(x, heightAt(x, z) + lift, z);
  mesh.scale.set(rx, 1, rz);
  mesh.frustumCulled = false;
  mesh.renderOrder = 3;
  return mesh;
}

function kyivBluff() {
  const ridge = [
    [50.4608, 30.5235],
    [50.4568, 30.5285],
    [50.4522, 30.5345],
    [50.4476, 30.54],
    [50.4424, 30.5475],
    [50.4372, 30.5545],
    [50.4324, 30.5605],
    [50.4272, 30.5655],
    [50.4228, 30.5705],
  ];
  const pts = ridge.map(([lat, lon]) => {
    const [x, z] = worldXZ(lat, lon);
    const [bx, bz] = worldXZ(lat, lon + 0.0032);
    return { x, z, y: heightAt(x, z), bx, bz, by: heightAt(bx, bz) };
  });
  const pos = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    if (a.y - a.by < 8 && b.y - b.by < 8) continue;
    const ay = a.y + 1.2;
    const by = b.y + 1.2;
    const aBase = Math.min(a.by, ay - 6) + 0.8;
    const bBase = Math.min(b.by, by - 6) + 0.8;
    pos.push(a.x, ay, a.z, b.x, by, b.z, b.bx, bBase, b.bz);
    pos.push(a.x, ay, a.z, b.bx, bBase, b.bz, a.bx, aBase, a.bz);
  }
  const mesh = meshFrom(pos, 0x3f6b3e, 1);
  if (mesh) {
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
  }
  return mesh;
}

function spanBridge(aLat, aLon, bLat, bLon, kind) {
  const [x0, z0] = worldXZ(aLat, aLon);
  const [x1, z1] = worldXZ(bLat, bLon);
  const dx = x1 - x0;
  const dz = z1 - z0;
  const len = Math.hypot(dx, dz);
  if (len < 40) return null;
  const mx = (x0 + x1) * 0.5;
  const mz = (z0 + z1) * 0.5;
  const deckY = Math.max(heightAt(mx, mz) + 16, (heightAt(x0, z0) + heightAt(x1, z1)) * 0.5);
  const g = new THREE.Group();
  const deckMat = new THREE.MeshLambertMaterial({ color: kind === "girder" ? 0xd7dde4 : 0xc5ced6 });
  const pierMat = new THREE.MeshLambertMaterial({ color: 0x9aa3ab });
  const accent = new THREE.MeshLambertMaterial({ color: 0xe7eef4 });
  const deck = new THREE.Mesh(new THREE.BoxGeometry(46, 3.2, len), deckMat);
  deck.position.y = deckY;
  g.add(deck);
  const piers = Math.max(2, Math.round(len / 240));
  for (let i = 0; i <= piers; i++) {
    const pier = new THREE.Mesh(new THREE.BoxGeometry(10, 26, 14), pierMat);
    pier.position.set(0, deckY - 12, -len * 0.5 + (len * i) / piers);
    g.add(pier);
  }
  if (kind === "pylon") {
    const pylon = new THREE.Mesh(new THREE.BoxGeometry(7, 96, 10), accent);
    pylon.position.set(0, deckY + 48, 0);
    g.add(pylon);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(52, 2.6, 8), accent);
    arm.position.set(0, deckY + 82, 0);
    g.add(arm);
  } else if (kind === "arch") {
    const arch = new THREE.Mesh(new THREE.TorusGeometry(Math.min(210, len * 0.24), 4.2, 8, 20, Math.PI), accent);
    arch.rotation.y = Math.PI / 2;
    arch.position.set(0, deckY, 0);
    g.add(arch);
  }
  g.position.set(mx, 0, mz);
  g.rotation.y = Math.atan2(dx, dz);
  g.frustumCulled = false;
  return g;
}

function dressKyiv(scene) {
  scene.add(flatDisc(50.47, 30.552, 780, 1500, 0x2c8a42, 2.4));
  scene.add(flatDisc(50.4455, 30.576, 520, 980, 0x2f8f46, 2.4));
  scene.add(flatDisc(50.455, 30.568, 380, 760, 0x348a48, 2.4));
  scene.add(flatDisc(50.368, 30.495, 1700, 1500, 0x2a6b3a, 1.4));
  scene.add(flatDisc(50.555, 30.38, 1900, 1600, 0x246338, 1.4));
  const bluff = kyivBluff();
  if (bluff) scene.add(bluff);
  for (const bridge of [
    spanBridge(50.4902, 30.522, 50.491, 30.558, "pylon"),
    spanBridge(50.4438, 30.5615, 50.4412, 30.5785, "arch"),
    spanBridge(50.4268, 30.569, 50.4256, 30.5985, "girder"),
    spanBridge(50.3982, 30.568, 50.3948, 30.608, "pylon"),
  ]) {
    if (bridge) scene.add(bridge);
  }
}

function ringHolds(x, z, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 2; i < ring.length; i += 2) {
    const xi = ring[i];
    const zi = ring[i + 1];
    const xj = ring[j];
    const zj = ring[j + 1];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi || 1e-9) + xi) inside = !inside;
    j = i;
  }
  return inside;
}

function buildWaterMask(city) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  const take = (x, z) => {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  };
  for (const river of city.rivers || []) {
    const p = river.p;
    if (!p) continue;
    for (let i = 0; i < p.length; i += 2) take(p[i], p[i + 1]);
  }
  for (const lake of city.lakes || []) {
    for (let i = 0; i < lake.length; i += 2) take(lake[i], lake[i + 1]);
  }
  if (!Number.isFinite(minX)) return null;
  const cell = 16;
  const pad = 400;
  const originX = minX - pad;
  const originZ = minZ - pad;
  const cols = Math.max(1, Math.ceil((maxX - minX + pad * 2) / cell));
  const rows = Math.max(1, Math.ceil((maxZ - minZ + pad * 2) / cell));
  if (cols * rows > 12000000) return null;
  const bits = new Uint8Array((cols * rows + 7) >> 3);
  const mark = (x, z) => {
    const c = Math.floor((x - originX) / cell);
    const r = Math.floor((z - originZ) / cell);
    if (c < 0 || r < 0 || c >= cols || r >= rows) return;
    const i = r * cols + c;
    bits[i >> 3] |= 1 << (i & 7);
  };
  const stamp = (x, z, rad) => {
    const reach = Math.max(cell, rad);
    const c0 = Math.max(0, Math.floor((x - reach - originX) / cell));
    const c1 = Math.min(cols - 1, Math.floor((x + reach - originX) / cell));
    const r0 = Math.max(0, Math.floor((z - reach - originZ) / cell));
    const r1 = Math.min(rows - 1, Math.floor((z + reach - originZ) / cell));
    const rad2 = reach * reach;
    for (let r = r0; r <= r1; r++) {
      const wz = originZ + (r + 0.5) * cell;
      const dz = wz - z;
      for (let c = c0; c <= c1; c++) {
        const wx = originX + (c + 0.5) * cell;
        const dx = wx - x;
        if (dx * dx + dz * dz > rad2) continue;
        const i = r * cols + c;
        bits[i >> 3] |= 1 << (i & 7);
      }
    }
  };
  for (const river of city.rivers || []) {
    const p = river.p;
    if (!p || p.length < 4) continue;
    const n = p.length / 2;
    for (let i = 0; i < n - 1; i++) {
      const x0 = p[i * 2];
      const z0 = p[i * 2 + 1];
      const x1 = p[(i + 1) * 2];
      const z1 = p[(i + 1) * 2 + 1];
      const len = Math.hypot(x1 - x0, z1 - z0);
      const h0 = river.hl && river.hr ? Math.min(river.hl[i], river.hr[i]) : (river.w || 40) * 0.5;
      const h1 = river.hl && river.hr ? Math.min(river.hl[i + 1], river.hr[i + 1]) : (river.w || 40) * 0.5;
      const steps = Math.max(1, Math.ceil(len / 12));
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        stamp(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, h0 + (h1 - h0) * t);
      }
    }
  }
  for (const lake of city.lakes || []) {
    if (!lake || lake.length < 6) continue;
    let lx0 = Infinity, lx1 = -Infinity, lz0 = Infinity, lz1 = -Infinity;
    for (let i = 0; i < lake.length; i += 2) {
      lx0 = Math.min(lx0, lake[i]);
      lx1 = Math.max(lx1, lake[i]);
      lz0 = Math.min(lz0, lake[i + 1]);
      lz1 = Math.max(lz1, lake[i + 1]);
    }
    const c0 = Math.max(0, Math.floor((lx0 - originX) / cell));
    const c1 = Math.min(cols - 1, Math.floor((lx1 - originX) / cell));
    const r0 = Math.max(0, Math.floor((lz0 - originZ) / cell));
    const r1 = Math.min(rows - 1, Math.floor((lz1 - originZ) / cell));
    for (let r = r0; r <= r1; r++) {
      const z = originZ + (r + 0.5) * cell;
      for (let c = c0; c <= c1; c++) {
        const x = originX + (c + 0.5) * cell;
        if (ringHolds(x, z, lake)) mark(x, z);
      }
    }
  }
  return { originX, originZ, cell, cols, rows, bits };
}

export function createWorld(city, index, flight = false) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(TIMES[1].bg);
  scene.fog = new THREE.Fog(TIMES[1].fog, 980, 5600);

  const hemi = new THREE.HemisphereLight(0xe7f2ff, 0x5f7a42, 0.62);
  const sun = new THREE.DirectionalLight(0xfff6e4, 1.45);
  sun.position.set(80, 140, 40);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 8;
  sun.shadow.camera.far = 160;
  sun.shadow.camera.left = -46;
  sun.shadow.camera.right = 46;
  sun.shadow.camera.top = 46;
  sun.shadow.camera.bottom = -46;
  sun.shadow.bias = -0.00035;
  sun.shadow.normalBias = 0.04;
  scene.add(hemi, sun, sun.target);

  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(42000, 28, 16),
    new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL1,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new THREE.Color(0x6eaddf) },
        horizon: { value: new THREE.Color(0xd5e6f4) },
        sunColor: { value: new THREE.Color(TIMES[1].sun) },
        sunDir: { value: new THREE.Vector3(80, 140, 40).normalize() },
      },
      vertexShader: "varying vec3 vP; #include <common>\n#include <logdepthbuf_pars_vertex>\nvoid main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); #include <logdepthbuf_vertex>\n}",
      fragmentShader: [
        "varying vec3 vP;",
        "uniform vec3 top;",
        "uniform vec3 horizon;",
        "uniform vec3 sunColor;",
        "uniform vec3 sunDir;",
        "#include <common>",
        "#include <logdepthbuf_pars_fragment>",
        "void main(){",
        "  vec3 dir = normalize(vP);",
        "  float h = clamp(dir.y * 1.15 + 0.08, 0.0, 1.0);",
        "  vec3 col = mix(horizon, top, pow(h, 0.85));",
        "  float sun = dot(dir, normalize(sunDir));",
        "  float glow = pow(max(sun, 0.0), 5.0);",
        "  col += sunColor * glow * 0.45;",
        "  gl_FragColor = vec4(col, 1.0);",
        "  #include <logdepthbuf_fragment>",
        "}",
      ].join("\n"),
    }),
  );
  sky.renderOrder = -2;
  sky.frustumCulled = false;
  scene.add(sky);

  const sunTex = canvasTex((g, w, h) => {
    const grd = g.createRadialGradient(w / 2, h / 2, w * 0.06, w / 2, h / 2, w * 0.5);
    grd.addColorStop(0, "rgba(255,253,240,1)");
    grd.addColorStop(0.16, "rgba(255,236,160,0.95)");
    grd.addColorStop(0.42, "rgba(255,190,80,0.22)");
    grd.addColorStop(1, "rgba(255,170,40,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
  }, 128, 128);
  const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: sunTex,
    color: 0xfff4cc,
    fog: false,
    depthWrite: false,
    transparent: true,
    blending: THREE.AdditiveBlending,
  }));
  sunGlow.scale.set(720, 720, 1);
  sunGlow.renderOrder = -1;
  sunGlow.frustumCulled = false;
  scene.add(sunGlow);

  const groundSeg = 168;
  const groundGeo = new THREE.BufferGeometry();
  const groundPos = new Float32Array((groundSeg + 1) * (groundSeg + 1) * 3);
  const groundCol = new Float32Array((groundSeg + 1) * (groundSeg + 1) * 3);
  const groundUv = new Float32Array((groundSeg + 1) * (groundSeg + 1) * 2);
  const groundIdx = [];
  for (let iz = 0; iz < groundSeg; iz++) {
    for (let ix = 0; ix < groundSeg; ix++) {
      const a = iz * (groundSeg + 1) + ix;
      groundIdx.push(a, a + groundSeg + 1, a + 1, a + 1, a + groundSeg + 1, a + groundSeg + 2);
    }
  }
  groundGeo.setAttribute("position", new THREE.BufferAttribute(groundPos, 3));
  groundGeo.setAttribute("color", new THREE.BufferAttribute(groundCol, 3));
  groundGeo.setAttribute("uv", new THREE.BufferAttribute(groundUv, 2));
  groundGeo.setIndex(groundIdx);
  const ground = new THREE.Mesh(
    groundGeo,
    new THREE.MeshLambertMaterial({ map: landTexture(), vertexColors: true }),
  );
  ground.renderOrder = -1;
  ground.material.polygonOffset = true;
  ground.material.polygonOffsetFactor = 2;
  ground.material.polygonOffsetUnits = 2;
  ground.receiveShadow = true;
  ground.frustumCulled = false;
  const fieldBook = [
    [0.28, 0.5, 0.18],
    [0.62, 0.52, 0.2],
    [0.36, 0.58, 0.22],
    [0.14, 0.32, 0.12],
    [0.5, 0.38, 0.18],
    [0.24, 0.44, 0.16],
  ];
  const fieldHash = (ix, iz) => {
    const n = Math.sin(ix * 127.1 + iz * 311.7) * 43758.5453;
    return n - Math.floor(n);
  };
  const fieldAtCell = (ix, iz) => fieldBook[Math.floor(fieldHash(ix, iz) * fieldBook.length)];
  const mixField = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const landTint = (col, h, i, x, z) => {
    const elev = Math.max(0, Math.min(1, (h - 88) / 70));
    const sx = 1500;
    const sz = 1800;
    const ix = Math.floor(x / sx);
    const iz = Math.floor(z / sz);
    const fx = (x / sx) - ix;
    const fz = (z / sz) - iz;
    const ux = fx * fx * (3 - 2 * fx);
    const uz = fz * fz * (3 - 2 * fz);
    const ab = mixField(fieldAtCell(ix, iz), fieldAtCell(ix + 1, iz), ux);
    const cd = mixField(fieldAtCell(ix, iz + 1), fieldAtCell(ix + 1, iz + 1), ux);
    const tone = mixField(ab, cd, uz);
    const damp = Math.max(0, 0.4 - elev);
    const high = elev * 0.07;
    col[i] = tone[0] + high - damp * 0.04;
    col[i + 1] = tone[1] - high * 0.35 - damp * 0.03;
    col[i + 2] = tone[2] + damp * 0.04;
  };
  const waterMask = buildWaterMask(city);
  const wetAt = (x, z) => {
    if (!waterMask) return false;
    const c = Math.floor((x - waterMask.originX) / waterMask.cell);
    const row = Math.floor((z - waterMask.originZ) / waterMask.cell);
    if (c < 0 || row < 0 || c >= waterMask.cols || row >= waterMask.rows) return false;
    const bit = row * waterMask.cols + c;
    return (waterMask.bits[bit >> 3] & (1 << (bit & 7))) !== 0;
  };
  const groundRaw = new Float32Array((groundSeg + 1) * (groundSeg + 1));
  const scratchPos = new Float32Array(groundPos.length);
  const scratchCol = new Float32Array(groundCol.length);
  const scratchUv = new Float32Array(groundUv.length);
  const scratchRaw = new Float32Array(groundRaw.length);
  const nVert = groundSeg + 1;
  const writeRawRow = (pos, uv, raw, iz, cx, cz, span) => {
    const step = span / groundSeg;
    const x0 = cx - span / 2;
    const z0 = cz - span / 2;
    for (let ix = 0; ix <= groundSeg; ix++) {
      const x = x0 + ix * step;
      const z = z0 + iz * step;
      raw[iz * nVert + ix] = heightAt(x, z);
      const v = (iz * nVert + ix) * 3;
      pos[v] = x;
      pos[v + 2] = z;
      const u = (iz * nVert + ix) * 2;
      uv[u] = x / 520;
      uv[u + 1] = z / 520;
    }
  };
  const writeShadeRow = (pos, col, raw, iz) => {
    for (let ix = 0; ix <= groundSeg; ix++) {
      const h = raw[iz * nVert + ix];
      let low = h;
      if (ix > 0) low = Math.min(low, raw[iz * nVert + ix - 1]);
      if (ix + 1 < nVert) low = Math.min(low, raw[iz * nVert + ix + 1]);
      if (iz > 0) low = Math.min(low, raw[(iz - 1) * nVert + ix]);
      if (iz + 1 < nVert) low = Math.min(low, raw[(iz + 1) * nVert + ix]);
      const v = (iz * nVert + ix) * 3;
      pos[v + 1] = Math.min(h, (h * 2 + low) / 3) - 0.3;
      landTint(col, h, v, pos[v], pos[v + 2]);
      if (wetAt(pos[v], pos[v + 2])) {
        pos[v + 1] = Math.min(pos[v + 1], h - 1.8);
        col[v] = 0.05;
        col[v + 1] = 0.2;
        col[v + 2] = 0.36;
      }
    }
  };
  const uploadGround = (cx, cz, span) => {
    groundGeo.attributes.position.needsUpdate = true;
    groundGeo.attributes.color.needsUpdate = true;
    groundGeo.attributes.uv.needsUpdate = true;
    groundGeo.computeVertexNormals();
    ground.userData.cx = cx;
    ground.userData.cz = cz;
    ground.userData.span = span;
  };
  let groundJob = null;
  const fillGround = (pos, col, uv, raw, cx, cz, span) => {
    for (let iz = 0; iz <= groundSeg; iz++) writeRawRow(pos, uv, raw, iz, cx, cz, span);
    for (let iz = 0; iz <= groundSeg; iz++) writeShadeRow(pos, col, raw, iz);
  };
  const reshapeGround = (cx, cz, span) => {
    fillGround(groundPos, groundCol, groundUv, groundRaw, cx, cz, span);
    const step = span / groundSeg;
    const x0 = cx - span / 2;
    const z0 = cz - span / 2;
    const n = nVert;
    if (!flight && step < 80) {
      const seen = new Set();
      const groups = cellsAround(index.roadCells, cx, cz, Math.ceil(span / 2 / 80) + 1);
      for (const group of groups) {
        for (const seg of group) {
          if (seen.has(seg)) continue;
          seen.add(seg);
          const dx = seg.x1 - seg.x0;
          const dz = seg.z1 - seg.z0;
          const len = Math.hypot(dx, dz) || 1;
          const nx = -dz / len;
          const nz = dx / len;
          const samples = Math.max(1, Math.ceil(len / 18));
          for (let s = 0; s <= samples; s++) {
            const t = s / samples;
            const x = seg.x0 + dx * t;
            const z = seg.z0 + dz * t;
            const hw = seg.hw0 == null ? Math.max(3.1, (seg.w || 6) * 0.55) : seg.hw0 + (seg.hw1 - seg.hw0) * t;
            const asphalt = hw * 1.2;
            const deck = seg.y0 + (seg.y1 - seg.y0) * t;
            const gy = heightAt(x, z);
            const raised = !!(seg.br || deck - gy > 2.5);
            const reach = raised ? asphalt + 1.5 : asphalt + CURB_W + WALK_W + SHOULDER_W + VERGE;
            const ix0 = Math.max(0, Math.floor((x - reach - x0) / step));
            const ix1 = Math.min(groundSeg, Math.ceil((x + reach - x0) / step));
            const iz0 = Math.max(0, Math.floor((z - reach - z0) / step));
            const iz1 = Math.min(groundSeg, Math.ceil((z + reach - z0) / step));
            for (let iz = iz0; iz <= iz1; iz++) {
              for (let ix = ix0; ix <= ix1; ix++) {
                const v = (iz * n + ix) * 3;
                const lat = Math.abs((groundPos[v] - x) * nx + (groundPos[v + 2] - z) * nz);
                if (lat > reach) continue;
                const along = Math.abs((groundPos[v] - x) * dx + (groundPos[v + 2] - z) * dz) / len;
                if (along > step * 0.85) continue;
                const top = streetTop(lat, asphalt, deck, heightAt(groundPos[v], groundPos[v + 2]), raised) - 0.22;
                if (groundPos[v + 1] > top) groundPos[v + 1] = top;
              }
            }
          }
        }
      }
    }
    uploadGround(cx, cz, span);
  };
  const scheduleGround = (cx, cz, span) => {
    if (groundJob && Math.hypot(groundJob.cx - cx, groundJob.cz - cz) < 400 && Math.abs(groundJob.span - span) < span * 0.08) return;
    groundJob = { cx, cz, span, row: 0, phase: "raw" };
  };
  const pumpGround = (rows) => {
    const job = groundJob;
    if (!job) return;
    const end = Math.min(groundSeg, job.row + rows - 1);
    if (job.phase === "raw") {
      for (let iz = job.row; iz <= end; iz++) writeRawRow(scratchPos, scratchUv, scratchRaw, iz, job.cx, job.cz, job.span);
    } else {
      for (let iz = job.row; iz <= end; iz++) writeShadeRow(scratchPos, scratchCol, scratchRaw, iz);
    }
    job.row = end + 1;
    if (job.row <= groundSeg) return;
    if (job.phase === "raw") {
      job.phase = "shade";
      job.row = 0;
      return;
    }
    groundPos.set(scratchPos);
    groundCol.set(scratchCol);
    groundUv.set(scratchUv);
    groundRaw.set(scratchRaw);
    uploadGround(job.cx, job.cz, job.span);
    groundJob = null;
  };
  const home = flight && city.fields?.length ? (city.fields.find((f) => f.icao === "UKKK") || city.fields[0]) : null;
  reshapeGround(home?.x ?? city.spawn?.x ?? 0, home?.z ?? city.spawn?.z ?? 0, 9000);
  scene.add(ground);

  const roadPack = makeRoads(city, index, flight);
  const roads = roadPack.mesh;
  scene.add(roads);
  if (flight && city.fields?.length) {
    const strips = makeRunways(city.fields);
    if (strips) scene.add(strips);
  }
  const railMap = new Map();
  const railCell = 48;
  for (const seg of roadPack.rails) {
    const len = Math.hypot(seg.x1 - seg.x0, seg.z1 - seg.z0);
    const steps = Math.max(1, Math.ceil(len / railCell));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const k = Math.floor((seg.x0 + (seg.x1 - seg.x0) * t) / railCell) + "," + Math.floor((seg.z0 + (seg.z1 - seg.z0) * t) / railCell);
      let bucket = railMap.get(k);
      if (!bucket) railMap.set(k, bucket = []);
      bucket.push(seg);
    }
  }

  const waterPos = [];
  const dniproPos = [];
  const appendPos = (extra, into) => {
    for (let i = 0; i < extra.length; i++) into.push(extra[i]);
  };
  for (const river of stitchRivers(city.rivers)) {
    const sheet = riverSurface(river);
    const wide = (river.w || 0) >= 400 || /дніпро/i.test(river.n || "");
    appendPos(sheet, wide ? dniproPos : waterPos);
  }
  for (const lake of city.lakes || []) {
    let bed = Infinity;
    for (let i = 0; i < lake.length; i += 2) bed = Math.min(bed, heightAt(lake[i], lake[i + 1]));
    appendPos(fan(lake, (bed === Infinity ? 0 : bed) + 0.4), waterPos);
  }
  const water = meshFrom(waterPos, 0x1d5f92, 1);
  if (water) {
    water.frustumCulled = false;
    water.renderOrder = 2;
    water.material.polygonOffset = true;
    water.material.polygonOffsetFactor = -3;
    water.material.polygonOffsetUnits = -3;
    scene.add(water);
  }
  const dnipro = meshFrom(dniproPos, 0x1a78c4, 1);
  if (dnipro) {
    dnipro.frustumCulled = false;
    dnipro.renderOrder = 2;
    dnipro.material.polygonOffset = true;
    dnipro.material.polygonOffsetFactor = -3;
    dnipro.material.polygonOffsetUnits = -3;
    dnipro.material.emissive = new THREE.Color(0x0c4a78);
    dnipro.material.emissiveIntensity = 0.28;
    scene.add(dnipro);
  }
  if (flight) dressKyiv(scene);

  const parkPos = [];
  for (const park of city.parks || []) parkPos.push(...fan(park, (x, z) => heightAt(x, z) + 0.12));
  const parks = meshFrom(parkPos, 0x2c6b3c, 0.82);
  if (parks) scene.add(parks);

  const buildings = makeBuildings(city, index);
  if (buildings) scene.add(buildings);
  const viewX = home?.x ?? city.spawn?.x ?? 0;
  const viewZ = home?.z ?? city.spawn?.z ?? 0;
  showNear(roads, viewX, viewZ, 9000);
  if (buildings) showNear(buildings, viewX, viewZ, 9000);

  let treePack = makeTrees(city, flight ? 4 : 2, index);
  scene.add(...treePack.parts);

  const sights = [];
  for (const s of city.sights) {
    const mark = landmark(s);
    const spot = mark.userData.foot
      ? clearOfRunway(s.x, s.z, mark.userData.foot[0], mark.userData.foot[1], city.fields)
      : { x: s.x, z: s.z };
    mark.position.set(spot.x, heightAt(spot.x, spot.z), spot.z);
    scene.add(mark);
    sights.push({ data: s, mark, beam: null });
  }

  const plane = flight ? makePlane() : null;
  if (plane) scene.add(plane);

  const combat = flight && city.fields?.length ? createCombat(scene, city.fields, heightAt, (x, z) => waterAt(index, x, z)) : null;

  const sunDir = new THREE.Vector3(80, 140, 40).normalize();
  let time = 1;
  let quality = 1;
  let fogNear = 980;
  let fogFar = 5600;

  function applyTime(next) {
    time = next % 3;
    const t = TIMES[time];
    scene.background.setHex(t.bg);
    scene.fog.color.setHex(t.fog);
    sun.color.setHex(t.sun);
    sun.intensity = t.intensity;
    hemi.intensity = t.amb;
    const rad = (t.elev * Math.PI) / 180;
    const az = (t.az * Math.PI) / 180;
    sunDir.set(Math.cos(rad) * Math.sin(az), Math.sin(rad), Math.cos(rad) * Math.cos(az)).normalize();
    sky.material.uniforms.top.value.setHex(t.bg);
    sky.material.uniforms.horizon.value.setHex(t.fog);
    sky.material.uniforms.sunColor.value.setHex(t.sun);
    sky.material.uniforms.sunDir.value.copy(sunDir);
    const walls = buildings?.userData.walls;
    if (walls) {
      walls.material.emissive = walls.material.emissive || new THREE.Color(0xffd7a0);
      walls.material.emissiveMap = walls.material.map;
      walls.material.emissiveIntensity = t.emit;
    }
  }

  function setQuality(level, renderer) {
    quality = level;
    if (flight) {
      fogNear = 1800;
      fogFar = 16000;
      scene.fog.near = fogNear;
      scene.fog.far = fogFar;
      if (renderer) {
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
        sun.castShadow = false;
      }
      return;
    }
    const step = level === 0 ? 4 : 1;
    scene.remove(...treePack.parts);
    for (const mesh of treePack.parts) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    treePack = makeTrees(city, step, index);
    scene.add(...treePack.parts);
    const dist = level === 0 ? 2200 : level === 1 ? 5600 : 9000;
    fogNear = level === 0 ? 520 : level === 1 ? 980 : 1600;
    fogFar = dist;
    scene.fog.near = fogNear;
    scene.fog.far = fogFar;
    if (renderer) {
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, level === 2 ? 2 : level === 1 ? 1.75 : 1));
      sun.castShadow = level > 0;
      sun.shadow.mapSize.set(level === 2 ? 2048 : 1024, level === 2 ? 2048 : 1024);
    }
  }

  applyTime(1);

  return {
    scene,
    roads,
    car: null,
    sights,
    craft: combat?.craft || [],
    stepCombat(player, input, dt, plan) {
      if (!combat) return { shot: false, missile: false, boom: false, kills: 0, broke: false, hit: false, tags: [] };
      return combat.update(player, input, dt, plan);
    },
    get time() { return time; },
    get quality() { return quality; },
    setTime: applyTime,
    setQuality,
    runway(x, z) {
      return city.fields ? fieldAt(city.fields, x, z) : null;
    },
    surface(x, z, y = null) {
      if (city.fields) {
        const pad = fieldAt(city.fields, x, z);
        if (pad) return heightAt(x, z) + 1.35;
      }
      const groundH = heightAt(x, z);
      const road = roadDeck(index, x, z, y) || nearestRoad(index, x, z, 8);
      if (road) {
        const asphalt = roadAsphalt(road);
        const drop = road.y - groundH;
        const raised = !!(road.seg?.br || drop > 2.5);
        const reach = raised ? asphalt + 0.4 : asphalt + CURB_W + WALK_W + SHOULDER_W + VERGE;
        if (road.dist <= reach) return streetTop(road.dist, asphalt, road.y, groundH, raised);
      }
      const probe = Number.isFinite(y) ? y : 0;
      const touch = buildingContact(index, x, z, Math.max(probe, 0), 0.4);
      if (touch.roof != null && probe > touch.roof - 3) return touch.roof;
      return groundH;
    },
    guard(x, z, y, radius) {
      const cell = 48;
      const cx = Math.floor(x / cell);
      const cz = Math.floor(z / cell);
      let best = 0;
      let bx = 0;
      let bz = 0;
      const seen = new Set();
      for (let ix = cx - 1; ix <= cx + 1; ix++) {
        for (let iz = cz - 1; iz <= cz + 1; iz++) {
          const bucket = railMap.get(ix + "," + iz);
          if (!bucket) continue;
          for (const seg of bucket) {
            if (seen.has(seg)) continue;
            seen.add(seg);
            const dx = seg.x1 - seg.x0;
            const dz = seg.z1 - seg.z0;
            const len2 = dx * dx + dz * dz || 1;
            const t = ((x - seg.x0) * dx + (z - seg.z0) * dz) / len2;
            if (t < 0 || t > 1) continue;
            const deck = seg.y0 + (seg.y1 - seg.y0) * t;
            if (y < deck - 1.2 || y > deck + 2.6) continue;
            const qx = seg.x0 + dx * t;
            const qz = seg.z0 + dz * t;
            const lat = (x - qx) * seg.nx + (z - qz) * seg.nz;
            const hw = seg.hw0 + (seg.hw1 - seg.hw0) * t;
            const limit = hw - radius;
            let push = 0;
            let nx = 0;
            let nz = 0;
            if (lat > limit) {
              push = lat - limit;
              nx = -seg.nx;
              nz = -seg.nz;
            } else if (lat < -limit) {
              push = -limit - lat;
              nx = seg.nx;
              nz = seg.nz;
            }
            if (push > best) {
              best = push;
              bx = nx * push;
              bz = nz * push;
            }
          }
        }
      }
      if (best < 0.001) return null;
      return { x: bx, z: bz, hit: true };
    },
    elevation(x, z) {
      return heightAt(x, z);
    },
    push(x, z, y, radius) {
      return buildingContact(index, x, z, y, radius);
    },
    wet(x, z, y = null) {
      const road = onRoad(index, x, z, y);
      if (road?.seg?.br) return false;
      if (road) return false;
      return waterAt(index, x, z);
    },
    grip(x, z) {
      return onRoad(index, x, z) ? 1 : 0.7;
    },
    sync(player, sim, dt) {
      const agl = Math.max(0, player.y - heightAt(player.x, player.z));
      const viewFar = player.flying || agl > 45 ? 48000 : 9000;
      showNear(roads, player.x, player.z, viewFar);
      if (buildings) showNear(buildings, player.x, player.z, viewFar);
      const span = Math.min(120000, Math.max(7200, 6800 + agl * 16));
      const moved = Math.hypot(player.x - (ground.userData.cx || 0), player.z - (ground.userData.cz || 0));
      if (moved > span * 0.12 || Math.abs(span - (ground.userData.span || 0)) > span * 0.08) scheduleGround(player.x, player.z, span);
      pumpGround(36);
      sky.position.set(player.x, 0, player.z);
      sky.material.uniforms.sunDir.value.copy(sunDir);
      sunGlow.position.set(player.x, player.y + 30, player.z).addScaledVector(sunDir, 3400);
      const air = player.flying || agl > 45;
      if (air) {
        const lift = Math.min(1, agl / 2800);
        scene.fog.near = 1600 + lift * 2800;
        scene.fog.far = 7000 + lift * 16000;
      } else {
        scene.fog.near = fogNear;
        scene.fog.far = fogFar;
      }
      sun.position.set(player.x, 0, player.z).addScaledVector(sunDir, 90);
      sun.target.position.set(player.x, 0, player.z);
      if (plane && player.flight) {
        plane.visible = true;
        plane.position.set(player.x, player.y, player.z);
        if (player.wrecked) {
          plane.rotation.order = "YXZ";
          plane.rotation.set(-0.7, player.heading, 0.35);
        } else {
          plane.quaternion.set(player.qx || 0, player.qy || 0, player.qz || 0, player.qw == null ? 1 : player.qw);
        }
        const gear = plane.userData.gear;
        if (gear) {
          const want = !player.flying || player.gearDown !== false ? 1 : 0;
          const shown = gear.userData.t ?? 1;
          const t = shown + (want - shown) * Math.min(1, dt * 3.2);
          gear.userData.t = t;
          gear.visible = t > 0.06;
          gear.position.y = (1 - t) * 0.95;
          gear.scale.set(1, 0.15 + 0.85 * t, 1);
          if (gear.userData.nose) gear.userData.nose.rotation.y = -(player.wheel || 0) * 0.55;
        }
        const flapT = plane.userData.flapT || 0;
        const wantFlap = player.flaps > 0.5 ? 1 : 0;
        plane.userData.flapT = flapT + (wantFlap - flapT) * Math.min(1, dt * 3);
        const flapAng = -plane.userData.flapT * 0.72;
        for (const flap of plane.userData.flaps || []) {
          if (flap) flap.rotation.x = flapAng;
        }
        const rollCmd = player.wrecked ? 0 : (player.rollSm || 0);
        const pitchCmd = player.wrecked ? 0 : (player.noseSm || 0);
        plane.userData.ailT = (plane.userData.ailT || 0) + (rollCmd - (plane.userData.ailT || 0)) * Math.min(1, dt * 9);
        plane.userData.elevT = (plane.userData.elevT || 0) + (pitchCmd - (plane.userData.elevT || 0)) * Math.min(1, dt * 9);
        for (const aileron of plane.userData.ailerons || []) {
          if (aileron) aileron.rotation.x = -(aileron.userData.sign || 1) * plane.userData.ailT * 0.7;
        }
        for (const elevator of plane.userData.elevators || []) {
          if (elevator) elevator.rotation.x = plane.userData.elevT * 0.62;
        }
        const sweep = plane.userData.sweep || 0;
        const wantSweep = player.jets ? 1 : 0;
        plane.userData.sweep = sweep + (wantSweep - sweep) * Math.min(1, dt * 2.4);
        const fold = plane.userData.sweep * 0.95;
        if (plane.userData.wingL) plane.userData.wingL.rotation.y = -fold;
        if (plane.userData.wingR) plane.userData.wingR.rotation.y = fold;
        const thr = Math.max(0, Math.min(1, player.throttle || 0));
        const jetOn = !!player.jets;
        const plume = (0.32 + thr * 0.62) * (jetOn ? 1.45 : 1);
        if (plane.userData.flameMat) {
          plane.userData.flameMat.color.setHex(jetOn ? (thr > 0.6 ? 0xfff0c2 : 0xff6a1a) : (thr > 0.7 ? 0xe7f4ff : 0x7eadd4));
        }
        for (const flame of plane.userData.jets || []) {
          flame.visible = thr > 0.03 || jetOn;
          const flick = 0.94 + Math.random() * 0.12;
          flame.scale.y = plume * flick;
          const girth = 0.7 + thr * 0.32;
          flame.scale.x = girth;
          flame.scale.z = girth;
          flame.position.z = -3.18 - plume * 1.05;
        }
      }
      for (const s of sights) {
        const seen = sim.visited.has(s.data.id);
        if (s.mark.userData.plate) {
          s.mark.userData.plate.visible = agl < 280;
          s.mark.userData.plate.material.color.setHex(seen ? 0xb7e7c4 : 0xffffff);
        }
      }
    },
  };
}
