const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const port = Number(process.env.PORT || 4173);
const defaultHtml = fs.existsSync(path.join(root, "ayor-seychelles-landing-refined.html"))
  ? "ayor-seychelles-landing-refined.html"
  : "ayor-seychelles-ai-planner.html";
const types = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".mp4": "video/mp4",
  ".png": "image/png",
  ".svg": "image/svg+xml"
};

function safePath(urlPath) {
  const requested = decodeURIComponent(urlPath.split("?")[0]);
  const relative = requested === "/" ? defaultHtml : requested.replace(/^\/+/, "");
  const resolved = path.resolve(root, relative);
  return resolved.startsWith(root) ? resolved : null;
}

http.createServer((request, response) => {
  const filePath = safePath(request.url || "/");
  if (!filePath) {
    response.writeHead(403).end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.writeHead(error.code === "ENOENT" ? 404 : 500).end("Not found");
      return;
    }
    response.writeHead(200, {
      "Content-Type": types[path.extname(filePath).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    response.end(data);
  });
}).listen(port, "127.0.0.1", () => {
  console.log(`AYOR MVP: http://127.0.0.1:${port}`);
});
