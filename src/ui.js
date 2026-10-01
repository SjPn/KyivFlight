import { cellsAround } from "./geo.js?v=67";

function showRoad(cls, mpp) {
  if (cls === "motorway" || cls === "trunk" || cls === "primary") return true;
  if (cls === "secondary") return mpp <= 110;
  if (cls === "tertiary" || cls === "unclassified") return mpp <= 80;
  return mpp <= 36;
}


function kbd(s) {
  return `<kbd>${s}</kbd>`;
}

function row(keys, text) {
  return `<div class="r"><div class="k">${keys}</div><div class="t">${text}</div></div>`;
}

function latinize(text) {
  const map = {
    а: "a", б: "b", в: "v", г: "h", ґ: "g", д: "d", е: "e", є: "ie", ж: "zh", з: "z",
    и: "y", і: "i", ї: "i", й: "i", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p",
    р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch",
    ь: "", ю: "iu", я: "ia", "'": "", "’": "", "ʼ": "",
  };
  return text.replace(/./g, (ch) => {
    const low = ch.toLowerCase();
    const next = map[low];
    if (next == null) return ch;
    return ch === low ? next : next.charAt(0).toUpperCase() + next.slice(1);
  });
}

function stripKind(name) {
  return name
    .replace(/^вулиця\s+/i, "")
    .replace(/\s+вулиця$/i, "")
    .replace(/^бульвар\s+/i, "")
    .replace(/\s+бульвар$/i, " Blvd")
    .replace(/^проспект\s+/i, "")
    .replace(/\s+проспект$/i, " Ave")
    .replace(/^провулок\s+/i, "")
    .replace(/\s+провулок$/i, " Ln")
    .replace(/^площа\s+/i, "")
    .replace(/\s+площа$/i, " Sq")
    .replace(/^узвіз\s+/i, "")
    .replace(/\s+узвіз$/i, " Descent")
    .replace(/^набережна\s+/i, "")
    .replace(/\s+набережна$/i, " Emb")
    .replace(/^шосе\s+/i, "")
    .replace(/\s+шосе$/i, " Hwy")
    .replace(/^алея\s+/i, "")
    .replace(/\s+алея$/i, " Alley")
    .replace(/^проїзд\s+/i, "")
    .replace(/\s+проїзд$/i, " Ln")
    .replace(/^тупик\s+/i, "")
    .replace(/\s+тупик$/i, " Close")
    .replace(/^дорога\s+/i, "")
    .replace(/\s+дорога$/i, " Rd")
    .replace(/^vulytsia\s+/i, "")
    .replace(/\s+vulytsia$/i, "")
    .replace(/^bulvar\s+/i, "")
    .replace(/\s+bulvar$/i, " Blvd")
    .replace(/^prospekt\s+/i, "")
    .replace(/\s+prospekt$/i, " Ave")
    .replace(/^provulok\s+/i, "")
    .replace(/\s+provulok$/i, " Ln")
    .replace(/^ploshcha\s+/i, "")
    .replace(/\s+ploshcha$/i, " Sq")
    .replace(/^uzviz\s+/i, "")
    .replace(/\s+uzviz$/i, " Descent")
    .replace(/^naberezhna\s+/i, "")
    .replace(/\s+naberezhna$/i, " Emb")
    .replace(/^aleia\s+/i, "")
    .replace(/\s+aleia$/i, " Alley")
    .replace(/^proizd\s+/i, "")
    .replace(/\s+proizd$/i, " Ln");
}

const KNOWN = [
  [/heroes? of the heavenly hundred|heroiv nebesnoi sotni/i, "Alley of the Heavenly Hundred"],
  [/khreshchatyk/i, "Khreshchatyk"],
  [/maidan nezalezhnosti|independence square/i, "Independence Square"],
  [/andriivskyi|andriyivskyi/i, "Andriivskyi Descent"],
  [/volodymyrskyi uzviz|volodymyrskyi descent/i, "Volodymyrskyi Descent"],
  [/bankova/i, "Bankova Street"],
  [/mykhaila hrushevskoho|hrushevskoho/i, "Hrushevskoho Street"],
  [/saksahanskoho/i, "Saksahanskoho Street"],
  [/velyka vasylkivska|chervonoarmiiska/i, "Velyka Vasylkivska Street"],
  [/bessarabska/i, "Bessarabska Square"],
  [/ievropeiska|yevropeiska/i, "European Square"],
];

function knownPlace(name) {
  for (const [re, label] of KNOWN) if (re.test(name)) return label;
  return name;
}

export function shortStreet(name) {
  if (!name) return "";
  return knownPlace(stripKind(latinize(stripKind(String(name)))));
}

function englishLine(text) {
  if (!text) return "";
  return String(text).replace(/[А-Яа-яІіЇїЄєҐґ][^·,]*/gu, (chunk) => shortStreet(chunk.trim()));
}

export function createUI(city, index) {
  const root = document.createElement("div");
  root.className = "hud";
  root.innerHTML = `
    <div class="topbar">
      <button class="key help" data-act="help"><i>H</i><span>Controls</span></button>
      <button class="key" data-act="home"><i>B</i><span>Restart</span></button>
      <div class="panel off"><div class="ttl"></div><div class="obj"></div><div class="row"><div class="bl"></div><div class="bar"><i></i></div><div class="tm"></div></div></div>
    </div>
    <div class="banner"><small></small></div>
    <div class="toast"></div>
    <div class="meters">
      <div class="thr"><b>THR</b><i><em></em></i><span>0%</span></div>
      <div class="land off"><b>LAND</b><i><s></s><em></em></i></div>
    </div>
    <div class="speed"><div class="street"></div><div class="v">0</div><div class="u">KM/H</div></div>
    <div class="radar">
      <div class="cap"><span>RADAR</span><div class="weapon">GUN</div><em>15 KM</em></div>
      <canvas class="scope" width="180" height="180"></canvas>
      <div class="keyline"><i class="g"></i>Civil<i class="r"></i>Drones<b class="score">0 down</b></div>
    </div>
    <div class="atc"></div>
    <div class="crosshair"></div>
    <div class="lead off"></div>
    <div class="lockbox off"></div>
    <div class="tags"></div>
    <div class="fly off"></div>
    <div class="hint off"></div>
    <div class="nav">
      <button class="mapkey" data-act="map">${kbd("M")} Chart</button>
    </div>
    <div class="pin off"><div class="mk"></div><div class="d"></div></div>
    <div class="manual off">
      <h4>CONTROLS</h4>
      <div class="cols">
        <section><h5>Takeoff</h5>
          ${row(kbd("Shift"), "add thrust — it stays when you release")}
          ${row(kbd("Ctrl"), "reduce thrust")}
          ${row(kbd("F"), "flaps: landing or combat")}
          ${row(kbd("G"), "gear up / gear down")}
          ${row(kbd("S"), "rotate once you are above stall")}
          ${row(kbd("R"), "back to the nearest runway")}
          ${row(kbd("B") + kbd("Home"), "return to Zhuliany")}
        </section>
        <section><h5>Flight</h5>
          ${row(kbd("A") + kbd("D"), "roll — hold through a barrel roll")}
          ${row(kbd("S") + kbd("W"), "nose up / down — hold through a loop")}
          ${row(kbd("Caps"), "wings fold back, jet to 2400 km/h")}
          ${row("", "landing flaps lift off near 75 km/h, stall at 60")}
          ${row("", "combat flaps stall at 130 km/h and spin")}
          ${row("", "a climb bleeds speed, a dive builds it")}
          ${row("", "the landing bar must stay left of the white mark")}
          ${row("", "flare with S, gear down, then touch the runway")}
          ${row("", "landing reloads missiles. Four drones finish a sortie")}
        </section>
        <section><h5>Weapons</h5>
          ${row(kbd("Space"), "fire")}
          ${row(kbd("Alt"), "gun / missiles")}
          ${row("", "the gold diamond is where the gun rounds will meet")}
          ${row("", "missiles lock the nearest drone within 15 km")}
          ${row("", "a hard turn breaks a missile on your tail")}
          ${row("", "green radar blips are civil, red are drones")}
          ${row("", "shoot the drones — they break apart and fall")}
        </section>
        <section><h5>Camera</h5>
          ${row(kbd("V"), "cabin / chase view")}
          ${row("Mouse", "look around (click the game to capture)")}
          ${row(kbd("Esc"), "release the cursor")}
        </section>
        <section><h5>Map</h5>
          ${row(kbd("M"), "chart (pauses the flight)")}
          ${row(kbd("Esc"), "close the map")}
          ${row("Wheel / + −", "zoom")}
          ${row("Drag / arrows", "pan")}
          ${row("", "To plane closes the map")}
        </section>
        <section><h5>Other</h5>
          ${row(kbd("H"), "this guide")}
          ${row("\`", "hide / show the interface")}
          ${row(kbd("T"), "time of day: morning / day / evening")}
        </section>
      </div>
      <p class="botline">F sets landing flaps for a short takeoff. G raises the gear once you are flying. Drop below stall speed and the nose falls into a spin — add power to recover. Shoot the red drones.</p>
    </div>
    <aside class="place off"><div class="ic">✦</div><div><b></b><small></small><p></p></div></aside>
    <div class="bigmap off">
      <canvas></canvas>
      <div class="vignette"></div>
      <div class="head"><div class="title">KYIV FLIGHT</div><div class="sub">chart</div></div>
      <div class="north"><i></i><span>N</span></div>
      <div class="legend">
        <button class="act" data-layer="sight"><i class="dot sight"></i>Sights <em class="seen"></em></button>
        <button class="act" data-layer="town"><i class="dot town"></i>Towns</button>
        <button class="act" data-layer="road"><i class="dot street"></i>Streets</button>
        <button data-act="zoomout" title="Zoom out to the oblast">−</button>
        <button data-act="zoomin" title="Zoom in">+</button>
        <button data-act="recenter">${city.flight ? "To plane" : "To car"}</button>
      </div>
      <div class="scale"><i></i><span></span></div>
      <div class="keys">${city.flight ? "− oblast · + closer · wheel zooms · To plane closes the map" : "− oblast · + closer · wheel zooms · To car returns to driving · Esc closes"}</div>
      <div class="tip off"><b></b><span></span><em></em></div>
      <div class="copy">© OpenStreetMap</div>
    </div>
  `;
  document.body.appendChild(root);

  const $ = (sel) => root.querySelector(sel);
  const mini = $(".mini");
  const mctx = mini ? mini.getContext("2d") : null;
  const scope = $(".scope");
  const sctx = scope.getContext("2d");
  let sweepAng = 0;
  const big = $(".bigmap");
  const bcanvas = big.querySelector("canvas");
  const bctx = bcanvas.getContext("2d");
  const layers = { sight: true, town: true, road: true };
  const view = { x: city.spawn.x, z: city.spawn.z, mpp: 34 };
  let help = false;
  let map = false;
  let hidden = false;
  let drag = null;
  let hover = null;
  const actions = {};

  root.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-act]");
    if (!btn) return;
    const act = btn.dataset.act;
    if (act === "help") help = !help;
    if (act === "map") map = !map;
    if (act === "recenter") {
      map = false;
      if (actions.player) { view.x = actions.player.x; view.z = actions.player.z; }
    }
    if (act === "zoomin") view.mpp = Math.max(1.2, view.mpp / 1.4);
    if (act === "zoomout") view.mpp = Math.min(240, view.mpp * 1.4);
    actions.onAct?.(act);
    paint();
  });

  big.addEventListener("click", (e) => {
    if (e.target.closest("button")) return;
    const rect = bcanvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const hit = pick(mx, my);
    if (hit) actions.onPin?.(hit);
  });
  big.addEventListener("pointerdown", (e) => {
    if (e.target !== bcanvas) return;
    drag = { x: e.clientX, y: e.clientY, vx: view.x, vz: view.z };
    big.classList.add("grab");
  });
  window.addEventListener("pointermove", (e) => {
    if (!map) return;
    const rect = bcanvas.getBoundingClientRect();
    hover = pick(e.clientX - rect.left, e.clientY - rect.top);
    if (!drag) return;
    view.x = drag.vx + (e.clientX - drag.x) * view.mpp;
    view.z = drag.vz + (e.clientY - drag.y) * view.mpp;
  });
  window.addEventListener("pointerup", () => {
    drag = null;
    big.classList.remove("grab");
  });
  big.addEventListener("wheel", (e) => {
    e.preventDefault();
    view.mpp = Math.max(1.2, Math.min(240, view.mpp * (e.deltaY > 0 ? 1.12 : 0.88)));
  }, { passive: false });
  big.querySelectorAll("[data-layer]").forEach((btn) => {
    btn.addEventListener("click", () => {
      layers[btn.dataset.layer] = !layers[btn.dataset.layer];
      btn.classList.toggle("act", layers[btn.dataset.layer]);
    });
  });

  function worldFrom(mx, my) {
    const w = bcanvas.width;
    const h = bcanvas.height;
    return {
      x: view.x - (mx - w / 2) * view.mpp,
      z: view.z - (my - h / 2) * view.mpp,
    };
  }
  function pick(mx, my) {
    if (mx < 0 || my < 0) return null;
    const p = worldFrom(mx, my);
    let best = null;
    let bestD = 18 * view.mpp;
    if (layers.sight) {
      for (const s of city.sights) {
        const d = Math.hypot(s.x - p.x, s.z - p.z);
        if (d < bestD) {
          bestD = d;
          best = s;
        }
      }
    }
    if (city.flight && city.fields) {
      for (const f of city.fields) {
        const d = Math.hypot(f.x - p.x, f.z - p.z);
        if (d < bestD) {
          bestD = d;
          best = { id: f.id, n: f.name, x: f.x, z: f.z, note: f.icao || "airfield" };
        }
      }
    }
    return best;
  }

  function paint() {
    $(".manual").classList.toggle("on", help);
    big.classList.toggle("off", !map);
    root.classList.toggle("hidden", hidden);
    root.querySelector("button.help").classList.toggle("act", help);
  }

  function drawRadar(player, sim) {
    const w = scope.width;
    const h = scope.height;
    const cx = w / 2;
    const cy = h / 2;
    const R = w / 2 - 7;
    const range = 15000;
    sweepAng += 0.045;
    sctx.clearRect(0, 0, w, h);
    sctx.beginPath();
    sctx.arc(cx, cy, R, 0, Math.PI * 2);
    sctx.fillStyle = "#071018";
    sctx.fill();
    sctx.strokeStyle = "#ffffff18";
    sctx.lineWidth = 1;
    for (const k of [0.33, 0.66]) {
      sctx.beginPath();
      sctx.arc(cx, cy, R * k, 0, Math.PI * 2);
      sctx.stroke();
    }
    sctx.beginPath();
    sctx.moveTo(cx, cy - R);
    sctx.lineTo(cx, cy + R);
    sctx.moveTo(cx - R, cy);
    sctx.lineTo(cx + R, cy);
    sctx.stroke();
    sctx.save();
    sctx.beginPath();
    sctx.moveTo(cx, cy);
    sctx.arc(cx, cy, R - 1, sweepAng, sweepAng + 0.55);
    sctx.closePath();
    sctx.fillStyle = "#3dde6a22";
    sctx.fill();
    sctx.restore();
    sctx.strokeStyle = "#f2c14eaa";
    sctx.lineWidth = 2;
    sctx.beginPath();
    sctx.arc(cx, cy, R, 0, Math.PI * 2);
    sctx.stroke();
    const hdg = player.heading;
    let hostile = 0;
    for (const a of sim.craft || []) {
      if (!a.alive) continue;
      if (a.role === "drone") hostile++;
      const dx = a.x - player.x;
      const dz = a.z - player.z;
      const fwd = dx * Math.sin(hdg) + dz * Math.cos(hdg);
      const right = dx * Math.cos(hdg) - dz * Math.sin(hdg);
      const dist = Math.hypot(fwd, right);
      if (dist > range || dist < 1) continue;
      const px = cx + (right / range) * (R - 6);
      const py = cy - (fwd / range) * (R - 6);
      const locked = player.lockPos && a.role === "drone" && Math.hypot(a.x - player.lockPos.x, a.z - player.lockPos.z) < 40;
      if (a.role === "drone") {
        sctx.fillStyle = "#ff3b30";
        sctx.beginPath();
        sctx.moveTo(px, py - 5);
        sctx.lineTo(px + 4.2, py);
        sctx.lineTo(px, py + 5);
        sctx.lineTo(px - 4.2, py);
        sctx.closePath();
        sctx.fill();
        if (locked) {
          sctx.strokeStyle = "#ff3b30";
          sctx.lineWidth = 1.5;
          sctx.beginPath();
          sctx.arc(px, py, 8, 0, Math.PI * 2);
          sctx.stroke();
        }
      } else {
        sctx.fillStyle = "#3dde6a";
        sctx.beginPath();
        sctx.arc(px, py, 3.1, 0, Math.PI * 2);
        sctx.fill();
      }
    }
    sctx.fillStyle = "#f2c14e";
    sctx.beginPath();
    sctx.moveTo(cx, cy - 7);
    sctx.lineTo(cx - 4.5, cy + 5);
    sctx.lineTo(cx + 4.5, cy + 5);
    sctx.closePath();
    sctx.fill();
    const cap = $(".radar em");
    if (cap) cap.textContent = hostile + " red";
    const score = $(".radar .score");
    if (score) score.textContent = (sim.kills || 0) + " down";
    if (player.warning) {
      sctx.strokeStyle = "#ff3b30";
      sctx.lineWidth = 3;
      sctx.beginPath();
      sctx.arc(cx, cy, R - 1, 0, Math.PI * 2);
      sctx.stroke();
    }
  }

  function drawMini(player, street, sim) {
    if (!mctx) return;
    const w = mini.width;
    const h = mini.height;
    mctx.clearRect(0, 0, w, h);
    mctx.fillStyle = "#243044";
    mctx.fillRect(0, 0, w, h);
    mctx.save();
    mctx.translate(w / 2, h / 2);
    mctx.rotate(player.heading);
    const mpp = 2.3;
    const groups = cellsAround(index.roadCells, player.x, player.z, 3);
    mctx.lineWidth = 2;
    for (const group of groups) {
      for (const seg of group) {
        mctx.strokeStyle = seg.br ? "#d7c27a" : seg.c === "primary" || seg.c === "trunk" || seg.c === "motorway" ? "#f2f5f8" : "#9aa6b5";
        mctx.beginPath();
        mctx.moveTo((player.x - seg.x0) / mpp, -(seg.z0 - player.z) / mpp);
        mctx.lineTo((player.x - seg.x1) / mpp, -(seg.z1 - player.z) / mpp);
        mctx.stroke();
      }
    }
    if (sim?.route?.length) {
      mctx.strokeStyle = "#f2c14e";
      mctx.lineWidth = 3;
      mctx.beginPath();
      sim.route.forEach((n, i) => {
        const x = (player.x - n.x) / mpp;
        const y = -(n.z - player.z) / mpp;
        if (i) mctx.lineTo(x, y);
        else mctx.moveTo(x, y);
      });
      mctx.stroke();
    }
    if (sim?.mission) {
      const dot = (p, color) => {
        mctx.fillStyle = color;
        mctx.beginPath();
        mctx.arc((player.x - p.x) / mpp, -(p.z - player.z) / mpp, 4.5, 0, Math.PI * 2);
        mctx.fill();
      };
      dot(sim.mission.dest, "#f2c14e");
      if (sim.mission.phase === "pickup") dot(sim.mission.pickup, "#7ec8ff");
    }
    mctx.restore();
    mctx.fillStyle = "#f2c14e";
    mctx.beginPath();
    mctx.moveTo(w / 2, h / 2 - 7);
    mctx.lineTo(w / 2 - 5, h / 2 + 6);
    mctx.lineTo(w / 2 + 5, h / 2 + 6);
    mctx.fill();
    mctx.fillStyle = "#fff";
    mctx.font = "700 11px system-ui";
    mctx.fillText("N", w / 2 + Math.sin(player.heading) * 70 - 4, h / 2 - Math.cos(player.heading) * 70);
    if (street) {
      mctx.fillStyle = "rgba(8,12,18,.55)";
      mctx.fillRect(0, h - 22, w, 22);
      mctx.fillStyle = "#fff";
      mctx.font = "600 11px system-ui";
      const label = shortStreet(street);
      mctx.fillText(label.slice(0, 28), 8, h - 7);
    }
  }

  function drawBig(player, sim) {
    const visited = sim.visited;
    if (!map) return;
    const w = bcanvas.width = Math.floor(big.clientWidth * devicePixelRatio);
    const h = bcanvas.height = Math.floor(big.clientHeight * devicePixelRatio);
    bctx.setTransform(1, 0, 0, 1, 0, 0);
    bctx.fillStyle = "#1a273b";
    bctx.fillRect(0, 0, w, h);
    const toX = (x) => -(x - view.x) / view.mpp * devicePixelRatio + w / 2;
    const toY = (z) => -(z - view.z) / view.mpp * devicePixelRatio + h / 2;
    if (layers.road) {
      bctx.lineCap = "round";
      const drawSeg = (x0, z0, x1, z1, cls, wdt, br) => {
        bctx.strokeStyle = br ? "#e6c56a" : cls === "motorway" || cls === "trunk" ? "#f0d78a" : cls === "primary" ? "#ffffff" : "#8ea0b6";
        bctx.lineWidth = Math.max(1, (wdt / view.mpp) * devicePixelRatio * 0.45);
        bctx.beginPath();
        bctx.moveTo(toX(x0), toY(z0));
        bctx.lineTo(toX(x1), toY(z1));
        bctx.stroke();
      };
      const margin = (Math.max(w, h) / 2 / devicePixelRatio) * view.mpp + 800;
      for (const road of city.roads) {
        if (!showRoad(road.c, view.mpp)) continue;
        const p = road.p;
        for (let i = 0; i < p.length - 2; i += 2) {
          const x0 = p[i], z0 = p[i + 1], x1 = p[i + 2], z1 = p[i + 3];
          if (Math.max(x0, x1) < view.x - margin || Math.min(x0, x1) > view.x + margin) continue;
          if (Math.max(z0, z1) < view.z - margin || Math.min(z0, z1) > view.z + margin) continue;
          drawSeg(x0, z0, x1, z1, road.c, road.w, road.br);
        }
      }
    }
    if (layers.town && view.mpp > 4) {
      bctx.font = "600 13px system-ui";
      bctx.fillStyle = "#d5deea";
      for (const t of city.towns) {
        bctx.fillText(t.n, toX(t.x) + 6, toY(t.z));
      }
    }
    if (layers.sight) {
      for (const s of city.sights) {
        const seen = visited.has(s.id);
        bctx.beginPath();
        bctx.arc(toX(s.x), toY(s.z), seen ? 5 : 6, 0, Math.PI * 2);
        bctx.fillStyle = seen ? "#6ee08a" : "#11161f";
        bctx.fill();
        bctx.lineWidth = 2;
        bctx.strokeStyle = seen ? "#6ee08a" : "#f2c14e";
        bctx.stroke();
      }
    }
    if (city.fields) {
      for (const f of city.fields) {
        const been = sim.landed?.has(f.id);
        bctx.save();
        bctx.translate(toX(f.x), toY(f.z));
        bctx.rotate(-f.h);
        bctx.fillStyle = been ? "#7ee0a0" : "#d5dbe6";
        bctx.fillRect(-7, -2, 14, 4);
        bctx.restore();
      }
    }
    if (sim.craft) {
      for (const a of sim.craft) {
        if (!a.alive) continue;
        bctx.fillStyle = a.role === "drone" ? "#ff3b30" : "#3dde6a";
        bctx.beginPath();
        bctx.arc(toX(a.x), toY(a.z), a.role === "drone" ? 4 : 3.2, 0, Math.PI * 2);
        bctx.fill();
      }
    }
    if (sim.route?.length) {
      bctx.lineJoin = "round";
      bctx.lineCap = "round";
      bctx.beginPath();
      sim.route.forEach((n, i) => {
        const x = toX(n.x);
        const y = toY(n.z);
        if (i) bctx.lineTo(x, y);
        else bctx.moveTo(x, y);
      });
      const routeW = Math.max(2.5, Math.min(6, 22 / view.mpp));
      bctx.strokeStyle = "#2a2110";
      bctx.lineWidth = routeW + 3;
      bctx.stroke();
      bctx.strokeStyle = "#f2c14e";
      bctx.lineWidth = routeW;
      bctx.stroke();
    }
    if (sim.mission) {
      const dest = sim.mission.dest;
      const pick = sim.mission.pickup;
      const stacked = sim.mission.phase === "pickup"
        && Math.hypot(toX(dest.x) - toX(pick.x), toY(dest.z) - toY(pick.z)) < 88;
      const blob = (p, fill, label, dy) => {
        bctx.beginPath();
        bctx.arc(toX(p.x), toY(p.z), 7, 0, Math.PI * 2);
        bctx.fillStyle = fill;
        bctx.fill();
        bctx.fillStyle = "#fff";
        bctx.font = "700 12px system-ui";
        bctx.fillText(label, toX(p.x) + 10, toY(p.z) + dy);
      };
      blob(dest, "#f2c14e", sim.mission.type === "hop" ? "Land" : "Drop-off", stacked ? -16 : 4);
      if (sim.mission.phase === "pickup") blob(pick, "#7ec8ff", "Books", stacked ? 18 : 4);
    }
    bctx.fillStyle = "#f2c14e";
    bctx.beginPath();
    const px = toX(player.x);
    const py = toY(player.z);
    bctx.save();
    bctx.translate(px, py);
    bctx.rotate(-player.heading);
    bctx.moveTo(0, -8);
    bctx.lineTo(-5, 7);
    bctx.lineTo(5, 7);
    bctx.fill();
    bctx.restore();
    const meters = view.mpp * 140;
    const steps = [100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000];
    let nice = steps[0];
    for (const step of steps) if (step <= meters) nice = step;
    $(".scale i").style.width = (nice / view.mpp) + "px";
    $(".scale span").textContent = nice >= 1000 ? nice / 1000 + " km" : nice + " m";
    $(".seen").textContent = (city.flight ? (sim.landed?.size || 0) : visited.size) + "/" + (city.flight ? city.fields.length : city.sights.length);
    const tip = $(".tip");
    if (hover) {
      tip.classList.add("on");
      tip.querySelector("b").textContent = hover.n;
      tip.querySelector("span").textContent = hover.note || "";
      const d = Math.hypot(hover.x - player.x, hover.z - player.z);
      tip.querySelector("em").textContent = (d > 1000 ? (d / 1000).toFixed(1) + " km" : Math.round(d) + " m") + (visited.has(hover.id) ? " · visited" : " · not yet");
      const rect = bcanvas.getBoundingClientRect();
      const sx = -(hover.x - view.x) / view.mpp + rect.width / 2;
      const sy = -(hover.z - view.z) / view.mpp + rect.height / 2;
      tip.style.left = sx + "px";
      tip.style.top = (sy - 8) + "px";
    } else tip.classList.remove("on");
  }

  return {
    root,
    actions,
    get mapOpen() { return map; },
    get paused() { return map; },
    toggleHelp() { help = !help; paint(); },
    toggleMap(player) {
      map = !map;
      if (map && player) {
        const m = actions.sim?.mission;
        if (m) {
          const pts = [player, m.pickup, m.dest];
          let minx = Infinity, maxx = -Infinity, minz = Infinity, maxz = -Infinity;
          for (const p of pts) {
            minx = Math.min(minx, p.x);
            maxx = Math.max(maxx, p.x);
            minz = Math.min(minz, p.z);
            maxz = Math.max(maxz, p.z);
          }
          view.x = (minx + maxx) * 0.5;
          view.z = (minz + maxz) * 0.5;
          const span = Math.max(maxx - minx, maxz - minz, 200);
          view.mpp = Math.max(3, Math.min(70, span / 150));
        } else {
          view.x = player.x;
          view.z = player.z;
        }
      }
      paint();
    },
    closeMap() { map = false; paint(); },
    nudgeMap(dx, dz) { view.x += dx * view.mpp; view.z += dz * view.mpp; },
    zoomMap(f) { view.mpp = Math.max(1.2, Math.min(240, view.mpp * f)); },
    recenter(player) { view.x = player.x; view.z = player.z; },
    toggleHidden() { hidden = !hidden; paint(); },
    update(frame) {
      const { player, sim, street, camera } = frame;
      actions.player = player;
      actions.sim = sim;
      $(".money span") && ($(".money span").textContent = Math.round(sim.money));
      const panel = $(".panel");
      if (sim.objective) {
        panel.classList.remove("off");
        panel.querySelector(".ttl").textContent = sim.objective.title;
        panel.querySelector(".obj").textContent = shortStreet(sim.objective.text);
        panel.querySelector(".bl").textContent = "";
        panel.querySelector(".bar i").style.width = Math.round(sim.objective.bar * 100) + "%";
        const tm = panel.querySelector(".tm");
        tm.textContent = sim.objective.dist == null
          ? "MSL " + (player.missiles ?? 0)
          : sim.objective.time == null
            ? (sim.objective.dist > 1000 ? (sim.objective.dist / 1000).toFixed(1) + " km" : Math.round(sim.objective.dist) + " m")
            : Math.max(0, Math.ceil(sim.objective.time)) + " s";
        tm.classList.toggle("low", sim.objective.time < 20);
      } else panel.classList.add("off");
      const banner = $(".banner");
      banner.classList.toggle("on", sim.bannerT > 0);
      banner.firstChild && (banner.childNodes[0].textContent = "");
      banner.innerHTML = `${sim.banner}<small>${englishLine(sim.bannerSub || "")}</small>`;
      const toast = $(".toast");
      toast.classList.toggle("on", sim.toastT > 0);
      toast.textContent = sim.toast || "";
      const kmh = Math.abs(player.speed) * 3.6;
      $(".speed .v").textContent = String(Math.round(kmh));
      const thr = $(".thr");
      if (thr) {
        const pct = Math.round((player.throttle || 0) * 100);
        thr.querySelector("em").style.width = pct + "%";
        thr.querySelector("span").textContent = pct + "%";
      }
      const land = $(".land");
      if (land) {
        const show = player.flight && player.flying && !player.wrecked && (player.agl ?? 999) < 180;
        land.classList.toggle("off", !show);
        const mark = Math.max(0, Math.min(1, player.landStress || 0));
        land.querySelector("em").style.left = (mark * 100) + "%";
      }
      const alt = Math.max(0, Math.round(player.y));
      if (player.flight) {
        const stall = player.flaps > 0.5 ? 60 : 130;
        const bits = [
          "KM/H",
          "ALT " + alt + " M",
          player.gearDown === false ? "GEAR UP" : "GEAR",
          player.flaps > 0.5 ? "FLAPS" : "CLEAN",
        ];
        if (player.flying && kmh < stall + 20) bits.push("STALL");
        $(".speed .u").textContent = bits.join(" · ");
      } else {
        $(".speed .u").textContent = player.flying
          ? `KM/H · ALT ${alt} M ASL`
          : `KM/H · ${player.gear} · ${alt} M`;
      }
      $(".speed .street").textContent = shortStreet(street || "");
      const fly = $(".fly");
      fly.classList.add("on");
      const vr = player.flaps > 0.5 ? 70 : 140;
      fly.textContent = player.wrecked
        ? "Destroyed"
        : player.spin
        ? "Stall · spin"
        : player.stallWarn
          ? "Stall warning"
          : player.flying
          ? (player.gearDown === false ? "Gear up · " : "") + (player.jets ? "Jet · " : "Airborne · ") + Math.round(player.vy) + " m/s"
          : kmh > vr
            ? "S · rotate"
            : player.flaps > 0.5
              ? "Flaps · Shift · takeoff"
              : "Shift · takeoff";
      const weapon = $(".weapon");
      if (weapon) {
        weapon.textContent = player.weapon ? "MSL " + (player.missiles ?? 0) : "GUN";
        weapon.classList.toggle("lock", !!player.lock);
      }
      const cross = $(".crosshair");
      if (cross) cross.classList.toggle("lock", !!player.lock);
      const box = $(".lockbox");
      if (box) {
        if (frame.lockScreen) {
          box.classList.remove("off");
          box.style.left = frame.lockScreen.x + "px";
          box.style.top = frame.lockScreen.y + "px";
        } else box.classList.add("off");
      }
      const lead = $(".lead");
      if (lead) {
        if (frame.leadScreen && !frame.leadScreen.edge) {
          lead.classList.remove("off");
          lead.style.left = frame.leadScreen.x + "px";
          lead.style.top = frame.leadScreen.y + "px";
        } else lead.classList.add("off");
      }
      const atc = $(".atc");
      if (atc) atc.textContent = frame.atc || "";
      const tags = $(".tags");
      if (tags) {
        tags.innerHTML = (frame.tags || []).map((tag) => (
          `<b style="left:${tag.x}px;top:${tag.y}px;opacity:${Math.max(0, tag.life)}">${tag.text}</b>`
        )).join("");
      }
      $(".radar")?.classList.toggle("warn", !!player.warning);
      const hint = $(".hint");
      if (sim.mission?.type === "hop") {
        hint.classList.remove("on");
      } else if (sim.mission) {
        const goal = sim.mission.phase === "pickup" ? sim.mission.pickup : sim.mission.dest;
        const d = Math.hypot(player.x - goal.x, player.z - goal.z);
        hint.classList.add("on");
        hint.textContent = (sim.mission.phase === "pickup" ? "Pick up books · " : "Deliver books · ") + Math.round(d) + " m";
      } else hint.classList.remove("on");
      const place = $(".place");
      const near = frame.nearSight;
      if (near && near.dist < 32 && Math.abs(player.speed) < 4) {
        place.classList.add("on");
        place.querySelector("b").textContent = near.n;
        place.querySelector("small").textContent = near.seen ? "visited" : "Kyiv landmark";
        place.querySelector("p").textContent = near.note || "";
      } else place.classList.remove("on");
      drawRadar(player, sim);
      drawMini(player, street, sim);
      drawBig(player, sim);
      if (sim.pin && camera) {
        const el = $(".pin");
        const sp = frame.pinScreen;
        if (!sp) el.classList.add("off");
        else {
          el.classList.remove("off");
          el.classList.toggle("edge", sp.edge);
          el.style.transform = `translate(${sp.x}px, ${sp.y}px)`;
          el.querySelector(".d").textContent = sp.edge ? sim.pin.n : Math.round(sp.dist) + " m";
        }
      }
      paint();
    },
  };
}

