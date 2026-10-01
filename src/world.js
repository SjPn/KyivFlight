import * as THREE from "three";
import { heightAt } from "./elev.js?v=49";
import { buildingContact, cellsAround, nearestRoad, onRoad, roadDeck, waterAt } from "./geo.js?v=67";
import { fieldAt } from "./airfields.js?v=1";
import { createCombat } from "./combat.js?v=13";

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
  { bg: 0x7eb6ea, fog: 0xd7e8f8, sun: 0xfff8ec, elev: 64, az: 32, intensity: 1.65, amb: 1.08, emit: 0 },
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

function makeRoads(city, index, flight) {
  const positions = [];
  const colors = [];
  const uvs = [];
  const marks = [];
  const dashTaken = new Set();
  const railPos = [];
  const railNrm = [];
  const railSegs = [];
  const curbPos = [];
  const curbNrm = [];
  const walkPos = [];
  const walkUv = [];
  const vergePos = [];
  const fencePos = [];
  const fenceNrm = [];
  const lamps = [];
  const pads = new Map();
  const padPut = (x, z, y, r) => {
    const k = Math.round(x / 14) + "," + Math.round(z / 14);
    const pad = pads.get(k);
    if (!pad || r > pad.r) pads.set(k, { x, z, y, r });
  };
  for (const road of city.roads) {
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
      if (marked) {
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
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  upNormals(geo);
  const mat = new THREE.MeshLambertMaterial({
    map: roadTexture(),
    color: 0xffffff,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.renderOrder = 1;
  mesh.position.y = 0;
  mesh.frustumCulled = false;
  const root = new THREE.Group();
  root.add(mesh);
  const curb = meshPos(curbPos, new THREE.MeshLambertMaterial({ color: 0xd4d0c8, side: THREE.DoubleSide }), curbNrm);
  if (curb) {
    curb.renderOrder = 2;
    root.add(curb);
  }
  if (walkPos.length) {
    const wgeo = new THREE.BufferGeometry();
    wgeo.setAttribute("position", new THREE.Float32BufferAttribute(walkPos, 3));
    wgeo.setAttribute("uv", new THREE.Float32BufferAttribute(walkUv, 2));
    upNormals(wgeo);
    const walkMesh = new THREE.Mesh(wgeo, new THREE.MeshLambertMaterial({ map: pavingTexture(), color: 0xffffff }));
    walkMesh.receiveShadow = true;
    walkMesh.frustumCulled = false;
    walkMesh.renderOrder = 2;
    root.add(walkMesh);
  }
  const verge = meshPos(vergePos, new THREE.MeshLambertMaterial({ color: 0x3c7a46, side: THREE.DoubleSide }));
  if (verge) {
    verge.renderOrder = 0;
    root.add(verge);
  }
  const fence = meshPos(fencePos, new THREE.MeshLambertMaterial({ color: 0x4f86a6, side: THREE.DoubleSide }), fenceNrm);
  if (fence) {
    fence.renderOrder = 2;
    root.add(fence);
  }
  if (lamps.length) {
    const pole = new THREE.CylinderGeometry(0.07, 0.09, 4.4, 5);
    pole.translate(0, 2.2, 0);
    const arm = new THREE.BoxGeometry(0.85, 0.06, 0.06);
    arm.translate(0.38, 4.35, 0);
    const head = new THREE.BoxGeometry(0.62, 0.08, 0.24);
    head.translate(0.78, 4.22, 0);
    const lampMesh = new THREE.InstancedMesh(
      joinGeos([pole, arm, head]),
      new THREE.MeshLambertMaterial({ color: 0x2e343c }),
      lamps.length,
    );
    lampMesh.frustumCulled = false;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < lamps.length; i++) {
      const lamp = lamps[i];
      dummy.position.set(lamp.x, lamp.y, lamp.z);
      dummy.rotation.set(0, lamp.rot, 0);
      dummy.updateMatrix();
      lampMesh.setMatrixAt(i, dummy.matrix);
    }
    lampMesh.instanceMatrix.needsUpdate = true;
    root.add(lampMesh);
  }
  if (marks.length) {
    const mgeo = new THREE.BufferGeometry();
    mgeo.setAttribute("position", new THREE.Float32BufferAttribute(marks, 3));
    const mark = new THREE.Mesh(
      mgeo,
      new THREE.MeshBasicMaterial({ color: 0xf3efe4, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    );
    mark.position.y = 0.03;
    mark.renderOrder = 3;
    mark.frustumCulled = false;
    root.add(mark);
  }
  if (railPos.length) {
    const rgeo = new THREE.BufferGeometry();
    rgeo.setAttribute("position", new THREE.Float32BufferAttribute(railPos, 3));
    rgeo.setAttribute("normal", new THREE.Float32BufferAttribute(railNrm, 3));
    const rails = new THREE.Mesh(
      rgeo,
      new THREE.MeshLambertMaterial({ color: 0xc5c8ce, side: THREE.DoubleSide }),
    );
    rails.frustumCulled = false;
    rails.renderOrder = 2;
    root.add(rails);
  }
  return { mesh: root, rails: railSegs };
}

function ribbon(p, width, y, hl, hr) {
  const positions = [];
  const left = [];
  const right = [];
  for (let i = 0; i < p.length; i += 2) {
    const i0 = Math.max(0, i - 2);
    const i1 = Math.min(p.length - 2, i + 2);
    let dx = p[i1] - p[i0];
    let dz = p[i1 + 1] - p[i0 + 1];
    const L = Math.hypot(dx, dz) || 1;
    dx /= L;
    dz /= L;
    const vi = i / 2;
    const l = hl ? hl[vi] : width * 0.5;
    const r = hr ? hr[vi] : width * 0.5;
    const py = typeof y === "function" ? y(p[i], p[i + 1]) : y;
    left.push([p[i] - dz * l, py, p[i + 1] + dx * l]);
    right.push([p[i] + dz * r, py, p[i + 1] - dx * r]);
  }
  for (let i = 0; i < left.length - 1; i++) {
    const a = left[i], b = right[i], c = right[i + 1], d = left[i + 1];
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

function makeBuildings(city, index) {
  const list = city.buildings;
  if (!list.length) return null;
  const geo = new THREE.BoxGeometry(1, 1, 1);
  geo.translate(0, 0.5, 0);
  const mat = new THREE.MeshLambertMaterial({ map: windowTexture(), color: 0xffffff });
  tuneWindows(mat);
  const mesh = new THREE.InstancedMesh(geo, mat, list.length);
  mesh.frustumCulled = false;
  const roofGeo = new THREE.BoxGeometry(1, 1, 1);
  roofGeo.translate(0, 0.5, 0);
  const roofs = new THREE.InstancedMesh(
    roofGeo,
    new THREE.MeshLambertMaterial({
      map: roofTexture(),
      color: 0xffffff,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }),
    list.length,
  );
  roofs.frustumCulled = false;
  const plinthGeo = new THREE.BoxGeometry(1, 1, 1);
  plinthGeo.translate(0, 0.5, 0);
  const plinths = new THREE.InstancedMesh(plinthGeo, new THREE.MeshLambertMaterial({ color: 0xcfc6b8 }), list.length);
  plinths.frustumCulled = false;
  const corniceGeo = new THREE.BoxGeometry(1, 1, 1);
  corniceGeo.translate(0, 0.5, 0);
  const cornices = new THREE.InstancedMesh(corniceGeo, new THREE.MeshLambertMaterial({ color: 0xf4efe6 }), list.length);
  cornices.frustumCulled = false;
  let bandCount = 0;
  for (let i = 0; i < list.length; i++) {
    const b = list[i];
    if (b.h > 10 && b.w > 7 && b.d > 7 && b.k !== "church") bandCount++;
  }
  const bandGeo = new THREE.BoxGeometry(1, 1, 1);
  bandGeo.translate(0, 0.5, 0);
  const bands = new THREE.InstancedMesh(bandGeo, new THREE.MeshLambertMaterial({ color: 0xb7b0a4 }), Math.max(1, bandCount * 2));
  bands.frustumCulled = false;
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const walls = [0xf4efe4, 0xe7d3b8, 0xf7f4ee, 0xd9c4a4, 0xe4eaf0, 0xc9b59a, 0xf0e2cc, 0xd5ddd4];
  const roofCols = [0x8d4e3a, 0x6e645c, 0xa15a3a, 0x4e5964, 0x7a5344];
  let band = 0;
  for (let i = 0; i < list.length; i++) {
    const b = list[i];
    const zone = Math.abs((Math.floor(b.x / 160) * 3 + Math.floor(b.z / 140) * 7) | 0);
    let h = b.h;
    if (b.w * b.d > 480 && h > 22 && Math.hypot(b.x, b.z) < 1100) h = 15 + (zone % 6) * 1.5;
    let base = b.base || 0;
    if (index && b.k !== "church") {
      const near = nearestRoad(index, b.x, b.z, 14);
      if (near && !near.seg?.br) {
        const hw = (near.half != null ? near.half : Math.max(3.1, (near.w || 6) * 0.55)) * 1.2;
        if (near.dist < hw + 8 && near.y - base < 3.2 && base - near.y < 1.4) base = near.y - 0.04;
      }
    }
    dummy.position.set(b.x, base, b.z);
    dummy.rotation.set(0, -b.rot, 0);
    dummy.scale.set(b.w, h, b.d);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    let wall = walls[zone % walls.length];
    if (Math.hypot(b.x, b.z) < 420) wall = [0xf7f1e4, 0xe9dcc4, 0xf3e2c0, 0xefe8dc][zone % 4];
    if (b.k === "church") wall = 0xf6f1e6;
    if (b.k === "com") wall = 0xd5e0ea;
    color.setHex(wall);
    mesh.setColorAt(i, color);
    const rh = Math.max(0.45, Math.min(1.6, h * 0.045));
    dummy.position.set(b.x, base + h - 0.02, b.z);
    dummy.scale.set(b.w * 1.07, rh, b.d * 1.07);
    dummy.updateMatrix();
    roofs.setMatrixAt(i, dummy.matrix);
    color.setHex(b.k === "church" ? 0xd7a441 : roofCols[zone % roofCols.length]);
    roofs.setColorAt(i, color);
    dummy.position.set(b.x, base, b.z);
    dummy.scale.set(b.w * 1.04, Math.min(1.15, h * 0.08), b.d * 1.04);
    dummy.updateMatrix();
    plinths.setMatrixAt(i, dummy.matrix);
    color.setHex(b.k === "com" ? 0x8ea0b0 : 0xc8bfb2);
    plinths.setColorAt(i, color);
    dummy.position.set(b.x, base + h - 0.4, b.z);
    dummy.scale.set(b.w * 1.03, 0.26, b.d * 1.03);
    dummy.updateMatrix();
    cornices.setMatrixAt(i, dummy.matrix);
    color.setHex(0xf6f1e8);
    cornices.setColorAt(i, color);
    if (b.h > 10 && b.w > 7 && b.d > 7 && b.k !== "church") {
      const yaw = -b.rot;
      const ox = Math.cos(yaw) * (b.w * 0.5 + 0.22);
      const oz = -Math.sin(yaw) * (b.w * 0.5 + 0.22);
      for (const lift of [0.42, 0.68]) {
        dummy.position.set(b.x + ox, base + h * lift, b.z + oz);
        dummy.scale.set(0.55, 0.12, Math.max(2.2, b.d * 0.72));
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
  }
  const group = new THREE.Group();
  group.add(mesh, plinths, roofs, cornices, bands);
  group.userData.walls = mesh;
  return group;
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

function namePlate(text) {
  const c = document.createElement("canvas");
  c.width = 640;
  c.height = 160;
  const ctx = c.getContext("2d");
  ctx.clearRect(0, 0, 640, 160);
  ctx.fillStyle = "rgba(10,14,22,0.8)";
  ctx.fillRect(12, 36, 616, 96);
  ctx.fillStyle = "#f2c14e";
  ctx.font = `700 ${text.length > 18 ? 40 : 52}px system-ui, Segoe UI, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 320, 84);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sp.scale.set(42, 10.5, 1);
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
    plaza(16);
    cathedral(g, stone, gold, 22, 16, 12, 3.2);
    put(g, new THREE.CylinderGeometry(3.2, 4.2, 46, 10), stone, 16, 23, 6);
    onion(g, gold, 3.4, 16, 49, 6);
    top = 58;
  } else if (id === "mykhailivsky") {
    plaza(14);
    cathedral(g, blue, gold, 20, 14, 11, 3.4);
    put(g, new THREE.CylinderGeometry(2.2, 2.6, 22, 8), blue, -12, 11, 4);
    onion(g, gold, 2.2, -12, 24, 4);
    top = 32;
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
    plaza(14);
    put(g, new THREE.CylinderGeometry(8, 10, 3, 8), stone, 0, 1.5, 0);
    put(g, new THREE.CylinderGeometry(2.2, 5.5, 28, 7), stone, 0, 17, 0);
    put(g, new THREE.SphereGeometry(2.3, 8, 6), stone, 0, 33, 0);
    put(g, new THREE.BoxGeometry(0.7, 22, 0.7), gold, 1.6, 46, 0);
    put(g, new THREE.BoxGeometry(7, 8, 0.6), new THREE.MeshLambertMaterial({ color: 0xc4552a }), -3.2, 24, 0.4);
    top = 62;
  } else if (icon === "arch") {
    put(g, new THREE.TorusGeometry(16, 1.35, 8, 20, Math.PI), gold, 0, 0, 0);
    put(g, new THREE.BoxGeometry(2.4, 3, 2.4), stone, -16, 1.5, 0);
    put(g, new THREE.BoxGeometry(2.4, 3, 2.4), stone, 16, 1.5, 0);
    top = 22;
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
    put(g, new THREE.CylinderGeometry(34, 38, 10, 16), new THREE.MeshLambertMaterial({ color: 0xd8dde4 }), 0, 5, 0);
    put(g, new THREE.CylinderGeometry(20, 20, 0.5, 16), new THREE.MeshLambertMaterial({ color: 0x3d8f45 }), 0, 10.2, 0);
    put(g, new THREE.TorusGeometry(30, 1.4, 6, 18), new THREE.MeshLambertMaterial({ color: 0xf4f7fb }), 0, 11, 0);
    top = 18;
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
  const paint = new THREE.MeshPhongMaterial({ color: 0xe7e1d6, specular: 0xd5dbe4, shininess: 42, side: THREE.DoubleSide });
  const accent = new THREE.MeshPhongMaterial({ color: 0xf2c14e, shininess: 20, side: THREE.DoubleSide });
  const dark = new THREE.MeshPhongMaterial({ color: 0x232830, shininess: 18 });
  const glass = new THREE.MeshPhongMaterial({ color: 0x8eb4cc, transparent: true, opacity: 0.55, shininess: 90 });
  const red = new THREE.MeshPhongMaterial({ color: 0xc4473a, shininess: 20 });
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
  const roundel = new THREE.Mesh(new THREE.CircleGeometry(0.28, 16), red);
  roundel.position.set(0.9, 1.72, 1.15);
  roundel.rotation.y = Math.PI / 2;
  const wingVerts = (span) => [
    0, 0.055, 1.15,
    span, 0.02, -0.7,
    span * 0.94, 0.015, -1.55,
    0, 0.045, -1.85,
    0, -0.04, 1.15,
    span, -0.012, -0.7,
    span * 0.94, -0.01, -1.55,
    0, -0.03, -1.85,
  ];
  const swept = (sign) => {
    const pivot = new THREE.Group();
    pivot.position.set(sign * 0.72, 1.42, 0.05);
    const wing = plate(wingVerts(sign * 7.15), paint);
    const fence = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.28, 0.7), accent);
    fence.position.set(sign * 6.7, 0.16, -1.05);
    const flapMat = new THREE.MeshPhongMaterial({ color: 0xc9c3b6, shininess: 20, side: THREE.DoubleSide });
    const flap = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.08, 1.05), flapMat);
    flap.geometry.translate(0, 0, -0.52);
    flap.position.set(sign * 3.2, 0.02, -1.78);
    pivot.add(wing, fence, flap);
    pivot.userData.flap = flap;
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
  const stab = plate([
    0, 0.03, 0.55,
    2.35, 0.015, -0.15,
    2.15, 0.01, -0.85,
    0, 0.025, -0.7,
    0, -0.02, 0.55,
    2.35, -0.01, -0.15,
    2.15, -0.008, -0.85,
    0, -0.018, -0.7,
  ], paint);
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
  const finCapL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.16, 0.42), accent);
  finCapL.position.set(-0.78, 3.42, -4.85);
  const finR = plate(finGeo, paint);
  finR.position.set(0.72, 1.7, -4.55);
  finR.rotation.z = -0.18;
  const finCapR = finCapL.clone();
  finCapR.position.x = 0.78;
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
  const spine = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.06, 10.6), accent);
  spine.position.set(0, 2.12, -0.15);
  const wingMark = (x) => {
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.58, 18), red);
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(x, 1.5, -0.4);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.34, 0.58, 18), accent);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 1.52, -0.4);
    return [disc, ring];
  };
  const [markL, ringL] = wingMark(-3.35);
  const [markR, ringR] = wingMark(3.35);
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
    fuse, radome, canopy, frame, roundel,
    glove, gloveL, wingL, wingR, stab, stabL,
    finL, finR, finCapL, finCapR,
    nacelleL, nacelleR, lipL, lipR, nozzleL, nozzleR, plugL, plugR, flameL, flameR,
    spine, markL, ringL, markR, ringR, gear,
  );
  g.userData.gear = gear;
  g.userData.jets = [flameL, flameR];
  g.userData.flameMat = flameMat;
  g.userData.wingL = wingL;
  g.userData.wingR = wingR;
  g.userData.flaps = [wingL.userData.flap, wingR.userData.flap];
  g.userData.sweep = 0;
  g.userData.flapT = 0;
  return g;
}

export function createWorld(city, index, flight = false) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(TIMES[1].bg);
  scene.fog = new THREE.Fog(TIMES[1].fog, 980, 5600);

  const hemi = new THREE.HemisphereLight(0xe7f2ff, 0x7d9a62, 1.08);
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
      },
      vertexShader: "varying vec3 vP; #include <common>\n#include <logdepthbuf_pars_vertex>\nvoid main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); #include <logdepthbuf_vertex>\n}",
      fragmentShader: "varying vec3 vP; uniform vec3 top; uniform vec3 horizon; #include <common>\n#include <logdepthbuf_pars_fragment>\nvoid main(){ float h = clamp(normalize(vP).y * 1.15 + 0.08, 0.0, 1.0); gl_FragColor = vec4(mix(horizon, top, pow(h, 0.85)), 1.0); #include <logdepthbuf_fragment>\n}",
    }),
  );
  sky.renderOrder = -2;
  sky.frustumCulled = false;
  scene.add(sky);

  const groundSeg = 168;
  const groundGeo = new THREE.BufferGeometry();
  const groundPos = new Float32Array((groundSeg + 1) * (groundSeg + 1) * 3);
  const groundCol = new Float32Array((groundSeg + 1) * (groundSeg + 1) * 3);
  const groundIdx = [];
  for (let iz = 0; iz < groundSeg; iz++) {
    for (let ix = 0; ix < groundSeg; ix++) {
      const a = iz * (groundSeg + 1) + ix;
      groundIdx.push(a, a + groundSeg + 1, a + 1, a + 1, a + groundSeg + 1, a + groundSeg + 2);
    }
  }
  groundGeo.setAttribute("position", new THREE.BufferAttribute(groundPos, 3));
  groundGeo.setAttribute("color", new THREE.BufferAttribute(groundCol, 3));
  groundGeo.setIndex(groundIdx);
  const ground = new THREE.Mesh(
    groundGeo,
    new THREE.MeshLambertMaterial({ vertexColors: true }),
  );
  ground.renderOrder = -1;
  ground.material.polygonOffset = true;
  ground.material.polygonOffsetFactor = 2;
  ground.material.polygonOffsetUnits = 2;
  ground.receiveShadow = true;
  ground.frustumCulled = false;
  const landTint = (h, i) => {
    const t = Math.max(0, Math.min(1, (h - 95) / 90));
    groundCol[i] = 0.16 + t * 0.16;
    groundCol[i + 1] = 0.32 + t * 0.08;
    groundCol[i + 2] = 0.2 - t * 0.04;
  };
  const groundRaw = new Float32Array((groundSeg + 1) * (groundSeg + 1));
  const reshapeGround = (cx, cz, span) => {
    const step = span / groundSeg;
    const x0 = cx - span / 2;
    const z0 = cz - span / 2;
    const n = groundSeg + 1;
    for (let iz = 0; iz <= groundSeg; iz++) {
      for (let ix = 0; ix <= groundSeg; ix++) {
        const x = x0 + ix * step;
        const z = z0 + iz * step;
        groundRaw[iz * n + ix] = heightAt(x, z);
        const v = (iz * n + ix) * 3;
        groundPos[v] = x;
        groundPos[v + 2] = z;
      }
    }
    for (let iz = 0; iz <= groundSeg; iz++) {
      for (let ix = 0; ix <= groundSeg; ix++) {
        const h = groundRaw[iz * n + ix];
        let low = h;
        if (ix > 0) low = Math.min(low, groundRaw[iz * n + ix - 1]);
        if (ix + 1 < n) low = Math.min(low, groundRaw[iz * n + ix + 1]);
        if (iz > 0) low = Math.min(low, groundRaw[(iz - 1) * n + ix]);
        if (iz + 1 < n) low = Math.min(low, groundRaw[(iz + 1) * n + ix]);
        const v = (iz * n + ix) * 3;
        groundPos[v + 1] = Math.min(h, (h * 2 + low) / 3) - 0.3;
        landTint(h, v);
      }
    }
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
    groundGeo.attributes.position.needsUpdate = true;
    groundGeo.attributes.color.needsUpdate = true;
    groundGeo.computeVertexNormals();
    ground.userData.cx = cx;
    ground.userData.cz = cz;
    ground.userData.span = span;
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
  for (const river of city.rivers) waterPos.push(...ribbon(river.p, river.w, (x, z) => heightAt(x, z) + 0.55, river.hl, river.hr));
  for (const lake of city.lakes || []) {
    let bed = Infinity;
    for (let i = 0; i < lake.length; i += 2) bed = Math.min(bed, heightAt(lake[i], lake[i + 1]));
    waterPos.push(...fan(lake, (bed === Infinity ? 0 : bed) + 0.4));
  }
  const water = meshFrom(waterPos, 0x1d5f92, 0.92);
  if (water) {
    water.frustumCulled = false;
    scene.add(water);
  }

  const parkPos = [];
  for (const park of city.parks || []) parkPos.push(...fan(park, (x, z) => heightAt(x, z) + 0.12));
  const parks = meshFrom(parkPos, 0x2c6b3c, 0.82);
  if (parks) scene.add(parks);

  const buildings = makeBuildings(city, index);
  if (buildings) scene.add(buildings);

  let treePack = makeTrees(city, flight ? 4 : 2, index);
  scene.add(...treePack.parts);

  const sights = [];
  for (const s of city.sights) {
    const mark = landmark(s);
    mark.position.set(s.x, heightAt(s.x, s.z), s.z);
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
    stepCombat(player, input, dt) {
      if (!combat) return { shot: false, missile: false, boom: false, kills: 0, broke: false, hit: false, tags: [] };
      return combat.update(player, input, dt);
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
      const span = Math.min(120000, Math.max(7200, 6800 + agl * 16));
      const moved = Math.hypot(player.x - (ground.userData.cx || 0), player.z - (ground.userData.cz || 0));
      if (moved > span * 0.12 || Math.abs(span - (ground.userData.span || 0)) > span * 0.08) reshapeGround(player.x, player.z, span);
      sky.position.set(player.x, 0, player.z);
      const air = player.flying || agl > 45;
      scene.fog.near = air ? 8000 : fogNear;
      scene.fog.far = air ? 46000 : fogFar;
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
        const flapAng = -plane.userData.flapT * 0.95;
        for (const flap of plane.userData.flaps || []) {
          if (flap) flap.rotation.x = flapAng;
        }
        const sweep = plane.userData.sweep || 0;
        const wantSweep = player.jets ? 1 : 0;
        plane.userData.sweep = sweep + (wantSweep - sweep) * Math.min(1, dt * 2.4);
        const fold = plane.userData.sweep * 0.95;
        if (plane.userData.wingL) plane.userData.wingL.rotation.y = -fold;
        if (plane.userData.wingR) plane.userData.wingR.rotation.y = fold;
        const jetOn = !!player.jets;
        if (plane.userData.flameMat) plane.userData.flameMat.color.setHex(jetOn ? 0xff6a1a : 0x8fb4d4);
        for (const flame of plane.userData.jets || []) {
          flame.visible = true;
          flame.scale.y = jetOn ? 1.5 + Math.random() * 1.6 : 0.45;
        }
      }
      for (const s of sights) {
        const seen = sim.visited.has(s.data.id);
        if (s.mark.userData.plate) s.mark.userData.plate.material.color.setHex(seen ? 0xb7e7c4 : 0xffffff);
      }
    },
  };
}
