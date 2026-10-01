import fs from "fs";
import path from "path";
import zlib from "zlib";
import { fileURLToPath } from "url";
import { readElev } from "../src/elev.js";
import { clearPlazas, indexCity, nearestRoad, openStreets, presentEast, streetVisual, waterAt } from "../src/geo.js";
import { encodeCity, decodeCity } from "../src/mapio.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const jsonPath = path.join(root, "public", "data", "kyiv.json");
const elevPath = path.join(root, "public", "data", "elev.bin");
const outPath = path.join(root, "public", "data", "kyiv.bin");

const stamp = (label, fn) => {
  const t0 = performance.now();
  const value = fn();
  console.log(label, Math.round(performance.now() - t0) + "ms");
  return value;
};

const city = stamp("read", () => JSON.parse(fs.readFileSync(jsonPath, "utf8")));
const elev = fs.readFileSync(elevPath);
readElev(elev.buffer.slice(elev.byteOffset, elev.byteOffset + elev.byteLength));
stamp("flip", () => presentEast(city));
stamp("streets", () => openStreets(city));
stamp("plazas", () => clearPlazas(city));
const index = stamp("index", () => indexCity(city));
stamp("decks", () => {
  for (const b of city.buildings) b.deck = streetVisual(b, index);
});
const bytes = stamp("encode", () => encodeCity(city, index));
fs.writeFileSync(outPath, bytes);
const gz = stamp("gzip", () => zlib.gzipSync(bytes, { level: 6 }));
fs.writeFileSync(outPath + ".gz", gz);
const back = stamp("check", () => decodeCity(bytes));
let sample = null;
let sampleAt = 0;
let first = null;
for (let i = 0; i < city.buildings.length; i += 40) {
  const hit = nearestRoad(index, city.buildings[i].x, city.buildings[i].z, 30);
  if (!hit) continue;
  sample = city.buildings[i];
  sampleAt = i;
  first = hit;
  break;
}
const again = sample ? nearestRoad(back.index, sample.x, sample.z, 30) : null;
const wet = sample ? waterAt(index, sample.x, sample.z) : false;
const wetAgain = sample ? waterAt(back.index, sample.x, sample.z) : false;
console.log(
  "kyiv.bin",
  (bytes.byteLength / 1048576).toFixed(1) + "MB",
  "gzip",
  (gz.byteLength / 1048576).toFixed(1) + "MB",
  "roads", city.roads.length,
  "buildings", city.buildings.length,
  "road cells", index.roadCells.size,
  "decoded", back.city.roads.length, back.index.roadCells.size,
);
if (back.city.roads.length !== city.roads.length || back.index.roadCells.size !== index.roadCells.size) {
  throw new Error("Baked map did not round-trip");
}
if (!first || !again || again.name !== first.name || Math.abs(again.dist - first.dist) > 0.25) {
  throw new Error("Road index did not round-trip");
}
if (wet !== wetAgain) throw new Error("Water index did not round-trip");
const backB = back.city.buildings[sampleAt];
if (Math.abs((backB.deck || 0) - (sample.deck || 0)) > 0.02) throw new Error("Building deck did not round-trip");
if (Math.abs((backB.base || 0) - (sample.base || 0)) > 0.02) throw new Error("Building base did not round-trip");
