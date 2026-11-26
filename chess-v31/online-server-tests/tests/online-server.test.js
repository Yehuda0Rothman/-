"use strict";

const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const net = require("node:net");
const path = require("node:path");
const { test } = require("node:test");
const WebSocket = require("ws");

function freePort() {
  return new Promise((resolve, reject) => {
    const listener = net.createServer();
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", () => {
      const port = listener.address().port;
      listener.close(error => error ? reject(error) : resolve(port));
    });
  });
}

function waitForMessage(socket, type, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Timed out waiting for " + type));
    }, timeoutMs);

    function cleanup() {
      clearTimeout(timer);
      socket.off("message", onMessage);
      socket.off("close", onClose);
    }

    function onMessage(raw) {
      let message;
      try {
        message = JSON.parse(raw.toString());
      } catch (_) {
        return;
      }
      if (message.type !== type) return;
      cleanup();
      resolve(message);
    }

    function onClose() {
      cleanup();
      reject(new Error("Socket closed while waiting for " + type));
    }

    socket.on("message", onMessage);
    socket.once("close", onClose);
  });
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    socket.once("open", () => resolve(socket));
    socket.once("error", reject);
  });
}

function startServer(port) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["server.js"], {
      cwd: path.resolve(__dirname, ".."),
      env: { ...process.env, PORT: String(port) },
      stdio: ["ignore", "pipe", "pipe"]
    });

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("Server did not start in time"));
    }, 7000);

    child.once("error", error => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", code => {
      clearTimeout(timer);
      reject(new Error("Server exited before starting (code " + code + ")"));
    });
    child.stdout.on("data", chunk => {
      if (chunk.toString().includes("Chess server listening")) {
        clearTimeout(timer);
        resolve(child);
      }
    });
  });
}

test("online moves are acknowledged, rejected moves resync, and game over carries final state", async t => {
  const port = await freePort();
  const server = await startServer(port);
  const sockets = [];

  t.after(async () => {
    for (const socket of sockets) {
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.terminate();
      }
    }
    if (server.exitCode === null) {
      server.kill("SIGTERM");
      await new Promise(resolve => server.once("exit", resolve));
    }
  });

  const url = "ws://127.0.0.1:" + port + "/ws";
  const white = await connect(url);
  sockets.push(white);

  const createdPromise = waitForMessage(white, "room_created");
  white.send(JSON.stringify({ type:"create", initialMs:60000, incrementMs:1000 }));
  const created = await createdPromise;
  assert.match(created.room, /^[A-F0-9]{6}$/);

  const black = await connect(url);
  sockets.push(black);
  const joinedPromise = waitForMessage(black, "room_joined");
  black.send(JSON.stringify({ type:"join", room:created.room }));
  await joinedPromise;

  const acceptedPromise = waitForMessage(white, "move_accepted");
  const opponentPromise = waitForMessage(black, "opponent_move");
  white.send(JSON.stringify({ type:"move", uci:"e2e4" }));
  const [accepted, opponentMove] = await Promise.all([acceptedPromise, opponentPromise]);

  assert.equal(opponentMove.fen, accepted.fen);
  assert.deepEqual(accepted.moves, ["e2e4"]);
  assert.equal(accepted.history.length, 2);

  // The white player tries to move again while it is black's turn.
  const rejectedPromise = waitForMessage(white, "room_error");
  white.send(JSON.stringify({ type:"move", uci:"d2d4" }));
  const rejected = await rejectedPromise;
  assert.equal(rejected.fen, accepted.fen);
  assert.deepEqual(rejected.moves, accepted.moves);
  assert.deepEqual(rejected.history, accepted.history);
  assert.ok(rejected.clock);

  await new Promise(resolve => setTimeout(resolve, 60));
  const whiteGameOverPromise = waitForMessage(white, "game_over");
  const blackGameOverPromise = waitForMessage(black, "game_over");
  black.send(JSON.stringify({ type:"resign" }));
  const [whiteGameOver, blackGameOver] = await Promise.all([
    whiteGameOverPromise,
    blackGameOverPromise
  ]);

  for (const finalState of [whiteGameOver, blackGameOver]) {
    assert.equal(finalState.finished, true);
    assert.equal(finalState.fen, accepted.fen);
    assert.deepEqual(finalState.moves, accepted.moves);
    assert.equal(finalState.clock.running, false);
    assert.ok(finalState.clock.remaining[1] < 60000);
  }
});
