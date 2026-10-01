const LAT0 = 50.4501;
const LON0 = 30.5234;
const M_LAT = 111320;
const M_LON = 111320 * Math.cos((LAT0 * Math.PI) / 180);

let rows = 0;
let cols = 0;
let south = 0;
let west = 0;
let dLat = 1;
let dLon = 1;
let data = null;

export function readElev(buf) {
  const view = new DataView(buf);
  rows = view.getUint32(0, true);
  cols = view.getUint32(4, true);
  south = view.getFloat64(8, true);
  west = view.getFloat64(16, true);
  dLat = view.getFloat64(24, true);
  dLon = view.getFloat64(32, true);
  data = new Int16Array(buf, 48);
  if (data.length < rows * cols) throw new Error("Elevation grid is short");
}

export async function loadElev(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Elevation grid missing");
  readElev(await res.arrayBuffer());
}

export function heightAt(x, z) {
  if (!data) return 0;
  const lat = LAT0 + z / M_LAT;
  const lon = LON0 - x / M_LON;
  let row = (lat - south) / dLat;
  let col = (lon - west) / dLon;
  row = Math.max(0, Math.min(rows - 1.001, row));
  col = Math.max(0, Math.min(cols - 1.001, col));
  const r0 = Math.floor(row);
  const c0 = Math.floor(col);
  const fr = row - r0;
  const fc = col - c0;
  const at = (r, c) => data[r * cols + c];
  const a = at(r0, c0);
  const b = at(r0, c0 + 1);
  const c = at(r0 + 1, c0);
  const d = at(r0 + 1, c0 + 1);
  return a * (1 - fr) * (1 - fc) + b * (1 - fr) * fc + c * fr * (1 - fc) + d * fr * fc;
}
