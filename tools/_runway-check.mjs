import { register } from "node:module";

register(new URL("./_strip-query.mjs", import.meta.url));

const { FIELDS } = await import("../src/airfields.js");
const { presentEast, clearRunways } = await import("../src/geo.js");
const fs = await import("fs");

const city = JSON.parse(fs.readFileSync("public/data/kyiv.json", "utf8"));
presentEast(city);
const ukkk = FIELDS.find((f) => f.icao === "UKKK");

function hits(label) {
  const ax = Math.sin(ukkk.h);
  const az = Math.cos(ukkk.h);
  const lx = Math.cos(ukkk.h);
  const lz = -Math.sin(ukkk.h);
  const halfLen = ukkk.len * 0.5;
  const edge = Math.max(14, ukkk.wid * 0.5);
  let n = 0;
  const samples = [];
  for (const b of city.buildings) {
    if (Math.hypot(b.x - ukkk.x, b.z - ukkk.z) > ukkk.len) continue;
    const along = (b.x - ukkk.x) * ax + (b.z - ukkk.z) * az;
    const lat = (b.x - ukkk.x) * lx + (b.z - ukkk.z) * lz;
    const yaw = -(b.rot || 0);
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    let maxA = 0;
    let maxL = 0;
    const hw = (b.w || 8) * 0.5;
    const hd = (b.d || 8) * 0.5;
    for (const sx of [-hw, hw]) {
      for (const sz of [-hd, hd]) {
        const dx = sx * cos + sz * sin;
        const dz = -sx * sin + sz * cos;
        maxA = Math.max(maxA, Math.abs(dx * ax + dz * az));
        maxL = Math.max(maxL, Math.abs(dx * lx + dz * lz));
      }
    }
    if (Math.abs(along) > halfLen + maxA) continue;
    if (Math.abs(lat) > edge + maxL) continue;
    n++;
    if (samples.length < 6) samples.push({ w: b.w, d: b.d, along: Math.round(along), lat: Math.round(lat) });
  }
  console.log(label, n, samples);
}

const ax = Math.sin(ukkk.h);
const az = Math.cos(ukkk.h);
const lx = Math.cos(ukkk.h);
const lz = -Math.sin(ukkk.h);
let total = 0;
for (const f of FIELDS) {
  const ax = Math.sin(f.h);
  const az = Math.cos(f.h);
  const lx = Math.cos(f.h);
  const lz = -Math.sin(f.h);
  const edge = Math.max(14, f.wid * 0.5) + 8;
  let n = 0;
  for (const b of city.buildings) {
    if (Math.abs(b.x - f.x) > f.len || Math.abs(b.z - f.z) > f.len) continue;
    const along = (b.x - f.x) * ax + (b.z - f.z) * az;
    const lat = (b.x - f.x) * lx + (b.z - f.z) * lz;
    if (Math.abs(along) > f.len * 0.5 + 30) continue;
    if (Math.abs(lat) > edge + Math.hypot(b.w || 8, b.d || 8) * 0.5) continue;
    n++;
  }
  if (n) {
    total += n;
    console.log(f.icao || f.id, n);
  }
}
console.log("total", total);
