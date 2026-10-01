export function isPhone() {
  return document.documentElement.classList.contains("mobile");
}

const DZ = 0.25;

export function mountTouch({ keys, unlock }) {
  if (!isPhone() || document.querySelector(".touch")) return;

  const root = document.createElement("div");
  root.className = "touch";
  root.innerHTML = `
    <div class="look"></div>
    <div class="stick" aria-hidden="true"><i></i><b></b></div>
    <div class="fight">
      <button type="button" class="up" data-hold="Equal">+</button>
      <button type="button" class="wpn">MSL</button>
      <button type="button" class="down" data-hold="Minus">−</button>
      <button type="button" class="flare" data-hold="KeyC">Flares</button>
      <button type="button" class="fire" data-hold="Space">Fire</button>
    </div>
    <div class="chrome">
      <div class="cluster">
        <button type="button" data-tap="map">Chart</button>
        <button type="button" data-tap="KeyG">Gear</button>
        <button type="button" data-tap="KeyF">Flaps</button>
        <button type="button" data-tap="CapsLock">Jet</button>
      </div>
      <div class="cluster">
        <button type="button" data-tap="KeyV">View</button>
        <button type="button" data-tap="KeyB">Base</button>
        <button type="button" data-tap="voice">Voice</button>
        <button type="button" class="help" data-tap="help">Help</button>
      </div>
    </div>
    <div class="guide off">
      <div class="card">
        <h4>CONTROLS</h4>
        <p>Pull the stick back to raise the nose. Push it forward to lower the nose. Left and right roll.</p>
        <p>+ and − add and reduce thrust. It stays when you let go.</p>
        <p>Fire is held. Gun / Msl switches weapons. Flares drops a pair.</p>
        <p>Drag a finger on the empty sky to look around. The view stays where you leave it.</p>
        <div class="extra">
          <button type="button" data-tap="KeyR">Nearest runway</button>
          <button type="button" data-tap="KeyT">Time of day</button>
        </div>
        <button type="button" class="close" data-tap="help">Close</button>
      </div>
    </div>
  `;
  document.body.appendChild(root);

  const owned = new Set();
  const stick = root.querySelector(".stick");
  const nub = stick.querySelector("b");
  const look = root.querySelector(".look");
  const guide = root.querySelector(".guide");
  const wpn = root.querySelector(".wpn");
  let stickId = null;
  let lookId = null;
  let lookX = 0;
  let lookY = 0;

  const hudBtn = (sel) => document.querySelector(".hud " + sel);

  function setHeld(code, on) {
    if (on) {
      keys.add(code);
      owned.add(code);
    } else if (owned.delete(code)) keys.delete(code);
  }

  function releaseAll() {
    for (const code of owned) keys.delete(code);
    owned.clear();
    stickId = null;
    lookId = null;
    nub.style.transform = "";
    root.querySelectorAll(".fight button.on, .stick.on").forEach((el) => el.classList.remove("on"));
  }

  function tapKey(code) {
    unlock();
    window.dispatchEvent(new KeyboardEvent("keydown", { code, bubbles: true, cancelable: true }));
    window.dispatchEvent(new KeyboardEvent("keyup", { code, bubbles: true, cancelable: true }));
  }

  function clickHud(sel) {
    unlock();
    hudBtn(sel)?.click();
  }

  function runTap(name) {
    if (name === "map") clickHud("[data-act=map]");
    else if (name === "voice") {
      clickHud("[data-act=voice]");
      root.querySelector("[data-tap=voice]")?.classList.toggle("dim", !!hudBtn("[data-act=voice]")?.classList.contains("mute"));
    } else if (name === "help") clickHud("button.help");
    else tapKey(name);
  }

  root.addEventListener("contextmenu", (e) => e.preventDefault());

  root.querySelectorAll("[data-hold]").forEach((btn) => {
    const code = btn.dataset.hold;
    const down = (e) => {
      if (e.button != null && e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      try { btn.setPointerCapture(e.pointerId); } catch { /* the gesture still counts */ }
      unlock();
      setHeld(code, true);
      btn.classList.add("on");
    };
    const up = (e) => {
      try { if (btn.hasPointerCapture?.(e.pointerId)) btn.releasePointerCapture(e.pointerId); } catch { /* already released */ }
      setHeld(code, false);
      btn.classList.remove("on");
    };
    btn.addEventListener("pointerdown", down);
    btn.addEventListener("pointerup", up);
    btn.addEventListener("pointercancel", up);
  });

  const tapBtn = (btn, fire) => {
    let id = null;
    btn.addEventListener("pointerdown", (e) => {
      if (e.button != null && e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      id = e.pointerId;
      try { btn.setPointerCapture(e.pointerId); } catch { /* the gesture still counts */ }
    });
    btn.addEventListener("pointerup", (e) => {
      if (e.pointerId !== id) return;
      id = null;
      e.preventDefault();
      e.stopPropagation();
      const rect = btn.getBoundingClientRect();
      if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) return;
      fire();
    });
    btn.addEventListener("pointercancel", (e) => {
      if (e.pointerId === id) id = null;
    });
  };
  root.querySelectorAll("[data-tap]").forEach((btn) => tapBtn(btn, () => runTap(btn.dataset.tap)));
  tapBtn(wpn, () => tapKey("AltLeft"));

  function placeStick(e) {
    const rect = stick.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const max = rect.width * 0.28;
    let dx = e.clientX - cx;
    let dy = e.clientY - cy;
    const mag = Math.hypot(dx, dy) || 1;
    if (mag > max) {
      dx *= max / mag;
      dy *= max / mag;
    }
    nub.style.transform = `translate(${dx}px, ${dy}px)`;
    const nx = dx / max;
    const ny = dy / max;
    setHeld("KeyA", nx < -DZ);
    setHeld("KeyD", nx > DZ);
    setHeld("KeyW", ny < -DZ);
    setHeld("KeyS", ny > DZ);
  }

  stick.addEventListener("pointerdown", (e) => {
    if (e.button != null && e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    try { stick.setPointerCapture(e.pointerId); } catch { /* the gesture still counts */ }
    stickId = e.pointerId;
    stick.classList.add("on");
    unlock();
    placeStick(e);
  });
  stick.addEventListener("pointermove", (e) => {
    if (e.pointerId !== stickId) return;
    placeStick(e);
  });
  const endStick = (e) => {
    if (e.pointerId !== stickId) return;
    stickId = null;
    stick.classList.remove("on");
    nub.style.transform = "";
    setHeld("KeyA", false);
    setHeld("KeyD", false);
    setHeld("KeyW", false);
    setHeld("KeyS", false);
  };
  stick.addEventListener("pointerup", endStick);
  stick.addEventListener("pointercancel", endStick);

  look.addEventListener("pointerdown", (e) => {
    if (e.button != null && e.button !== 0) return;
    if (e.target !== look) return;
    e.preventDefault();
    try { look.setPointerCapture(e.pointerId); } catch { /* the gesture still counts */ }
    lookId = e.pointerId;
    lookX = e.clientX;
    lookY = e.clientY;
    unlock();
  });
  look.addEventListener("pointermove", (e) => {
    if (e.pointerId !== lookId) return;
    const dx = e.clientX - lookX;
    const dy = e.clientY - lookY;
    lookX = e.clientX;
    lookY = e.clientY;
    window.dispatchEvent(new CustomEvent("touchlook", { detail: { dx, dy } }));
  });
  const endLook = (e) => {
    if (e.pointerId !== lookId) return;
    lookId = null;
  };
  look.addEventListener("pointerup", endLook);
  look.addEventListener("pointercancel", endLook);

  guide.addEventListener("pointerdown", (e) => {
    if (e.target !== guide) return;
    e.preventDefault();
    clickHud("button.help");
  });

  const manual = document.querySelector(".manual");
  const helpBtn = hudBtn("button.help");
  const syncHelp = () => {
    const on = !!helpBtn?.classList.contains("act");
    guide.classList.toggle("off", !on);
    root.querySelector(".chrome .help")?.classList.toggle("on", on);
  };
  if (manual) new MutationObserver(syncHelp).observe(manual, { attributes: true, attributeFilter: ["class"] });
  if (helpBtn) new MutationObserver(syncHelp).observe(helpBtn, { attributes: true, attributeFilter: ["class"] });

  const weapon = document.querySelector(".weapon");
  const syncWeapon = () => {
    wpn.textContent = weapon?.classList.contains("msl") ? "MSL" : "GUN";
  };
  if (weapon) {
    syncWeapon();
    new MutationObserver(syncWeapon).observe(weapon, { attributes: true, attributeFilter: ["class"] });
  }

  const map = document.querySelector(".bigmap");
  const syncMap = () => {
    const open = map && !map.classList.contains("off");
    root.classList.toggle("chart", !!open);
    if (open) releaseAll();
  };
  if (map) new MutationObserver(syncMap).observe(map, { attributes: true, attributeFilter: ["class"] });

  window.addEventListener("blur", releaseAll);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) releaseAll();
  });
  window.matchMedia("(orientation: portrait)").addEventListener("change", releaseAll);
}
