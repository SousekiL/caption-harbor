const { test, expect, chromium } = require("@playwright/test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
test("unpacked extension starts its real service worker and persists learning settings", async () => {
  const root = process.env.CAPTION_HARBOR_EXTENSION_ROOT || path.resolve(__dirname, "../..");
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
    await worker.evaluate(() =>
      chrome.storage.local.set({ ytd_options_language: "zh-CN" }),
    );
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`chrome-extension://${id}/options.html`);
    await expect(page.locator("#harbor-auto")).toBeChecked();
    await page.locator("#harbor-auto").uncheck();
    await page.locator("#settingsForm button[type=submit]").click();
    await expect(page.locator("#saveStatus")).toContainText("已保存");
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
    await page.locator("#harbor-explanation-language").selectOption("en");
    await expect.poll(() => page.evaluate(async () => (await chrome.storage.local.get("lens_settings")).lens_settings?.explanationLanguage)).toBe("en");
    await page.reload();
    await expect(page.locator("#harbor-explanation-language")).toHaveValue("en");
    await page.locator('[data-language="en"]').click();
    await expect(page.locator("#harbor-explanation-language")).toHaveValue("en");
    await page.locator("#harbor-explanation-language").selectOption("zh-CN");
    await expect.poll(() => page.evaluate(async () => (await chrome.storage.local.get("lens_settings")).lens_settings?.explanationLanguage)).toBe("zh-CN");
    await page.locator('[data-language="zh-CN"]').click();
    await expect(page.locator("#reading-font")).toHaveValue("serif");
    await expect(page.locator("#reading-size")).toHaveValue("32");
    await expect(page.locator(".harbor-reading-preview")).toHaveCSS(
      "font-size",
      "32px",
    );
    await expect(page.locator("#harbor-auto")).not.toBeChecked();
    await context.route("https://www.youtube.com/watch?v=video123", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: '<video class="html5-main-video"></video>',
      }),
    );
    const videoPage = await context.newPage();
    await videoPage.goto("https://www.youtube.com/watch?v=video123");
    await videoPage.evaluate(
      () => (document.querySelector("video").currentTime = 42.5),
    );
    const playback = await page.evaluate(async () => {
      const tabs = await chrome.tabs.query({
        url: "https://www.youtube.com/watch?v=video123",
      });
      const valid = await chrome.runtime.sendMessage({
        action: "getPlaybackState",
        tabId: tabs[0].id,
        videoId: "video123",
      });
      const wrong = await chrome.runtime.sendMessage({
        action: "getPlaybackState",
        tabId: tabs[0].id,
        videoId: "other123",
      });
      return { valid, wrong };
    });
    expect(playback.valid).toEqual({ success: true, currentTime: 42.5 });
    expect(playback.wrong.success).toBe(false);
    for (const file of ["sites.js", "page-media.js", "player-connection.js"]) {
      await page.addScriptTag({
        url: `chrome-extension://${id}/${file}`,
      });
    }
    const directAndFallback = await page.evaluate(async () => {
      const tabs = await chrome.tabs.query({
        url: "https://www.youtube.com/watch?v=video123",
      });
      const direct = await readBoundPlayerState(tabs[0].id, "video123");
      let changedFlag = null;
      try {
        await readBoundPlayerState(tabs[0].id, "other123");
      } catch (error) {
        changedFlag = error.videoChanged === true;
      }
      const original = chrome.tabs.sendMessage;
      try {
        chrome.tabs.sendMessage = async () => undefined;
        const fallback = await readBoundPlayerState(tabs[0].id, "video123");
        return {
          direct: direct.currentTime,
          fallback: fallback.currentTime,
          changedFlag,
        };
      } finally {
        chrome.tabs.sendMessage = original;
      }
    });
    expect(directAndFallback).toEqual({
      direct: 42.5,
      fallback: 42.5,
      changedFlag: true,
    });
    expect(errors).toEqual([]);
  } finally {
    await context.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
});

test("native host reads private environment configuration without persisting token", async () => {
  const { spawnSync } = require("node:child_process");
  const root = process.env.CAPTION_HARBOR_EXTENSION_ROOT || path.resolve(__dirname, "../..");
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
    await worker.evaluate(() =>
      chrome.storage.local.set({ ytd_options_language: "zh-CN" }),
    );
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

test("service configuration and learning controls follow one interface language", async () => {
  const root = process.env.CAPTION_HARBOR_EXTENSION_ROOT || path.resolve(__dirname, "../..");
  const profile = fs.mkdtempSync(
    path.join(os.tmpdir(), "caption-harbor-settings-test-"),
  );
  const context = await chromium.launchPersistentContext(profile, {
    headless: true,
    channel: "chromium",
    args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`],
  });
  try {
    let worker = context.serviceWorkers()[0];
    if (!worker) worker = await context.waitForEvent("serviceworker");
    const page = await context.newPage();
    await page.setViewportSize({ width: 1100, height: 950 });
    await page.goto(
      `chrome-extension://${new URL(worker.url()).host}/options.html`,
    );
    await expect(page.locator("#harbor-auto")).toBeChecked();
    await page.locator('[data-language="en"]').click();
    await page.locator("#transcriptionProvider").selectOption("local");
    await expect(page.locator("#localConfiguration")).toBeVisible();
    await expect(page.locator("#supadataConfiguration")).not.toBeVisible();
    await expect(page.locator("#localConfiguration")).toContainText("CPU/GPU");
    const untranslated = await page
      .locator(".settings-shell")
      .evaluate((root) => {
        const clone = root.cloneNode(true);
        clone
          .querySelectorAll("textarea,.harbor-reading-preview")
          .forEach((e) => e.remove());
        return clone.textContent
          .split("\n")
          .map((s) => s.trim())
          .filter((s) => /[\u4e00-\u9fff]/.test(s));
      });
    expect(untranslated).toEqual([]);
    const aligned = await page.locator(".checkbox-line").first().evaluate((label) => {
      const c = label.querySelector("input").getBoundingClientRect();
      const t = label.querySelector("span").getBoundingClientRect();
      return Math.abs(c.top + c.height / 2 - t.top - t.height / 2) < 2;
    });
    expect(aligned).toBe(true);
    await page.screenshot({
      path: "dist/settings-en.png",
      fullPage: true,
      animations: "disabled",
    });
    await page.locator("#transcriptionProvider").selectOption("groq");
    await expect(page.locator("#groqApiKey")).toBeVisible();
    await page.locator("#groqApiKey").fill("fixture-groq");
    await page.locator("#settingsForm button[type=submit]").click();
    await expect(page.locator("#saveStatus")).toContainText("Saved");
    await page.reload();
    await expect(page.locator("#transcriptionProvider")).toHaveValue("groq");
    await page.locator('[data-language="zh-CN"]').click();
    await expect(page.locator("#learningModule > h2")).toHaveText("学习设置");
    await expect(page.locator("#settingsForm > h2")).toHaveText("字幕与 AI");
    await page.locator("#harbor-auto").uncheck();
    await expect(page.locator("#transcriptionChoices")).not.toBeVisible();
  } finally {
    await context.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
});
