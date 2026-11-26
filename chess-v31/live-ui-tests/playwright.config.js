"use strict";

const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  timeout: 90000,
  expect: { timeout: 20000 },
  reporter: [["list"]],
  use: {
    baseURL: process.env.SHACH_BASE_URL || "https://shach.onrender.com",
    browserName: "chromium",
    headless: true,
    viewport: { width: 1440, height: 1000 },
    actionTimeout: 15000,
    navigationTimeout: 90000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure"
  }
});
