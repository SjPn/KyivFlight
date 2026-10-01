import fs from "fs";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};
const port = Number(process.env.PORT || 5173);

function resolveFile(urlPath) {
  const rel = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");
  const candidates = [
    path.join(root, rel),
    path.join(root, "public", rel),
  ];
  for (const file of candidates) {
    const normal = path.normalize(file);
    if (!normal.startsWith(root)) continue;
    if (fs.existsSync(normal) && fs.statSync(normal).isFile()) return normal;
  }
  return null;
}

const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || "/").split("?")[0]);
  const file = resolveFile(url);
  if (!file) {
    res.writeHead(404);
    res.end("not found");
    return;
  }
  const headers = {
    "Content-Type": types[path.extname(file)] || "application/octet-stream",
    "Cache-Control": "no-cache",
  };
  const gz = file + ".gz";
  const accept = String(req.headers["accept-encoding"] || "");
  if (file.endsWith(".bin") && /\bgzip\b/.test(accept) && fs.existsSync(gz)) {
    headers["Content-Encoding"] = "gzip";
    headers["Content-Length"] = String(fs.statSync(gz).size);
    headers["X-Size"] = String(fs.statSync(file).size);
    headers.Vary = "Accept-Encoding";
    res.writeHead(200, headers);
    fs.createReadStream(gz).pipe(res);
    return;
  }
  res.writeHead(200, headers);
  fs.createReadStream(file).pipe(res);
});

server.listen(port, () => {
  console.log("Київ Драйв  http://localhost:" + port);
});
