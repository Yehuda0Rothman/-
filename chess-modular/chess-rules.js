"use strict";
// =====================================================================
// chess-rules.js — THE RULES OF CHESS
// =====================================================================
// This file knows how pieces move and when a move is legal.
// It does NOT draw anything and does NOT choose moves (see ai.js).
//
// HOW THE BOARD IS STORED
//   board[row][col] — an 8x8 array (array of 8 rows, each with 8 squares)
//   row 0 = rank 8 (black's back row)   row 7 = rank 1 (white's back row)
//   col 0 = file "a"                    col 7 = file "h"
//
// HOW PIECES ARE STORED (same letters as FEN notation)
//   Uppercase = white, lowercase = black, null = empty square
//   P = pawn, N = knight, B = bishop, R = rook, Q = queen, K = king
//
// A "POSITION" is an object holding everything needed to continue a game:
//   {
//     board,            // the 8x8 array described above
//     turn,             // "w" or "b" — whose turn it is
//     castling,         // { K, Q, k, q } — which castling moves are still allowed
//     enPassant,        // { row, col } a pawn may capture into, or null
//     halfmoveClock,    // moves since last capture/pawn move (50-move rule)
//     fullmoveNumber    // starts at 1, grows after each black move
//   }
//
// A "MOVE" is an object: { fromRow, fromCol, toRow, toCol, promotion }
//   promotion is null, or "Q" / "R" / "B" / "N" when a pawn promotes.
//
// Positions are never changed in place: makeMove() returns a NEW position.
// This is slower than editing the board, but much easier to reason about.
// =====================================================================
//
// ---------------------------------------------------------------------
// הסבר בעברית — מבוא לקובץ
// ---------------------------------------------------------------------
// כיתה, הקובץ הזה הוא "ספר החוקים" של השחמט. הוא לא מצייר כלום על
// המסך ולא מחליט איזה מהלך לשחק — הוא רק יודע לענות על שאלות כמו:
// "איך זז הפרש?", "האם המלך בשח?", "אילו מהלכים חוקיים יש עכשיו?".
//
// הלוח נשמר כמערך דו-ממדי של 8 שורות ו-8 עמודות. שורה 0 היא הצד של
// השחור (שורה 8 בלוח האמיתי), ושורה 7 היא הצד של הלבן (שורה 1).
// כל משבצת מכילה אות: אות גדולה = כלי לבן, אות קטנה = כלי שחור,
// ו-null = משבצת ריקה.
//
// "עמדה" (position) היא תמונת מצב מלאה של המשחק: הלוח, תור מי,
// זכויות הצרחה, משבצת "הכאה דרך הילוכו", ומוני מהלכים.
// "מהלך" (move) הוא פשוט: מאיפה (שורה, עמודה) ולאן (שורה, עמודה),
// ואם רגלי מגיע לסוף הלוח — לאיזה כלי הוא מוכתר.
//
// עיקרון חשוב: אנחנו אף פעם לא משנים עמדה קיימת. כל מהלך יוצר עמדה
// חדשה. כך קל מאוד "לנסות" מהלך ולבדוק מה קורה, בלי לקלקל את המקור.
// =====================================================================

// הסבר: זו העמדה ההתחלתית של כל משחק שחמט, כתובה בפורמט FEN
// (פורמט טקסט סטנדרטי לתיאור עמדה — נסביר אותו בהמשך).
const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

// Direction lists as [rowChange, colChange].
// הסבר: כאן אנחנו מגדירים "כיווני תנועה". כל זוג [שינוי בשורה, שינוי בעמודה]
// אומר לנו לאן כלי יכול לזוז צעד אחד.
//   • פרש — 8 קפיצות בצורת האות L (שתיים לכיוון אחד ואחת לצד).
//   • מלך — 8 צעדים לכל המשבצות הצמודות.
//   • רץ — 4 אלכסונים.  • צריח — 4 קווים ישרים.
//   • מלכה — שילוב של רץ וצריח (לכן אנחנו פשוט מחברים את שתי הרשימות).
// במקום לכתוב קוד נפרד לכל כלי, נשתמש ברשימות האלה בלולאות.
const KNIGHT_JUMPS = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
const KING_STEPS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
const BISHOP_DIRECTIONS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const ROOK_DIRECTIONS = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const QUEEN_DIRECTIONS = [...BISHOP_DIRECTIONS, ...ROOK_DIRECTIONS];
// הסבר: הכלים שרגלי יכול להפוך אליהם כשהוא מגיע לקצה הלוח.
const PROMOTION_PIECES = ["Q", "R", "B", "N"];

// ---------------------------------------------------------------------
// Small helpers
// פונקציות עזר קטנות — "כלי עבודה" שכל שאר הקוד משתמש בהם.
// ---------------------------------------------------------------------

/** "w" for a white piece, "b" for a black piece. */
// הסבר: איך יודעים מה צבע הכלי? בודקים אם האות כבר גדולה.
// אם האות שווה לגרסה הגדולה של עצמה — היא גדולה, כלומר כלי לבן.
// אחרת — אות קטנה, כלי שחור.
function colorOf(piece) {
  return piece === piece.toUpperCase() ? "w" : "b";
}

/** The piece type as an uppercase letter, e.g. "n" -> "N". */
// הסבר: לפעמים לא אכפת לנו מהצבע, רק מסוג הכלי (פרש? רץ?).
// לכן הופכים את האות לגדולה, וכך "n" ו-"N" שניהם נהיים "N".
function typeOf(piece) {
  return piece.toUpperCase();
}

// הסבר: מחזירה את הצבע של היריב. אם קיבלנו לבן — מחזירים שחור, ולהפך.
function opponent(color) {
  return color === "w" ? "b" : "w";
}

// הסבר: בודקת שמשבצת נמצאת בתוך הלוח. שורה ועמודה חייבות להיות
// בין 0 ל-7. זה חשוב כי כשמחשבים קפיצה של פרש, למשל, אפשר
// "ליפול" מחוץ ללוח — ואז צריך להתעלם מהמשבצת הזו.
function isOnBoard(row, col) {
  return row >= 0 && row < 8 && col >= 0 && col < 8;
}

/** The piece on a square, or null if the square is empty or off the board. */
// הסבר: גרסה "בטוחה" לקריאת משבצת. אם המשבצת מחוץ ללוח,
// במקום לקרוס אנחנו פשוט מחזירים null (כאילו היא ריקה).
function pieceAt(board, row, col) {
  return isOnBoard(row, col) ? board[row][col] : null;
}

/** (row 7, col 4) -> "e1" */
// הסבר: ממירה מספרי שורה ועמודה לשם משבצת כמו בשחמט האמיתי.
// העמודה הופכת לאות (0→a, 1→b ...), והשורה הופכת למספר.
// למה 8 פחות השורה? כי אצלנו שורה 0 היא למעלה (שורה 8 בלוח),
// ושורה 7 היא למטה (שורה 1 בלוח) — הסדר הפוך.
function squareName(row, col) {
  return "abcdefgh"[col] + (8 - row);
}

/** "e1" -> { row: 7, col: 4 } */
// הסבר: הפעולה ההפוכה לפונקציה הקודמת. מקבלים טקסט כמו "e1":
//   • התו השני ("1") — הופכים למספר ומחשבים 8 פחות אותו → שורה 7.
//   • התו הראשון ("e") — קוד ה-ASCII של 'a' הוא 97, ולכן
//     קוד התו פחות 97 נותן 0 עבור a, 1 עבור b, וכן הלאה → עמודה 4.
function parseSquare(name) {
  return { row: 8 - Number(name[1]), col: name.charCodeAt(0) - 97 };
}

// ---------------------------------------------------------------------
// FEN: a standard one-line text format for a chess position.
// Example: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
//   1. pieces row by row (digits = number of empty squares)
//   2. side to move   3. castling rights   4. en-passant square
//   5. halfmove clock 6. fullmove number
//
// הסבר: FEN היא דרך לכתוב עמדה שלמה בשורת טקסט אחת. היא בנויה
// משישה חלקים מופרדים ברווחים: הכלים (שורה אחרי שורה, מופרדות ב-/,
// כשספרה מציינת כמה משבצות ריקות ברצף), תור מי, זכויות הצרחה,
// משבצת הכאה דרך הילוכו, מונה חצאי-מהלכים, ומספר המהלך.
// ---------------------------------------------------------------------

// הסבר: parseFEN "קוראת" טקסט FEN ובונה ממנו אובייקט עמדה.
// שלבי העבודה:
//   1. מפרקים את הטקסט לשישה חלקים לפי רווחים.
//   2. את חלק הכלים מפרקים לפי "/" לשמונה שורות. בכל שורה עוברים
//      תו אחרי תו: אם זו ספרה (נניח 3) — מוסיפים 3 משבצות ריקות;
//      אם זו אות — מוסיפים את הכלי עצמו.
//   3. בודקים שיצא לוח תקין של 8 על 8, אחרת זורקים שגיאה.
//   4. ממלאים את שאר השדות: תור, זכויות הצרחה (האם האות מופיעה
//      בטקסט), משבצת הכאה דרך הילוכו, ומוני המהלכים.
// שימו לב: אם לא מעבירים FEN בכלל, מקבלים את עמדת הפתיחה.
function parseFEN(fen = START_FEN) {
  const [placement, turn, castling, enPassant, halfmove, fullmove] = fen.trim().split(/\s+/);

  const board = placement.split("/").map(rankText => {
    const row = [];
    for (const char of rankText) {
      if (char >= "1" && char <= "8") {
        for (let i = 0; i < Number(char); i++) row.push(null);
      } else {
        row.push(char);
      }
    }
    return row;
  });
  if (board.length !== 8 || board.some(row => row.length !== 8)) {
    throw new Error("Invalid FEN: " + fen);
  }

  return {
    board,
    turn: turn === "b" ? "b" : "w",
    castling: {
      K: castling.includes("K"), // white king-side
      Q: castling.includes("Q"), // white queen-side
      k: castling.includes("k"), // black king-side
      q: castling.includes("q")  // black queen-side
    },
    enPassant: enPassant && enPassant !== "-" ? parseSquare(enPassant) : null,
    halfmoveClock: Number(halfmove) || 0,
    fullmoveNumber: Number(fullmove) || 1
  };
}

// הסבר: toFEN עושה את הפעולה ההפוכה — הופכת אובייקט עמדה לטקסט FEN.
// הרעיון המרכזי הוא "דחיסת" משבצות ריקות:
//   • עוברים על כל שורה ומחזיקים מונה empty של משבצות ריקות ברצף.
//   • כשפוגשים משבצת ריקה — מגדילים את המונה.
//   • כשפוגשים כלי — קודם כותבים את המונה (אם הוא לא אפס), מאפסים
//     אותו, ואז כותבים את אות הכלי.
//   • בסוף השורה — אם נשארו ריקות, כותבים את המונה.
// אחר כך בונים את מחרוזת זכויות ההצרחה ("-" אם אין אף אחת),
// את משבצת ההכאה דרך הילוכו, ומחברים את כל החלקים עם רווחים.
function toFEN(position) {
  const rows = position.board.map(row => {
    let text = "";
    let empty = 0;
    for (const piece of row) {
      if (!piece) {
        empty++;
      } else {
        if (empty) text += empty;
        empty = 0;
        text += piece;
      }
    }
    if (empty) text += empty;
    return text;
  });

  let castling = "";
  for (const right of ["K", "Q", "k", "q"]) {
    if (position.castling[right]) castling += right;
  }

  const ep = position.enPassant ? squareName(position.enPassant.row, position.enPassant.col) : "-";

  return [rows.join("/"), position.turn, castling || "-", ep,
    position.halfmoveClock, position.fullmoveNumber].join(" ");
}

// ---------------------------------------------------------------------
// Attacks and check
// התקפות ושח — איך יודעים אם משבצת מאוימת, ואם המלך בסכנה.
// ---------------------------------------------------------------------

/** Walks from a square in one direction and returns the first piece met (or null). */
// הסבר: דמיינו שאתם עומדים על משבצת ומסתכלים בכיוון מסוים (למשל
// אלכסון למעלה-ימינה). הפונקציה "הולכת" צעד אחרי צעד בכיוון הזה
// ועוצרת בכלי הראשון שהיא פוגשת — ומחזירה אותו.
// אם הגענו לקצה הלוח בלי לפגוש אף כלי — מחזירים null.
// זה שימושי לכלים "גולשים" (רץ, צריח, מלכה), כי הם תוקפים רק עד
// הכלי הראשון שחוסם אותם.
function firstPieceInDirection(board, row, col, rowStep, colStep) {
  let r = row + rowStep;
  let c = col + colStep;
  while (isOnBoard(r, c)) {
    if (board[r][c]) return board[r][c];
    r += rowStep;
    c += colStep;
  }
  return null;
}

/** Is the square (row, col) attacked by any piece of color `byColor`? */
// הסבר: זו אחת הפונקציות החשובות בקובץ! היא עונה על השאלה:
// "האם כלי כלשהו בצבע byColor תוקף את המשבצת הזו?"
//
// הטריק החכם: במקום לעבור על כל כלי היריב ולבדוק לאן הוא תוקף,
// אנחנו "עומדים" על המשבצת עצמה ומסתכלים החוצה, כאילו היינו כל
// סוג של כלי. למשל: אם מהמשבצת שלנו, בקפיצת פרש, נמצא פרש של
// היריב — אז הפרש הזה תוקף אותנו (כי קפיצת פרש היא סימטרית).
//
// סדר הבדיקות:
//   1. רגלים — רגלי תוקף באלכסון קדימה. לכן רגלי לבן שתוקף אותנו
//      חייב לעמוד שורה אחת "מתחתינו" (row + 1), ובעמודה סמוכה.
//   2. פרשים — בודקים את 8 קפיצות הפרש.
//   3. מלך — בודקים את 8 המשבצות הצמודות.
//   4. אלכסונים — הכלי הראשון בכל אלכסון: אם הוא רץ או מלכה של
//      היריב, אנחנו מותקפים.
//   5. קווים ישרים — הכלי הראשון בכל כיוון: אם הוא צריח או מלכה.
// אם אף בדיקה לא הצליחה — המשבצת בטוחה.
function isSquareAttacked(board, row, col, byColor) {
  // Convert a type letter to this attacker's letter: "N" -> "N" or "n".
  const own = type => (byColor === "w" ? type : type.toLowerCase());

  // Pawns attack diagonally forward. A white pawn attacking (row, col)
  // must stand one row BELOW it (row + 1); a black pawn one row above.
  const pawnRow = byColor === "w" ? row + 1 : row - 1;
  if (pieceAt(board, pawnRow, col - 1) === own("P") ||
      pieceAt(board, pawnRow, col + 1) === own("P")) return true;

  for (const [dr, dc] of KNIGHT_JUMPS) {
    if (pieceAt(board, row + dr, col + dc) === own("N")) return true;
  }
  for (const [dr, dc] of KING_STEPS) {
    if (pieceAt(board, row + dr, col + dc) === own("K")) return true;
  }

  // Sliding pieces: look along each line for the first piece.
  for (const [dr, dc] of BISHOP_DIRECTIONS) {
    const piece = firstPieceInDirection(board, row, col, dr, dc);
    if (piece === own("B") || piece === own("Q")) return true;
  }
  for (const [dr, dc] of ROOK_DIRECTIONS) {
    const piece = firstPieceInDirection(board, row, col, dr, dc);
    if (piece === own("R") || piece === own("Q")) return true;
  }
  return false;
}

// הסבר: מחפשת איפה המלך של צבע מסוים נמצא על הלוח.
// פשוט עוברים על כל 64 המשבצות (שתי לולאות מקוננות — שורות ועמודות)
// עד שמוצאים את האות "K" (לבן) או "k" (שחור), ומחזירים את המיקום.
// אם לא נמצא מלך — זה מצב בלתי אפשרי, ולכן זורקים שגיאה.
function findKing(board, color) {
  const king = color === "w" ? "K" : "k";
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      if (board[row][col] === king) return { row, col };
    }
  }
  throw new Error("No " + color + " king on the board");
}

/** Is the king of `color` (default: side to move) currently in check? */
// הסבר: מה זה "שח"? זה מצב שבו המלך עומד על משבצת מותקפת.
// אז הפונקציה פשוטה מאוד — היא משלבת שתי פונקציות שכבר כתבנו:
//   1. מוצאים את המלך (findKing).
//   2. שואלים אם המשבצת שלו מותקפת על ידי היריב (isSquareAttacked).
// זו דוגמה יפה לכך שפונקציות קטנות וברורות מאפשרות לבנות פונקציות
// גדולות בקלות.
function isInCheck(position, color = position.turn) {
  const king = findKing(position.board, color);
  return isSquareAttacked(position.board, king.row, king.col, opponent(color));
}

// ---------------------------------------------------------------------
// Move generation
// Step 1: "pseudo-legal" moves follow each piece's movement pattern but
//         may leave our own king in check.
// Step 2: generateLegalMoves() removes the moves that do that.
//
// הסבר: יצירת מהלכים נעשית בשני שלבים:
//   שלב 1 — מהלכים "כמעט חוקיים": כל מהלך שמתאים לצורת התנועה של
//            הכלי, בלי לבדוק אם הוא משאיר את המלך שלנו בשח.
//   שלב 2 — מסננים: מנסים כל מהלך, ומשאירים רק את אלה שאחריהם
//            המלך שלנו לא בשח.
// למה ככה? כי קשה מאוד לחשב מראש "האם המהלך חושף את המלך", אבל
// קל מאוד פשוט לנסות אותו ולבדוק.
// ---------------------------------------------------------------------

// הסבר: פונקציית עזר קטנה שיוצרת אובייקט מהלך ומוסיפה אותו לרשימה.
// אם לא מציינים הכתרה — ברירת המחדל היא null (אין הכתרה).
function addMove(moves, fromRow, fromCol, toRow, toCol, promotion = null) {
  moves.push({ fromRow, fromCol, toRow, toCol, promotion });
}

// הסבר: הרגלי הוא הכלי המסובך ביותר, למרות שהוא הכי "חלש"!
// הסיבות: הוא זז רק קדימה, הוא מכה בצורה שונה ממה שהוא זז, יש לו
// צעד כפול בהתחלה, הכאה דרך הילוכו, והכתרה. בואו נעבור על זה:
//
//   • כיוון: לבן זז "למעלה" (שורה קטנה יותר, -1), שחור "למטה" (+1).
//   • שורת התחלה: לבן בשורה 6, שחור בשורה 1 — משם מותר צעד כפול.
//   • שורה אחרונה: אם הרגלי מגיע אליה — הוא חייב להיות מוכתר.
//
//   addPawnMove — פונקציה פנימית: אם הגענו לשורה האחרונה, יוצרים
//   ארבעה מהלכים (אחד לכל כלי הכתרה), אחרת — מהלך רגיל אחד.
//
//   צעד קדימה: מותר רק אם המשבצת שלפנינו ריקה (רגלי לא מכה קדימה!).
//   צעד כפול: רק אם צעד אחד אפשרי, אנחנו בשורת ההתחלה, וגם המשבצת
//   השנייה ריקה. (שימו לב שהבדיקה בתוך ה-if של הצעד הראשון — כך לא
//   ניתן "לקפוץ" מעל כלי.)
//
//   הכאות: בודקים את שתי המשבצות האלכסוניות קדימה. מותר להכות אם
//   יש שם כלי של היריב, או אם זו משבצת ההכאה דרך הילוכו.
function addPawnMoves(position, row, col, moves) {
  const { board, turn, enPassant } = position;
  const direction = turn === "w" ? -1 : 1; // white moves up (toward row 0)
  const startRow = turn === "w" ? 6 : 1;
  const lastRow = turn === "w" ? 0 : 7;

  // Reaching the last row creates four moves, one per promotion piece.
  const addPawnMove = (toRow, toCol) => {
    if (toRow === lastRow) {
      for (const piece of PROMOTION_PIECES) addMove(moves, row, col, toRow, toCol, piece);
    } else {
      addMove(moves, row, col, toRow, toCol);
    }
  };

  // Forward one square (must be empty), then two squares from the start row.
  const oneAhead = row + direction;
  if (isOnBoard(oneAhead, col) && !board[oneAhead][col]) {
    addPawnMove(oneAhead, col);
    const twoAhead = row + 2 * direction;
    if (row === startRow && !board[twoAhead][col]) {
      addMove(moves, row, col, twoAhead, col);
    }
  }

  // Diagonal captures, including en passant.
  for (const colStep of [-1, 1]) {
    const toCol = col + colStep;
    if (!isOnBoard(oneAhead, toCol)) continue;
    const target = board[oneAhead][toCol];
    const isEnemy = target && colorOf(target) !== turn;
    const isEnPassant = enPassant && enPassant.row === oneAhead && enPassant.col === toCol;
    if (isEnemy || isEnPassant) addPawnMove(oneAhead, toCol);
  }
}

/** Knight and king: jump to each target square if it is empty or holds an enemy. */
// הסבר: פרש ומלך מתנהגים באותה צורה בסיסית — הם "קופצים" צעד אחד
// לרשימה קבועה של משבצות (הם לא גולשים למרחק). לכן אפשר לכתוב
// פונקציה אחת לשניהם, ופשוט להעביר לה רשימת צעדים שונה.
// עבור כל צעד ברשימה:
//   • מחשבים את משבצת היעד.
//   • אם היא מחוץ ללוח — מדלגים (continue).
//   • אם היא ריקה, או שיש בה כלי של היריב — המהלך מותר.
//   • אם יש בה כלי שלנו — אסור (אי אפשר להכות כלי של עצמך).
function addStepMoves(position, row, col, steps, moves) {
  for (const [dr, dc] of steps) {
    const toRow = row + dr;
    const toCol = col + dc;
    if (!isOnBoard(toRow, toCol)) continue;
    const target = position.board[toRow][toCol];
    if (!target || colorOf(target) !== position.turn) addMove(moves, row, col, toRow, toCol);
  }
}

/** Bishop, rook, queen: slide along each direction until blocked. */
// הסבר: רץ, צריח ומלכה הם כלים "גולשים" — הם ממשיכים לנוע בכיוון
// אחד כמה משבצות שהם רוצים, עד שמשהו עוצר אותם.
// עבור כל כיוון, אנחנו מתקדמים צעד אחרי צעד בלולאת while:
//   • משבצת ריקה → מוסיפים מהלך וממשיכים הלאה.
//   • כלי של היריב → מוסיפים מהלך (הכאה) ועוצרים.
//   • כלי שלנו → לא מוסיפים, ועוצרים.
// ה-break הוא הלב של הפונקציה: הוא מבטא את החוק "אסור לקפוץ מעל כלים".
function addSlidingMoves(position, row, col, directions, moves) {
  for (const [dr, dc] of directions) {
    let toRow = row + dr;
    let toCol = col + dc;
    while (isOnBoard(toRow, toCol)) {
      const target = position.board[toRow][toCol];
      if (!target) {
        addMove(moves, row, col, toRow, toCol);
      } else {
        if (colorOf(target) !== position.turn) addMove(moves, row, col, toRow, toCol);
        break; // cannot jump over pieces
      }
      toRow += dr;
      toCol += dc;
    }
  }
}

/**
 * Castling rules: the king and rook have not moved (castling right still set),
 * the squares between them are empty, and the king is not in check and does
 * not pass through an attacked square.
 */
// הסבר: הצרחה היא מהלך מיוחד שבו המלך זז שתי משבצות לכיוון הצריח,
// והצריח קופץ לצד השני של המלך. יש לה הרבה תנאים, ונבדוק אותם אחד אחד:
//   1. המלך חייב לעמוד במשבצת ההתחלה שלו (שורת הבית, עמודה 4 = e).
//   2. המלך לא בשח כרגע (אסור להצריח "מתוך" שח) — safe(4).
//   3. זכות ההצרחה עדיין קיימת (המלך והצריח לא זזו אף פעם).
//   4. הצריח באמת נמצא בפינה.
//   5. כל המשבצות שבין המלך לצריח ריקות — empty(...).
//   6. המלך לא עובר דרך משבצת מותקפת ולא נוחת על משבצת מותקפת — safe(...).
// הצרחה קצרה (צד המלך): המלך עובר ל-g (עמודה 6).
// הצרחה ארוכה (צד המלכה): המלך עובר ל-c (עמודה 2). שימו לב שעמודה 1 (b)
// חייבת להיות ריקה, אבל לא חייבת להיות בטוחה — כי המלך לא עובר דרכה.
function addCastlingMoves(position, row, col, moves) {
  const { board, turn, castling } = position;
  const homeRow = turn === "w" ? 7 : 0;
  if (row !== homeRow || col !== 4) return;

  const enemy = opponent(turn);
  const rook = turn === "w" ? "R" : "r";
  const safe = c => !isSquareAttacked(board, homeRow, c, enemy);
  const empty = c => !board[homeRow][c];
  if (!safe(4)) return; // cannot castle out of check

  const kingSide = turn === "w" ? castling.K : castling.k;
  if (kingSide && board[homeRow][7] === rook && empty(5) && empty(6) && safe(5) && safe(6)) {
    addMove(moves, homeRow, 4, homeRow, 6);
  }

  const queenSide = turn === "w" ? castling.Q : castling.q;
  if (queenSide && board[homeRow][0] === rook && empty(1) && empty(2) && empty(3) && safe(3) && safe(2)) {
    addMove(moves, homeRow, 4, homeRow, 2);
  }
}

// הסבר: זו פונקציית "המנהל" של שלב 1. היא עוברת על כל 64 המשבצות,
// ולכל כלי של השחקן שתורו עכשיו — שולחת אותו לפונקציה המתאימה לפי
// הסוג שלו (בעזרת switch):
//   רגלי → addPawnMoves,  פרש → addStepMoves עם קפיצות פרש,
//   רץ/צריח/מלכה → addSlidingMoves עם הכיוונים המתאימים,
//   מלך → צעדי מלך רגילים + בדיקת הצרחה.
// משבצות ריקות או כלים של היריב — מדלגים עליהם (continue).
// כל הפונקציות מוסיפות לאותה רשימה moves, ובסוף מחזירים אותה.
function generatePseudoMoves(position) {
  const moves = [];
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = position.board[row][col];
      if (!piece || colorOf(piece) !== position.turn) continue;

      switch (typeOf(piece)) {
        case "P": addPawnMoves(position, row, col, moves); break;
        case "N": addStepMoves(position, row, col, KNIGHT_JUMPS, moves); break;
        case "B": addSlidingMoves(position, row, col, BISHOP_DIRECTIONS, moves); break;
        case "R": addSlidingMoves(position, row, col, ROOK_DIRECTIONS, moves); break;
        case "Q": addSlidingMoves(position, row, col, QUEEN_DIRECTIONS, moves); break;
        case "K":
          addStepMoves(position, row, col, KING_STEPS, moves);
          addCastlingMoves(position, row, col, moves);
          break;
      }
    }
  }
  return moves;
}

/** Does this move capture something? (En passant captures land on an empty square.) */
// הסבר: האם המהלך הוא הכאה? יש שני מקרים:
//   1. במשבצת היעד יש כלי — ברור שזו הכאה.
//   2. המקרה המיוחד: הכאה דרך הילוכו. שם הרגלי נוחת על משבצת ריקה!
//      איך נזהה? רגלי שזז באלכסון (העמודה השתנתה) — תמיד מכה,
//      כי רגלי זז באלכסון רק כשהוא מכה.
function isCapture(position, move) {
  if (position.board[move.toRow][move.toCol]) return true;
  const piece = position.board[move.fromRow][move.fromCol];
  return typeOf(piece) === "P" && move.fromCol !== move.toCol;
}

/**
 * All legal moves for the side to move.
 * capturesOnly = true returns only captures and promotions (used by the AI).
 */
// הסבר: זה שלב 2 — הסינון. כאן נמצא הרעיון הכי חשוב בקובץ:
//   1. מקבלים את כל המהלכים ה"כמעט חוקיים" משלב 1.
//   2. (אופציונלי) אם ביקשו רק הכאות — מסננים ומשאירים רק הכאות
//      והכתרות. המחשב משתמש בזה בחיפוש שלו (ראו ai.js).
//   3. לכל מהלך: "משחקים" אותו על עותק של הלוח (makeMove), ובודקים
//      אם המלך שלנו בשח אחרי המהלך. אם כן — המהלך אסור ונזרק.
// כך מטפלים בבת אחת בכל המצבים המסובכים: כלי "מסומר" שאסור לו לזוז,
// מלך שמנסה לזוז למשבצת מותקפת, וחובה לצאת משח.
// בדיקה מהירה האם קיים לפחות מהלך חוקי אחד, בלי לבנות רשימה מלאה.
function hasLegalMove(position) {
  const moves = generatePseudoMoves(position);
  for (const move of moves) {
    if (!isInCheck(makeMove(position, move), position.turn)) return true;
  }
  return false;
}

function generateLegalMoves(position, capturesOnly = false) {
  let moves = generatePseudoMoves(position);
  if (capturesOnly) {
    moves = moves.filter(move => isCapture(position, move) || move.promotion);
  }
  // Try each move; keep it only if our own king is safe afterwards.
  return moves.filter(move => !isInCheck(makeMove(position, move), position.turn));
}

// ---------------------------------------------------------------------
// Making a move
// ביצוע מהלך — יצירת העמדה החדשה שמתקבלת אחרי המהלך.
// ---------------------------------------------------------------------

/** Returns the NEW position after `move`. The old position is not changed. */
// הסבר: makeMove מקבלת עמדה ומהלך, ומחזירה עמדה חדשה לגמרי.
// בואו נעבור על השלבים לפי הסדר:
//
//   1. מעתיקים את הלוח (כל שורה בנפרד עם slice) — כדי לא לשנות את
//      המקור. זוכרים את העיקרון? אף פעם לא משנים עמדה קיימת.
//
//   2. הכאה דרך הילוכו: אם רגלי זז באלכסון למשבצת ריקה, הרגלי של
//      היריב שנאכל לא נמצא ביעד — הוא עומד לידנו, באותה שורה שממנה
//      התחלנו ובעמודת היעד. לכן מוחקים אותו משם.
//
//   3. הצרחה: אם המלך זז שתי עמודות, צריך להזיז גם את הצריח.
//      הצרחה קצרה: צריח מ-h ל-f.  הצרחה ארוכה: צריח מ-a ל-d.
//
//   4. מזיזים את הכלי עצמו: שמים אותו ביעד ומרוקנים את משבצת המוצא.
//      אם זו הכתרה — שמים את הכלי החדש (באות גדולה או קטנה לפי הצבע).
//
//   5. מעדכנים זכויות הצרחה:
//      • המלך זז → הצבע שלו מאבד את שתי ההצרחות.
//      • משהו זז מפינה או אל פינה → ההצרחה של אותה פינה אובדת.
//        (אם צריח עזב את הפינה — הוא זז. אם מישהו נחת על הפינה —
//        הצריח שם נאכל. בשני המקרים — אין יותר הצרחה לשם.)
//
//   6. הכאה דרך הילוכו בתור הבא: אם רגלי זז שתי משבצות, המשבצת
//      שהוא "דילג" עליה (הממוצע בין שורת המוצא לשורת היעד) הופכת
//      למשבצת שהיריב יכול להכות אליה. אחרת — null.
//
//   7. מחזירים עמדה חדשה: התור עובר ליריב, מונה 50 המהלכים מתאפס
//      אחרי מהלך רגלי או הכאה (אחרת גדל ב-1), ומספר המהלך המלא
//      גדל רק אחרי מהלך של השחור.
function makeMove(position, move) {
  const { fromRow, fromCol, toRow, toCol, promotion } = move;
  const board = position.board.map(row => row.slice()); // copy the board
  const piece = board[fromRow][fromCol];
  const type = typeOf(piece);
  const color = position.turn;
  let captured = board[toRow][toCol] !== null;

  // En passant: a pawn moves diagonally onto an empty square and captures
  // the enemy pawn standing next to it (same row it started on).
  if (type === "P" && fromCol !== toCol && !board[toRow][toCol]) {
    board[fromRow][toCol] = null;
    captured = true;
  }

  // Castling: the king moves two squares, so move the rook next to it.
  if (type === "K" && Math.abs(toCol - fromCol) === 2) {
    const rookFromCol = toCol === 6 ? 7 : 0;
    const rookToCol = toCol === 6 ? 5 : 3;
    board[fromRow][rookToCol] = board[fromRow][rookFromCol];
    board[fromRow][rookFromCol] = null;
  }

  // Move the piece (a promoting pawn becomes the chosen piece).
  board[toRow][toCol] = promotion ? (color === "w" ? promotion : promotion.toLowerCase()) : piece;
  board[fromRow][fromCol] = null;

  // Update castling rights: lost when the king moves, or when a rook
  // leaves (or is captured on) its starting corner.
  const castling = { ...position.castling };
  if (piece === "K") castling.K = castling.Q = false;
  if (piece === "k") castling.k = castling.q = false;
  const touches = (r, c) => (fromRow === r && fromCol === c) || (toRow === r && toCol === c);
  if (touches(7, 7)) castling.K = false;
  if (touches(7, 0)) castling.Q = false;
  if (touches(0, 7)) castling.k = false;
  if (touches(0, 0)) castling.q = false;

  // After a two-square pawn move, the skipped square can be captured en passant.
  const enPassant = type === "P" && Math.abs(toRow - fromRow) === 2
    ? { row: (fromRow + toRow) / 2, col: fromCol }
    : null;

  return {
    board,
    turn: opponent(color),
    castling,
    enPassant,
    halfmoveClock: type === "P" || captured ? 0 : position.halfmoveClock + 1,
    fullmoveNumber: color === "b" ? position.fullmoveNumber + 1 : position.fullmoveNumber
  };
}

// ---------------------------------------------------------------------
// UCI notation: a move as text, e.g. "e2e4", or "e7e8q" for promotion.
// כתיב UCI — דרך פשוטה לכתוב מהלך כטקסט: משבצת מוצא + משבצת יעד,
// ואם יש הכתרה — אות קטנה של הכלי בסוף.
// ---------------------------------------------------------------------

// הסבר: הופכת אובייקט מהלך לטקסט. פשוט מחברים את שם משבצת המוצא,
// שם משבצת היעד, ואם יש הכתרה — את אות הכלי באות קטנה.
// לדוגמה: מ-(6,4) ל-(4,4) → "e2" + "e4" = "e2e4".
function moveToUci(move) {
  return squareName(move.fromRow, move.fromCol) +
         squareName(move.toRow, move.toCol) +
         (move.promotion ? move.promotion.toLowerCase() : "");
}

// הסבר: הפעולה ההפוכה — מטקסט לאובייקט מהלך.
//   • שני התווים הראשונים (למשל "e2") — משבצת המוצא.
//   • התווים 3-4 (למשל "e4") — משבצת היעד.
//   • התו החמישי, אם קיים — כלי ההכתרה (הופכים לאות גדולה).
function uciToMove(uci) {
  const from = parseSquare(uci.slice(0, 2));
  const to = parseSquare(uci.slice(2, 4));
  return {
    fromRow: from.row, fromCol: from.col,
    toRow: to.row, toCol: to.col,
    promotion: uci[4] ? uci[4].toUpperCase() : null
  };
}