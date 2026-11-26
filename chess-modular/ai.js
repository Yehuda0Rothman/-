"use strict";
// =====================================================================
// ai.js — THE COMPUTER PLAYER
// =====================================================================
// Uses the rules from chess-rules.js to look ahead and pick a move.
//
// Main ideas (each one is a function below):
//   1. evaluate()     — give a position a score (material + piece placement)
//   2. alphaBeta()    — look several moves ahead (minimax with alpha-beta pruning)
//   3. quiescence()   — follow captures and legal check evasions at the end of the search so we
//                       don't stop in the middle of an exchange
//   4. orderMoves()   — try moves with the best resulting position evaluation first
//   5. findBestMove() — iterative deepening: search depth 1, 2, 3, ... up to
//                       the maximum depth selected by the player
//
// Scores use the "negamax" convention: a score is always from the point
// of view of the side to move. Positive = good for the player whose turn it is.
// So when we look at the opponent's reply we flip the sign: -score.
// =====================================================================
//
// ---------------------------------------------------------------------
// הסבר בעברית — מבוא לקובץ
// ---------------------------------------------------------------------
// תלמידים, כאן גר "המוח" של המחשב. איך מחשב משחק שחמט? הוא לא
// "מבין" שחמט כמו בן אדם. הוא עושה שני דברים פשוטים, הרבה מאוד פעמים:
//
//   1. הערכה — נותן ציון לעמדה: כמה כלים יש לכל צד, וכמה הם ממוקמים טוב.
//   2. חיפוש — מנסה מהלך, ואז את כל התשובות של היריב, ואז את כל
//      התשובות שלו לתשובות... וכך הלאה כמה צעדים קדימה. בסוף הוא
//      בוחר את המהלך שמוביל לציון הטוב ביותר, בהנחה שהיריב תמיד
//      משחק את המהלך הכי טוב בשבילו.
//
// מוסכמת "נגהמקס" (negamax): הציון תמיד נמדד מנקודת המבט של מי
// שתורו. ציון חיובי = טוב לי. כשאני מסתכל על תשובת היריב, מה שטוב
// לו רע לי — ולכן הופכים את הסימן (מינוס). כך אפשר לכתוב פונקציה
// אחת לשני הצדדים, במקום פונקציה נפרדת ל"מקסימום" ול"מינימום".
// =====================================================================

// הסבר: ערך כל כלי ב"נקודות". רגלי = 100, ולכן פרש שווה בערך 3 רגלים,
// צריח 5, ומלכה 9. למלך ערך 0 כי הוא אף פעם לא נאכל באמת (מט מטופל בנפרד).
const PIECE_VALUES = { P: 100, N: 320, B: 330, R: 500, Q: 900, K: 0 };
// הסבר: ציון ענק שמייצג מט. הוא הרבה יותר גדול מכל ציון חומרי אפשרי,
// כך שמט תמיד "מנצח" כל יתרון בכלים.
const MATE_SCORE = 100000;
// הסבר: עומק החיפוש המרבי שאפשר לבחור בממשק. העומק נמדד בחצאי־מהלכים.
// ברירת המחדל בממשק נמוכה יותר, כי עומקים גדולים עלולים לדרוש חיפוש ממושך.
const MAX_DEPTH = 20;

// ---------------------------------------------------------------------
// 1. Evaluation
// הערכה — איך נותנים ציון לעמדה בלי לחפש קדימה.
// ---------------------------------------------------------------------

/** 0 for a corner square up to 6 for the four center squares. */
// הסבר: כמה המשבצת "מרכזית"? המרכז של הלוח הוא בנקודה 3.5 (בין שורה
// 3 ל-4, ובין עמודה 3 ל-4). מחשבים את המרחק מהמרכז — בשורות ובעמודות —
// ומחסירים מ-7. כך:
//   • פינה (0,0): מרחק 3.5 + 3.5 = 7 → ציון 0.
//   • משבצת מרכזית (3,3): מרחק 0.5 + 0.5 = 1 → ציון 6.
// ככל שקרובים יותר למרכז — הציון גבוה יותר.
function centrality(row, col) {
  return 7 - (Math.abs(3.5 - row) + Math.abs(3.5 - col));
}

/** Score contributed by one piece, including its color and placement. */
// הסבר: מקבלת את הכלי עצמו (למשל "N" או "n") ואת מיקומו.
// אות גדולה מייצגת לבן ואות קטנה מייצגת שחור.
// הפונקציה מחשבת את ערך הכלי ואת בונוס המיקום, ואז מחזירה
// ציון חיובי לכלי לבן וציון שלילי לכלי שחור.
// כך אין צורך להעביר בנפרד סוג וצבע או לחשב אותם ב-evaluate().
function pieceScore(piece, row, col) {
  const type = piece.toUpperCase();
  const isWhite = piece === type;

  let score = PIECE_VALUES[type];

  if (type === "N") {
    score += centrality(row, col) * 4; // לפרש יש בונוס גדול על מרכזיות.
  } else if (type === "B") {
    score += centrality(row, col) * 2; // לרץ יש בונוס קטן יותר.
  } else if (type === "P") {
    const rowsAdvanced = isWhite ? 6 - row : row - 1;
    score += rowsAdvanced * 7 + centrality(row, col);
  }

  return isWhite ? score : -score;
}

/** Score of the position from the side to move's point of view. */
// הסבר: פונקציית ההערכה הראשית. עוברים על כל המשבצות, ולכל כלי
// pieceScore() מחשבת לכל כלי את ערכו ואת בונוס המיקום שלו,
// ומחזירה סימן חיובי ללבן ושלילי לשחור.
// כך מקבלים ציון "מנקודת המבט של הלבן" (חיובי = טוב ללבן).
// בסוף, לפי מוסכמת הנגהמקס: אם תור השחור — הופכים את הסימן, כדי
// שהציון יהיה תמיד מנקודת המבט של מי שתורו.
function evaluate(position) {
  let whiteScore = 0;
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = position.board[row][col];
      if (!piece) continue;
      whiteScore += pieceScore(piece, row, col);
    }
  }
  return position.turn === "w" ? whiteScore : -whiteScore;
}

// ---------------------------------------------------------------------
// 4. Move ordering
// Try first the move whose resulting position has the best static evaluation.
//
// הסבר: סידור מהלכים לפי הערכת העמדה שתתקבל אחרי המהלך.
// לכל מהלך:
//   1. יוצרים את העמדה החדשה שמתקבלת אחרי ביצועו.
//   2. evaluate() מחזירה ציון מנקודת המבט של מי שתורו בעמדה החדשה —
//      כלומר, היריב. לכן הופכים את הסימן כדי לקבל ציון עבור השחקן
//      שבחר את המהלך.
//   3. מסדרים מהציון הגבוה לנמוך.
// כך Alpha-Beta מתחיל בענף שנראה הטוב ביותר לפי הערכת העמדה הנוכחית,
// ורק אחר כך עובר לשאר המהלכים. החיפוש המלא עדיין קובע את התוצאה;
// ההערכה הזאת קובעת את סדר הבדיקה בלבד.
// ---------------------------------------------------------------------

// הסבר: ציון הסידור של מהלך הוא הערכת העמדה מיד לאחר ביצועו,
// מנקודת המבט של השחקן שביצע את המהלך.
// evaluate() מסתכלת מנקודת המבט של הצד שתורו בעמדה החדשה (היריב),
// ולכן מכפילים במינוס 1 כדי להפוך לנקודת המבט שלנו.
function moveOrderScore(position, move) {
  return -evaluate(makeMove(position, move));
}

// הסבר: ממיינת את רשימת המהלכים מהציון הגבוה לנמוך:
//   1. map — שומרים לכל מהלך גם את ציון הסידור שלו.
//   2. sort — המהלך עם הציון הגבוה ביותר עובר לראש הרשימה.
//   3. map — מחזירים רק את המהלכים, בלי ציון העזר.
// את הציון מחשבים פעם אחת לכל מהלך, ולא בכל השוואת מיון.
function orderMoves(position, moves) {
  return moves
    .map(move => ({ move, score: moveOrderScore(position, move) }))
    .sort((a, b) => b.score - a.score)
    .map(item => item.move);
}

// הספירה מתבצעת בכל צומת חיפוש; היא משמשת להצגת נתונים בלבד ואינה מגבילה את החיפוש.
// ---------------------------------------------------------------------
// 3. Quiescence search — only captures, until the position is "quiet".
// חיפוש "שקט" — ממשיכים לבדוק רק הכאות, עד שהעמדה נרגעת.
// ---------------------------------------------------------------------

// הסבר: למה צריך את זה? דמיינו שהחיפוש נעצר בדיוק אחרי שהמלכה שלנו
// אכלה רגלי. הציון ייראה מצוין — אבל אולי בתור הבא היריב אוכל את
// המלכה! זו "בעיית האופק": המחשב לא רואה מה שקורה מעבר לעומק שלו.
// הפתרון: בסוף החיפוש הרגיל, ממשיכים לבדוק רק הכאות, עד שאין יותר
// הכאות מעניינות — ורק אז סומכים על פונקציית ההערכה.
//
// "עמידה במקום" (stand pat): לשחקן תמיד מותר לא להכות. לכן הציון
// הנוכחי הוא "רצפה" — הוא לפחות יכול לקבל אותו.
//   • אם הציון הזה כבר גבוה מ-beta — היריב לא ייתן לנו להגיע לכאן,
//     אז אפשר לעצור מיד.
//   • אם הוא טוב מ-alpha — מעדכנים את alpha.
// אחר כך מנסים כל הכאה (מסודרות — הטובות קודם), ובודקים רקורסיבית
// מה קורה אחריה, עם היפוך סימן והיפוך החלון (-beta, -alpha) לפי נגהמקס.
function quiescence(position, alpha, beta, ply, search) {
  search.nodes++;

  const inCheck = isInCheck(position);
  let moves;

  if (inCheck) {
    // בשח חייבים לבדוק את כל ההתחמקויות החוקיות, גם מהלכים שקטים.
    moves = orderMoves(position, generateLegalMoves(position));
    if (moves.length === 0) return -(MATE_SCORE - ply);
  }

  // אותו כלל תיקו כמו ב-alphaBeta: 100 חצאי-מהלכים בלי רגלי או הכאה.
  // הבדיקה באה אחרי זיהוי מט, כדי שמט לא יהפוך בטעות לתיקו.
  if (position.halfmoveClock >= 100) return 0;

  if (!inCheck) {
    // Stand pat: כשאין שח, אפשר להעריך את העמדה בלי לבצע הכאה.
    const standPat = evaluate(position);
    if (standPat >= beta) {
      // גם בחיתוך מוקדם צריך לוודא שזו לא עמדת פט.
      return hasLegalMove(position) ? standPat : 0;
    }
    if (standPat > alpha) alpha = standPat;

    // ללא שח בודקים רק הכאות והכתרות.
    moves = orderMoves(position, generateLegalMoves(position, true));

    // אם אין מהלכים טקטיים, ייתכן שיש מהלכים שקטים — או שזה פט.
    if (moves.length === 0 && !hasLegalMove(position)) return 0;
  }

  for (const move of moves) {
    const score = -quiescence(
      makeMove(position, move), -beta, -alpha, ply + 1, search
    );
    if (score >= beta) return score;
    if (score > alpha) alpha = score;
  }
  return alpha;
}

// ---------------------------------------------------------------------
// 2. Alpha-beta search (negamax form)
//   depth = how many more half-moves to look ahead
//   alpha = the best score we are already guaranteed elsewhere
//   beta  = the best score the opponent will allow us
//   If a move reaches beta, the opponent will avoid this line anyway,
//   so we can stop searching it ("beta cut-off").
//   ply   = distance from the root, used to prefer faster checkmates
// ---------------------------------------------------------------------

// הסבר: זה לב המחשב — חיפוש אלפא-בטא. נבין אותו בעזרת דוגמה:
//
// נניח שבדקתי מהלך A ומצאתי שהוא מבטיח לי ציון 5 (זה alpha — "הכי טוב
// שכבר מובטח לי"). עכשיו אני בודק מהלך B, ומגלה שליריב יש תשובה
// שמורידה אותי ל-3. האם אני צריך לבדוק את שאר התשובות של היריב
// למהלך B? לא! כבר ברור ש-B גרוע מ-A, כי היריב יכול להוריד אותי
// לפחות ל-3. אז מפסיקים לבדוק את B — זה "גיזום" (חיתוך).
//
// beta הוא הצד השני: "הכי טוב שהיריב יסכים לתת לי". אם מצאתי מהלך
// שנותן לי יותר מ-beta — היריב פשוט לא ייכנס לקו הזה, אז אין טעם
// להמשיך לחפש בו (beta cut-off).
//
// שלבי הפונקציה:
//   1. אם העומק הגיע ל-0 — עוברים ל-quiescence(), שסופרת את הצומת בעצמה.
//   2. אחרת סופרים כאן צומת רגיל פעם אחת בלבד.
//   3. אם אין מהלכים חוקיים: אם אנחנו בשח — זה מט (ציון נוראי);
//      אחרת — פט (תיקו, ציון 0).
//      שימו לב ל-(MATE_SCORE - ply): מט קרוב (ply קטן) גרוע יותר
//      מאשר מט רחוק. כך המחשב מעדיף לתת מט מהר ולדחות מט נגדו.
//   4. אם עברו 50 מהלכים בלי הכאה או מהלך רגלי — תיקו.
//   5. לכל מהלך (מסודר): משחקים אותו, קוראים לעצמנו רקורסיבית עם
//      עומק קטן ב-1, הופכים סימן, ומעדכנים את הציון הטוב ביותר ואת
//      alpha. אם alpha הגיע ל-beta — חותכים (break).
function alphaBeta(position, depth, alpha, beta, ply, search) {
  // עומק 0 נספר בתוך quiescence(), כדי שכל עמדה תיספר פעם אחת בלבד.
  if (depth === 0) return quiescence(position, alpha, beta, ply, search);

  search.nodes++;

  const moves = generateLegalMoves(position);
  if (moves.length === 0) {
    // No legal moves: checkmate (very bad for us) or stalemate (draw).
    return isInCheck(position) ? -(MATE_SCORE - ply) : 0;
  }
  if (position.halfmoveClock >= 100) return 0; // 50-move rule draw

  let bestScore = -Infinity;
  for (const move of orderMoves(position, moves)) {
    const score = -alphaBeta(makeMove(position, move), depth - 1, -beta, -alpha, ply + 1, search);
    if (score > bestScore) bestScore = score;
    if (score > alpha) alpha = score;
    if (alpha >= beta) break; // beta cut-off
  }
  return bestScore;
}

/** Searches every root move to `depth` and returns the best one. */
// הסבר: "השורש" הוא העמדה הנוכחית על הלוח. הפונקציה הזו דומה מאוד
// ל-alphaBeta, אבל עם הבדל חשוב: היא צריכה לזכור לא רק את הציון
// הטוב ביותר, אלא גם *איזה מהלך* הוביל אליו — כי זה המהלך שהמחשב
// באמת ישחק.
// לכל מהלך אפשרי: משחקים אותו, מחפשים לעומק depth-1, הופכים סימן.
// אם הציון הכי טוב עד עכשיו — זוכרים גם את הציון וגם את המהלך.
// בשורש אין beta (אין "יריב" מעלינו שמגביל), ולכן beta הוא אינסוף.
function searchRoot(position, rootMoves, depth, search) {
  let alpha = -Infinity;
  let bestMove = rootMoves[0];

  for (const move of rootMoves) {
    const score = -alphaBeta(makeMove(position, move), depth - 1, -Infinity, -alpha, 1, search);

    if (score > alpha) {
      alpha = score;
      bestMove = move;
    }
  }

  return { move: bestMove, score: alpha };
}

// ---------------------------------------------------------------------
// 5. Iterative deepening — the function the game calls.
// העמקה הדרגתית — הפונקציה שהמשחק קורא לה כשהוא רוצה מהלך מהמחשב.
// ---------------------------------------------------------------------

/**
 * Finds a move by searching to the requested maximum depth (in half-moves).
 * Returns { move, depth, nodes, timeMs }; timeMs is measurement only.
 */
// הסבר: "העמקה הדרגתית": מחפשים לעומק 1, אחר כך 2, אחר כך 3,
// וכן הלאה עד לעומק שהשחקן בחר. בכל שלב שומרים את התשובה המלאה
// של העומק האחרון. כאן אין מגבלת זמן; עומק גדול יותר עשוי לדרוש
// הרבה יותר זמן חישוב.
//
// "אבל זה בזבוז — אנחנו מחפשים שוב ושוב!" — לא ממש. כל עומק לוקח
// בערך פי כמה מהקודם, אז העמקים הקודמים הם רק חלק קטן מהזמן.
// ובונוס: המהלך הטוב ביותר מהעומק הקודם נבדק ראשון בעומק הבא, וזה
// משפר מאוד את הגיזום של אלפא-בטא.
//
// עוד פרטים:
//   • אם אין מהלכים חוקיים בכלל — מחזירים move: null.
//   • אם מצאנו מט כפוי — אין טעם לחפש עמוק יותר, עוצרים.
// בסוף מחזירים את המהלך, העומק שהושלם, מספר העמדות שנבדקו ומשך החיפוש.
function findBestMove(position, maxDepth) {
  // מתקנים את הקלט לטווח המותר ושומרים על עומק שלם.
  const targetDepth = Math.max(1, Math.min(MAX_DEPTH, Math.floor(Number(maxDepth) || 5)));
  const startTime = Date.now();
  const search = { nodes: 0 };

  let rootMoves = orderMoves(position, generateLegalMoves(position));
  if (rootMoves.length === 0) return { move: null, depth: 0, nodes: 0, timeMs: 0 };

  let bestMove = rootMoves[0];
  let completedDepth = 0;

  // מעמיקים בהדרגה עד לעומק שנבחר. אין עצירה לפי שעון.
  for (let depth = 1; depth <= targetDepth; depth++) {
    const result = searchRoot(position, rootMoves, depth, search);
    bestMove = result.move;
    completedDepth = depth;

    // סדר המהלכים נשאר לפי הערכת העמדה שמתקבלת אחרי כל מהלך.

    // אם נמצא מט כפוי, אין צורך להמשיך לחפש.
    if (Math.abs(result.score) > MATE_SCORE - 1000) break;
  }

  // הזמן נמדד ומוצג למשתמש, אך אינו משפיע על משך החיפוש.
  return { move: bestMove, depth: completedDepth, nodes: search.nodes, timeMs: Date.now() - startTime };
}