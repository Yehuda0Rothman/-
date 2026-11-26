"use strict";
// =====================================================================
// game.js — THE USER INTERFACE
// =====================================================================
// Connects the web page (index.html) to the rules (chess-rules.js)
// and the computer player (ai.js):
//   • draws the board and move list
//   • handles clicks: select a piece, then click a target square
//   • asks the AI for a move when it is black's turn
//   • detects the end of the game (checkmate, stalemate, draws)
// =====================================================================
//
// ---------------------------------------------------------------------
// הסבר בעברית — מבוא לקובץ
// ---------------------------------------------------------------------
// כיתה, הקובץ הזה הוא "המנצח על התזמורת". הוא לא יודע את חוקי
// השחמט (זה chess-rules.js) ולא יודע לחשוב על מהלכים (זה ai.js).
// התפקיד שלו הוא לחבר את כולם לדף האינטרנט:
//   • לצייר את הלוח ואת רשימת המהלכים על המסך.
//   • להקשיב ללחיצות של השחקן ולהפוך אותן למהלכים.
//   • לבקש מהמחשב מהלך כשמגיע תורו.
//   • לזהות מתי המשחק נגמר (מט, פט, תיקו).
//
// עיקרון מרכזי: כל המידע על המשחק נשמר באובייקט אחד (game), ואחרי
// כל שינוי קוראים ל-render() שמצייר הכל מחדש לפי המידע הזה.
// כך המסך תמיד משקף בדיוק את מצב המשחק.
// =====================================================================

// הסבר: טבלאות תרגום מאות הכלי לסמל יוניקוד שמוצג על המסך, ולשם
// בעברית (שמשמש לנגישות — קוראי מסך לעיוורים).
const PIECE_SYMBOLS = {
  P: "♙", N: "♘", B: "♗", R: "♖", Q: "♕", K: "♔",
  p: "♟", n: "♞", b: "♝", r: "♜", q: "♛", k: "♚"
};
const PIECE_NAMES = {
  P: "רגלי לבן", N: "פרש לבן", B: "רץ לבן", R: "צריח לבן", Q: "מלכה לבנה", K: "מלך לבן",
  p: "רגלי שחור", n: "פרש שחור", b: "רץ שחור", r: "צריח שחור", q: "מלכה שחורה", k: "מלך שחור"
};

// Page elements we use often.
// הסבר: במקום לחפש כל פעם אלמנט בדף (getElementById), מחפשים את
// כולם פעם אחת בהתחלה ושומרים באובייקט ui. זה גם מהיר יותר וגם
// מסודר יותר — כל החיבורים לדף נמצאים במקום אחד.
const ui = {
  board: document.getElementById("board"),
  status: document.getElementById("status"),
  moves: document.getElementById("moves"),
  depth: document.getElementById("depth"),
  nodes: document.getElementById("nodes"),
  elapsed: document.getElementById("elapsed"),
  searchDepth: document.getElementById("searchDepth"),
  newGame: document.getElementById("newGame"),
  undo: document.getElementById("undo"),
  flip: document.getElementById("flip"),
  resign: document.getElementById("resign")
};

// Everything about the current game.
// הסבר: "מצב המשחק" — כל מה שצריך לדעת על המשחק הנוכחי.
// שימו לב שיש כאן גם דברים שהם לא חלק מחוקי השחמט, אלא רק מהממשק:
// איזה כלי נבחר, האם הלוח הפוך, האם המחשב חושב כרגע.
const game = {
  position: parseFEN(START_FEN),
  history: [],     // FEN of every position so far (for undo and repetition)
  moveList: [],    // every move played, in UCI text ("e2e4")
  selected: null,  // { row, col } of the piece the player clicked, or null
  targets: [],     // legal moves of the selected piece
  flipped: false,  // draw the board from black's side?
  thinking: false, // is the computer searching right now?
  finished: false,
  started: false // the board is idle until the player presses "New Game"
};

// Online-play state. Filled in by online.js; when active, the opponent
// is another person instead of the computer.
// הסבר: מצב המשחק המקוון. כשהוא פעיל (active), היריב הוא בן אדם אחר
// דרך האינטרנט ולא המחשב. online.js הוא זה שממלא את השדות האלה.
const online = {
  active: false,
  ready: false, // both players connected
  color: null   // "w" or "b" — our color in the online game
};

// ---------------------------------------------------------------------
// Drawing
// ציור — הפונקציות שמעדכנות את מה שרואים על המסך.
// ---------------------------------------------------------------------

// הסבר: מחזירה את המהלך האחרון ששוחק (כדי שנוכל להדגיש אותו על הלוח).
// לוקחים את הטקסט האחרון ברשימת המהלכים והופכים אותו לאובייקט מהלך.
// אם עוד לא שוחק אף מהלך — מחזירים null.
function lastMove() {
  return game.moveList.length ? uciToMove(game.moveList[game.moveList.length - 1]) : null;
}

// הסבר: מציירת את הלוח מאפס. בואו נבין את השלבים:
//   1. מוחקים את כל המשבצות הישנות (replaceChildren בלי פרמטרים).
//   2. עוברים על 64 מיקומים על המסך (שורת מסך ועמודת מסך).
//   3. "היפוך לוח": אם הלוח הפוך, משבצת המסך השמאלית-עליונה מציגה
//      את h1 ולא את a8. לכן ממירים: row = 7 - screenRow. ההבדל בין
//      "מיקום על המסך" ל"מיקום על הלוח" הוא הרעיון החשוב כאן.
//   4. לכל משבצת יוצרים כפתור (button), נותנים לו צבע בהיר/כהה
//      (אם שורה+עמודה זוגי — בהיר), ושומרים בו את השורה והעמודה
//      (dataset) כדי שנדע על מה לחצו.
//   5. מוסיפים הדגשות: המשבצת שנבחרה, משבצות המהלך האחרון, ומשבצות
//      שאפשר לזוז אליהן (עם סימון שונה אם זו הכאה).
//   6. אם יש כלי — מוסיפים את הסמל שלו.
//   7. מוסיפים קואורדינטות: אותיות בשורה התחתונה, מספרים בעמודה השמאלית.
function renderBoard() {
  ui.board.replaceChildren();
  const last = lastMove();

  for (let screenRow = 0; screenRow < 8; screenRow++) {
    for (let screenCol = 0; screenCol < 8; screenCol++) {
      // When flipped, the top-left of the screen shows square h1.
      const row = game.flipped ? 7 - screenRow : screenRow;
      const col = game.flipped ? 7 - screenCol : screenCol;
      const piece = game.position.board[row][col];

      const square = document.createElement("button");
      square.type = "button";
      square.className = "square " + ((row + col) % 2 === 0 ? "light" : "dark");
      square.dataset.row = row;
      square.dataset.col = col;
      square.setAttribute("aria-label", squareName(row, col) + ", " + (piece ? PIECE_NAMES[piece] : "ריק"));

      // Highlights
      if (game.selected && game.selected.row === row && game.selected.col === col) {
        square.classList.add("selected");
      }
      if (last && ((last.fromRow === row && last.fromCol === col) || (last.toRow === row && last.toCol === col))) {
        square.classList.add("last-move");
      }
      if (game.targets.some(move => move.toRow === row && move.toCol === col)) {
        square.classList.add(piece ? "capture-target" : "legal-target");
      }

      if (piece) {
        const symbol = document.createElement("span");
        symbol.className = "piece " + (colorOf(piece) === "w" ? "white-piece" : "black-piece");
        symbol.textContent = PIECE_SYMBOLS[piece];
        square.appendChild(symbol);
      }

      // Coordinates: letters along the bottom row, numbers along the left column.
      if (screenRow === 7) addCoordinate(square, "file-coordinate", "abcdefgh"[col]);
      if (screenCol === 0) addCoordinate(square, "rank-coordinate", String(8 - row));

      ui.board.appendChild(square);
    }
  }
}

// הסבר: פונקציית עזר שמוסיפה תווית קטנה (אות או מספר) בפינת משבצת.
// יוצרים אלמנט span, נותנים לו מחלקת עיצוב ואת הטקסט, ומכניסים למשבצת.
function addCoordinate(square, className, text) {
  const label = document.createElement("span");
  label.className = "coordinate " + className;
  label.textContent = text;
  square.appendChild(label);
}

// הסבר: מציירת את רשימת המהלכים בצורה של טבלה: מספר מהלך, מהלך
// הלבן, מהלך השחור. למה הלולאה קופצת ב-2 (i += 2)? כי כל "שורה"
// בטבלה מכילה שני מהלכים — אחד של כל צד.
//   • i / 2 + 1 — מספר המהלך (0→1, 2→2, 4→3...).
//   • game.moveList[i + 1] || "" — ייתכן שהשחור עוד לא שיחק, ואז
//     התא ריק.
// בסוף גוללים את הרשימה לתחתית, כדי שהמהלך האחרון תמיד ייראה.
function renderMoveList() {
  ui.moves.replaceChildren();
  for (let i = 0; i < game.moveList.length; i += 2) {
    const row = document.createElement("div");
    row.className = "move-row";
    const number = document.createElement("span");
    number.className = "move-number";
    number.textContent = (i / 2 + 1) + ".";
    const whiteMove = document.createElement("span");
    whiteMove.textContent = game.moveList[i];
    const blackMove = document.createElement("span");
    blackMove.textContent = game.moveList[i + 1] || "";
    row.append(number, whiteMove, blackMove);
    ui.moves.appendChild(row);
  }
  ui.moves.scrollTop = ui.moves.scrollHeight;
}

// הסבר: פונקציית הציור הראשית — מעדכנת את כל המסך:
//   1. מציירת לוח ורשימת מהלכים.
//   2. מחליטה אילו כפתורים פעילים: "בטל מהלך" כבוי במשחק מקוון,
//      כשהמחשב חושב, או כשאין מהלכים לבטל. "היכנע" כבוי כשהמשחק נגמר
//      או כשהמחשב חושב.
//   3. מעדכנת את שורת הסטטוס — אבל רק אם אין כבר הודעה חשובה יותר
//      (סוף משחק או "המחשב חושב"), כדי לא לדרוס אותה.
//      במשחק מקוון: האם ממתינים ליריב, תורי, או תור היריב.
//      מול המחשב: תורך או תור המחשב.
function render() {
  renderBoard();
  renderMoveList();
  ui.undo.disabled = online.active || game.thinking || game.moveList.length === 0;
  ui.resign.disabled = !game.started || game.finished || game.thinking;

  // Keep the idle message until the player explicitly starts a game.
  if (!game.started) {
    setStatus('לחץ על "משחק חדש" כדי להתחיל.');
    return;
  }
  if (game.finished || game.thinking) return;
  if (online.active) {
    if (!online.ready) setStatus("ממתין לחיבור השחקן השני…");
    else setStatus(game.position.turn === online.color ? "תורך — בצע מהלך." : "היריב חושב…");
  } else {
    setStatus(game.position.turn === "w" ? "תורך — הלבן משחק." : "תור המחשב.");
  }
}

// הסבר: כותבת הודעה בשורת הסטטוס שמעל/מתחת ללוח.
function setStatus(text) {
  ui.status.textContent = text;
}

// הסבר: מאפסת את הסטטיסטיקות של המחשב (עומק, מספר עמדות, זמן) לקו "—".
// שימו לב לטריק: השמה משורשרת a = b = c = "—" מציבה את אותו ערך בשלושתם.
function clearStats() {
  ui.depth.textContent = ui.nodes.textContent = ui.elapsed.textContent = "—";
}

// ---------------------------------------------------------------------
// Playing moves
// שחקן מבצע מהלך — מהלחיצה ועד העדכון.
// ---------------------------------------------------------------------

// הסבר: מבטלת את הבחירה הנוכחית — אף כלי לא נבחר ואין משבצות מודגשות.
function clearSelection() {
  game.selected = null;
  game.targets = [];
}

/** Plays a legal move on the real game board and records it. */
// הסבר: מבצעת מהלך "אמיתי" על המשחק (לא ניסיון כמו בחיפוש של המחשב):
//   1. רושמת את המהלך ברשימת המהלכים (כטקסט UCI).
//   2. מחשבת את העמדה החדשה ושומרת אותה כעמדה הנוכחית.
//   3. שומרת את העמדה החדשה בהיסטוריה (לביטול מהלך ולבדיקת חזרה משולשת).
//   4. מבטלת את הבחירה.
function playMove(move) {
  game.moveList.push(moveToUci(move));
  game.position = makeMove(game.position, move);
  game.history.push(toFEN(game.position));
  clearSelection();
}

/** Called after every move: check for game end, redraw, maybe let the AI play. */
// הסבר: מה קורה אחרי כל מהלך? שלושה דברים, לפי הסדר:
//   1. בודקים אם המשחק נגמר.
//   2. מציירים את המסך מחדש.
//   3. אם המשחק לא נגמר, אנחנו לא במשחק מקוון, ותור השחור — מבקשים
//      מהמחשב לשחק. setTimeout עם 50 מילישניות נותן לדפדפן רגע לצייר
//      את המהלך שלנו לפני שהמחשב מתחיל לחשוב.
function afterMove() {
  checkGameEnd();
  render();
  if (game.started && !game.finished && !online.active && game.position.turn === "b") {
    setTimeout(computerMove, 50);
  }
}

// הסבר: באיזה צבע אני משחק? במשחק מקוון — הצבע שהשרת נתן לי.
// מול המחשב — תמיד לבן.
function myColor() {
  return online.active ? online.color : "w";
}

// הסבר: האם מותר לשחקן ללחוץ ולזוז עכשיו? בודקים את כל הסיבות שלא:
//   • המחשב חושב, או שהמשחק נגמר → לא.
//   • במשחק מקוון והיריב עוד לא התחבר → לא.
//   • ולבסוף: מותר רק אם זה התור של הצבע שלי.
function canPlayerMove() {
  if (!game.started || game.thinking || game.finished) return false;
  if (online.active && !online.ready) return false;
  return game.position.turn === myColor();
}

/** First click selects one of your pieces; second click on a target square moves it. */
// הסבר: כך עובדת הלחיצה על הלוח — שיטת "שתי לחיצות":
//   לחיצה ראשונה — בוחרים כלי. לחיצה שנייה — בוחרים לאן לזוז.
//
//   1. מוצאים על איזו משבצת לחצו (closest מוצא את המשבצת גם אם
//      לחצו על הסמל שבתוכה). אם אסור לזוז עכשיו — מתעלמים.
//   2. בודקים: האם המשבצת הזו היא יעד חוקי של הכלי שכבר בחרנו?
//      אם כן — מבצעים את המהלך! (ובמשחק מקוון גם שולחים אותו לשרת.)
//      בהכתרה יש 4 מהלכים לאותה משבצת — בוחרים תמיד מלכה.
//   3. אם לא — אולי השחקן בוחר כלי חדש: אם לחצו על כלי שלנו,
//      בוחרים אותו ומחשבים את כל המהלכים החוקיים שלו (מסננים מכל
//      המהלכים החוקיים רק את אלה שיוצאים מהמשבצת הזו).
//   4. אחרת (לחצו על משבצת ריקה או על כלי של היריב) — מבטלים בחירה.
function onBoardClick(event) {
  const square = event.target.closest(".square");
  if (!square || !canPlayerMove()) return;
  const row = Number(square.dataset.row);
  const col = Number(square.dataset.col);

  // Did the player click a target of the selected piece?
  const choices = game.targets.filter(move => move.toRow === row && move.toCol === col);
  if (choices.length > 0) {
    // Promotion creates 4 moves to the same square; always choose the queen.
    const move = choices.find(m => m.promotion === "Q") || choices[0];
    playMove(move);
    if (online.active) sendOnlineMove(moveToUci(move));
    afterMove();
    return;
  }

  // Otherwise: select one of our own pieces, or clear the selection.
  const piece = game.position.board[row][col];
  if (piece && colorOf(piece) === myColor()) {
    game.selected = { row, col };
    game.targets = generateLegalMoves(game.position)
      .filter(move => move.fromRow === row && move.fromCol === col);
  } else {
    clearSelection();
  }
  render();
}

// קוראת את עומק החיפוש שנבחר בתיבה ומגבילה אותו לטווח 1–20.
// כל שכבה היא חצי־מהלך אחד: תור של הלבן או תור של השחור.
function getSearchDepth() {
  const value = Math.max(1, Math.min(MAX_DEPTH, Math.floor(Number(ui.searchDepth.value) || 5)));
  ui.searchDepth.value = value;
  return value;
}

// הסבר: תור המחשב. שלבים:
//   1. בודקים שבאמת תור המחשב (המשחק לא נגמר, לא מקוון, תור השחור).
//   2. מסמנים "המחשב חושב" ומציירים את המסך — כדי שהשחקן יראה הודעה.
//   3. בעיה: החיפוש רץ על אותו "חוט" של הדף ומקפיא אותו. אם נתחיל
//      לחפש מיד — הדפדפן לא יספיק להציג את ההודעה. לכן setTimeout
//      קטן נותן לדפדפן רגע לצייר קודם.
//   4. בתוך ה-setTimeout בודקים שוב — אולי בינתיים השחקן לחץ "משחק חדש".
//   5. מריצים את findBestMove, מציגים סטטיסטיקות (עומק, עמדות, זמן),
//      משחקים את המהלך, וקוראים ל-afterMove.
function computerMove() {
  if (game.finished || online.active || game.position.turn !== "b") return;
  game.thinking = true;
  setStatus("המחשב חושב…");
  render();

  // The search runs on the main thread and freezes the page while it works.
  // setTimeout gives the browser a moment to show "thinking" first.
  setTimeout(() => {
    // The player may have started a new game in the meantime.
    if (!game.thinking || game.position.turn !== "b") return;

    const result = findBestMove(game.position, getSearchDepth());
    game.thinking = false;
    ui.depth.textContent = result.depth;
    ui.nodes.textContent = result.nodes.toLocaleString("he-IL");
    ui.elapsed.textContent = (result.timeMs / 1000).toFixed(2) + " שניות";

    if (result.move) playMove(result.move);
    afterMove();
  }, 30);
}

// ---------------------------------------------------------------------
// End of game
// סוף המשחק — זיהוי מט, פט וסוגי התיקו השונים.
// ---------------------------------------------------------------------

/** The part of a FEN that must match for a "repeated position". */
// הסבר: מתי שתי עמדות נחשבות "אותה עמדה" לצורך חזרה משולשת?
// כשהכלים, תור מי, זכויות ההצרחה ומשבצת ההכאה דרך הילוכו — זהים.
// אלה ארבעת החלקים הראשונים של FEN. את מוני המהלכים (החלקים 5-6)
// מתעלמים, כי הם תמיד משתנים. לכן לוקחים רק את 4 החלקים הראשונים.
function repetitionKey(fen) {
  return fen.split(" ").slice(0, 4).join(" ");
}

/** True when only kings remain, plus at most one knight or bishop. */
// הסבר: "חומר לא מספיק" — כשאף צד לא יכול לתת מט, גם אם ישחק מושלם.
// לדוגמה: מלך מול מלך, או מלך ופרש מול מלך.
// הלוגיקה: עוברים על כל הכלים.
//   • אם יש רגלי, צריח או מלכה — אפשר לתת מט, מחזירים false מיד.
//   • סופרים פרשים ורצים.
//   • בסוף: אם יש לכל היותר אחד — אין מספיק חומר.
// (זו גרסה מפושטת של החוק המלא, אבל היא מכסה את המקרים הנפוצים.)
function insufficientMaterial(board) {
  let minorPieces = 0;
  for (const row of board) {
    for (const piece of row) {
      if (!piece) continue;
      const type = typeOf(piece);
      if (type === "P" || type === "R" || type === "Q") return false;
      if (type === "N" || type === "B") minorPieces++;
    }
  }
  return minorPieces <= 1;
}

// הסבר: מסיימת את המשחק — מסמנת שהוא נגמר ומציגה את ההודעה.
function endGame(message) {
  game.finished = true;
  setStatus(message);
}

// הסבר: בודקת את כל הדרכים שבהן משחק יכול להיגמר, לפי הסדר:
//   1. אין מהלכים חוקיים לשחקן שתורו:
//      • אם הוא בשח → מט! הצד השני ניצח.
//      • אם לא → פט, תיקו.
//   2. 100 חצאי-מהלכים (= 50 מהלכים מלאים) בלי הכאה ובלי מהלך רגלי → תיקו.
//   3. חזרה משולשת: סופרים כמה פעמים העמדה הנוכחית מופיעה בהיסטוריה.
//      אם 3 פעמים או יותר → תיקו.
//   4. חומר לא מספיק למט → תיקו.
// כל בדיקה שמצליחה מסיימת את המשחק ויוצאת (return), כדי לא להציג
// כמה הודעות סיום.
function checkGameEnd() {
  const position = game.position;

  if (generateLegalMoves(position).length === 0) {
    if (isInCheck(position)) endGame("מט! " + (position.turn === "w" ? "השחור ניצח." : "הלבן ניצח."));
    else endGame("פט — תיקו.");
    return;
  }
  if (position.halfmoveClock >= 100) {
    endGame("תיקו לפי כלל 50 המהלכים.");
    return;
  }
  const key = repetitionKey(toFEN(position));
  if (game.history.filter(fen => repetitionKey(fen) === key).length >= 3) {
    endGame("תיקו בחזרה משולשת.");
    return;
  }
  if (insufficientMaterial(position.board)) {
    endGame("תיקו בגלל חומר לא מספיק למט.");
  }
}

// ---------------------------------------------------------------------
// Buttons
// כפתורים — מה קורה כשלוחצים על כל אחד מהכפתורים בדף.
// ---------------------------------------------------------------------

// הסבר: מתחילה משחק חדש. אם היינו במשחק מקוון — קודם עוזבים אותו.
// אחר כך מאפסים הכל: עמדת פתיחה, היסטוריה שמכילה רק את עמדת הפתיחה,
// רשימת מהלכים ריקה, אין בחירה, אין סטטיסטיקות — ומציירים.
function newGame() {
  if (online.active) leaveOnlineGame();
  game.position = parseFEN(START_FEN);
  game.history = [toFEN(game.position)];
  game.moveList = [];
  game.thinking = false;
  game.finished = false;
  game.started = true;
  clearSelection();
  clearStats();
  setStatus("משחק חדש — אתה בלבן.");
  render();
}

/** Takes back the player's last move and the computer's reply. */
// הסבר: ביטול מהלך. למה מבטלים 2 מהלכים ולא 1? כי אם נבטל רק את
// תשובת המחשב, יהיה שוב תור המחשב — והוא פשוט ישחק אותו מהלך שוב!
// לכן מבטלים גם את המהלך שלנו וגם את תשובתו. (Math.min מטפל במקרה
// שיש רק מהלך אחד ברשימה.)
// הטריק היפה: כי שמרנו את כל העמדות בהיסטוריה, אין צורך "לחשב אחורה".
// פשוט מוחקים את שתי העמדות האחרונות, וטוענים את העמדה שנשארה אחרונה.
function undoTurn() {
  if (online.active || game.thinking || game.moveList.length === 0) return;
  const count = Math.min(2, game.moveList.length);
  game.moveList.splice(-count, count);
  game.history.splice(-count, count);
  game.position = parseFEN(game.history[game.history.length - 1]);
  game.finished = false;
  clearSelection();
  clearStats();
  render();
}

// הסבר: כניעה. אם המחשב חושב או שהמשחק כבר נגמר — לא עושים כלום.
// במשחק מקוון — מודיעים לשרת (והוא יודיע לשני השחקנים).
// מול המחשב — פשוט מסיימים את המשחק עם הודעה.
function resign() {
  if (game.thinking || game.finished) return;
  if (online.active) {
    resignOnlineGame();
    return;
  }
  endGame("נכנעת — המחשב ניצח.");
  render();
}

// הסבר: כאן "מחברים" כל כפתור לפונקציה שלו (addEventListener).
// שימו לב: על הלוח יש מאזין אחד בלבד, ולא מאזין לכל משבצת. זה נקרא
// "האצלת אירועים" (event delegation) — הלחיצה "מבעבעת" מהמשבצת אל
// הלוח, ושם onBoardClick מברר על איזו משבצת לחצו.
// כפתור ההיפוך רק משנה את flipped ומצייר מחדש את הלוח.
ui.board.addEventListener("click", onBoardClick);
ui.newGame.addEventListener("click", newGame);
ui.undo.addEventListener("click", undoTurn);
ui.resign.addEventListener("click", resign);
ui.searchDepth.addEventListener("change", getSearchDepth);
ui.flip.addEventListener("click", () => {
  game.flipped = !game.flipped;
  renderBoard();
});

// הדף נטען במצב המתנה; משחק מתחיל רק אחרי לחיצה על "משחק חדש".
game.history = [toFEN(game.position)];
render();