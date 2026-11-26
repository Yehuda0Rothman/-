"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

// הקבצים שמותר לשרת להגיש. כך אין אפשרות לבקש קבצים שרירותיים מהשרת.
const siteDirectory = path.join(__dirname, "chess-modular");
const publicFiles = new Map([
  ["/", "index.html"],
  ["/index.html", "index.html"],
  ["/style.css", "style.css"],
  ["/chess-rules.js", "chess-rules.js"],
  ["/ai.js", "ai.js"],
  ["/game.js", "game.js"],
  ["/online.js", "online.js"]
]);
const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8"
};

const server = http.createServer((request, response) => {
  const pathname = new URL(request.url || "/", "http://localhost").pathname;

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

  const fileName = publicFiles.get(pathname);
  if (!fileName) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  const filePath = path.join(siteDirectory, fileName);
  fs.readFile(filePath, (error, content) => {
    if (error) {
      response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      response.end("Could not load the game file");
      return;
    }

    response.writeHead(200, {
      "content-type": contentTypes[path.extname(fileName)],
      "cache-control": "no-cache"
    });
    response.end(request.method === "HEAD" ? undefined : content);
  });
});

const port = Number(process.env.PORT) || 10000;
server.listen(port, "0.0.0.0");
