import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { readElev } from "../src/elev.js";
import { clearPlazas, indexCity, openStreets, presentEast } from "../src/geo.js";
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
const bytes = stamp("encode", () => encodeCity(city, index));
fs.writeFileSync(outPath, bytes);
const back = stamp("check", () => decodeCity(bytes));
console.log(
  "kyiv.bin",
  (bytes.byteLength / 1048576).toFixed(1) + "MB",
  "roads", city.roads.length,
  "buildings", city.buildings.length,
  "road cells", index.roadCells.size,
  "decoded", back.city.roads.length, back.index.roadCells.size,
);
if (back.city.roads.length !== city.roads.length || back.index.roadCells.size !== index.roadCells.size) {
  throw new Error("Baked map did not round-trip");
}
