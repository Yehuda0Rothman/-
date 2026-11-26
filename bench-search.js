// Isolated benchmark: current engine, iterative deepening vs one fixed-depth search.
const fs = require("node:fs");
const vm = require("node:vm");
const { performance } = require("node:perf_hooks");

const rules = fs.readFileSync("chess-modular/chess-rules.js", "utf8");
const ai = fs.readFileSync("chess-modular/ai.js", "utf8");

const harness = String.raw`
const positions = [
  {
    name: "Starting position",
    fen: START_FEN
  },
  {
    name: "Ruy Lopez opening",
    fen: "r1bqk2r/1pppbppp/p1n2n2/4p3/B3P3/5N2/PPPP1PPP/RNBQ1RK1 w kq - 4 6"
  },
  {
    name: "Sicilian opening",
    fen: "rnbqkb1r/1p2pppp/p2p1n2/2p5/3NP3/2N5/PPP2PPP/R1BQKB1R w KQkq - 0 6"
  }
];

function directSearch(position, depth) {
  const search = { nodes: 0 };
  const rootMoves = orderMoves(position, generateLegalMoves(position));
  if (rootMoves.length === 0) {
    return { move: null, score: 0, nodes: 0 };
  }
  const result = searchRoot(position, rootMoves, depth, search);
  return { move: result.move, score: result.score, nodes: search.nodes };
}

function iterativeSearch(position, targetDepth) {
  const search = { nodes: 0 };
  let rootMoves = orderMoves(position, generateLegalMoves(position));
  if (rootMoves.length === 0) {
    return { move: null, score: 0, nodes: 0, completedDepth: 0 };
  }

  let bestMove = rootMoves[0];
  let bestScore = 0;
  let completedDepth = 0;

  for (let depth = 1; depth <= targetDepth; depth++) {
    const result = searchRoot(position, rootMoves, depth, search);
    bestMove = result.move;
    bestScore = result.score;
    completedDepth = depth;
    rootMoves = [bestMove, ...rootMoves.filter(move => move !== bestMove)];
    if (Math.abs(result.score) > MATE_SCORE - 1000) break;
  }

  return { move: bestMove, score: bestScore, nodes: search.nodes, completedDepth };
}

function timed(fn) {
  const start = performance.now();
  const result = fn();
  return { ...result, ms: performance.now() - start };
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

const rows = [];
for (const item of positions) {
  const position = parseFEN(item.fen);

  for (const depth of [5]) {
    // Warm both code paths before measuring.
    directSearch(position, depth);
    iterativeSearch(position, depth);

    const direct = [];
    const iterative = [];

    // Alternate order to reduce bias from CPU temperature / scheduling.
    for (let rep = 0; rep < 3; rep++) {
      if (rep % 2 === 0) {
        direct.push(timed(() => directSearch(position, depth)));
        iterative.push(timed(() => iterativeSearch(position, depth)));
      } else {
        iterative.push(timed(() => iterativeSearch(position, depth)));
        direct.push(timed(() => directSearch(position, depth)));
      }
    }

    const dNodes = median(direct.map(x => x.nodes));
    const iNodes = median(iterative.map(x => x.nodes));
    const dMs = median(direct.map(x => x.ms));
    const iMs = median(iterative.map(x => x.ms));
    const row = {
      position: item.name,
      depth,
      direct: {
        medianNodes: dNodes,
        medianMs: Number(dMs.toFixed(2)),
        move: moveToUci(direct[0].move),
        score: direct[0].score
      },
      iterative: {
        medianNodes: iNodes,
        medianMs: Number(iMs.toFixed(2)),
        move: moveToUci(iterative[0].move),
        score: iterative[0].score
      },
      nodeChangePercent: Number(((iNodes - dNodes) / dNodes * 100).toFixed(2)),
      timeChangePercent: Number(((iMs - dMs) / dMs * 100).toFixed(2))
    };
    rows.push(row);
    console.log(JSON.stringify(row));
  }
}
console.log("SUMMARY " + JSON.stringify(rows));
`;

const source = rules + "\n" + ai + "\n" + harness;
vm.runInNewContext(source, { console, performance });
