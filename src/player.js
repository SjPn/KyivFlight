export function createPlayer(spawn) {
  return {
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
    vy: 0,
    flying: false,
    jets: false,
    weapon: 0,
    lock: false,
    wings: 0,
    gear: 1,
    gearDown: true,
    flaps: 0,
    spin: 0,
    throttle: 0,
    missiles: 6,
    crashed: 0,
    wrecked: false,
    landStress: 0,
    wet: false,
  };
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
  player.missiles = 6;
  player.wet = false;
  player.wrecked = false;
  player.wreckShown = false;
  player.landStress = 0;
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
    player.gearDown = true;
    if (player.speed < setSpeed) player.speed += Math.min(setSpeed - player.speed, accel * dt);
    else player.speed -= Math.min(player.speed - setSpeed, (flap ? 16 : 10) * dt);
    if (player.throttle <= 0.01) player.speed = Math.max(0, player.speed - 8 * dt);
    player.speed = Math.max(0, player.speed);
    player.wheel = steer;
    const steerRate = Math.min(0.85, 0.22 + player.speed * 0.006);
    if (player.speed > 2) player.heading += steer * dt * steerRate;
    player.pitch = 0;
    player.roll = 0;
    player.vy = 0;
    player.x += Math.sin(player.heading) * player.speed * dt;
    player.z += Math.cos(player.heading) * player.speed * dt;
    const groundHit = slideBuildings(player, world);
    player.y = ground() + 0.45;
    player.agl = 0;
    if (groundHit > 16) return wreckPlayer(player, world);
    if (player.speed > rotate && input.noseUp) {
      player.flying = true;
      player.pitch = flap ? 0.22 : 0.16;
      player.vy = flap ? 8 : 12;
    }
  } else {
    const noseNow = wrapAngle(player.pitch);
    const gamma = Math.sin(noseNow);
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
    const diveCap = player.jets ? jet : cruise * 1.55;
    if (player.speed > diveCap) player.speed = diveCap;
    player.speed = Math.max(0, player.speed);
    const below = player.spin ? player.speed < stall * 1.2 : player.speed < stall;
    const nose = (input.noseUp ? 1 : 0) - (input.noseDown ? 1 : 0);
    const rollInput = steer;
    const auth = Math.min(1.15, 0.5 + player.speed / 160);
    if (below) {
      if (!player.spin) player.spin = wrapAngle(player.roll) >= 0 ? 1 : -1;
      player.pitch += nose * 0.45 * dt;
      player.pitch += (-1.2 - wrapAngle(player.pitch)) * Math.min(1, dt * 1.8);
      player.roll += (player.spin * 2.8 + rollInput * 0.45) * dt;
      player.heading += player.spin * 2.2 * dt;
    } else {
      player.spin = 0;
      player.pitch += nose * 1.35 * auth * dt;
      player.roll += rollInput * 3.05 * auth * dt;
      if (!rollInput) {
        const turns = Math.PI * 2;
        const canopyUp = Math.cos(player.pitch) * Math.cos(player.roll) > 0.35;
        const upright = canopyUp && Math.cos(player.pitch) < 0 ? Math.PI : 0;
        const level = upright + Math.round((player.roll - upright) / turns) * turns;
        player.roll += (level - player.roll) * Math.min(1, dt * 2.2);
      }
      const bank = wrapAngle(player.roll);
      const cp = Math.cos(player.pitch);
      player.heading += Math.sin(bank) * 1.25 * dt * Math.max(0.3, Math.abs(cp));
    }
    player.wheel += (0 - player.wheel) * Math.min(1, dt * 4);
    const cp = Math.cos(player.pitch);
    const sp = Math.sin(player.pitch);
    let climb = sp * player.speed;
    if (flap && !player.spin) climb += 6 * Math.max(0, cp);
    if (player.spin) climb -= (stall - player.speed) * 2.4 + 8;
    const deck = ground();
    const agl = player.y - deck;
    player.agl = agl;
    if (!player.spin && player.gearDown && agl < 18 && agl > 0 && player.vy < 4) {
      climb *= 0.42 + agl / 30;
    }
    player.vy = climb;
    player.y += player.vy * dt;
    const ceiling = world.elevation(player.x, player.z) + (player.jets ? 6500 : 3400);
    if (player.y > ceiling) {
      player.y = ceiling;
      player.vy = Math.min(0, player.vy);
    }
    player.x += Math.sin(player.heading) * player.speed * cp * dt;
    player.z += Math.cos(player.heading) * player.speed * cp * dt;
    const hit = slideBuildings(player, world);
    if (hit > 12) return wreckPlayer(player, world);
    const pad = world.runway?.(player.x, player.z);
    player.landStress = landingStress(player, agl, !!pad);
    if (player.y <= deck + 0.55) {
      const fatal = !pad || player.landStress >= 0.82 || player.gearDown === false || player.spin;
      if (fatal) return wreckPlayer(player, world);
      player.y = deck + 0.45;
      player.flying = false;
      player.pitch = 0;
      player.roll = 0;
      player.vy = 0;
      player.spin = 0;
      player.gearDown = true;
      player.landStress = 0;
    }
  }
  player.vx = Math.sin(player.heading) * player.speed;
  player.vz = Math.cos(player.heading) * player.speed;
  player.heading = wrapAngle(player.heading);
  player.gear = player.speed < 1 ? "N" : "1";
  const kmhNow = player.speed * 3.6;
  const stallKmh = flap ? 60 : 130;
  player.stallWarn = player.flying && !player.spin && kmhNow < stallKmh + 15 && kmhNow + 1 >= stallKmh;
  return player;
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
