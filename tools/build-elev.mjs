/**
 * Real ground heights for Kyiv and Kyiv Oblast from SRTM 1 arc-second.
 * Output: public/data/elev.bin  (meters above sea level, EGM96)
 */
import fs from "fs";
import path from "path";
import zlib from "zlib";
import { spawn } from "child_process";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = path.join(root, "tools", "cache", "elev");
const OUT = path.join(root, "public", "data", "elev.bin");

const SOUTH = 49.42;
const NORTH = 51.08;
const WEST = 29.22;
const EAST = 32.18;
const DLAT = 0.0009;
const DLON = 0.0014;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function curl(url, file) {
  return new Promise((resolve, reject) => {
    const child = spawn("curl.exe", ["-L", "-f", "-sS", "--retry", "4", "--retry-delay", "3", "-m", "180", "-o", file, url], { windowsHide: true });
    let err = "";
    child.stderr.on("data", (d) => { err += d; });
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(err.trim() || "curl " + code))));
  });
}

async function hgt(lat, lon) {
  const name = "N" + lat + "E" + String(lon).padStart(3, "0");
  const file = path.join(CACHE, name + ".hgt");
  if (!fs.existsSync(file) || fs.statSync(file).size < 25000000) {
    const gz = file + ".gz";
    const url = `https://elevation-tiles-prod.s3.amazonaws.com/skadi/N${lat}/${name}.hgt.gz`;
    console.log("fetch", name);
    await curl(url, gz);
    const raw = zlib.gunzipSync(fs.readFileSync(gz));
    fs.writeFileSync(file, raw);
    fs.unlinkSync(gz);
    await sleep(400);
  } else console.log("cache", name);
  const buf = fs.readFileSync(file);
  if (buf.length < 3601 * 3601 * 2) throw new Error(name + " short " + buf.length);
  return buf;
}

function sample(buf, lat0, lon0, lat, lon) {
  const n = 3600;
  let row = (lat0 + 1 - lat) * n;
  let col = (lon - lon0) * n;
  row = Math.max(0, Math.min(n, row));
  col = Math.max(0, Math.min(n, col));
  const r0 = Math.floor(row);
  const c0 = Math.floor(col);
  const r1 = Math.min(n, r0 + 1);
  const c1 = Math.min(n, c0 + 1);
  const fr = row - r0;
  const fc = col - c0;
  const at = (r, c) => buf.readInt16BE((r * 3601 + c) * 2);
  let a = at(r0, c0), b = at(r0, c1), c = at(r1, c0), d = at(r1, c1);
  const bad = (v) => v < -500;
  if (bad(a)) a = bad(b) ? (bad(c) ? d : c) : b;
  if (bad(b)) b = a;
  if (bad(c)) c = a;
  if (bad(d)) d = b;
  if (bad(a)) return 120;
  return a * (1 - fr) * (1 - fc) + b * (1 - fr) * fc + c * fr * (1 - fc) + d * fr * fc;
}

async function main() {
  fs.mkdirSync(CACHE, { recursive: true });
  const tiles = new Map();
  for (let lat = 49; lat <= 51; lat++) {
    for (let lon = 29; lon <= 32; lon++) {
      tiles.set(lat + "," + lon, await hgt(lat, lon));
    }
  }
  const rows = Math.round((NORTH - SOUTH) / DLAT) + 1;
  const cols = Math.round((EAST - WEST) / DLON) + 1;
  const data = Buffer.alloc(rows * cols * 2);
  let min = 1e9, max = -1e9;
  for (let r = 0; r < rows; r++) {
    const lat = SOUTH + r * DLAT;
    const lat0 = Math.max(49, Math.min(51, Math.floor(lat)));
    for (let c = 0; c < cols; c++) {
      const lon = WEST + c * DLON;
      const lon0 = Math.max(29, Math.min(32, Math.floor(lon)));
      const buf = tiles.get(lat0 + "," + lon0);
      const h = Math.round(sample(buf, lat0, lon0, lat, lon));
      if (h < min) min = h;
      if (h > max) max = h;
      data.writeInt16LE(h, (r * cols + c) * 2);
    }
  }
  const head = Buffer.alloc(48);
  head.writeUInt32LE(rows, 0);
  head.writeUInt32LE(cols, 4);
  head.writeDoubleLE(SOUTH, 8);
  head.writeDoubleLE(WEST, 16);
  head.writeDoubleLE(DLAT, 24);
  head.writeDoubleLE(DLON, 32);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, Buffer.concat([head, data]));
  console.log("grid", cols, "x", rows, "range", min, max, "m", (fs.statSync(OUT).size / 1048576).toFixed(1), "MB");
  const probe = (lat, lon, name) => {
    const lat0 = Math.floor(lat);
    const lon0 = Math.floor(lon);
    const h = sample(tiles.get(lat0 + "," + lon0), lat0, lon0, lat, lon);
    console.log(name, h.toFixed(0), "m");
  };
  probe(50.4501, 30.5234, "Maidan");
  probe(50.4474, 30.5216, "Khreshchatyk");
  probe(50.4346, 30.557, "Lavra");
  probe(50.458, 30.535, "Dnipro channel");
  probe(50.445, 30.60, "Left bank");
  probe(50.075, 30.122, "Bila Tserkva");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
