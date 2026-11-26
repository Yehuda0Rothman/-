"use strict";
// =====================================================================
// online.js — PLAYING AGAINST ANOTHER PERSON OVER THE INTERNET
// =====================================================================
// Uses a WebSocket (a connection that stays open in both directions)
// to a game server. The server keeps "rooms" with two players and
// forwards each move to the other player.
//
// Messages we SEND (JSON):     { type: "create" | "join", room, token }
//                              { type: "move", uci }   { type: "resign" }
// Messages we RECEIVE (JSON):  room_created, room_joined, room_status,
//                              opponent_move, move_accepted, game_over,
//                              peer_disconnected, room_error
//
// This only works when the page is served by the game server.
// Opened as a local file, the connection simply fails.
// =====================================================================
//
// ---------------------------------------------------------------------
// הסבר בעברית — מבוא לקובץ
// ---------------------------------------------------------------------
// תלמידים, איך שני אנשים במחשבים שונים משחקים באותו משחק? הם לא
// מדברים ישירות זה עם זה — יש באמצע "שרת" (מחשב באינטרנט) שמתווך.
//
// אנחנו משתמשים ב-WebSocket: זה כמו שיחת טלפון שנשארת פתוחה. בניגוד
// לטעינת דף רגילה (שואלים שאלה → מקבלים תשובה → מנתקים), כאן הקו
// נשאר פתוח, והשרת יכול לשלוח לנו הודעה בכל רגע — למשל "היריב שיחק e4".
//
// השרת מחזיק "חדרים". כל חדר = משחק אחד עם שני שחקנים. כששחקן אחד
// משחק מהלך, הוא שולח אותו לשרת, השרת בודק אותו ומעביר לשחקן השני.
//
// ההודעות הן אובייקטי JSON (טקסט שמייצג אובייקט), ולכל אחת יש שדה
// type שאומר מה סוג ההודעה.
//
// עיקרון חשוב: השרת הוא "השופט". אם יש מחלוקת בין מה שאצלנו לבין מה
// שאצל השרת — תמיד מאמינים לשרת.
// =====================================================================

// הסבר: האלמנטים בדף שקשורים למשחק המקוון, שמורים במקום אחד.
const onlineUi = {
  info: document.getElementById("onlineInfo"),
  infoText: document.getElementById("onlineInfoText"),
  inviteLink: document.getElementById("inviteLink"),
  roomCode: document.getElementById("roomCode"),
  modeLabel: document.getElementById("modeLabel")
};

// הסבר: החיבור הנוכחי לשרת (null = אין חיבור).
let socket = null;
// הסבר: "ביטוי רגולרי" שבודק שקוד חדר תקין: בדיוק 6 תווים, כל אחד
// מהם אות A-F או ספרה 0-9. ה-^ וה-$ אומרים "מתחילת הטקסט ועד סופו".
const ROOM_CODE_PATTERN = /^[A-F0-9]{6}$/;

// הסבר: מציגה את תיבת המידע של המשחק המקוון, עם הודעה ועם קישור
// (אם יש) שאפשר לשלוח לחבר.
function showOnlineInfo(message, link = "") {
  onlineUi.info.hidden = false;
  onlineUi.infoText.textContent = message;
  onlineUi.inviteLink.value = link;
}

/** Changes the page address without reloading (to add/remove ?room=...). */
// הסבר: משנה את הכתובת בשורת הכתובת של הדפדפן — בלי לטעון את הדף
// מחדש. כך, אם מרעננים את הדף, הכתובת עדיין מכילה את קוד החדר
// ואפשר לחזור לאותו משחק.
function setAddress(url) {
  window.history.replaceState({}, "", url.pathname + url.search + url.hash);
}

/** Replaces our game with the server's copy (the server is always right). */
// הסבר: "סנכרון" — מחליפים את מצב המשחק שלנו במה שהשרת שלח.
// בודקים כל שדה בנפרד, כי לא כל הודעה מכילה את כולם:
//   • fen — העמדה הנוכחית.
//   • history — כל העמדות עד כה. אם אין היסטוריה אבל יש fen,
//     ההיסטוריה היא רק העמדה הזו.
//   • moves — רשימת המהלכים.
//   • finished — האם המשחק נגמר.
// בסוף מבטלים בחירה ומציירים מחדש.
function applyServerState(message) {
  if (message.fen) game.position = parseFEN(message.fen);
  if (Array.isArray(message.history) && message.history.length) game.history = message.history.slice();
  else if (message.fen) game.history = [message.fen];
  if (Array.isArray(message.moves)) game.moveList = message.moves.slice();
  game.finished = Boolean(message.finished);
  game.thinking = false;
  clearSelection();
  render();
}

// הסבר: שולחת הודעה לשרת. לפני השליחה בודקים שהחיבור באמת פתוח
// (readyState === OPEN). אם לא — מציגים הודעת שגיאה במקום לקרוס.
// JSON.stringify הופך את האובייקט לטקסט, כי ברשת שולחים רק טקסט.
function send(payload) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    setStatus("החיבור נותק. רענן את הדף כדי להתחבר מחדש.");
    return;
  }
  socket.send(JSON.stringify(payload));
}

// הסבר: שולחת לשרת את המהלך ששיחקנו (כטקסט UCI, למשל "e2e4").
// game.js קורא לפונקציה הזו אחרי שהשחקן לוחץ על מהלך.
function sendOnlineMove(uci) {
  send({ type: "move", uci });
}

// הסבר: מודיעה לשרת שאנחנו נכנעים.
function resignOnlineGame() {
  send({ type: "resign" });
}

// הסבר: יציאה מהמשחק המקוון וחזרה למשחק מול המחשב:
//   1. סוגרים את החיבור לשרת.
//   2. מאפסים את מצב ה-online.
//   3. מסתירים את תיבת המידע ומחזירים את התווית "אתה בלבן · המחשב בשחור".
//   4. מוחקים את ?room=... מהכתובת, כדי שרענון לא יחזיר אותנו לחדר.
//   5. מציירים מחדש.
function leaveOnlineGame() {
  if (socket) socket.close();
  socket = null;
  online.active = false;
  online.ready = false;
  online.color = null;
  onlineUi.info.hidden = true;
  onlineUi.modeLabel.textContent = "אתה משחק בלבן · המחשב בשחור";
  const address = new URL(location.href);
  address.searchParams.delete("room");
  setAddress(address);
  render();
}

// ---------------------------------------------------------------------
// Handling messages from the server
// טיפול בהודעות שמגיעות מהשרת.
// ---------------------------------------------------------------------

// הסבר: נקראת כשנכנסנו לחדר (בין אם יצרנו אותו ובין אם הצטרפנו):
//   1. השרת אומר לנו באיזה צבע אנחנו (0 = לבן, 1 = שחור).
//   2. שומרים "אסימון" (token) ב-sessionStorage — זה כמו כרטיס כניסה.
//      אם נרענן את הדף, נציג אותו לשרת והוא יחזיר אותנו לאותו כיסא.
//   3. מציגים את קוד החדר ואת הצבע שלנו.
//   4. בונים קישור הזמנה (הכתובת הנוכחית + ?room=קוד) ומציגים אותו,
//      כדי שנוכל לשלוח אותו לחבר.
//   5. מסנכרנים את הלוח עם מה שהשרת שלח, ומציגים "ממתין לשחקן השני".
function onRoomEntered(message) {
  // The server sends color 0 for white and 1 for black.
  online.color = message.color === 0 ? "w" : "b";
  // The token lets us rejoin the same seat after a page refresh.
  sessionStorage.setItem("chess-room-token:" + message.room, message.token);
  onlineUi.roomCode.value = message.room;
  onlineUi.modeLabel.textContent = online.color === "w" ? "אתה בלבן · היריב בשחור" : "אתה בשחור · היריב בלבן";

  const shareLink = new URL(location.href);
  shareLink.searchParams.set("room", message.room);
  setAddress(shareLink);
  showOnlineInfo("קוד החדר: " + message.room + " · שלח את הקישור לחבר", shareLink.href);

  applyServerState(message);
  setStatus(online.color === "w" ? "החדר נוצר. ממתין לשחקן השני…" : "הצטרפת לחדר. ממתין לשחקן השני…");
}

// הסבר: היריב שיחק מהלך! מה עושים?
//   1. מחפשים את המהלך ברשימת המהלכים החוקיים שלנו. (הופכים כל מהלך
//      חוקי לטקסט UCI ומשווים לטקסט שהגיע מהשרת.)
//   2. אם לא מצאנו — כנראה הלוח שלנו לא מסונכרן עם השרת. במקום
//      להתווכח, פשוט טוענים את המצב של השרת.
//   3. אם מצאנו — משחקים את המהלך אצלנו.
//   4. בדיקת ביטחון: משווים את העמדה שקיבלנו לעמדה שהשרת שלח. אם
//      יש הבדל — השרת צודק, טוענים את המצב שלו.
//   5. afterMove — בודק סוף משחק ומצייר.
function onOpponentMove(message) {
  const move = generateLegalMoves(game.position).find(m => moveToUci(m) === message.uci);
  if (!move) {
    applyServerState(message);
    setStatus("סנכרנתי מחדש את מצב הלוח.");
    return;
  }
  playMove(move);
  // If our board somehow differs from the server's, trust the server.
  if (message.fen && toFEN(game.position) !== message.fen) applyServerState(message);
  else if (Array.isArray(message.history)) game.history = message.history.slice();
  afterMove();
}

// הסבר: "מרכזיית הטלפונים" — כל הודעה מהשרת מגיעה לכאן קודם.
//   1. מנסים לפענח את הטקסט כ-JSON. אם זה לא JSON תקין — מתעלמים
//      (try/catch מונע קריסה).
//   2. לפי השדה type, מעבירים את ההודעה לטיפול המתאים (switch):
//      • room_created / room_joined — נכנסנו לחדר.
//      • room_status — עדכון: האם שני השחקנים מחוברים.
//      • opponent_move — היריב שיחק.
//      • move_accepted — השרת אישר את המהלך שלנו (ובודקים שאנחנו מסונכרנים).
//      • game_over — המשחק נגמר (מט, כניעה וכו').
//      • peer_disconnected — היריב התנתק.
//      • room_error — שגיאה (למשל: החדר לא קיים או מלא).
function onServerMessage(event) {
  let message;
  try {
    message = JSON.parse(event.data);
  } catch (error) {
    return; // ignore anything that isn't JSON
  }

  switch (message.type) {
    case "room_created":
    case "room_joined":
      onRoomEntered(message);
      break;
    case "room_status":
      online.ready = message.ready;
      setStatus(message.ready ? "שני השחקנים מחוברים. הלבן מתחיל!" : "ממתין לחיבור השחקן השני…");
      render();
      break;
    case "opponent_move":
      onOpponentMove(message);
      break;
    case "move_accepted":
      if (message.fen && toFEN(game.position) !== message.fen) applyServerState(message);
      break;
    case "game_over":
      game.thinking = false;
      endGame(message.message || "המשחק הסתיים.");
      render();
      break;
    case "peer_disconnected":
      online.ready = false;
      setStatus("היריב התנתק. אפשר להמתין שיתחבר מחדש.");
      render();
      break;
    case "room_error":
      setStatus(message.message || "לא ניתן להצטרף לחדר.");
      showOnlineInfo(message.message || "שגיאה בחדר.");
      break;
  }
}

// ---------------------------------------------------------------------
// Connecting
// התחברות לשרת.
// ---------------------------------------------------------------------

/** action is "create" (new room) or "join" (existing room code). */
// הסבר: מתחילה משחק מקוון — יצירת חדר חדש או הצטרפות לחדר קיים.
//   1. אם כבר היינו במשחק מקוון — יוצאים ממנו. מתחילים משחק חדש
//      (כל חדר מתחיל מעמדת הפתיחה) ומסמנים שאנחנו במצב מקוון.
//   2. בוחרים לאיזה שרת להתחבר: בדרך כלל לאותו שרת שממנו נטען הדף.
//      (יש מקרה מיוחד: כתובת ישנה שהחדרים שלה עברו לשרת חדש.)
//   3. בוחרים פרוטוקול: אם הדף מאובטח (https) — חייבים חיבור מאובטח
//      (wss), אחרת — ws רגיל.
//   4. פותחים את החיבור ומגדירים ארבעה "מאזינים" לאירועים:
//      • open — החיבור נפתח: שולחים לשרת "צור חדר" או "הצטרף לחדר".
//        בהצטרפות — שולחים גם את האסימון השמור (אם יש), כדי לחזור
//        לאותו כיסא אחרי רענון.
//      • message — הגיעה הודעה: מעבירים ל-onServerMessage.
//      • close — החיבור נסגר: מודיעים לשחקן.
//        שימו לב לבדיקה socket === thisSocket: אם כבר פתחנו חיבור
//        חדש, הסגירה של הישן לא מעניינת אותנו. thisSocket "זוכר"
//        איזה חיבור זה היה (זה נקרא closure).
//      • error — שגיאת חיבור: מציגים הודעה.
function startOnlineGame(action, room) {
  if (online.active) leaveOnlineGame();
  newGame(); // every room starts from the opening position
  online.active = true;
  online.ready = false;
  online.color = null;
  setStatus("מתחבר לשרת המשחק…");

  // The old address still works, but its rooms live on the newer server.
  // The game page and WebSocket service are deployed separately.
  const host = "mate-pcqg.onrender.com";
  const protocol = location.protocol === "https:" ? "wss://" : "ws://";
  const thisSocket = new WebSocket(protocol + host + "/ws");
  socket = thisSocket;

  thisSocket.addEventListener("open", () => {
    const token = action === "join" ? sessionStorage.getItem("chess-room-token:" + room) : null;
    send({ type: action, room, token });
  });
  thisSocket.addEventListener("message", onServerMessage);
  thisSocket.addEventListener("close", () => {
    // Ignore old sockets we closed ourselves.
    if (socket === thisSocket && online.active) {
      online.ready = false;
      setStatus("החיבור לשרת נסגר. רענן את הדף כדי לנסות שוב.");
      render();
    }
  });
  thisSocket.addEventListener("error", () => {
    setStatus("שגיאה בחיבור לשרת. בדוק את החיבור לאינטרנט ונסה שוב.");
  });
}

// ---------------------------------------------------------------------
// Buttons
// כפתורי המשחק המקוון.
// ---------------------------------------------------------------------

// הסבר: כפתור "צור חדר" — מתחיל משחק מקוון חדש. אין קוד חדר, כי
// השרת הוא שממציא אותו ושולח לנו.
document.getElementById("createRoom").addEventListener("click", () => startOnlineGame("create", ""));

// הסבר: כפתור "הצטרף לחדר" — קוראים את הקוד שהמשתמש הקליד, מנקים
// רווחים (trim) והופכים לאותיות גדולות. בודקים שהקוד תקין לפי
// הביטוי הרגולרי. אם לא — מציגים הודעה ולא מתחברים בכלל (אין טעם
// לשאול את השרת על קוד שבטוח שגוי).
document.getElementById("joinRoom").addEventListener("click", () => {
  const code = onlineUi.roomCode.value.trim().toUpperCase();
  if (!ROOM_CODE_PATTERN.test(code)) {
    setStatus("הזן קוד חדר בן שש אותיות או ספרות.");
    return;
  }
  startOnlineGame("join", code);
});

// הסבר: כפתור "העתק קישור" — מנסה להעתיק את קישור ההזמנה ללוח.
// הפונקציה היא async, כי העתקה ללוח היא פעולה שלוקחת זמן (await).
// לפעמים הדפדפן לא מרשה להעתיק (למשל באתר לא מאובטח) — אז בתוך
// ה-catch מבקשים מהמשתמש להעתיק בעצמו. שימו לב שקודם עושים select(),
// כך שהטקסט כבר מסומן ונוח להעתקה ידנית.
document.getElementById("copyInvite").addEventListener("click", async () => {
  onlineUi.inviteLink.select();
  try {
    await navigator.clipboard.writeText(onlineUi.inviteLink.value);
    onlineUi.infoText.textContent = "הקישור הועתק. שלח אותו לחבר!";
  } catch (error) {
    onlineUi.infoText.textContent = "סמן והעתק את הקישור שמופיע בתיבה.";
  }
});

// Invite links fill in the room code, but joining requires an explicit click.
const invitedRoom = (new URLSearchParams(location.search).get("room") || "").toUpperCase();
if (ROOM_CODE_PATTERN.test(invitedRoom)) {
  onlineUi.roomCode.value = invitedRoom;
  showOnlineInfo('קיבלת הזמנה למשחק. לחץ על "הצטרף לחדר" כדי להיכנס.');
  setStatus('קישור הזמנה מוכן. לחץ על "הצטרף לחדר" כדי להצטרף.');
}