// שרת קטן לחדרי שחמט בזמן אמת. מצב המשחק נשמר בזיכרון של תהליך יחיד.
"use strict";
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { WebSocketServer, WebSocket } = require("ws");
const { Chess } = require("chess.js");

const PORT = Number(process.env.PORT) || 10000;
const STATIC_ASSETS = new Map([
  ["/style.css", { file: "style.css", contentType: "text/css; charset=utf-8" }],
  ["/chess-rules.js", { file: "chess-rules.js", contentType: "text/javascript; charset=utf-8" }],
  ["/ai.js", { file: "ai.js", contentType: "text/javascript; charset=utf-8" }],
  ["/game.js", { file: "game.js", contentType: "text/javascript; charset=utf-8" }],
  ["/online.js", { file: "online.js", contentType: "text/javascript; charset=utf-8" }]
]);
const rooms = new Map();
const send = (socket, payload) => {
  if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
};
const makeToken = () => crypto.randomBytes(24).toString("hex");
const makeRoomId = () => {
  let id;
  do { id = crypto.randomBytes(3).toString("hex").toUpperCase(); } while (rooms.has(id));
  return id;
};
const connectedCount = room => room.players.filter(player => player && player.ws && player.ws.readyState === WebSocket.OPEN).length;
function clockSnapshot(room) {
  const now = Date.now();
  const remaining = room.clock.remainingMs.slice();
  const activeIndex = room.game.turn() === "w" ? 0 : 1;
  if (room.clock.startedAt !== null && !room.finished) {
    remaining[activeIndex] = Math.max(0, remaining[activeIndex] - (now - room.clock.startedAt));
  }
  return {
    initialMs:room.clock.initialMs, incrementMs:room.clock.incrementMs, remaining,
    activeColor:room.game.turn(), running:room.clock.startedAt !== null && !room.finished, serverNow:now
  };
}
function roomState(room, color, token, type) {
  return {
    type, room:room.id, color, token,
    fen:room.game.fen(), history:room.history, moves:room.moves,
    finished:room.finished, clock:clockSnapshot(room)
  };
}
// דחיית מהלך מחזירה לשחקן את תמונת המצב הרשמית, כדי שיוכל להסתנכרן מחדש.
function sendRoomError(ws, room, message) {
  send(ws, {
    type:"room_error", message,
    fen:room.game.fen(), history:room.history.slice(), moves:room.moves.slice(),
    finished:room.finished, clock:clockSnapshot(room)
  });
}

// מסיימת משחק פעם אחת ושומרת גם את הזמן שחלף עד רגע הסיום.
function finishGame(room, message) {
  if (room.finished) return;

  const clock = clockSnapshot(room);
  if (room.clock.startedAt !== null && room.clock.initialMs > 0) {
    const activeIndex = room.game.turn() === "w" ? 0 : 1;
    room.clock.remainingMs[activeIndex] = clock.remaining[activeIndex];
  }

  room.clock.startedAt = null;
  room.finished = true;

  const finalState = {
    fen:room.game.fen(), history:room.history.slice(), moves:room.moves.slice(),
    finished:true, clock:clockSnapshot(room)
  };
  for (const player of room.players) {
    if (player) send(player.ws, { type:"game_over", message, ...finalState });
  }
}
function expireRoomClock(room, colorIndex) {
  if (room.finished) return;
  room.clock.remainingMs[colorIndex] = 0;
  room.clock.startedAt = null;
  const loser = colorIndex === 0 ? "הלבן" : "השחור";
  const winner = colorIndex === 0 ? "השחור" : "הלבן";
  const message = room.game.isInsufficientMaterial()
    ? "הזמן של " + loser + " אזל — תיקו בגלל חומר לא מספיק למט."
    : "הזמן של " + loser + " אזל — " + winner + " ניצח.";
  finishGame(room, message);
}
function roomStatus(room) {
  const count = connectedCount(room);
  if (count === 2 && room.clock.initialMs > 0 && room.clock.startedAt === null && !room.finished) {
    room.clock.startedAt = Date.now();
  }
  const clock = clockSnapshot(room);
  for (const player of room.players) {
    if (player && player.ws) send(player.ws, { type:"room_status", connectedPlayers:count, ready:count === 2, clock });
  }
}
function attach(room, color, ws, token) {
  const previous = room.players[color] && room.players[color].ws;
  if (previous && previous !== ws && previous.readyState === WebSocket.OPEN) previous.close(4001, "Reconnected in another tab");
  room.players[color] = { token, ws };
  ws.roomId = room.id;
  ws.color = color;
  room.lastActivity = Date.now();
}
const server = http.createServer((req,res) => {
  const pathname = new URL(req.url, "http://localhost").pathname;
  if (pathname === "/health") {
    res.writeHead(200, {"content-type":"application/json","cache-control":"no-store"});
    return res.end(JSON.stringify({ok:true,rooms:rooms.size}));
  }
  if (pathname === "/" || pathname === "/index.html") {
    res.writeHead(200, {"content-type":"text/html; charset=utf-8","cache-control":"no-store"});
    return fs.createReadStream(path.join(__dirname,"site","index.html")).pipe(res);
  }
  const asset = STATIC_ASSETS.get(pathname);
  if (asset) {
    return fs.readFile(path.join(__dirname,"site",asset.file),(error,content) => {
      if (error) {
        res.writeHead(404, {"content-type":"text/plain; charset=utf-8","cache-control":"no-store"});
        return res.end("Not found");
      }
      res.writeHead(200, {"content-type":asset.contentType,"cache-control":"no-store"});
      res.end(content);
    });
  }
  if (pathname === "/favicon.ico") { res.writeHead(204); return res.end(); }
  res.writeHead(404, {"content-type":"text/plain; charset=utf-8"});
  res.end("Not found");
});
const wss = new WebSocketServer({ server, path:"/ws", maxPayload:2048 });
wss.on("connection", ws => {
  ws.on("message", raw => {
    let message;
    try { message = JSON.parse(raw.toString()); } catch (_) { return send(ws,{type:"room_error",message:"התקבלה הודעה לא תקינה."}); }

    if (message.type === "create") {
      const id = makeRoomId();
      const allowedTimes = [0,60000,180000,300000,600000,900000,1800000];
      const allowedIncrements = [0,1000,2000,3000,5000,10000];
      const requestedTime = Number(message.initialMs);
      const requestedIncrement = Number(message.incrementMs);
      const initialMs = allowedTimes.includes(requestedTime) ? requestedTime : 600000;
      const incrementMs = initialMs && allowedIncrements.includes(requestedIncrement) ? requestedIncrement : 0;
      const room = {
        id, game:new Chess(), players:[null,null], moves:[], history:[],
        finished:false, lastActivity:Date.now(),
        clock:{initialMs, incrementMs, remainingMs:[initialMs,initialMs], startedAt:null}
      };
      room.history.push(room.game.fen());
      const token = makeToken();
      attach(room,0,ws,token);
      rooms.set(id,room);
      send(ws,roomState(room,0,token,"room_created"));
      roomStatus(room);
      return;
    }

    if (message.type === "join") {
      const id = String(message.room || "").toUpperCase();
      const room = rooms.get(id);
      if (!room) return send(ws,{type:"room_error",message:"החדר לא נמצא. בקש מהמארח ליצור חדר חדש."});
      let color = -1;
      let token = String(message.token || "");
      if (token) color = room.players.findIndex(player => player && player.token === token);
      if (color < 0) {
        if (token) return send(ws,{type:"room_error",message:"מפתח החיבור אינו תואם לחדר. פתח את קישור ההזמנה המקורי."});
        color = room.players[0] === null ? 0 : room.players[1] === null ? 1 : -1;
        if (color < 0) return send(ws,{type:"room_error",message:"החדר מלא. אפשר להצטרף רק שני שחקנים."});
        token = makeToken();
      }
      attach(room,color,ws,token);
      send(ws,roomState(room,color,token,"room_joined"));
      roomStatus(room);
      return;
    }

    const room = rooms.get(ws.roomId);
    if (!room || !room.players[ws.color] || room.players[ws.color].ws !== ws) {
      return send(ws,{type:"room_error",message:"החיבור לחדר אינו פעיל. פתח את קישור החדר מחדש."});
    }
    room.lastActivity = Date.now();

    if (message.type === "move") {
      if (room.finished || connectedCount(room) !== 2) return sendRoomError(ws,room,"המשחק אינו מוכן לקבל מהלכים.");
      const side = room.game.turn() === "w" ? 0 : 1;
      if (ws.color !== side) return sendRoomError(ws,room,"זה לא התור שלך.");
      const uci = String(message.uci || "");
      if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) return sendRoomError(ws,room,"קידוד המהלך אינו תקין.");
      const now = Date.now();
      let timeAfterMove = null;
      if (room.clock.initialMs > 0) {
        const elapsed = room.clock.startedAt === null ? 0 : now - room.clock.startedAt;
        timeAfterMove = room.clock.remainingMs[side] - elapsed;
        if (timeAfterMove <= 0) {
          expireRoomClock(room, side);
          return;
        }
      }
      let result;
      try {
        result = room.game.move({
          from:uci.slice(0,2), to:uci.slice(2,4),
          ...(uci.length === 5 ? {promotion:uci[4]} : {})
        });
      } catch (_) { result = null; }
      if (!result) return sendRoomError(ws,room,"המהלך אינו חוקי לפי חוקי השחמט.");
      if (room.clock.initialMs > 0) {
        room.clock.remainingMs[side] = timeAfterMove + room.clock.incrementMs;
        room.clock.startedAt = null;
      }
      room.moves.push(uci);
      room.history.push(room.game.fen());

      let endMessage = null;
      if (room.game.isGameOver()) {
        if (room.game.isCheckmate()) endMessage = room.game.turn() === "w" ? "מט! השחור ניצח." : "מט! הלבן ניצח.";
        else if (room.game.isStalemate()) endMessage = "תיקו — פט.";
        else if (room.game.isThreefoldRepetition()) endMessage = "תיקו — חזרה משולשת.";
        else if (room.game.isInsufficientMaterial()) endMessage = "תיקו — אין מספיק חומר למט.";
        else endMessage = "המשחק הסתיים בתיקו.";
      } else if (room.clock.initialMs > 0 && connectedCount(room) === 2) {
        room.clock.startedAt = Date.now();
      }

      const state = {
        fen:room.game.fen(), history:room.history, moves:room.moves,
        finished:Boolean(endMessage), clock:clockSnapshot(room)
      };
      send(ws,{type:"move_accepted",...state});
      const opponent = room.players[1-ws.color];
      if (opponent) send(opponent.ws,{type:"opponent_move",uci,color:ws.color,...state});
      if (endMessage) finishGame(room,endMessage);
      return;
    }

    if (message.type === "resign") {
      if (room.finished) return;
      finishGame(room,ws.color === 0 ? "הלבן נכנע — השחור ניצח." : "השחור נכנע — הלבן ניצח.");
      return;
    }
  });

  ws.on("close", () => {
    const room = rooms.get(ws.roomId);
    if (!room) return;
    const player = room.players[ws.color];
    if (player && player.ws === ws) {
      player.ws = null;
      room.lastActivity = Date.now();
      const opponent = room.players[1-ws.color];
      send(opponent && opponent.ws,{type:"peer_disconnected"});
      roomStatus(room);
    }
  });
  ws.on("error", () => {});
});

// חדרים ריקים נשמרים לזמן קצר כדי לאפשר חיבור מחדש לאחר רענון או ניתוק.
const cleanup = setInterval(() => {
  const cutoff = Date.now() - 3 * 60 * 60 * 1000;
  for (const [id,room] of rooms) if (connectedCount(room) === 0 && room.lastActivity < cutoff) rooms.delete(id);
}, 60 * 1000);

// השעון נבדק בשרת גם בלי מהלך נוסף, כדי להכריע נפילת זמן.
const clockMonitor = setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    if (room.finished || room.clock.initialMs <= 0 || room.clock.startedAt === null) continue;
    const side = room.game.turn() === "w" ? 0 : 1;
    if (room.clock.remainingMs[side] - (now - room.clock.startedAt) <= 0) expireRoomClock(room, side);
  }
}, 250);

server.listen(PORT,"0.0.0.0",() => console.log("Chess server listening on " + PORT));
process.on("SIGTERM",() => {
  clearInterval(cleanup);
  clearInterval(clockMonitor);
  for (const ws of wss.clients) ws.close(1001,"Server restarting");
  server.close(() => process.exit(0));
});
