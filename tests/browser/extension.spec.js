const { test, expect, chromium } = require("@playwright/test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
test("unpacked extension starts its real service worker and persists learning settings", async () => {
  const root = path.resolve(__dirname, "../..");
  const profile = fs.mkdtempSync(
    path.join(os.tmpdir(), "caption-harbor-test-"),
  );
  const context = await chromium.launchPersistentContext(profile, {
    headless: true,
    channel: "chromium",
    args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`],
  });
  try {
    let worker = context.serviceWorkers()[0];
    if (!worker) worker = await context.waitForEvent("serviceworker");
    const id = new URL(worker.url()).host;
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`chrome-extension://${id}/options.html`);
    await expect(page.locator("#harbor-auto")).toBeChecked();
    await page.locator("#harbor-auto").uncheck();
    await page.locator("#harbor-save").click();
    await expect(page.locator("#harbor-status")).toContainText("已保存");
    const result = await page.evaluate(() =>
      chrome.runtime.sendMessage({
        action: "lensSaveWord",
        word: "context",
        videoId: "video123",
        context: "Learn in context.",
        title: "Fixture",
      }),
    );
    expect(result.success).toBe(true);
    const sync = await page.evaluate(
      (id) => chrome.runtime.sendMessage({ action: "lensSyncWord", id }),
      result.row.id,
    );
    expect(sync.row.status).toBe("failed");
    expect(sync.row.error).toContain("欧路");
    await page.reload();
    await expect(page.locator("#harbor-auto")).not.toBeChecked();
    expect(errors).toEqual([]);
  } finally {
    await context.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
});
