import * as THREE from "three";

const GUN_RANGE = 1400;
const GUN_RADIUS = 14;
const GUN_GAP = 0.07;
const MISSILE_GAP = 1.05;
const MISSILE_SPEED = 720;
const LOCK_RANGE = 15000;
const COLORS = [0xf7f4ee, 0xf2c14e, 0xe4453a, 0x7ec8ea, 0xf28a2e, 0xc6ef7a, 0xe7c2ef, 0xffffff];

const _dir = new THREE.Vector3();
const _z = new THREE.Vector3(0, 0, 1);

function wrap(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function wingPlate(span, chord, sweep, thick, material) {
  const s = span;
  const c = chord;
  const k = sweep;
  const t = thick;
  const verts = [
    0, t, c * 0.55,
    s, t * 0.4, c * 0.15 - k,
    s * 0.96, t * 0.3, -c * 0.45 - k,
    0, t * 0.8, -c * 0.5,
    0, -t * 0.6, c * 0.55,
    s, -t * 0.25, c * 0.15 - k,
    s * 0.96, -t * 0.2, -c * 0.45 - k,
    0, -t * 0.5, -c * 0.5,
  ];
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
  const flip = mesh.clone();
  flip.scale.x = -1;
  const g = new THREE.Group();
  g.add(mesh, flip);
  return g;
}

function airlinerGroup() {
  const g = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color: 0xf7f8fb, fog: false });
  const blue = new THREE.MeshLambertMaterial({ color: 0x2d6cb5, fog: false });
  const dark = new THREE.MeshLambertMaterial({ color: 0x2c333d, fog: false });
  const glass = new THREE.MeshLambertMaterial({ color: 0xb7d4e6, fog: false });
  const fuse = new THREE.Mesh(new THREE.CylinderGeometry(0.82, 0.82, 13.5, 16), paint);
  fuse.rotation.x = Math.PI / 2;
  fuse.position.set(0, 1.5, 0.2);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.82, 14, 10), paint);
  nose.scale.set(1, 0.95, 1.4);
  nose.position.set(0, 1.5, 6.7);
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.82, 3.1, 14), paint);
  tail.rotation.x = Math.PI / 2;
  tail.position.set(0, 1.55, -7.6);
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.86, 0.07, 8, 18), blue);
  band.position.set(0, 1.5, 3.4);
  const wing = wingPlate(7.4, 2.2, 2.4, 0.08, paint);
  wing.position.set(0, 1.15, 0.2);
  const stab = wingPlate(2.6, 1.1, 0.8, 0.05, paint);
  stab.position.set(0, 1.7, -7.3);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.6, 2.1), blue);
  fin.position.set(0, 2.9, -7.55);
  const cabin = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), glass);
  cabin.scale.set(1.1, 0.7, 1.6);
  cabin.position.set(0, 2.15, 4.6);
  const engGeo = new THREE.CylinderGeometry(0.38, 0.46, 2.5, 12);
  const engL = new THREE.Mesh(engGeo, dark);
  engL.rotation.x = Math.PI / 2;
  engL.position.set(-2.5, 0.72, -0.2);
  const engR = engL.clone();
  engR.position.x = 2.5;
  const lamp = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0x3dde6a, fog: false }),
  );
  lamp.position.set(0, 1.55, 7.7);
  g.add(fuse, nose, tail, band, wing, stab, fin, cabin, engL, engR, lamp);
  g.scale.setScalar(2.5);
  return g;
}

function fighterGroup() {
  const g = new THREE.Group();
  const body = new THREE.MeshLambertMaterial({ color: 0x4a4038, fog: false });
  const wingM = new THREE.MeshLambertMaterial({ color: 0x2e2926, fog: false });
  const hot = new THREE.MeshBasicMaterial({ color: 0xff8a1e, fog: false });
  const fuse = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.46, 7.2, 12), body);
  fuse.rotation.x = Math.PI / 2;
  fuse.position.set(0, 0.9, 0);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.38, 1.5, 12), hot);
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, 0.9, 4.2);
  const wing = wingPlate(4.8, 1.35, 1.7, 0.06, wingM);
  wing.position.set(0, 0.82, -0.2);
  const stab = wingPlate(1.7, 0.7, 0.55, 0.04, wingM);
  stab.position.set(0, 0.95, -3.3);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.15, 1.15), hot);
  fin.position.set(0, 1.7, -3.35);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), hot);
  lamp.position.set(0, 1.05, 4.7);
  g.add(fuse, nose, wing, stab, fin, lamp);
  g.scale.setScalar(2.15);
  return g;
}

function droneGroup() {
  const g = new THREE.Group();
  const body = new THREE.MeshLambertMaterial({ color: 0x3c434c, fog: false });
  const wingM = new THREE.MeshLambertMaterial({ color: 0x2a3038, fog: false });
  const red = new THREE.MeshBasicMaterial({ color: 0xff2e24, fog: false });
  const hull = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 10), body);
  hull.scale.set(0.72, 0.5, 2.8);
  hull.position.set(0, 0.72, 0);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.9, 10), body);
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, 0.7, 1.35);
  const wing = wingPlate(4.4, 0.7, 0.55, 0.045, wingM);
  wing.position.set(0, 0.7, 0.05);
  const boomL = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.2, 6), body);
  boomL.rotation.x = Math.PI / 2;
  boomL.position.set(-0.55, 0.68, -1.15);
  const boomR = boomL.clone();
  boomR.position.x = 0.55;
  const vL = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.55, 0.7), red);
  vL.position.set(-0.55, 0.95, -2.05);
  vL.rotation.z = 0.4;
  const vR = vL.clone();
  vR.position.x = 0.55;
  vR.rotation.z = -0.4;
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), red);
  lamp.position.set(0, 0.98, 0.15);
  g.add(hull, nose, wing, boomL, boomR, vL, vR, lamp);
  g.scale.setScalar(2.4);
  return g;
}

function pointAlong(mesh, x, y, z, dx, dy, dz) {
  _dir.set(dx, dy, dz);
  if (_dir.lengthSq() < 1e-6) return;
  _dir.normalize();
  mesh.position.set(x, y, z);
  mesh.quaternion.setFromUnitVectors(_z, _dir);
}

export function createCombat(scene, fields, elevation, wet = null) {
  const craft = [];
  const parked = [];
  const dummy = new THREE.Object3D();
  const home = fields.find((f) => f.icao === "UKKK") || fields[0];

  const bodyGeo = new THREE.BoxGeometry(1.35, 1.15, 8.2);
  const wingGeo = new THREE.BoxGeometry(12.4, 0.1, 1.8);
  const tailGeo = new THREE.BoxGeometry(4.2, 0.08, 0.95);
  const finGeo = new THREE.BoxGeometry(0.12, 1.5, 1.2);
  const cabinGeo = new THREE.BoxGeometry(0.85, 0.38, 1.5);
  const paint = new THREE.MeshLambertMaterial({ color: 0xf4f7fb });
  const accent = new THREE.MeshLambertMaterial({ color: 0xf2c14e });
  const glass = new THREE.MeshLambertMaterial({ color: 0x9ec4de });
  const nPark = fields.length * 5;
  const parts = {
    body: new THREE.InstancedMesh(bodyGeo, paint, nPark),
    wing: new THREE.InstancedMesh(wingGeo, paint, nPark),
    tail: new THREE.InstancedMesh(tailGeo, paint, nPark),
    fin: new THREE.InstancedMesh(finGeo, accent, nPark),
    cabin: new THREE.InstancedMesh(cabinGeo, glass, nPark),
  };
  for (const mesh of Object.values(parts)) {
    mesh.frustumCulled = false;
    scene.add(mesh);
  }
  const tint = new THREE.Color();
  let pi = 0;
  for (const f of fields) {
    const hw = Math.max(14, f.wid * 0.5);
    const fx = Math.sin(f.h);
    const fz = Math.cos(f.h);
    const rx = Math.cos(f.h);
    const rz = -Math.sin(f.h);
    for (let k = 0; k < 5; k++) {
      const along = -f.len * 0.5 + 120 + k * 18;
      const lat = hw + 26 + (k % 2) * 8;
      const x = f.x + fx * along + rx * lat;
      const z = f.z + fz * along + rz * lat;
      parked.push({
        x, z, h: f.h, y: elevation(x, z) + 1.45,
        alive: true, hp: 36, kind: "parked", wait: 0,
        color: COLORS[(pi + k) % COLORS.length],
      });
      pi++;
    }
  }

  function placeParked(p, index, lx, ly, lz) {
    const fx = Math.sin(p.h);
    const fz = Math.cos(p.h);
    const rx = Math.cos(p.h);
    const rz = -Math.sin(p.h);
    dummy.position.set(p.x + rx * lx + fx * lz, p.y + ly, p.z + rz * lx + fz * lz);
    dummy.rotation.set(0, p.h, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    return index;
  }

  function paintParked() {
    let n = 0;
    for (const p of parked) {
      if (!p.alive) continue;
      const slots = [
        [parts.body, 0, 1.15, 0.15],
        [parts.wing, 0, 1.05, 0.1],
        [parts.tail, 0, 1.35, -3.6],
        [parts.fin, 0, 2.05, -3.7],
        [parts.cabin, 0, 1.85, 1.2],
      ];
      for (const [mesh, lx, ly, lz] of slots) {
        placeParked(p, n, lx, ly, lz);
        mesh.setMatrixAt(n, dummy.matrix);
      }
      tint.setHex(p.color);
      parts.body.setColorAt(n, tint);
      parts.wing.setColorAt(n, tint);
      parts.tail.setColorAt(n, tint);
      n++;
    }
    for (const mesh of Object.values(parts)) {
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
    }
    if (parts.body.instanceColor) parts.body.instanceColor.needsUpdate = true;
    if (parts.wing.instanceColor) parts.wing.instanceColor.needsUpdate = true;
    if (parts.tail.instanceColor) parts.tail.instanceColor.needsUpdate = true;
  }
  paintParked();

  const DRONE_SLOW = 200 / 3.6;
  const DRONE_FAST = 500 / 3.6;
  const BANDIT_SPEED = 600 / 3.6;
  const CITY_RING = 16000;

  function eastOfKyiv(slot, count) {
    const t = count <= 1 ? 0.5 : slot / (count - 1);
    return {
      x: -15200 - (slot % 3) * 600,
      z: -11000 + t * 24000,
    };
  }

  function droneRoute(slot) {
    const south = slot % 2 === 0;
    const lap = slot % 4 < 2 ? 1 : -1;
    const spot = eastOfKyiv(slot, 8);
    const around = [
      { x: -CITY_RING, z: lap * 4000 },
      { x: -CITY_RING * 0.45, z: lap * CITY_RING },
      { x: CITY_RING * 0.2, z: lap * CITY_RING },
      { x: CITY_RING * 0.9, z: lap * CITY_RING * 0.45 },
    ];
    const tail = south
      ? [
          { x: lap * 5000, z: -CITY_RING },
          { x: -18000 + (slot % 4) * 14000, z: -108000 },
        ]
      : [
          { x: CITY_RING, z: lap * 2000 },
          { x: 90000, z: -25000 + (slot % 4) * 16000 },
        ];
    return { x: spot.x, z: spot.z, points: around.concat(tail) };
  }

  function spawnDrone(a) {
    const slot = a.id % 8;
    const fast = slot % 2 === 1;
    const route = droneRoute(slot);
    const first = route.points[0];
    a.fast = fast;
    a.pace = fast ? DRONE_FAST : DRONE_SLOW;
    a.points = route.points;
    a.leg = 0;
    a.x = route.x;
    a.z = route.z;
    a.h = Math.atan2(first.x - a.x, first.z - a.z);
    a.agl = fast ? 540 + (slot % 3) * 80 : 230 + (slot % 3) * 55;
    a.y = elevation(a.x, a.z) + a.agl;
    a.speed = a.pace;
    a.alive = true;
    a.hp = fast ? 64 : 40;
    a.wait = 0;
    a.roll = 0;
    a.gunT = 2;
    a.mesh.visible = true;
    a.mesh.scale.setScalar(fast ? 2.05 : 2.45);
  }

  function placeAround(a, origin, i) {
    const drone = a.role === "drone";
    const ang = (i / (drone ? 8 : 5)) * Math.PI * 2 + (drone ? 0.2 : 1.1);
    const dist = drone ? 900 + (i % 4) * 520 : 1800 + (i % 3) * 700;
    a.x = origin.x + Math.sin(ang) * dist;
    a.z = origin.z + Math.cos(ang) * dist;
    a.h = ang + Math.PI / 2;
    a.agl = drone ? 240 + (i % 5) * 110 : 820 + (i % 4) * 180;
    a.y = elevation(a.x, a.z) + a.agl;
    a.speed = drone ? 96 + (i % 3) * 16 : 125;
    a.alive = true;
    a.hp = drone ? 48 : 80;
    a.wait = 0;
    a.roll = 0;
    a.gunT = 2 + (i % 3);
    a.anchor = { x: a.x, z: a.z };
    a.mesh.visible = true;
  }

  function isHostile(t) {
    return t.role === "drone" || t.role === "bandit";
  }

  function spawnCivil(a) {
    const slot = a.id % 5;
    const spot = eastOfKyiv(slot, 5);
    const south = slot % 2 === 0;
    a.x = spot.x;
    a.z = spot.z;
    a.points = south
      ? [{ x: -3000, z: spot.z * 0.35 }, { x: 20000, z: -9000 - slot * 1800 }]
      : [{ x: -2000, z: 7000 }, { x: 24000, z: 5000 + slot * 1400 }];
    a.leg = 0;
    const first = a.points[0];
    a.h = Math.atan2(first.x - a.x, first.z - a.z);
    a.agl = 900 + slot * 130;
    a.y = elevation(a.x, a.z) + a.agl;
    a.speed = 125;
    a.alive = true;
    a.hp = 80;
    a.wait = 0;
    a.roll = 0;
    a.gunT = 2;
    a.mesh.visible = true;
  }

  function spawnBandit(a, player, slot) {
    const spot = eastOfKyiv(slot, 2);
    a.x = spot.x;
    a.z = spot.z + (slot === 0 ? -1600 : 1600);
    a.h = Math.atan2(player.x - a.x, player.z - a.z);
    a.agl = 420 + slot * 220;
    a.y = elevation(a.x, a.z) + a.agl;
    a.speed = BANDIT_SPEED;
    a.alive = true;
    a.hp = 70;
    a.roll = 0;
    a.gunT = 4 + slot;
    a.wait = 0;
    a.mesh.visible = true;
  }

  for (let i = 0; i < 8; i++) {
    const mesh = droneGroup();
    scene.add(mesh);
    const a = { id: i, mesh, role: "drone", kind: "air", vx: 0, vz: 0, vy: 0 };
    spawnDrone(a);
    craft.push(a);
  }
  for (let i = 0; i < 5; i++) {
    const mesh = airlinerGroup();
    scene.add(mesh);
    const a = { id: 100 + i, mesh, role: "civil", kind: "air", vx: 0, vz: 0, vy: 0 };
    spawnCivil(a);
    craft.push(a);
  }
  for (let i = 0; i < 2; i++) {
    const mesh = fighterGroup();
    mesh.visible = false;
    scene.add(mesh);
    craft.push({ id: 200 + i, mesh, role: "bandit", kind: "air", vx: 0, vz: 0, vy: 0, alive: false, hp: 0, wait: 1e9 });
  }

  const tracers = [];
  const tracerGeo = new THREE.BoxGeometry(0.35, 0.35, 18);
  const tracerMat = new THREE.MeshBasicMaterial({ color: 0xfff1a8, fog: false });
  for (let i = 0; i < 28; i++) {
    const mesh = new THREE.Mesh(tracerGeo, tracerMat);
    mesh.visible = false;
    mesh.frustumCulled = false;
    scene.add(mesh);
    tracers.push({ mesh, life: 0, vx: 0, vy: 0, vz: 0 });
  }

  const missiles = [];
  const missileMat = new THREE.MeshLambertMaterial({ color: 0xf4f1ea });
  const bandMat = new THREE.MeshLambertMaterial({ color: 0xf2c14e });
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xff6a1a, fog: false });
  for (let i = 0; i < 8; i++) {
    const mesh = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 2.15, 10), missileMat);
    body.rotation.x = Math.PI / 2;
    const noseCone = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.62, 10), bandMat);
    noseCone.rotation.x = Math.PI / 2;
    noseCone.position.z = 1.32;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.165, 0.165, 0.18, 10), bandMat);
    band.rotation.x = Math.PI / 2;
    band.position.z = 0.15;
    for (let k = 0; k < 4; k++) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.46, 0.42), missileMat);
      fin.position.set(0, 0.28, -0.82);
      fin.rotation.z = (k * Math.PI) / 2;
      mesh.add(fin);
    }
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.14, 1.5, 8), flameMat);
    flame.rotation.x = -Math.PI / 2;
    flame.position.z = -1.55;
    mesh.add(body, noseCone, band, flame);
    mesh.userData.flame = flame;
    mesh.visible = false;
    scene.add(mesh);
    missiles.push({ mesh, life: 0, x: 0, y: 0, z: 0, dx: 0, dy: 0, dz: 1, target: null, smoke: 0 });
  }

  const smokes = [];
  for (let i = 0; i < 180; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color: 0xdfe3ea,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
      fog: false,
    });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.55, 7, 6), mat);
    mesh.visible = false;
    mesh.frustumCulled = false;
    scene.add(mesh);
    smokes.push({ mesh, life: 0, max: 1, rise: 2, grow: 3 });
  }

  const rings = [];
  for (let i = 0; i < 6; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffc14a,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    });
    const mesh = new THREE.Mesh(new THREE.TorusGeometry(1, 0.08, 6, 22), mat);
    mesh.rotation.x = Math.PI / 2;
    mesh.visible = false;
    mesh.frustumCulled = false;
    scene.add(mesh);
    rings.push({ mesh, life: 0, max: 0.55 });
  }

  const debris = [];
  const debrisGeo = new THREE.BoxGeometry(1.1, 0.7, 1.6);
  for (let i = 0; i < 56; i++) {
    const mesh = new THREE.Mesh(debrisGeo, new THREE.MeshLambertMaterial({ color: 0xd7dde6 }));
    mesh.visible = false;
    scene.add(mesh);
    debris.push({ mesh, life: 0 });
  }

  const flashes = [];
  for (let i = 0; i < 10; i++) {
    const mat = new THREE.MeshBasicMaterial({ color: 0xff8a2a, transparent: true, opacity: 1, fog: false, depthWrite: false });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), mat);
    mesh.visible = false;
    mesh.frustumCulled = false;
    scene.add(mesh);
    flashes.push({ mesh, life: 0, max: 0.7 });
  }

  const hostile = [];
  const hostileMat = new THREE.MeshLambertMaterial({ color: 0xe8e4dc });
  const hostileFlame = new THREE.MeshBasicMaterial({ color: 0xff3b30, fog: false });
  for (let i = 0; i < 4; i++) {
    const mesh = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, 1.8, 8), hostileMat);
    body.rotation.x = Math.PI / 2;
    const noseCone = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.45, 8), hostileFlame);
    noseCone.rotation.x = Math.PI / 2;
    noseCone.position.z = 1.05;
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.1, 1.1, 8), hostileFlame);
    flame.rotation.x = -Math.PI / 2;
    flame.position.z = -1.2;
    mesh.add(body, noseCone, flame);
    mesh.userData.flame = flame;
    mesh.visible = false;
    scene.add(mesh);
    hostile.push({ mesh, life: 0, age: 0, x: 0, y: 0, z: 0, dx: 0, dy: 0, dz: 1, decoy: null });
  }

  const flares = [];
  for (let i = 0; i < 16; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffe7a8,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      fog: false,
    });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.85, 8, 6), mat);
    mesh.visible = false;
    mesh.frustumCulled = false;
    scene.add(mesh);
    flares.push({ mesh, life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, puff: 0 });
  }

  let gunT = 0;
  let missileT = 0;
  let flareT = 0;
  let banditT = 240;
  let clock = 0;
  let lastH = 0;
  let lastRoll = 0;
  let breakEnergy = 0;
  const labels = [];

  function nose(player) {
    const cp = Math.cos(player.pitch);
    const dx = Math.sin(player.heading) * cp;
    const dy = Math.sin(player.pitch);
    const dz = Math.cos(player.heading) * cp;
    return {
      x: player.x + dx * 7,
      y: player.y + 1.3 + dy * 7,
      z: player.z + dz * 7,
      dx, dy, dz,
    };
  }

  function aliveTargets() {
    const list = [];
    for (const a of craft) if (a.alive) list.push(a);
    for (const p of parked) if (p.alive) list.push(p);
    return list;
  }

  function rayHit(ox, oy, oz, dx, dy, dz, range, radius) {
    let best = null;
    let bestT = range;
    for (const t of aliveTargets()) {
      if (t.role === "civil") continue;
      const tx = t.x - ox;
      const ty = (t.y + 1.2) - oy;
      const tz = t.z - oz;
      const along = tx * dx + ty * dy + tz * dz;
      if (along < 0 || along > range) continue;
      const px = ox + dx * along;
      const py = oy + dy * along;
      const pz = oz + dz * along;
      const miss = Math.hypot(t.x - px, t.y + 1.2 - py, t.z - pz);
      if (miss < radius && along < bestT) {
        best = t;
        bestT = along;
      }
    }
    return best;
  }

  function nearestAir(origin) {
    let best = null;
    let bestD = LOCK_RANGE;
    for (const t of craft) {
      if (!t.alive || !isHostile(t)) continue;
      const dist = Math.hypot(t.x - origin.x, t.y - origin.y, t.z - origin.z);
      if (dist < 40 || dist > LOCK_RANGE) continue;
      if (dist < bestD) {
        best = t;
        bestD = dist;
      }
    }
    return best;
  }

  function puff(x, y, z, big, trail) {
    for (const s of smokes) {
      if (s.life > 0) continue;
      s.life = trail ? 3.2 : big ? 2.6 : 1.25;
      s.max = s.life;
      s.x = x;
      s.y = y;
      s.z = z;
      s.rise = trail ? 0.2 + Math.random() * 0.35 : big ? 7 + Math.random() * 6 : 1.5 + Math.random() * 2;
      s.grow = trail ? 2.8 + Math.random() * 1.6 : big ? 10 + Math.random() * 8 : 2.4 + Math.random();
      s.dense = trail ? 0.78 : big ? 0.58 : 0.4;
      s.mesh.visible = true;
      s.mesh.material.color.setHex(trail ? (Math.random() < 0.45 ? 0x8e959c : 0xb7bec6) : big ? (Math.random() < 0.35 ? 0x4a4038 : 0x8d8680) : 0xe7ebf1);
      s.mesh.material.opacity = s.dense;
      s.mesh.scale.setScalar(trail ? 0.55 : 0.3);
      return;
    }
  }

  function trailPuff(x, y, z, dx, dy, dz) {
    const rx = dz;
    const rz = -dx;
    const w = (Math.random() - 0.5) * 0.7;
    puff(x - dx * 1.8 + rx * w, y - dy * 1.8 + (Math.random() - 0.5) * 0.35, z - dz * 1.8 + rz * w, false, true);
  }

  function burst(x, y, z) {
    let left = 10;
    for (const d of debris) {
      if (d.life > 0 || left <= 0) continue;
      left--;
      d.life = 5.5;
      d.x = x + (Math.random() - 0.5) * 6;
      d.y = y + Math.random() * 3;
      d.z = z + (Math.random() - 0.5) * 6;
      d.vx = (Math.random() - 0.5) * 36;
      d.vy = 10 + Math.random() * 22;
      d.vz = (Math.random() - 0.5) * 36;
      d.rx = Math.random() * 8;
      d.ry = Math.random() * 8;
      d.rz = Math.random() * 8;
      d.mesh.visible = true;
      d.mesh.scale.set(
        0.4 + Math.random() * 1.3,
        0.3 + Math.random() * 0.8,
        0.5 + Math.random() * 1.6,
      );
      d.mesh.material.color.setHex(Math.random() < 0.28 ? 0xff7a2a : 0xc5ccd4);
    }
    let flames = 0;
    for (const f of flashes) {
      if (f.life > 0) continue;
      f.life = flames === 0 ? 0.55 : 1.15;
      f.max = f.life;
      f.mesh.visible = true;
      f.mesh.position.set(x, y + 1, z);
      f.mesh.material.opacity = 0.95;
      f.mesh.material.color.setHex(flames === 0 ? 0xfff1c2 : 0xff6a1a);
      f.smoke = flames > 0;
      flames++;
      if (flames >= 2) break;
    }
    for (let i = 0; i < 8; i++) {
      const ang = Math.random() * Math.PI * 2;
      const rad = Math.random() * 4;
      puff(x + Math.cos(ang) * rad, y + Math.random() * 3, z + Math.sin(ang) * rad, true);
    }
    for (const ring of rings) {
      if (ring.life > 0) continue;
      ring.life = ring.max;
      ring.mesh.visible = true;
      ring.mesh.position.set(x, y + 1.2, z);
      ring.mesh.material.opacity = 0.9;
      ring.mesh.scale.setScalar(1);
      break;
    }
  }

  function kill(t) {
    t.alive = false;
    t.hp = 0;
    t.wait = t.kind === "air" ? 8 : 22;
    if (t.mesh) t.mesh.visible = false;
    burst(t.x, t.y + 1, t.z);
    if (isHostile(t)) labels.push({ x: t.x, y: t.y + 8, z: t.z, text: "DESTROYED" });
    if (t.kind === "parked") paintParked();
  }

  function leadOf(player) {
    if (player.weapon === 1) return null;
    const ox = player.x;
    const oy = player.y + 1.2;
    const oz = player.z;
    const cp = Math.cos(player.pitch);
    const fx = Math.sin(player.heading) * cp;
    const fy = Math.sin(player.pitch);
    const fz = Math.cos(player.heading) * cp;
    const speed = 900;
    let best = null;
    let bestScore = 1e9;
    for (const t of craft) {
      if (!t.alive || !isHostile(t)) continue;
      const px = t.x - ox;
      const py = t.y + 1.2 - oy;
      const pz = t.z - oz;
      const dist = Math.hypot(px, py, pz);
      if (dist < 30 || dist > 1700) continue;
      const dot = (px * fx + py * fy + pz * fz) / dist;
      if (dot < 0.15) continue;
      const vx = t.vx || 0;
      const vy = t.vy || 0;
      const vz = t.vz || 0;
      const a = vx * vx + vy * vy + vz * vz - speed * speed;
      const b = 2 * (px * vx + py * vy + pz * vz);
      const c = dist * dist;
      const disc = b * b - 4 * a * c;
      if (disc < 0 || Math.abs(a) < 1e-4) continue;
      const root = Math.sqrt(disc);
      const t1 = (-b - root) / (2 * a);
      const t2 = (-b + root) / (2 * a);
      let tt = 0;
      if (t1 > 0.02 && t1 < 3.5) tt = t1;
      if (t2 > 0.02 && t2 < 3.5 && (tt === 0 || t2 < tt)) tt = t2;
      if (tt === 0) continue;
      const score = (1 - dot) * 3 + dist / 1700;
      if (score < bestScore) {
        bestScore = score;
        best = { x: t.x + vx * tt, y: t.y + 1.2 + vy * tt, z: t.z + vz * tt };
      }
    }
    return best;
  }

  function launchHostile(a) {
    const slot = hostile.find((m) => m.life <= 0);
    if (!slot) return false;
    const dx = Math.sin(a.h);
    const dz = Math.cos(a.h);
    slot.life = 8.5;
    slot.age = 0;
    slot.x = a.x + dx * 14;
    slot.y = a.y;
    slot.z = a.z + dz * 14;
    slot.dx = dx;
    slot.dy = 0;
    slot.dz = dz;
    slot.mesh.visible = true;
    return true;
  }

  function dropFlare(player, side) {
    const slot = flares.find((f) => f.life <= 0);
    if (!slot || (player.flares ?? 0) <= 0) return false;
    player.flares -= 1;
    const hx = Math.sin(player.heading);
    const hz = Math.cos(player.heading);
    const rx = Math.cos(player.heading);
    const rz = -Math.sin(player.heading);
    slot.life = 4.4;
    slot.max = 4.4;
    slot.x = player.x - hx * 9 + rx * side * 2.1;
    slot.y = player.y + 0.6;
    slot.z = player.z - hz * 9 + rz * side * 2.1;
    slot.vx = -hx * 26 + rx * side * 8;
    slot.vy = 3;
    slot.vz = -hz * 26 + rz * side * 8;
    slot.puff = 0;
    slot.mesh.visible = true;
    slot.mesh.scale.setScalar(1.2);
    return true;
  }

  function seekFlare(m, player) {
    if (m.age < 0.45) return null;
    const px = player.x - m.x;
    const py = player.y + 1.2 - m.y;
    const pz = player.z - m.z;
    const pd = Math.hypot(px, py, pz) || 1;
    let best = null;
    let bestD = 1e9;
    for (const f of flares) {
      if (f.life <= 0.2) continue;
      const dx = f.x - m.x;
      const dy = f.y - m.y;
      const dz = f.z - m.z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist > 540 || dist < 5 || dist > pd * 0.92) continue;
      const align = (m.dx * dx + m.dy * dy + m.dz * dz) / dist;
      if (align < 0.55) continue;
      if (dist < bestD) {
        bestD = dist;
        best = f;
      }
    }
    return best;
  }

  function update(player, input, dt) {
    const fx = { shot: false, missile: false, boom: false, kills: 0, broke: false, hit: false, tags: [] };
    clock += dt;
    gunT = Math.max(0, gunT - dt);
    missileT = Math.max(0, missileT - dt);
    const aim = nose(player);
    const locked = nearestAir(player);
    player.lock = !!locked;
    player.lockPos = locked ? { x: locked.x, y: locked.y + 2.2, z: locked.z } : null;

    if (input.fire && player.weapon !== 1 && gunT <= 0) {
      if ((player.rounds ?? 0) <= 0) {
        fx.gunEmpty = true;
        gunT = 0.85;
      } else {
      player.rounds -= 1;
      gunT = GUN_GAP;
      fx.shot = true;
      const hit = rayHit(aim.x, aim.y, aim.z, aim.dx, aim.dy, aim.dz, GUN_RANGE, GUN_RADIUS);
      if (hit) {
        hit.hp -= 12;
        if (hit.hp <= 0) {
          kill(hit);
          fx.boom = true;
          if (isHostile(hit)) {
            fx.kills++;
            if (hit.role === "bandit") fx.banditKills = (fx.banditKills || 0) + 1;
          }
        }
      }
      for (const tr of tracers) {
        if (tr.life > 0) continue;
        tr.life = 0.22;
        tr.x = aim.x;
        tr.y = aim.y;
        tr.z = aim.z;
        tr.vx = aim.dx * 900;
        tr.vy = aim.dy * 900;
        tr.vz = aim.dz * 900;
        tr.mesh.visible = true;
        pointAlong(tr.mesh, tr.x, tr.y, tr.z, aim.dx, aim.dy, aim.dz);
        break;
      }
      }
    }

    if (input.fire && player.weapon === 1 && missileT <= 0) {
      if ((player.missiles ?? 0) <= 0) {
        fx.empty = true;
        missileT = 0.45;
      }
      const slot = (player.missiles ?? 0) > 0 ? missiles.find((m) => m.life <= 0) : null;
      if (slot) {
        player.missiles -= 1;
        missileT = MISSILE_GAP;
        fx.shot = true;
        fx.missile = true;
        slot.life = 26;
        slot.x = aim.x;
        slot.y = aim.y;
        slot.z = aim.z;
        slot.dx = aim.dx;
        slot.dy = aim.dy;
        slot.dz = aim.dz;
        slot.target = locked;
        slot.smoke = 0;
        slot.mesh.visible = true;
      }
    }

    for (const tr of tracers) {
      if (tr.life <= 0) continue;
      tr.life -= dt;
      tr.x += tr.vx * dt;
      tr.y += tr.vy * dt;
      tr.z += tr.vz * dt;
      pointAlong(tr.mesh, tr.x, tr.y, tr.z, tr.vx, tr.vy, tr.vz);
      if (tr.life <= 0) tr.mesh.visible = false;
    }

    for (const m of missiles) {
      if (m.life <= 0) continue;
      m.life -= dt;
      if (m.target && !m.target.alive) m.target = null;
      if (m.target) {
        const tx = m.target.x - m.x;
        const ty = m.target.y + 1.2 - m.y;
        const tz = m.target.z - m.z;
        const len = Math.hypot(tx, ty, tz) || 1;
        const k = Math.min(1, dt * 7);
        m.dx += (tx / len - m.dx) * k;
        m.dy += (ty / len - m.dy) * k;
        m.dz += (tz / len - m.dz) * k;
        const nrm = Math.hypot(m.dx, m.dy, m.dz) || 1;
        m.dx /= nrm;
        m.dy /= nrm;
        m.dz /= nrm;
        if (len < 36) {
          kill(m.target);
          fx.boom = true;
          if (isHostile(m.target)) {
            fx.kills++;
            if (m.target.role === "bandit") fx.banditKills = (fx.banditKills || 0) + 1;
          }
          m.life = 0;
        }
      }
      m.x += m.dx * MISSILE_SPEED * dt;
      m.y += m.dy * MISSILE_SPEED * dt;
      m.z += m.dz * MISSILE_SPEED * dt;
      if (!m.target) {
        const bump = rayHit(m.x, m.y, m.z, m.dx, m.dy, m.dz, 24, 12);
        if (bump) {
          kill(bump);
          fx.boom = true;
          if (isHostile(bump)) {
            fx.kills++;
            if (bump.role === "bandit") fx.banditKills = (fx.banditKills || 0) + 1;
          }
          m.life = 0;
        }
      }
      pointAlong(m.mesh, m.x, m.y, m.z, m.dx, m.dy, m.dz);
      const flame = m.mesh.userData.flame;
      if (flame) {
        flame.scale.y = 0.75 + Math.random() * 0.9;
        flame.material.color.setHex(Math.random() < 0.5 ? 0xfff0b0 : 0xff5a12);
      }
      m.smoke -= dt;
      if (m.smoke <= 0) {
        m.smoke = 0.028;
        trailPuff(m.x, m.y, m.z, m.dx, m.dy, m.dz);
      }
      if (m.life <= 0) m.mesh.visible = false;
    }

    for (const s of smokes) {
      if (s.life <= 0) continue;
      s.life -= dt;
      s.y += s.rise * dt;
      const k = 1 - s.life / s.max;
      s.mesh.position.set(s.x, s.y, s.z);
      s.mesh.scale.setScalar(0.35 + k * s.grow);
      s.mesh.material.opacity = Math.max(0, (1 - k) * (s.dense || 0.4));
      if (s.life <= 0) s.mesh.visible = false;
    }

    for (const d of debris) {
      if (d.life <= 0) continue;
      d.life -= dt;
      d.vy -= 26 * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.z += d.vz * dt;
      const ground = elevation(d.x, d.z) + 0.6;
      if (d.y < ground) {
        d.y = ground;
        d.vy *= -0.25;
        d.vx *= 0.6;
        d.vz *= 0.6;
        if (Math.abs(d.vy) < 2) d.vy = 0;
      }
      d.mesh.position.set(d.x, d.y, d.z);
      d.mesh.rotation.x += d.rx * dt;
      d.mesh.rotation.y += d.ry * dt;
      d.mesh.rotation.z += d.rz * dt;
      if (d.life <= 0) d.mesh.visible = false;
    }

    for (const f of flashes) {
      if (f.life <= 0) continue;
      f.life -= dt;
      const k = 1 - f.life / f.max;
      const spread = f.smoke ? 10 + k * 46 : 4 + k * 28;
      f.mesh.scale.setScalar(spread);
      f.mesh.material.opacity = Math.max(0, (f.life / f.max) * (f.smoke ? 0.55 : 0.95));
      if (!f.smoke && k > 0.35) f.mesh.material.color.setHex(0xff4a1a);
      if (f.life <= 0) f.mesh.visible = false;
    }

    for (const ring of rings) {
      if (ring.life <= 0) continue;
      ring.life -= dt;
      const k = 1 - ring.life / ring.max;
      ring.mesh.scale.setScalar(2 + k * 42);
      ring.mesh.material.opacity = Math.max(0, (1 - k) * 0.85);
      if (ring.life <= 0) ring.mesh.visible = false;
    }

    banditT -= dt;
    if (banditT <= 0) {
      banditT = 240;
      let spawned = 0;
      for (const a of craft) {
        if (a.role !== "bandit" || a.alive) continue;
        spawnBandit(a, player, spawned);
        spawned++;
      }
      if (spawned) fx.raid = spawned;
    }
    for (const a of craft) {
      if (!a.alive) {
        if (a.role === "bandit") continue;
        a.wait -= dt;
        if (a.wait <= 0) {
          if (a.role === "drone") spawnDrone(a);
          else if (a.role === "civil") spawnCivil(a);
          else placeAround(a, player, (a.id % 8) + 3);
        }
        continue;
      }
      const far = Math.hypot(a.x - player.x, a.z - player.z);
      const limit = a.role === "bandit" ? 12000 : 6200;
      if (far > limit && a.role !== "bandit" && a.role !== "drone" && a.role !== "civil") placeAround(a, player, a.id % 8);
      const prevY = a.y;
      if (a.role === "bandit" && player.flying && far < 8000 && far > 70) {
        const slot = a.id % 2;
        const high = slot === 1;
        const back = high ? 1600 : 900;
        const side = (slot === 0 ? -1 : 1) * (high ? 140 : 220);
        const bx = player.x - Math.sin(player.heading) * back + Math.cos(player.heading) * side;
        const bz = player.z - Math.cos(player.heading) * back - Math.sin(player.heading) * side;
        const aim = Math.atan2(bx - a.x, bz - a.z);
        let diff = wrap(aim - a.h);
        const maxTurn = 1.15 * dt;
        if (diff > maxTurn) diff = maxTurn;
        if (diff < -maxTurn) diff = -maxTurn;
        a.h = wrap(a.h + diff);
        a.roll = Math.max(-0.7, Math.min(0.7, diff / Math.max(dt, 0.001) * 0.12));
        const groundY = elevation(a.x, a.z);
        a.agl = Math.max(180, player.y - groundY + (high ? 260 : 40));
        a.speed = BANDIT_SPEED;
        a.gunT = (a.gunT || 0) - dt;
        const rear = -((a.x - player.x) * Math.sin(player.heading) + (a.z - player.z) * Math.cos(player.heading));
        const flyingHostile = hostile.filter((m) => m.life > 0).length;
        if (rear > 180 && far < 1700 && far > 320 && a.gunT <= 0 && flyingHostile < 2) {
          if (launchHostile(a)) {
            a.gunT = 9;
            fx.launch = true;
          }
        }
      } else if (a.role === "drone") {
        const wp = a.points && a.points[a.leg];
        if (!wp) {
          a.alive = false;
          a.wait = 8 + (a.id % 4) * 3;
          a.mesh.visible = false;
        } else {
          const aim = Math.atan2(wp.x - a.x, wp.z - a.z);
          let diff = wrap(aim - a.h);
          const maxTurn = (a.fast ? 0.9 : 0.55) * dt;
          if (diff > maxTurn) diff = maxTurn;
          if (diff < -maxTurn) diff = -maxTurn;
          a.h = wrap(a.h + diff);
          a.roll = Math.max(-0.45, Math.min(0.45, diff / Math.max(dt, 0.001) * 0.08));
          a.agl = a.fast ? 540 + (a.id % 3) * 80 : 230 + (a.id % 3) * 55;
          a.speed = a.pace;
          if (Math.hypot(wp.x - a.x, wp.z - a.z) < 1700) a.leg += 1;
        }
      } else {
        const wp = a.points && a.points[a.leg];
        if (!wp) {
          a.alive = false;
          a.wait = 14;
          a.mesh.visible = false;
        } else {
          const aim = Math.atan2(wp.x - a.x, wp.z - a.z);
          let diff = wrap(aim - a.h);
          const maxTurn = 0.45 * dt;
          if (diff > maxTurn) diff = maxTurn;
          if (diff < -maxTurn) diff = -maxTurn;
          a.h = wrap(a.h + diff);
          a.roll = Math.max(-0.25, Math.min(0.25, diff / Math.max(dt, 0.001) * 0.05));
          a.agl = 980 + (a.id % 3) * 140;
          a.speed = 125;
          if (Math.hypot(wp.x - a.x, wp.z - a.z) < 2200) a.leg += 1;
        }
      }
      a.x += Math.sin(a.h) * a.speed * dt;
      a.z += Math.cos(a.h) * a.speed * dt;
      const wantY = elevation(a.x, a.z) + a.agl;
      a.y += (wantY - a.y) * Math.min(1, dt * 0.4);
      a.vx = Math.sin(a.h) * a.speed;
      a.vy = (a.y - prevY) / Math.max(dt, 0.001);
      a.vz = Math.cos(a.h) * a.speed;
      a.mesh.position.set(a.x, a.y, a.z);
      a.mesh.rotation.order = "YXZ";
      a.mesh.rotation.set(a.role === "drone" ? 0.02 : 0.04, a.h, -a.roll);
      const body = Math.hypot(a.x - player.x, a.y - player.y, a.z - player.z);
      const ram = a.role === "civil" ? 26 : 16;
      if (!player.wrecked && player.flying && body < ram && player.speed > 15) {
        kill(a);
        fx.boom = true;
        if (isHostile(a)) {
          fx.kills++;
          if (a.role === "bandit") fx.banditKills = (fx.banditKills || 0) + 1;
        }
        player.wrecked = true;
        player.crashed = 1;
        player.flying = false;
        player.speed = 0;
        player.vy = 0;
        player.landStress = 1;
        player.smokeT = Math.max(player.smokeT || 0, 8);
      }
    }

    const yawStep = Math.abs(wrap(player.heading - lastH));
    const rollStep = Math.abs((player.roll || 0) - lastRoll);
    breakEnergy = breakEnergy * Math.exp(-dt * 1.7) + yawStep + rollStep * 0.4;
    lastH = player.heading;
    lastRoll = player.roll || 0;
    const dodging = breakEnergy > 0.5;
    flareT = Math.max(0, flareT - dt);
    if (input.flare && player.flying && !player.wrecked && flareT <= 0) {
      if ((player.flares ?? 0) <= 0) {
        fx.flareEmpty = true;
        flareT = 0.7;
      } else {
        const left = dropFlare(player, -1);
        const right = (player.flares ?? 0) > 0 ? dropFlare(player, 1) : false;
        if (left || right) {
          fx.flare = true;
          flareT = 0.28;
        }
      }
    }
    for (const f of flares) {
      if (f.life <= 0) continue;
      f.life -= dt;
      f.vy -= 7 * dt;
      f.vx *= Math.exp(-dt * 0.35);
      f.vz *= Math.exp(-dt * 0.35);
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.z += f.vz * dt;
      const deck = elevation(f.x, f.z) + 0.8;
      if (f.y < deck) {
        f.y = deck;
        f.vy = 0;
        f.vx *= 0.4;
        f.vz *= 0.4;
      }
      const fade = Math.max(0, f.life / f.max);
      f.mesh.position.set(f.x, f.y, f.z);
      f.mesh.scale.setScalar(1.1 + (1 - fade) * 2.4);
      f.mesh.material.opacity = 0.35 + fade * 0.65;
      f.puff -= dt;
      if (f.puff <= 0) {
        f.puff = 0.06;
        trailPuff(f.x, f.y, f.z, 0, 1, 0);
      }
      if (f.life <= 0) f.mesh.visible = false;
    }
    const HOSTILE_SPEED = 250;
    let threat = false;
    let nearestMissile = null;
    for (const m of hostile) {
      if (m.life <= 0) continue;
      threat = true;
      m.life -= dt;
      m.age += dt;
      if (!(m.decoy && m.decoy.life > 0)) m.decoy = seekFlare(m, player);
      const decoy = m.decoy && m.decoy.life > 0 ? m.decoy : null;
      const tx = (decoy ? decoy.x : player.x) - m.x;
      const ty = (decoy ? decoy.y : player.y + 1.2) - m.y;
      const tz = (decoy ? decoy.z : player.z) - m.z;
      const len = Math.hypot(tx, ty, tz) || 1;
      if (!decoy) {
        const align = (m.dx * tx + m.dy * ty + m.dz * tz) / len;
        if (m.age > 0.35 && (align < 0.78 || (dodging && align < 0.93))) {
          fx.broke = true;
          puff(m.x, m.y, m.z, false);
          m.life = 0;
          m.mesh.visible = false;
          m.decoy = null;
          continue;
        }
        if (nearestMissile == null || len < nearestMissile) nearestMissile = len;
      } else if (len < 16) {
        puff(m.x, m.y, m.z, false);
        m.life = 0;
        m.mesh.visible = false;
        m.decoy = null;
        fx.spoofed = true;
        continue;
      }
      const turn = Math.min(1, dt * (decoy ? 3.4 : 1.7));
      m.dx += (tx / len - m.dx) * turn;
      m.dy += (ty / len - m.dy) * turn;
      m.dz += (tz / len - m.dz) * turn;
      const nrm = Math.hypot(m.dx, m.dy, m.dz) || 1;
      m.dx /= nrm;
      m.dy /= nrm;
      m.dz /= nrm;
      m.x += m.dx * HOSTILE_SPEED * dt;
      m.y += m.dy * HOSTILE_SPEED * dt;
      m.z += m.dz * HOSTILE_SPEED * dt;
      if (!decoy && len < 24) {
        fx.hit = true;
        fx.boom = true;
        player.speed *= 0.62;
        player.vy -= 6;
        player.shake = 0.55;
        player.smokeT = Math.max(player.smokeT || 0, 10);
        burst(player.x, player.y + 1, player.z);
        m.life = 0;
      }
      pointAlong(m.mesh, m.x, m.y, m.z, m.dx, m.dy, m.dz);
      const flame = m.mesh.userData.flame;
      if (flame) flame.scale.y = 0.7 + Math.random() * 0.7;
      m.smoke = (m.smoke || 0) - dt;
      if (m.smoke <= 0) {
        m.smoke = 0.04;
        trailPuff(m.x, m.y, m.z, m.dx, m.dy, m.dz);
      }
      if (m.life <= 0) m.mesh.visible = false;
    }
    player.missileDist = nearestMissile;
    if (!threat && player.flying) {
      for (const a of craft) {
        if (!a.alive || a.role !== "bandit") continue;
        const rear = -((a.x - player.x) * Math.sin(player.heading) + (a.z - player.z) * Math.cos(player.heading));
        if (rear > 120 && Math.hypot(a.x - player.x, a.z - player.z) < 2200) threat = true;
      }
    }
    player.warning = threat && player.flying;
    player.leadPos = leadOf(player);
    if (player.smokeT > 0 && (player.flying || player.wrecked)) {
      player.smokeT -= dt;
      player.smokeClock = (player.smokeClock || 0) - dt;
      if (player.smokeClock <= 0) {
        player.smokeClock = 0.08;
        const hx = Math.sin(player.heading);
        const hz = Math.cos(player.heading);
        const rx = Math.cos(player.heading);
        const rz = -Math.sin(player.heading);
        puff(player.x - hx * 4 + rx * 1.15, player.y + 0.9, player.z - hz * 4 + rz * 1.15, true);
        puff(player.x - hx * 4 - rx * 1.15, player.y + 0.9, player.z - hz * 4 - rz * 1.15, true);
      }
    }
    if (!player.wrecked && player.flying && player.speed > 15) {
      for (const p of parked) {
        if (!p.alive) continue;
        if (Math.hypot(p.x - player.x, p.y + 1 - player.y, p.z - player.z) > 12) continue;
        kill(p);
        player.wrecked = true;
        player.crashed = 1;
        player.flying = false;
        player.speed = 0;
        player.vy = 0;
        player.landStress = 1;
        player.smokeT = Math.max(player.smokeT || 0, 8);
        break;
      }
    }
    if (player.wrecked && !player.wreckShown) {
      player.wreckShown = true;
      burst(player.x, player.y + 1, player.z);
      fx.boom = true;
      fx.wreck = true;
    }
    fx.tags = labels.splice(0, labels.length);

    for (const p of parked) {
      if (p.alive) continue;
      p.wait -= dt;
      if (p.wait <= 0) {
        p.alive = true;
        p.hp = 36;
        paintParked();
      }
    }
    return fx;
  }

  return { craft, update };
}
