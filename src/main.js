import * as THREE from "three";
import { createAudio } from "./audio.js?v=28";
import { loadElev } from "./elev.js?v=49";
import { clearPlazas, indexCity, nearestRoad, onRoad, openStreets, presentEast } from "./geo.js?v=67";
import { FIELDS, fieldAt, nearestField, runwayStart } from "./airfields.js?v=1";
import { createPlayer, resetPlayer, updatePlayer } from "./player.js?v=78";
import { clearRetry, createSim, nearestSight, retryHint, updateSim } from "./sim.js?v=60";
import { createUI } from "./ui.js?v=71";
import { createWorld } from "./world.js?v=90";

const app = document.querySelector("#app");
const loading = document.querySelector("#loading");
const loadMsg = loading.querySelector(".msg");
const loadBar = loading.querySelector("i");

function setLoad(text, t) {
  loadMsg.textContent = text;
  loadBar.style.transform = `scaleX(${t})`;
}

const SIGHT_EN = {
  maidan: ["Independence Square", "Kyiv's main square and the Independence Column"],
  khreshchatyk: ["Khreshchatyk", "The city's central street"],
  bessarabka: ["Bessarabska Market", "The covered market hall from 1912"],
  sophia: ["Saint Sophia Cathedral", "Eleventh-century cathedral"],
  goldengate: ["Golden Gate", "The rebuilt gate of Yaroslav's city"],
  mykhailivsky: ["St. Michael's Golden-Domed Monastery", "Blue walls and gold domes above the old city"],
  andriyivska: ["St. Andrew's Church", "The baroque church on the hill over Podil"],
  andriyivsky: ["Andriivskyi Descent", "The cobbled slope between the hill and Podil"],
  kontraktova: ["Kontraktova Square", "The heart of Podil"],
  chimeras: ["House with Chimaeras", "Horodetsky's mansion"],
  opera: ["National Opera", "The opera and ballet theatre"],
  volodymyrsky: ["St. Volodymyr's Cathedral", "The cathedral on Shevchenko Boulevard"],
  mariinsky: ["Mariinskyi Palace", "The palace above the Dnipro"],
  arch: ["Arch of Freedom of the Ukrainian People", "The overlook in Khreshchatyi Park"],
  olympic: ["NSC Olimpiyskiy", "The national stadium"],
  station: ["Kyiv-Pasazhyrskyi", "The central railway station"],
  lavra: ["Kyiv-Pechersk Lavra", "The monastery above the Dnipro"],
  motherland: ["Motherland Monument", "The statue at the World War II museum"],
  paton: ["Paton Bridge", "The bridge across the Dnipro"],
  hydropark: ["Hydropark", "Islands and beaches on the Dnipro"],
  zhuliany: ["Kyiv Airport (Zhuliany)", "The city airport"],
  pyrohiv: ["Pyrohiv", "The open-air museum of folk architecture"],
  irpin: ["Irpin", "A city of Kyiv Oblast on the Irpin river"],
  bucha: ["Bucha", "A city northwest of Kyiv"],
  vyshhorod: ["Vyshhorod", "A town above the Kyiv Reservoir"],
  brovary: ["Brovary", "A city on the left bank"],
  boryspil: ["Boryspil Airport", "The country's main airport"],
  boyarka: ["Boyarka", "A town southwest of Kyiv"],
  vasylkiv: ["Vasylkiv", "One of the oldest towns in the oblast"],
  obukhiv: ["Obukhiv", "A town south of Kyiv"],
};

const TOWN_EN = {
  "Ірпінь": "Irpin",
  "Буча": "Bucha",
  "Гостомель": "Hostomel",
  "Вишгород": "Vyshhorod",
  "Бровари": "Brovary",
  "Бориспіль": "Boryspil",
  "Боярка": "Boyarka",
  "Васильків": "Vasylkiv",
  "Обухів": "Obukhiv",
  "Вишневе": "Vyshneve",
  "Фастів": "Fastiv",
  "Біла Церква": "Bila Tserkva",
  "Богуслав": "Bohuslav",
  "Переяслав": "Pereiaslav",
  "Яготин": "Yahotyn",
  "Українка": "Ukrainka",
  "Бородянка": "Borodianka",
  "Макарів": "Makariv",
  "Сквира": "Skvyra",
  "Кагарлик": "Kaharlyk",
};

function applyEnglish(city) {
  for (const s of city.sights || []) {
    const row = SIGHT_EN[s.id];
    if (row) {
      s.n = row[0];
      s.note = row[1];
    }
  }
  for (const t of city.towns || []) {
    if (TOWN_EN[t.n]) t.n = TOWN_EN[t.n];
  }
}

const keys = new Set();
let lookX = 0;
let lookY = 0.15;
let cabin = false;
const tmp = new THREE.Vector3();
const camTarget = new THREE.Vector3();
const lookAt = new THREE.Vector3();
const bodyEuler = new THREE.Euler(0, 0, 0, "YXZ");
const bodyQuat = new THREE.Quaternion();
const camQuat = new THREE.Quaternion();
const camNose = new THREE.Vector3();
const camUpV = new THREE.Vector3();
let chaseReady = false;
let camBank = 0;
let camFov = 68;

window.addEventListener("keydown", (e) => {
  if (e.repeat) return;
  keys.add(e.code);
  if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyW", "KeyA", "KeyS", "KeyD", "KeyF", "KeyG", "AltLeft", "AltRight", "ControlLeft", "ControlRight", "CapsLock"].includes(e.code)) e.preventDefault();
});
window.addEventListener("keyup", (e) => keys.delete(e.code));
window.addEventListener("blur", () => keys.clear());

function wrapRoll(a) {
  const t = Math.PI * 2;
  a %= t;
  if (a > Math.PI) a -= t;
  if (a < -Math.PI) a += t;
  return a;
}

function steerTo(h, target) {
  let d = target - h;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function readInput(player) {
  const pads = navigator.getGamepads?.() || [];
  const gp = pads[0];
  const ax = gp ? gp.axes[0] || 0 : 0;
  if (player.flight) {
    return {
      accel: keys.has("ShiftLeft") || keys.has("ShiftRight") || (gp?.buttons[7]?.value > 0.15),
      decel: keys.has("ControlLeft") || keys.has("ControlRight") || (gp?.buttons[6]?.value > 0.15),
      left: keys.has("KeyA") || ax < -0.2,
      right: keys.has("KeyD") || ax > 0.2,
      noseUp: keys.has("KeyS") || !!gp?.buttons[3]?.pressed,
      noseDown: keys.has("KeyW") || !!gp?.buttons[0]?.pressed,
      fire: keys.has("Space") || !!gp?.buttons[1]?.pressed,
      manual: true,
    };
  }
  const flying = player.flying;
  return {
    throttle: keys.has("KeyW") || (!flying && keys.has("ArrowUp")) || (gp?.buttons[7]?.value > 0.15),
    brake: keys.has("KeyS") || (!flying && keys.has("ArrowDown")) || (gp?.buttons[6]?.value > 0.15),
    left: keys.has("KeyA") || (!flying && keys.has("ArrowLeft")) || ax < -0.2,
    right: keys.has("KeyD") || (!flying && keys.has("ArrowRight")) || ax > 0.2,
    boost: keys.has("ShiftLeft") || keys.has("ShiftRight") || !!gp?.buttons[5]?.pressed,
    handbrake: keys.has("Space") || !!gp?.buttons[1]?.pressed,
    lookUp: flying && (keys.has("ArrowUp") || gp?.buttons[3]?.pressed),
    lookDown: flying && (keys.has("ArrowDown") || gp?.buttons[0]?.pressed),
    horn: keys.has("KeyF") || !!gp?.buttons[2]?.pressed,
    cancel: keys.has("KeyX"),
    manual: keys.has("KeyA") || keys.has("KeyD") || keys.has("ArrowLeft") || keys.has("ArrowRight") || Math.abs(ax) > 0.2,
  };
}

function projectPin(camera, pin, player, width, height) {
  tmp.set(pin.x, pin.y ?? player.y + 2, pin.z);
  tmp.project(camera);
  let x = (tmp.x * 0.5 + 0.5) * width;
  let y = (-tmp.y * 0.5 + 0.5) * height;
  const behind = tmp.z > 1;
  let edge = behind || x < 28 || y < 28 || x > width - 28 || y > height - 28;
  if (edge) {
    const ang = Math.atan2((behind ? player.x - pin.x : x - width / 2), (behind ? pin.z - player.z : height / 2 - y));
    x = width / 2 + Math.sin(ang) * (width / 2 - 40);
    y = height / 2 - Math.cos(ang) * (height / 2 - 40);
    edge = true;
  }
  return { x, y, edge, dist: Math.hypot(pin.x - player.x, pin.z - player.z) };
}

async function boot() {
  setLoad("Starting the renderer…", 0.08);
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
    preserveDrawingBuffer: false,
    logarithmicDepthBuffer: true,
  });
  renderer.setClearColor(0x8eacd0, 1);
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  app.appendChild(renderer.domElement);

  const camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.25, 14000);
  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  setLoad("Building Kyiv…", 0.22);
  const [res] = await Promise.all([
    fetch("/data/kyiv.json?v=49"),
    loadElev("/data/elev.bin?v=49"),
  ]);
  if (!res.ok) throw new Error("Map missing. Run npm run map");
  const city = await res.json();
  if (!city.roads?.length) throw new Error("The map is empty");
  presentEast(city);
  setLoad("Clearing the streets…", 0.45);
  openStreets(city);
  clearPlazas(city);
  applyEnglish(city);
  setLoad("Compiling shaders…", 0.62);
  const index = indexCity(city);
  // Driving is switched off. The street mesh stays so the city reads from the air.
  const flight = true;
  city.flight = true;
  city.fields = FIELDS;
  setLoad("Preparing the runways…", 0.72);
  const world = createWorld(city, index, flight);
  const homeField = FIELDS.find((f) => f.icao === "UKKK") || FIELDS[0];
  const spot = flight ? runwayStart(homeField) : city.spawn;
  const player = createPlayer(spot);
  player.flight = flight;
  const sim = createSim(city, index, flight);
  sim.craft = world.craft;
  const audio = createAudio();
  const ui = createUI(city, index);
  world.setQuality(flight ? 1 : 2, renderer);

  player.y = world.surface(player.x, player.z, player.y) + 0.45;

  const parkPlane = (field) => {
    const next = runwayStart(field);
    resetPlayer(player, next);
    player.flight = true;
    player.y = world.surface(next.x, next.z, player.y) + 0.45;
  };

  renderer.domElement.addEventListener("click", () => {
    audio.unlock();
    if (!ui.mapOpen) renderer.domElement.requestPointerLock?.();
  });
  window.addEventListener("mousemove", (e) => {
    if (document.pointerLockElement !== renderer.domElement) return;
    lookX -= e.movementX * 0.0025;
    lookY = Math.max(-0.6, Math.min(1.1, lookY - e.movementY * 0.002));
  });

  ui.actions.onAct = (act) => {
    audio.unlock();
    if (act === "home") parkPlane(homeField);
  };
  ui.actions.onPin = (sight) => {
    sim.pin = sight;
    ui.closeMap();
  };

  window.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    audio.unlock();
    if (e.code === "KeyH") ui.toggleHelp();
    if (e.code === "KeyM") ui.toggleMap(player);
    if (e.code === "Escape") {
      if (ui.mapOpen) ui.closeMap();
      document.exitPointerLock?.();
    }
    if (e.code === "KeyB" || e.code === "Home") parkPlane(homeField);
    if (e.code === "KeyR") parkPlane(nearestField(city.fields, player.x, player.z));
    if (e.code === "KeyV") cabin = !cabin;
    if (e.code === "KeyT") {
      world.setTime(world.time + 1);
      const names = ["morning", "day", "evening"];
      sim.toast = "Time of day: " + names[world.time];
      sim.toastT = 1.4;
    }
    if (e.code === "KeyP") return;
    if (e.code === "AltLeft" || e.code === "AltRight") {
      e.preventDefault();
      player.weapon = player.weapon ? 0 : 1;
      sim.toast = player.weapon ? "Missiles" : "Machine gun";
      sim.toastT = 1.4;
    }
    if (e.code === "KeyG" && player.flight) {
      e.preventDefault();
      if (!player.flying) {
        sim.toast = "Gear stays down on the ground";
        sim.toastT = 1.3;
      } else {
        player.gearDown = !player.gearDown;
        sim.toast = player.gearDown ? "Gear down" : "Gear up";
        sim.toastT = 1.3;
      }
    }
    if (e.code === "KeyF" && player.flight) {
      e.preventDefault();
      if (player.jets) {
        player.flaps = 0;
        sim.toast = "Jet mode keeps the flaps clean";
      } else {
        player.flaps = player.flaps > 0.5 ? 0 : 1;
        sim.toast = player.flaps ? "Flaps · landing · stall 60 km/h" : "Flaps · combat · stall 130 km/h";
      }
      sim.toastT = 1.6;
    }
    if (e.code === "CapsLock") {
      e.preventDefault();
      player.jets = !player.jets;
      if (player.jets) {
        player.flaps = 0;
        player.throttle = Math.max(player.throttle || 0, 0.4);
        if (player.speed < 40) player.speed = 40;
      }
      sim.toast = player.jets ? "Jet mode · flaps clean · 2400 km/h" : "Jet mode off · 500 km/h";
      sim.toastT = 1.8;
    }
    if (e.code === "Backquote") ui.toggleHidden();
    if (e.code === "Enter" && retryHint(sim)) {
      clearRetry(sim);
      sim.callT = 1.2;
    }
    if (ui.mapOpen) {
      if (e.code === "Equal" || e.code === "NumpadAdd") ui.zoomMap(0.85);
      if (e.code === "Minus" || e.code === "NumpadSubtract") ui.zoomMap(1.15);
      if (e.code === "Space") ui.recenter(player);
    }
  });

  let last = performance.now();
  let hadLock = false;
  let wasWreck = false;
  let wasSpin = false;
  let stallT = 0;
  let warnT = 0;
  let atc = "";
  let atcT = 0;
  const tower = { cleared: 0, gear: 0, fast: 0 };
  sim.kills = sim.kills || 0;
  sim.tags = [];

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const paused = ui.paused;
    const input = readInput(player);
    if (ui.mapOpen) {
      if (keys.has("ArrowLeft") || keys.has("KeyA")) ui.nudgeMap(-18, 0);
      if (keys.has("ArrowRight") || keys.has("KeyD")) ui.nudgeMap(18, 0);
      if (keys.has("ArrowUp") || keys.has("KeyW")) ui.nudgeMap(0, 18);
      if (keys.has("ArrowDown") || keys.has("KeyS")) ui.nudgeMap(0, -18);
    }
    if (!paused) {
      updatePlayer(player, input, dt, world);
      updateSim(sim, player, dt, input);
      const fx = world.stepCombat(player, input, dt);
      if (fx.shot) audio.shot(fx.missile);
      if (fx.boom) audio.boom();
      if (player.lock && !hadLock) audio.lock();
      hadLock = !!player.lock;
      if (player.stallWarn) {
        stallT -= dt;
        if (stallT <= 0) {
          audio.stall();
          stallT = 0.42;
        }
      } else stallT = 0;
      if (player.warning) {
        warnT -= dt;
        if (warnT <= 0) {
          audio.warn();
          warnT = 0.48;
        }
      } else warnT = 0;
      if (player.spin && !wasSpin) {
        sim.toast = "Stall · spin — add power";
        sim.toastT = 1.8;
      }
      wasSpin = !!player.spin;
      if (fx.kills) {
        sim.kills += fx.kills;
        sim.sortieGot = (sim.sortieGot || 0) + fx.kills;
        sim.toast = fx.kills > 1 ? fx.kills + " drones down" : "Drone down";
        sim.toastT = 1.6;
      }
      if (fx.empty) {
        sim.toast = "Missiles empty · land to rearm";
        sim.toastT = 1.2;
      }
      if (fx.broke) {
        sim.toast = "Missile broken";
        sim.toastT = 1.3;
      }
      if (fx.hit) {
        sim.toast = "Hit";
        sim.toastT = 1.3;
      }
      if (player.wrecked && !wasWreck) {
        sim.toast = "Aircraft destroyed";
        sim.toastT = 2.6;
      }
      wasWreck = !!player.wrecked;
      for (const tag of fx.tags || []) sim.tags.push({ ...tag, life: 1.5 });
      for (const tag of sim.tags) tag.life -= dt;
      sim.tags = sim.tags.filter((tag) => tag.life > 0);
      if (player.flying) {
        const field = nearestField(city.fields, player.x, player.z);
        const dist = Math.hypot(player.x - field.x, player.z - field.z);
        const agl = player.y - world.elevation(player.x, player.z);
        const kmh = Math.abs(player.speed) * 3.6;
        const nowMs = now;
        const call = (key, gap, line) => {
          if (nowMs - tower[key] < gap) return;
          tower[key] = nowMs;
          audio.say(line);
          atc = line;
          atcT = 2.4;
        };
        const approach = player.vy < 6 && agl < 700;
        if (dist < 5500 && dist > 350 && approach) call("cleared", 22000, "Cleared to land");
        if (dist < 2600 && agl < 320 && player.vy < 4 && player.gearDown === false) call("gear", 9000, "Gear");
        const fast = player.flaps > 0.5 ? 190 : 240;
        if (dist < 2400 && agl < 280 && player.vy < 4 && kmh > fast) call("fast", 8000, "Too fast");
      }
      if (atcT > 0) atcT -= dt;
      else atc = "";
      if (player.shake > 0) player.shake = Math.max(0, player.shake - dt);
      audio.setDrive(player.speed, player.jets, true);
      audio.tick();
    }
    world.sync(player, sim, dt);

    const dist = cabin
      ? 0.2
      : player.flying
        ? 22 + Math.min(70, Math.abs(player.speed) * 0.1)
        : 16;
    const airView = player.flying || player.y - world.elevation(player.x, player.z) > 45;
    const far = airView ? 48000 : 9000;
    const near = !airView ? 0.25 : cabin ? 0.05 : Math.min(6, Math.max(0.5, dist * 0.18));
    if (camera.far !== far || camera.near !== near) {
      camera.near = near;
      camera.far = far;
      camera.updateProjectionMatrix();
    }

    const hy = player.heading + (cabin ? lookX : lookX * 0.35);
    bodyEuler.set(-(player.pitch || 0), hy, -(player.roll || 0));
    bodyQuat.setFromEuler(bodyEuler);
    const gap = Math.hypot(player.x - camera.position.x, player.y - camera.position.y, player.z - camera.position.z);
    if (cabin || !chaseReady || gap > 500) {
      camQuat.copy(bodyQuat);
      chaseReady = true;
    } else {
      const align = Math.abs(camQuat.dot(bodyQuat));
      const tau = align < 0.8 ? 0.04 : 0.14;
      camQuat.slerp(bodyQuat, 1 - Math.exp(-dt / tau));
    }
    camNose.set(0, 0, 1).applyQuaternion(camQuat);
    camUpV.set(0, 1, 0).applyQuaternion(camQuat);
    const above = cabin ? 1.15 : 7.4 + lookY * 2.2;
    camTarget.set(
      player.x - camNose.x * dist + camUpV.x * above,
      player.y - camNose.y * dist + camUpV.y * above,
      player.z - camNose.z * dist + camUpV.z * above,
    );
    camera.position.copy(camTarget);
    for (let n = 0; n < 6; n++) {
      const clip = world.push(camera.position.x, camera.position.z, camera.position.y, 0.4);
      if (!clip.hit) break;
      const dx = player.x - camera.position.x;
      const dz = player.z - camera.position.z;
      const len = Math.hypot(dx, dz) || 1;
      camera.position.x += (dx / len) * 2.4;
      camera.position.z += (dz / len) * 2.4;
    }
    const wantFov = player.jets && player.flying ? 84 : 68;
    camFov += (wantFov - camFov) * Math.min(1, dt * 1.8);
    if (Math.abs(camera.fov - camFov) > 0.08) {
      camera.fov = camFov;
      camera.updateProjectionMatrix();
    }
    if (cabin) {
      const rolled = wrapRoll(player.roll || 0);
      camBank += (-rolled * 0.85 - camBank) * Math.min(1, dt * 4);
      camera.rotation.order = "YXZ";
      camera.rotation.y = hy + Math.PI;
      camera.rotation.x = -player.pitch + lookY;
      camera.rotation.z = camBank;
    } else {
      camera.up.copy(camUpV);
      if (camera.up.lengthSq() < 1e-6) camera.up.set(0, 1, 0);
      else camera.up.normalize();
      lookAt.set(player.x + camNose.x * 16, player.y + camNose.y * 16, player.z + camNose.z * 16);
      camera.lookAt(lookAt);
    }
    if (player.shake > 0) {
      camera.position.x += (Math.random() - 0.5) * player.shake * 3.2;
      camera.position.y += (Math.random() - 0.5) * player.shake * 1.8;
    }

    const pad = player.flight ? fieldAt(city.fields, player.x, player.z) : null;
    const street = pad?.name || (onRoad(index, player.x, player.z) || nearestRoad(index, player.x, player.z, 30))?.name || "";
    const nearSight = nearestSight(sim, player.x, player.z);
    const pinScreen = sim.pin ? projectPin(camera, sim.pin, player, window.innerWidth, window.innerHeight) : null;
    const lockScreen = player.lockPos ? projectPin(camera, player.lockPos, player, window.innerWidth, window.innerHeight) : null;
    const leadScreen = player.leadPos ? projectPin(camera, player.leadPos, player, window.innerWidth, window.innerHeight) : null;
    const tags = sim.tags.map((tag) => {
      const sp = projectPin(camera, tag, player, window.innerWidth, window.innerHeight);
      return sp.edge ? null : { x: sp.x, y: sp.y, text: tag.text, life: tag.life };
    }).filter(Boolean);
    ui.update({
      player,
      sim,
      street,
      camera,
      nearSight,
      pinScreen,
      lockScreen,
      leadScreen,
      tags,
      atc: atcT > 0 ? atc : "",
    });
    try {
      renderer.render(world.scene, camera);
    } catch (err) {
      const box = document.querySelector("#loading");
      box.classList.remove("done");
      box.querySelector(".msg").textContent = err.message;
    }
    requestAnimationFrame(frame);
  };

  setLoad("Ready to fly", 1);
  loading.classList.add("done");
  frame(performance.now());
}

boot().catch((err) => {
  console.error(err);
  loadMsg.textContent = err.message || "Failed to load";
});
