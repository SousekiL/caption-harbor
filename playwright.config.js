const { defineConfig } = require("@playwright/test");
module.exports = defineConfig({
  testDir: "./tests/browser",
  timeout: 30000,
  workers: 1,
  use: { headless: true, viewport: { width: 430, height: 900 } },
  reporter: "list",
});
