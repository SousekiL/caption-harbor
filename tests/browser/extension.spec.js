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
    await page.locator("#reading-font").selectOption("serif");
    await page.locator("#reading-size").focus();
    await page.keyboard.press("End");
    await expect(page.locator("#reading-size-label")).toHaveText("32 px");
    await expect
      .poll(() =>
        page.evaluate(
          async () =>
            (await chrome.storage.local.get("harbor_reading")).harbor_reading
              ?.size,
        ),
      )
      .toBe(32);
    await page.reload();
    await expect(page.locator("#reading-font")).toHaveValue("serif");
    await expect(page.locator("#reading-size")).toHaveValue("32");
    await expect(page.locator(".harbor-reading-preview")).toHaveCSS(
      "font-size",
      "32px",
    );
    await expect(page.locator("#harbor-auto")).not.toBeChecked();
    expect(errors).toEqual([]);
  } finally {
    await context.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
});

test("native host reads private environment configuration without persisting token", async () => {
  const { spawnSync } = require("node:child_process");
  const root = path.resolve(__dirname, "../..");
  const temp = fs.mkdtempSync(
    path.join(os.tmpdir(), "caption-harbor-native-test-"),
  );
  const profile = path.join(temp, "browser");
  const config = path.join(temp, "private");
  fs.mkdirSync(config, { mode: 0o700 });
  fs.writeFileSync(
    path.join(config, "secrets.env"),
    "EUDIC_TOKEN='NIS fixture-native'\n",
    { mode: 0o600 },
  );
  const installed = spawnSync(
    "python3",
    [
      path.join(root, "scripts/install-native-host.py"),
      "--profile-dir",
      profile,
      "--config-dir",
      config,
    ],
    { encoding: "utf8" },
  );
  expect(installed.status).toBe(0);
  const context = await chromium.launchPersistentContext(profile, {
    headless: true,
    channel: "chromium",
    args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`],
  });
  try {
    let worker = context.serviceWorkers()[0];
    if (!worker) worker = await context.waitForEvent("serviceworker");
    const id = new URL(worker.url()).host;
    const manifest = JSON.parse(
      fs.readFileSync(
        path.join(
          profile,
          "NativeMessagingHosts/com.caption_harbor.environment.json",
        ),
      ),
    );
    expect(manifest.allowed_origins).toContain(`chrome-extension://${id}/`);
    const page = await context.newPage();
    await page.goto(`chrome-extension://${id}/options.html`);
    await page.locator("#harbor-environment").click();
    await expect(page.locator("#harbor-environment-status")).toContainText(
      "已找到本机",
    );
    expect(
      await page.evaluate(async () => {
        const value = await chrome.runtime.sendNativeMessage(
          "com.caption_harbor.environment",
          { action: "getEudicToken" },
        );
        const storage = JSON.stringify(await chrome.storage.local.get(null));
        return (
          value.token === "NIS fixture-native" &&
          !storage.includes("fixture-native")
        );
      }),
    ).toBe(true);
  } finally {
    await context.close();
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
