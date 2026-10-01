export function createPlayer(spawn) {
  const player = {
    x: spawn.x,
    z: spawn.z,
    y: 0.45,
    heading: spawn.h || 0,
    speed: 0,
    vx: 0,
    vz: 0,
    yaw: 0,
    wheel: 0,
    pitch: 0,
    roll: 0,
    qx: 0,
    qy: 0,
    qz: 0,
    qw: 1,
    vy: 0,
    flying: false,
    jets: false,
    weapon: 1,
    lock: false,
    wings: 0,
    gear: 1,
    gearDown: true,
    flaps: 0,
    spin: 0,
    throttle: 0,
    missiles: 8,
    rounds: 300,
    flares: 24,
    crashed: 0,
    wrecked: false,
    landStress: 0,
    wet: false,
    parked: true,
    parkX: spawn.x,
    parkZ: spawn.z,
    parkH: spawn.h || 0,
  };
  oriFromEuler(player);
  return player;
}

export function resetPlayer(player, spawn) {
  player.x = spawn.x;
  player.z = spawn.z;
  player.y = 0.45;
  player.heading = spawn.h || 0;
  player.speed = 0;
  player.vx = 0;
  player.vz = 0;
  player.yaw = 0;
  player.wheel = 0;
  player.pitch = 0;
  player.roll = 0;
  player.vy = 0;
  player.flying = false;
  player.jets = false;
  player.wings = 0;
  player.gearDown = true;
  player.flaps = 0;
  player.spin = 0;
  player.throttle = 0;
  player.missiles = 8;
  player.rounds = 300;
  player.flares = 24;
  player.rotate = 0;
  player.noseSm = 0;
  player.rollSm = 0;
  player.wet = false;
  player.wrecked = false;
  player.wreckShown = false;
  player.landStress = 0;
  player.parked = true;
  player.parkX = spawn.x;
  player.parkZ = spawn.z;
  player.parkH = spawn.h || 0;
  oriFromEuler(player);
}

export function placeOnRoad(player, hit) {
  if (!hit) return;
  const boost = hit.cls === "motorway" || hit.cls === "trunk" || hit.cls === "primary" ? 1.35 : 1.12;
  const half = Math.max(3.1, (hit.w || 6) * 0.5 * boost);
  const lane = half * 0.42;
  player.x = hit.x - Math.cos(hit.heading) * lane;
  player.z = hit.z + Math.sin(hit.heading) * lane;
  player.y = hit.y + 0.45;
  player.heading = hit.heading;
  player.pitch = 0;
  player.roll = 0;
  player.vy = 0;
  player.flying = false;
  player.jets = false;
  player.wings = 0;
  player.speed = Math.min(player.speed, 6);
  oriFromEuler(player);
  parkVelocity(player);
}

function slideBuildings(player, world) {
  let impact = 0;
  for (let n = 0; n < 4; n++) {
    const push = world.push(player.x, player.z, player.y, 1.6);
    if (!push?.hit) return impact;
    player.x += push.x;
    player.z += push.z;
    const plen = Math.hypot(push.x, push.z);
    if (plen < 0.0008) return impact;
    const nx = push.x / plen;
    const nz = push.z / plen;
    const vx = Math.sin(player.heading) * player.speed;
    const vz = Math.cos(player.heading) * player.speed;
    const into = vx * nx + vz * nz;
    if (into < 0) {
      impact = Math.max(impact, -into);
      const vx2 = vx - into * nx;
      const vz2 = vz - into * nz;
      player.speed = Math.max(0, Math.min(54, vx2 * Math.sin(player.heading) + vz2 * Math.cos(player.heading)));
      player.vx = Math.sin(player.heading) * player.speed;
      player.vz = Math.cos(player.heading) * player.speed;
      player.yaw = 0;
    }
  }
  return impact;
}

function wreckPlayer(player, world) {
  player.wrecked = true;
  player.crashed = 1;
  player.flying = false;
  player.speed = 0;
  player.vy = 0;
  player.vx = 0;
  player.vz = 0;
  player.spin = 0;
  player.jets = false;
  player.throttle = 0;
  player.landStress = 1;
  player.smokeT = Math.max(player.smokeT || 0, 8);
  player.y = world.surface(player.x, player.z, player.y) + 0.45;
  return player;
}

function landingStress(player, agl, onPad) {
  const sink = Math.max(0, -player.vy);
  let stress = sink / 8;
  const nose = Math.abs(wrapAngle(player.pitch));
  if (nose > 0.2) stress = Math.max(stress, (nose - 0.2) / 0.5);
  const bank = Math.abs(wrapAngle(player.roll));
  if (bank > 0.4) stress = Math.max(stress, 0.4 + (bank - 0.4) * 0.8);
  const kmh = Math.abs(player.speed) * 3.6;
  if (kmh > 260) stress = Math.max(stress, (kmh - 260) / 240);
  if (player.gearDown === false && agl < 100) stress = Math.max(stress, 0.9);
  if (player.spin) stress = 1;
  if (!onPad && agl < 80) stress = Math.max(stress, 0.92);
  return Math.max(0, Math.min(1, stress));
}

function stepFlight(player, input, dt, world) {
  player.prevX = player.x;
  player.prevZ = player.z;
  dt = Math.min(dt, 0.05);
  if (player.wrecked) {
    player.flying = false;
    player.speed = 0;
    player.vy = 0;
    player.jets = false;
    player.throttle = 0;
    player.landStress = 1;
    player.y = world.surface(player.x, player.z, player.y) + 0.45;
    return player;
  }
  player.crashed = 0;
  player.wings = 1;
  const cruise = 500 / 3.6;
  const jet = 2400 / 3.6;
  const cap = player.jets ? jet : cruise;
  const accel = player.jets ? 70 : 28;
  const flap = player.flaps > 0.5;
  if (player.throttle == null) player.throttle = 0;
  const throttleRate = player.jets ? 0.42 : 0.32;
  if (input.accel) player.throttle = Math.min(1, player.throttle + throttleRate * dt);
  if (input.decel) player.throttle = Math.max(0, player.throttle - throttleRate * 1.4 * dt);
  const setSpeed = player.throttle * cap;
  const stall = (flap ? 60 : 130) / 3.6;
  const rotate = (flap ? 75 : 150) / 3.6;
  const ground = () => world.surface(player.x, player.z, player.y);
  const steer = (input.left ? 1 : 0) - (input.right ? 1 : 0);
  if (!player.flying) {
    player.spin = 0;
    player.stallAge = 0;
    player.gearDown = true;
    if (player.jets) player.flaps = 0;
    if (player.parked && input.accel) player.parked = false;
    if (player.parked) {
      player.throttle = 0;
      player.speed = 0;
    }
    if (player.speed < setSpeed) player.speed += Math.min(setSpeed - player.speed, accel * dt);
    else player.speed -= Math.min(player.speed - setSpeed, (flap ? 16 : 10) * dt);
    if (player.throttle <= 0.01) player.speed = Math.max(0, player.speed - 8 * dt);
    player.speed = Math.max(0, player.speed);
    const wheelK = 1 - Math.exp(-dt * 5);
    player.wheel += (steer - player.wheel) * wheelK;
    const steerRate = Math.min(0.62, 0.1 + player.speed * 0.004);
    if (player.speed > 2) player.heading += player.wheel * dt * steerRate;
    const wantRotate = player.speed > rotate * 0.9 && input.noseUp ? 1 : 0;
    player.rotate = (player.rotate || 0) + (wantRotate - (player.rotate || 0)) * Math.min(1, dt * 2.4);
    player.pitch = player.rotate * (flap ? 0.2 : 0.15);
    player.roll += (0 - (player.roll || 0)) * Math.min(1, dt * 4);
    player.vy = 0;
    player.airTime = 0;
    player.noseSm = (input.noseUp ? 1 : 0) - (input.noseDown ? 1 : 0);
    player.rollSm = steer;
    player.x += Math.sin(player.heading) * player.speed * dt;
    player.z += Math.cos(player.heading) * player.speed * dt;
    const groundHit = slideBuildings(player, world);
    player.y = ground() + 0.45;
    player.agl = 0;
    if (player.parked) {
      player.speed = 0;
      player.vx = 0;
      player.vz = 0;
      player.x = player.parkX;
      player.z = player.parkZ;
      player.heading = player.parkH || 0;
      player.wheel = 0;
    } else if (groundHit > 16) return wreckPlayer(player, world);
    if (player.rotate > 0.62 && player.speed > rotate) {
      player.flying = true;
      player.airTime = 0;
      player.vy = Math.sin(player.pitch) * player.speed + 2.2;
    }
    oriFromEuler(player);
  } else {
    if (player.qw == null) oriFromEuler(player);
    const flightNose = oriAxis(player, 0, 0, 1);
    const gamma = flightNose.y;
    let drag = player.jets ? 0.4 : 1.2;
    if (flap) drag += 7;
    if (player.gearDown) drag += 4;
    drag += Math.abs(Math.sin(wrapAngle(player.roll))) * (player.jets ? 1.2 : 2.4);
    const ref = cap / Math.max(0.25, 1 - Math.min(drag, accel * 0.8) / accel);
    const thrust = accel * player.throttle * Math.max(0, 1 - player.speed / ref);
    player.speed += thrust * dt;
    player.speed -= drag * dt;
    player.speed -= (1 - player.throttle) * 5 * dt;
    player.speed -= 9.81 * gamma * dt;
    const pull = Math.abs((input.noseUp ? 1 : 0) - (input.noseDown ? 1 : 0));
    const rollIn = Math.abs(steer);
    const bank = Math.min(1, Math.abs(Math.sin(player.roll || 0)));
    const gLoad = Math.min(1.65, pull * 1.05 + bank * (0.4 + pull * 0.65) + rollIn * 0.2);
    if (gLoad > 0.04) {
      const corner = stall * 1.2;
      const excess = Math.max(0, player.speed - corner);
      player.speed -= gLoad * (5 + excess * (player.jets ? 0.1 : 0.085)) * dt;
    }
    const diveCap = player.jets ? jet : cruise * 1.55;
    if (player.speed > diveCap) player.speed = diveCap;
    player.speed = Math.max(0, player.speed);
    const slow = player.speed < stall;
    if (slow) player.stallAge = (player.stallAge || 0) + dt;
    else if (!player.spin) player.stallAge = 0;
    if (slow && !player.spin && player.stallAge > 2.6) {
      player.spin = (player.roll || 0) >= 0 ? 1 : -1;
    }
    if (player.spin && player.speed > stall * 1.22) {
      player.spin = 0;
      player.stallAge = 0;
    }
    const stalling = slow || !!player.spin;
    const nose = (input.noseUp ? 1 : 0) - (input.noseDown ? 1 : 0);
    const rollInput = steer;
    const noseK = 1 - Math.exp(-dt * 3.4);
    const rollK = 1 - Math.exp(-dt * 2.8);
    player.noseSm = (player.noseSm || 0) + (nose - (player.noseSm || 0)) * noseK;
    player.rollSm = (player.rollSm || 0) + (rollInput - (player.rollSm || 0)) * rollK;
    const noseCmd = player.noseSm;
    const rollCmd = player.rollSm;
    const auth = Math.min(1.15, 0.5 + player.speed / 160);
    if (stalling) {
      oriRotateLocal(player, 1, 0, 0, -(noseCmd * 0.22) * dt);
      if (player.spin) {
        oriRotateLocal(player, 0, 0, 1, -(player.spin * 2.4 + rollCmd * 0.2) * dt);
        oriRotateWorld(player, 0, 1, 0, player.spin * 1.15 * dt);
      } else {
        const wing = Math.max(-1, Math.min(1, player.roll || 0));
        oriRotateLocal(player, 0, 0, 1, -(wing * 0.28 + rollCmd * 0.25) * dt);
      }
      dropNose(player, dt, player.spin ? 2.1 : 1.55);
    } else {
      player.spin = 0;
      oriRotateLocal(player, 1, 0, 0, -(noseCmd * 0.85 * auth) * dt);
      oriRotateLocal(player, 0, 0, 1, -(rollCmd * 1.9 * auth) * dt);
      const right = oriAxis(player, 1, 0, 0);
      const up = oriAxis(player, 0, 1, 0);
      const aimed = oriAxis(player, 0, 0, 1);
      const bank = Math.atan2(-right.y, up.y);
      oriRotateWorld(player, 0, 1, 0, Math.sin(bank) * 0.82 * dt * Math.max(0.3, Math.hypot(aimed.x, aimed.z)));
    }
    const aimed = oriAxis(player, 0, 0, 1);
    const lifted = oriAxis(player, 0, 1, 0);
    const right = oriAxis(player, 1, 0, 0);
    player.pitch = Math.asin(Math.max(-1, Math.min(1, aimed.y)));
    player.roll = Math.atan2(-right.y, lifted.y);
    player.heading = Math.atan2(aimed.x, aimed.z);
    player.wheel += (0 - player.wheel) * Math.min(1, dt * 4);
    const cp = Math.hypot(aimed.x, aimed.z);
    const sp = aimed.y;
    let climb = sp * player.speed;
    if (flap && !stalling) climb += 6 * Math.max(0, cp);
    if (stalling) {
      const sink = player.spin ? -36 : -18 - Math.min(8, (player.stallAge || 0) * 3);
      climb = Math.min(climb, sink);
    }
    const deck = ground();
    const agl = player.y - deck;
    player.agl = agl;
    if (agl >= 180) {
      player.gearDown = false;
      player.flaps = 0;
    }
    player.airTime = (player.airTime || 0) + dt;
    if (!stalling && player.gearDown !== false && agl < 20 && agl > 0 && climb < -2.2) {
      const pad = world.runway?.(player.x, player.z);
      if (pad) {
        const blend = (1 - agl / 20) * 0.42;
        climb += (-1.5 - climb) * blend;
      }
    }
    const vyK = stalling ? 12 : (agl < 24 ? 14 : 6);
    player.vy += (climb - player.vy) * Math.min(1, dt * vyK);
    player.y += player.vy * dt;
    const ceiling = world.elevation(player.x, player.z) + (player.jets ? 6500 : 3400);
    if (player.y > ceiling) {
      player.y = ceiling;
      player.vy = Math.min(0, player.vy);
    }
    player.x += aimed.x * player.speed * dt;
    player.z += aimed.z * player.speed * dt;
    const hit = slideBuildings(player, world);
    if (hit > 12) return wreckPlayer(player, world);
    const pad = world.runway?.(player.x, player.z);
    player.landStress = landingStress(player, agl, !!pad);
    if (player.airTime > 0.45 && player.y <= deck + 0.55) {
      player.lastTouch = player.landStress;
      const fatal = !pad || player.landStress >= 0.82 || player.gearDown === false || player.spin;
      if (fatal) return wreckPlayer(player, world);
      player.y = deck + 0.45;
      player.flying = false;
      player.vy = 0;
      player.spin = 0;
      player.gearDown = true;
      player.landStress = 0;
      player.rotate = Math.max(0, Math.min(1, player.pitch / (flap ? 0.2 : 0.15)));
      player.roll *= 0.55;
      player.noseSm = 0;
      player.rollSm = 0;
      oriFromEuler(player);
    }
  }
  player.vx = Math.sin(player.heading) * player.speed;
  player.vz = Math.cos(player.heading) * player.speed;
  player.heading = wrapAngle(player.heading);
  player.gear = player.speed < 1 ? "N" : "1";
  const kmhNow = player.speed * 3.6;
  const stallKmh = flap ? 60 : 130;
  player.stalling = !!(player.flying && ((player.stallAge || 0) > 0.05 || player.spin));
  player.stallWarn = player.flying && !player.wrecked && kmhNow < stallKmh + 15;
  return player;
}

function setOri(player, x, y, z, w) {
  const n = Math.hypot(x, y, z, w) || 1;
  player.qx = x / n;
  player.qy = y / n;
  player.qz = z / n;
  player.qw = w / n;
}

function oriFromEuler(player) {
  const x = -(player.pitch || 0);
  const y = player.heading || 0;
  const z = -(player.roll || 0);
  const c1 = Math.cos(x / 2);
  const c2 = Math.cos(y / 2);
  const c3 = Math.cos(z / 2);
  const s1 = Math.sin(x / 2);
  const s2 = Math.sin(y / 2);
  const s3 = Math.sin(z / 2);
  setOri(
    player,
    s1 * c2 * c3 + c1 * s2 * s3,
    c1 * s2 * c3 - s1 * c2 * s3,
    c1 * c2 * s3 - s1 * s2 * c3,
    c1 * c2 * c3 + s1 * s2 * s3,
  );
}

function mulOri(player, x, y, z, w) {
  const qx = player.qx;
  const qy = player.qy;
  const qz = player.qz;
  const qw = player.qw;
  setOri(
    player,
    qw * x + qx * w + qy * z - qz * y,
    qw * y - qx * z + qy * w + qz * x,
    qw * z + qx * y - qy * x + qz * w,
    qw * w - qx * x - qy * y - qz * z,
  );
}

function preMulOri(player, x, y, z, w) {
  const qx = player.qx;
  const qy = player.qy;
  const qz = player.qz;
  const qw = player.qw;
  setOri(
    player,
    w * qx + x * qw + y * qz - z * qy,
    w * qy - x * qz + y * qw + z * qx,
    w * qz + x * qy - y * qx + z * qw,
    w * qw - x * qx - y * qy - z * qz,
  );
}

function dropNose(player, dt, strength) {
  const nose = oriAxis(player, 0, 0, 1);
  const horiz = Math.hypot(nose.x, nose.z);
  let ax = 1;
  let az = 0;
  if (horiz > 0.08) {
    ax = nose.z / horiz;
    az = -nose.x / horiz;
  }
  const need = nose.y - (-0.62);
  if (need <= 0.02) return;
  oriRotateWorld(player, ax, 0, az, Math.min(strength, need * 2.4) * dt);
}

function oriRotateLocal(player, ax, ay, az, angle) {
  const h = angle * 0.5;
  const s = Math.sin(h);
  mulOri(player, ax * s, ay * s, az * s, Math.cos(h));
}

function oriRotateWorld(player, ax, ay, az, angle) {
  const h = angle * 0.5;
  const s = Math.sin(h);
  preMulOri(player, ax * s, ay * s, az * s, Math.cos(h));
}

function oriAxis(player, lx, ly, lz) {
  const qx = player.qx;
  const qy = player.qy;
  const qz = player.qz;
  const qw = player.qw;
  const ix = qw * lx + qy * lz - qz * ly;
  const iy = qw * ly + qz * lx - qx * lz;
  const iz = qw * lz + qx * ly - qy * lx;
  const iw = -qx * lx - qy * ly - qz * lz;
  return {
    x: ix * qw + iw * -qx + iy * -qz - iz * -qy,
    y: iy * qw + iw * -qy + iz * -qx - ix * -qz,
    z: iz * qw + iw * -qz + ix * -qy - iy * -qx,
  };
}

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export function updatePlayer(player, input, dt, world) {
  return stepFlight(player, input, dt, world);
}


function parkVelocity(player) {
  player.vx = Math.sin(player.heading) * player.speed;
  player.vz = Math.cos(player.heading) * player.speed;
  player.yaw = 0;
  player.wheel = 0;
}
