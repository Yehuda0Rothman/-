"use strict";

const { test, expect } = require("@playwright/test");

async function openGame(page, baseURL) {
  const url = new URL("/", baseURL).toString();
  const deadline = Date.now() + 180000;
  let lastStatus = "no response";

  // Render's free service may show a temporary startup page after sleeping.
  // Retry until the actual chess UI (not the Render splash page) is ready.
  while (Date.now() < deadline) {
    let response = null;
    try {
      response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      lastStatus = response ? String(response.status()) : "no response";
      if (response && response.ok()) {
        await page.locator("#newGame").waitFor({ state: "visible", timeout: 10000 });
        await expect(page.locator(".square")).toHaveCount(64, { timeout: 10000 });
        if (await page.title() === "שחמט") return;
      }
    } catch (error) {
      lastStatus = error.message;
    }
    await page.waitForTimeout(5000);
  }

  throw new Error("SHACH did not become ready within 180 seconds. Last response: " + lastStatus);
}

async function startMode(page, mode) {
  await page.locator("#newGame").click();
  await expect(page.locator("#newGameDialog")).toBeVisible();
  await page.locator("#gameMode").selectOption(mode);
  if (mode !== "online") {
    await page.locator("#startGame").click();
    await expect(page.locator("#newGameDialog")).not.toBeVisible();
  }
}

async function clickMove(page, fromRow, fromCol, toRow, toCol) {
  await page.locator(`.square[data-row="${fromRow}"][data-col="${fromCol}"]`).click();
  await page.locator(`.square[data-row="${toRow}"][data-col="${toCol}"]`).click();
}

test("live page loads the full board and required controls", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));

  await openGame(page, test.info().project.use.baseURL || "https://shach.onrender.com");
  await expect(page).toHaveTitle("שחמט");
  await expect(page.locator(".square")).toHaveCount(64);
  await expect(page.locator("#newGame")).toBeVisible();
  await expect(page.locator("#undo")).toBeVisible();
  await expect(page.locator("#flip")).toBeVisible();
  await expect(page.locator("#resign")).toBeVisible();
  await expect(page.locator("#whiteClock")).toBeVisible();
  await expect(page.locator("#blackClock")).toBeVisible();

  const stylesheet = await page.evaluate(() => {
    const link = document.querySelector('link[rel="stylesheet"]');
    return link && link.sheet !== null;
  });
  expect(stylesheet).toBeTruthy();
  expect(pageErrors).toEqual([]);
});

test("local two-player mode accepts legal moves and rejects an illegal destination", async ({ page }) => {
  await openGame(page, test.info().project.use.baseURL || "https://shach.onrender.com");
  await startMode(page, "local");

  await clickMove(page, 6, 4, 4, 4); // e2-e4
  await expect(page.locator('.square[data-row="4"][data-col="4"]'))
    .toHaveAttribute("aria-label", /e4, רגלי לבן/);
  await expect(page.locator("#moves .move-row")).toHaveCount(1);

  await clickMove(page, 1, 4, 3, 4); // e7-e5
  await expect(page.locator('.square[data-row="3"][data-col="4"]'))
    .toHaveAttribute("aria-label", /e5, רגלי שחור/);
  await expect(page.locator("#moves .move-notation")).toHaveCount(2);

  await page.locator("#newGame").click();
  await page.locator("#gameMode").selectOption("local");
  await page.locator("#startGame").click();

  // Select e2, then click e5. A pawn cannot make this move.
  await page.locator('.square[data-row="6"][data-col="4"]').click();
  await page.locator('.square[data-row="3"][data-col="4"]').click();
  await expect(page.locator('.square[data-row="6"][data-col="4"]'))
    .toHaveAttribute("aria-label", /e2, רגלי לבן/);
  await expect(page.locator("#moves .move-row")).toHaveCount(0);
});

test("computer mode responds after the human move", async ({ page }) => {
  await openGame(page, test.info().project.use.baseURL || "https://shach.onrender.com");
  await startMode(page, "computer");
  await page.locator("#searchDepth").fill("2");
  await page.locator("#searchDepth").dispatchEvent("change");

  await clickMove(page, 6, 4, 4, 4); // e2-e4
  await expect(page.locator("#moves .move-notation")).toHaveCount(2, { timeout: 30000 });
  await expect(page.locator("#status")).not.toContainText("המחשב חושב");
  await expect(page.locator("#depth")).not.toHaveText("—");
});

test("board flip changes the visible orientation", async ({ page }) => {
  await openGame(page, test.info().project.use.baseURL || "https://shach.onrender.com");
  const firstSquare = page.locator(".square").first();
  await expect(firstSquare).toHaveAttribute("data-row", "0");
  await expect(firstSquare).toHaveAttribute("data-col", "0");

  await page.locator("#flip").click();
  await expect(page.locator(".square").first()).toHaveAttribute("data-row", "7");
  await expect(page.locator(".square").first()).toHaveAttribute("data-col", "7");
});

test("two real browser sessions stay synchronized during an online game", async ({ browser, baseURL }) => {
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();
  const errors = [];
  host.on("pageerror", error => errors.push("host: " + error.message));
  guest.on("pageerror", error => errors.push("guest: " + error.message));

  try {
    await openGame(host, baseURL);
    await startMode(host, "online");
    await host.locator("#createRoom").click();
    await expect.poll(() => host.locator("#roomCode").inputValue(), { timeout: 30000 })
      .toMatch(/^[A-F0-9]{6}$/);

    const inviteLink = await host.locator("#inviteLink").inputValue();
    expect(inviteLink).toContain("?room=");

    await guest.goto(inviteLink, { waitUntil: "domcontentloaded", timeout: 30000 });
    await expect(guest.locator("#newGame")).toBeVisible({ timeout: 30000 });
    await expect.poll(() => host.evaluate(() => online.ready), { timeout: 30000 })
      .toBe(true);
    await expect.poll(() => guest.evaluate(() => online.ready), { timeout: 30000 })
      .toBe(true);

    await clickMove(host, 6, 4, 4, 4); // white: e2-e4
    await expect(host.locator('.square[data-row="4"][data-col="4"]'))
      .toHaveAttribute("aria-label", /e4, רגלי לבן/);
    await expect(guest.locator('.square[data-row="4"][data-col="4"]'))
      .toHaveAttribute("aria-label", /e4, רגלי לבן/, { timeout: 15000 });

    await clickMove(guest, 1, 4, 3, 4); // black: e7-e5
    await expect(guest.locator('.square[data-row="3"][data-col="4"]'))
      .toHaveAttribute("aria-label", /e5, רגלי שחור/);
    await expect(host.locator('.square[data-row="3"][data-col="4"]'))
      .toHaveAttribute("aria-label", /e5, רגלי שחור/, { timeout: 15000 });

    await expect(host.locator("#moves .move-notation")).toHaveCount(2);
    await expect(guest.locator("#moves .move-notation")).toHaveCount(2);
    expect(errors).toEqual([]);
  } finally {
    await hostContext.close();
    await guestContext.close();
  }
});
