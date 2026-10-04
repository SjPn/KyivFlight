import * as THREE from "three";
import { createAudio } from "./audio.js?v=39";
import { readElev } from "./elev.js";
import { clearPlazas, indexCity, nearestRoad, onRoad, openStreets, presentEast } from "./geo.js?v=70";
import { decodeCity } from "./mapio.js?v=2";
import { FIELDS, fieldAt, nearestField, runwayStart } from "./airfields.js?v=2";
import { createPlayer, resetPlayer, updatePlayer } from "./player.js?v=93";
import { armSortie, clearRetry, createSim, nearestSight, pickSortie, restartSortie, retryHint, updateSim } from "./sim.js?v=70";
import { isPhone, mountTouch, touchAxes } from "./touch.js?v=5";
import { createUI } from "./ui.js?v=100";
import { createWorld } from "./world.js?v=127";

const app = document.querySelector("#app");
const loading = document.querySelector("#loading");
const loadMsg = loading.querySelector(".msg");
const loadBar = loading.querySelector(".bar i");
const takeoff = loading.querySelector(".takeoff");
let briefing = true;

function dismissBrief() {
  if (!briefing || !loading.classList.contains("ready")) return;
  briefing = false;
  keys.clear();
  loading.classList.add("done");
}

function setLoad(text, t) {
  loadMsg.textContent = text;
  loadBar.style.transform = `scaleX(${Math.max(0.02, Math.min(1, t))})`;
}

function bootClock() {
  const t0 = performance.now();
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem("kievride-boot") || "null"); } catch { saved = null; }
  const weights = saved && saved.world > 0 ? saved : { fetch: 6, read: 4, streets: 12, index: 8, world: 14 };
  const order = ["fetch", "read", "streets", "index", "world"];
  const prog = { fetch: 0, read: 0, streets: 0, index: 0, world: 0 };
  const sum = order.reduce((s, id) => s + (weights[id] || 1), 0);
  function show() {
    const done = order.reduce((s, id) => s + (weights[id] || 1) * prog[id], 0);
    const p = done / sum;
    const elapsed = performance.now() - t0;
    const left = p > 0.03 ? (elapsed * (1 - p)) / p : 12000;
    const secs = Math.max(0, Math.ceil(left / 1000));
    setLoad(secs > 0 ? `Mapping Kyiv… ${secs} s` : "A moment…", Math.max(0.02, Math.min(0.99, p)));
  }
  return {
    set(id, value) {
      prog[id] = Math.max(0, Math.min(1, value));
      show();
    },
    finish(measured) {
      try { localStorage.setItem("kievride-boot", JSON.stringify(measured)); } catch { /* keep the last good timing */ }
      setLoad("Runway is clear", 1);
      loading.classList.add("ready");
      if (takeoff) {
        takeoff.disabled = false;
        takeoff.textContent = "Take off";
      }
    },
  };
}

async function fetchCounted(url, onBytes, missing) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(missing);
  const total = Number(res.headers.get("x-size")) || Number(res.headers.get("content-length")) || 0;
  if (!res.body || !res.body.getReader) {
    const buf = new Uint8Array(await res.arrayBuffer());
    onBytes(buf.byteLength, total || buf.byteLength);
    return buf;
  }
  const reader = res.body.getReader();
  const parts = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    got += value.byteLength;
    onBytes(got, total || got);
  }
  const out = new Uint8Array(got);
  let off = 0;
  for (const part of parts) {
    out.set(part, off);
    off += part.byteLength;
  }
  return out;
}

const yieldPaint = () => new Promise((resolve) => setTimeout(resolve, 0));
const DATA_CACHE = "kievride-data-v52";

async function fetchCached(url, onBytes, missing) {
  if (typeof caches !== "undefined") {
    try {
      const cache = await caches.open(DATA_CACHE);
      const hit = await cache.match(url);
      if (hit) {
        const buf = new Uint8Array(await hit.arrayBuffer());
        onBytes(buf.byteLength, buf.byteLength);
        return buf;
      }
    } catch { /* private mode */ }
  }
  const buf = await fetchCounted(url, onBytes, missing);
  if (typeof caches !== "undefined") {
    try {
      const cache = await caches.open(DATA_CACHE);
      await cache.put(url, new Response(buf.slice()));
    } catch { /* keep the memory copy */ }
  }
  return buf;
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
const bodyQuat = new THREE.Quaternion();
const lookYaw = new THREE.Quaternion();
const camQuat = new THREE.Quaternion();
const camNose = new THREE.Vector3();
const camUpV = new THREE.Vector3();
let chaseReady = false;
let camBank = 0;
let camFov = 68;
let viewDist = 16;

takeoff?.addEventListener("click", dismissBrief);

window.addEventListener("keydown", (e) => {
  if (briefing) {
    e.stopPropagation();
    if (!e.repeat && (e.code === "Enter" || e.code === "NumpadEnter")) {
      e.preventDefault();
      dismissBrief();
    }
    return;
  }
  const chord = (e.ctrlKey || e.metaKey) && (e.code === "KeyW" || e.key === "w" || e.key === "W");
  if (chord) {
    e.preventDefault();
    e.stopPropagation();
  }
  if (e.repeat) return;
  keys.add(e.code);
  if (chord || ["Tab", "Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Equal", "Minus", "NumpadAdd", "NumpadSubtract", "KeyW", "KeyA", "KeyS", "KeyD", "KeyC", "KeyF", "KeyG", "AltLeft", "AltRight", "ControlLeft", "ControlRight", "CapsLock"].includes(e.code)) e.preventDefault();
}, true);
window.addEventListener("keyup", (e) => keys.delete(e.code));
window.addEventListener("blur", () => keys.clear());

function wrapRoll(a) {
  const t = Math.PI * 2;
  a %= t;
  if (a > Math.PI) a -= t;
  if (a < -Math.PI) a += t;
  return a;
}

const RANGE_WORDS = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen", "Twenty", "Twenty-one", "Twenty-two", "Twenty-three", "Twenty-four", "Twenty-five"];

function rangeWords(meters, cap) {
  const n = Math.max(1, Math.min(cap, Math.round((meters || 0) / 1000)));
  return RANGE_WORDS[n] + (n === 1 ? " kilometer." : " kilometers.");
}

function foxLine(meters) {
  if (meters == null || meters < 800) return "Fox two. Fox two.";
  return "Fox two. " + rangeWords(meters, 15);
}

function steerTo(h, target) {
  let d = target - h;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function readInput(player, mapOpen = false) {
  const pads = navigator.getGamepads?.() || [];
  const gp = pads[0];
  const ax = gp ? gp.axes[0] || 0 : 0;
  const thrustUp = keys.has("NumpadAdd") || keys.has("Equal") || (!mapOpen && keys.has("ArrowUp"));
  const thrustDown = keys.has("NumpadSubtract") || keys.has("Minus") || (!mapOpen && keys.has("ArrowDown"));
  if (player.flight) {
    return {
      accel: thrustUp || (gp?.buttons[7]?.value > 0.15),
      decel: thrustDown || (gp?.buttons[6]?.value > 0.15),
      left: keys.has("KeyA") || ax < -0.2,
      right: keys.has("KeyD") || ax > 0.2,
      noseUp: keys.has("KeyS") || !!gp?.buttons[3]?.pressed,
      noseDown: keys.has("KeyW") || !!gp?.buttons[0]?.pressed,
      fire: keys.has("Space") || !!gp?.buttons[1]?.pressed,
      flare: keys.has("KeyC") || !!gp?.buttons[5]?.pressed,
      yawLeft: !mapOpen && keys.has("ArrowLeft"),
      yawRight: !mapOpen && keys.has("ArrowRight"),
      stick: touchAxes(),
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
  const clock = bootClock();
  clock.set("fetch", 0.01);
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

  const got = { map: 0, elev: 0 };
  const totals = { map: 0, elev: 0 };
  const noteFetch = () => {
    const all = (totals.map || got.map) + (totals.elev || got.elev);
    const have = got.map + got.elev;
    clock.set("fetch", all ? have / all : 0.01);
  };
  const tFetch = performance.now();
  const onMap = (n, t) => { got.map = n; totals.map = t; noteFetch(); };
  const onElev = (n, t) => { got.elev = n; totals.elev = t; noteFetch(); };
  const loadChart = async () => {
    try {
      return { bin: true, bytes: await fetchCached("/data/kyiv.bin?v=52", onMap, "nomap") };
    } catch (err) {
      if (!/nomap/i.test(err.message || "")) throw err;
      return { bin: false, bytes: await fetchCached("/data/kyiv.json?v=49", onMap, "Map missing. Run npm run map") };
    }
  };
  const [chart, elevBytes] = await Promise.all([
    loadChart(),
    fetchCached("/data/elev.bin?v=49", onElev, "Elevation grid missing"),
  ]);
  clock.set("fetch", 1);
  await yieldPaint();
  const tRead = performance.now();
  readElev(elevBytes.buffer);
  let city;
  let index;
  let tStreets = tRead;
  let tIndex = tRead;
  if (chart.bin) {
    const decoded = decodeCity(chart.bytes);
    city = decoded.city;
    index = decoded.index;
    applyEnglish(city);
    tIndex = performance.now();
    clock.set("read", 1);
    clock.set("streets", 1);
    clock.set("index", 1);
  } else {
    city = JSON.parse(new TextDecoder().decode(chart.bytes));
    if (!city.roads?.length) throw new Error("The map is empty");
    clock.set("read", 1);
    await yieldPaint();
    tStreets = performance.now();
    presentEast(city);
    openStreets(city);
    clearPlazas(city);
    applyEnglish(city);
    clock.set("streets", 1);
    await yieldPaint();
    tIndex = performance.now();
    index = indexCity(city);
    clock.set("index", 1);
  }
  if (!city.roads?.length) throw new Error("The map is empty");
  await yieldPaint();
  const tWorld = performance.now();
  // Driving is switched off. The street mesh stays so the city reads from the air.
  const flight = true;
  city.flight = true;
  city.fields = FIELDS;
  const world = createWorld(city, index, flight);
  const bootMeasured = {
    fetch: Math.max(1, tRead - tFetch),
    read: Math.max(1, tStreets - tRead),
    streets: Math.max(1, tIndex - tStreets),
    index: Math.max(1, tWorld - tIndex),
    world: Math.max(1, performance.now() - tWorld),
  };
  const homeField = FIELDS.find((f) => f.icao === "UKKK") || FIELDS[0];
  const spot = flight ? runwayStart(homeField) : city.spawn;
  const player = createPlayer(spot);
  player.flight = flight;
  const sim = createSim(city, index, flight);
  sim.craft = world.craft;
  armSortie(sim, player);
  const audio = createAudio();
  const ui = createUI(city, index);
  world.setQuality(flight ? 1 : 2, renderer);

  player.y = world.surface(player.x, player.z, player.y) + 0.45;

  const parkPlane = (field) => {
    const next = runwayStart(field);
    resetPlayer(player, next);
    player.flight = true;
    player.y = world.surface(next.x, next.z, player.y) + 0.45;
    restartSortie(sim, player);
  };

  const holdFlightKeys = async () => {
    renderer.domElement.requestPointerLock?.();
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      await navigator.keyboard?.lock?.();
    } catch {
      // Without fullscreen the browser still treats Ctrl+W as "close tab".
    }
  };
  document.addEventListener("fullscreenchange", () => {
    if (!document.fullscreenElement) navigator.keyboard?.unlock?.();
  });
  renderer.domElement.addEventListener("click", () => {
    audio.unlock();
    if (isPhone()) return;
    if (!ui.mapOpen) holdFlightKeys();
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
  ui.actions.onVoice = () => audio.toggleVoice();
  ui.setVoice(audio.voiceOn());
  ui.actions.onPin = (sight) => {
    sim.pin = sight;
    ui.closeMap();
  };
  ui.actions.onSortie = (id) => {
    pickSortie(sim, player, id);
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
    if (e.code === "Tab" && !ui.mapOpen) player.cycleLock = true;
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
    }
    const approach = player.flying && !player.wrecked && (player.agl ?? 999) < 180;
    if (e.code === "KeyG" && player.flight) {
      e.preventDefault();
      if (!approach) {
        sim.toast = "Gear comes down on approach";
        sim.toastT = 1.4;
      } else {
        player.gearDown = !player.gearDown;
        sim.toast = player.gearDown ? "Gear down" : "Gear up";
        sim.toastT = 1.3;
      }
    }
    if (e.code === "KeyF" && player.flight) {
      e.preventDefault();
      const onGround = !player.flying && !player.wrecked;
      if (player.jets) {
        player.flaps = 0;
        sim.toast = "Jet mode keeps the flaps clean";
      } else if (!onGround && !approach) {
        sim.toast = "Flaps come down on approach";
      } else {
        player.flaps = player.flaps > 0.5 ? 0 : 1;
        sim.toast = player.flaps ? "Flaps · stall 60 km/h" : "Flaps up";
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

  if (isPhone()) {
    takeoff?.addEventListener("click", () => audio.unlock());
    window.addEventListener("touchlook", (e) => {
      lookX -= e.detail.dx * 0.0045;
      lookY = Math.max(-0.6, Math.min(1.1, lookY - e.detail.dy * 0.0036));
    });
    mountTouch({ keys, unlock: () => audio.unlock() });
  }

  let last = performance.now();
  let hadLock = false;
  let hadFixed = false;
  let wasWreck = false;
  let wasSpin = false;
  let stallT = 0;
  let pullT = 0;
  const altSaid = new Set();
  const altGates = [
    [500, "Five hundred."],
    [200, "Two hundred."],
    [100, "One hundred."],
    [50, "Fifty."],
    [30, "Thirty."],
    [15, "Fifteen."],
  ];
  let warnT = 0;
  sim.kills = sim.kills || 0;
  sim.tags = [];

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const paused = ui.paused || briefing;
    const input = readInput(player, ui.mapOpen);
    if (ui.mapOpen) {
      if (keys.has("ArrowLeft") || keys.has("KeyA")) ui.nudgeMap(-18, 0);
      if (keys.has("ArrowRight") || keys.has("KeyD")) ui.nudgeMap(18, 0);
      if (keys.has("ArrowUp") || keys.has("KeyW")) ui.nudgeMap(0, 18);
      if (keys.has("ArrowDown") || keys.has("KeyS")) ui.nudgeMap(0, -18);
    }
    if (!paused) {
      updatePlayer(player, input, dt, world);
      if (player.touched) {
        player.touched = false;
        audio.touch(player.touchFirm || 0);
      }
      const fx = world.stepCombat(player, input, dt, sim.plan);
      updateSim(sim, player, dt, fx);
      if (sim.openChart) {
        sim.openChart = false;
        ui.showMap(player);
      }
      if (sim.closeChart) {
        sim.closeChart = false;
        ui.closeMap();
      }
      if (sim.line && !sim.voiced[sim.line.id] && audio.callout(sim.line.text, sim.line.pri)) {
        sim.voiced[sim.line.id] = true;
      }
      if (fx.shot) audio.shot(fx.missile);
      else if (fx.launch) audio.shot(true);
      if (fx.missile) audio.callout(foxLine(player.shotRange), 3);
      if (fx.flare) audio.flare();
      if (fx.boom) audio.boom();
      if (player.flying && !player.wrecked && player.lock && !hadLock) audio.lock();
      hadLock = !!(player.flying && !player.wrecked && player.lock);
      const fixing = player.flying && !player.wrecked && player.fixed && (player.missiles ?? 0) > 0;
      if (fixing && !hadFixed) audio.callout("Target locked.", 3);
      hadFixed = fixing;
      if (player.stallWarn || player.stalling) {
        stallT -= dt;
        if (stallT <= 0) {
          audio.callout("Stall. Stall.", 2);
          stallT = player.stalling ? 1.05 : 1.4;
        }
      } else stallT = 0;
      if (player.flying && !player.wrecked) {
        const agl = player.agl ?? 9999;
        if ((player.vy || 0) < -1) {
          let due = null;
          for (const [gate, phrase] of altGates) {
            if (agl <= gate && !altSaid.has(gate)) due = [gate, phrase];
          }
          if (due && audio.callout(due[1], 1)) {
            for (const [gate] of altGates) if (gate >= due[0]) altSaid.add(gate);
          }
        }
        for (const [gate] of altGates) {
          if (agl > gate + 35) altSaid.delete(gate);
        }
        const overPad = fieldAt(city.fields, player.x, player.z);
        if (!overPad && agl < 160 && player.vy < -14) {
          pullT -= dt;
          if (pullT <= 0) {
            audio.callout("Pull up. Pull up.", 4);
            pullT = 2.4;
          }
        } else pullT = 0;
      }
      if (fx.launch) {
        if (!sim.voiced.flares && audio.callout("Break. Flares.", 4)) {
          sim.voiced.flares = true;
          sim.flareCue = 6;
        } else if (sim.voiced.flares) audio.callout("Missile. Missile.", 4);
      }
      const missileNear = player.missileDist;
      const missileClose = missileNear != null && missileNear < 240 && player.flying && !player.wrecked;
      if (missileClose) {
        audio.threat(true, 1 - missileNear / 240);
      } else {
        audio.threat(false);
        if (missileNear != null && player.flying && !player.wrecked) {
          const near = Math.max(0, Math.min(1, missileNear / 1900));
          warnT -= dt;
          if (warnT <= 0) {
            audio.warn(1 - near);
            warnT = 0.08 + near * 0.64;
          }
        } else if (player.warning) {
          warnT -= dt;
          if (warnT <= 0) {
            audio.warn(0);
            warnT = 0.62;
          }
        } else warnT = 0;
      }
      if (player.spin && !wasSpin) {
        sim.toast = "Spin — add power";
        sim.toastT = 1.8;
      }
      wasSpin = !!player.spin;
      if (fx.kills) {
        sim.kills += fx.kills;
        sim.toast = fx.banditKills ? (fx.banditKills > 1 ? fx.banditKills + " enemy down" : "Enemy down") : (fx.kills > 1 ? fx.kills + " drones down" : "Drone down");
        sim.toastT = 1.6;
      }
      if (fx.raid) {
        const lead = fx.raid > 2 ? "Four, east, " : fx.raid > 1 ? "Two, east, " : "Bandit, east, ";
        const call = lead + rangeWords(fx.raidRange || 12000, 25);
        audio.callout(call, 3);
        sim.toast = call;
        sim.toastT = 2.4;
      }
      if (fx.empty) {
        sim.toast = "Missiles empty · land to rearm";
        sim.toastT = 1.2;
      }
      if (fx.gunEmpty) {
        sim.toast = "Gun empty · land to rearm";
        sim.toastT = 1.2;
      }
      if (fx.flareEmpty) {
        sim.toast = "Flares empty · land to rearm";
        sim.toastT = 1.2;
      }
      if (fx.spoofed) {
        sim.toast = "Missile decoyed";
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
      if (player.shake > 0) player.shake = Math.max(0, player.shake - dt);
      audio.setDrive(player.speed, player.jets, true, player.throttle || 0);
    } else audio.threat(false);
    world.sync(player, sim, dt);

    const dist = cabin
      ? 3.4
      : player.flying
        ? 22 + Math.min(70, Math.abs(player.speed) * 0.1)
        : 16;
    const airView = player.flying || player.y - world.elevation(player.x, player.z) > 45;
    const far = airView ? 48000 : 9000;
    const near = !airView ? 0.25 : cabin ? 0.2 : Math.min(6, Math.max(0.5, dist * 0.18));
    if (camera.far !== far || camera.near !== near) {
      camera.near = near;
      camera.far = far;
      camera.updateProjectionMatrix();
    }

    bodyQuat.set(player.qx || 0, player.qy || 0, player.qz || 0, player.qw == null ? 1 : player.qw);
    if (lookX) {
      const yaw = lookX * (cabin ? 0.45 : 0.35) * 0.5;
      lookYaw.set(0, Math.sin(yaw), 0, Math.cos(yaw));
      bodyQuat.multiply(lookYaw);
    }
    const gap = Math.hypot(player.x - camera.position.x, player.y - camera.position.y, player.z - camera.position.z);
    if (cabin || !chaseReady || gap > 500) {
      camQuat.copy(bodyQuat);
      chaseReady = true;
      viewDist = dist;
    } else {
      const align = Math.abs(camQuat.dot(bodyQuat));
      const tau = align < 0.8 ? 0.04 : 0.18;
      camQuat.slerp(bodyQuat, 1 - Math.exp(-dt / tau));
      viewDist += (dist - viewDist) * (1 - Math.exp(-dt / 0.28));
    }
    camNose.set(0, 0, 1).applyQuaternion(camQuat);
    camUpV.set(0, 1, 0).applyQuaternion(camQuat);
    const above = cabin ? 3.35 : 7.4 + lookY * 2.2;
    camTarget.set(
      player.x - camNose.x * viewDist + camUpV.x * above,
      player.y - camNose.y * viewDist + camUpV.y * above,
      player.z - camNose.z * viewDist + camUpV.z * above,
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
    const wantFov = cabin ? 90 : player.jets && player.flying ? 84 : 68;
    camFov += (wantFov - camFov) * Math.min(1, dt * 1.8);
    if (Math.abs(camera.fov - camFov) > 0.08) {
      camera.fov = camFov;
      camera.updateProjectionMatrix();
    }
    if (cabin) {
      camera.quaternion.copy(bodyQuat);
      lookYaw.set(0, 1, 0, 0);
      camera.quaternion.multiply(lookYaw);
      const px = (lookY - 0.32) * 0.5;
      lookYaw.set(Math.sin(px), 0, 0, Math.cos(px));
      camera.quaternion.multiply(lookYaw);
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

  clock.finish(bootMeasured);
  frame(performance.now());
}

boot().catch((err) => {
  console.error(err);
  loadMsg.textContent = err.message || "Failed to load";
});
