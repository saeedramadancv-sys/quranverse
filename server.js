/**
 * server.js — Zero-dependency static file server for QuranVerse.
 * Run with:  node server.js       (then open http://localhost:8123/)
 */
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "www");
const PORT = process.env.PORT || 8123;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p === "/") p = "/index.html";
  // Prevent path traversal.
  const file = path.join(ROOT, path.normalize(p).replace(/^(\.\.[\/\\])+/, ""));
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }); res.end("404 Not Found"); return; }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream" });
    res.end(data);
  });
}).listen(PORT, () => {
  console.log(`\n  QuranVerse يعمل الآن على:  http://localhost:${PORT}/\n`);
  console.log("  افتح الرابط في Chrome أو Edge. لإيقاف السيرفر: أغلق هذه النافذة أو اضغط Ctrl+C\n");
});
