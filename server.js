const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

// מגישים ישירות את קובץ V31 הציבורי, בלי לשנות את קוד המשחק.
const gamePath = path.join(
  __dirname,
  "chess-v31",
  "AI-STANDALONE-CHESS-V31-PONDER-ONLINE.html"
);
const gameHtml = fs.readFileSync(gamePath);

const server = http.createServer((request, response) => {
  const pathname = new URL(request.url || "/", "http://localhost").pathname;

  // כתובת בדיקת תקינות עבור Render.
  if (pathname === "/health") {
    response.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
    response.end("ok");
    return;
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { allow: "GET, HEAD" });
    response.end();
    return;
  }

  if (pathname !== "/" && pathname !== "/index.html") {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  response.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-cache"
  });
  response.end(request.method === "HEAD" ? undefined : gameHtml);
});

const port = Number(process.env.PORT) || 10000;
server.listen(port, "0.0.0.0");
