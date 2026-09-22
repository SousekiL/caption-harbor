const { test, expect, chromium } = require("@playwright/test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

test("reset clears every settings form so saving cannot restore deleted credentials", async () => {
  const root = path.resolve(__dirname, "../..");
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "harbor-options-reset-"));
  const context = await chromium.launchPersistentContext(profile, {
    headless: true,
    channel: "chromium",
    args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`],
  });
  try {
    const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
    await worker.evaluate(() => chrome.storage.local.set({
      ytd_options_language: "zh-CN",
      harbor_services: { transcriptionProvider: "groq", groqApiKey: "fixture-groq", localModel: "base.en" },
      lens_settings: { explanationLanguage: "en", credentialSource: "manual", eudicToken: "fixture-eudic", categoryId: "42", categoryName: "Old book", autoTranscribe: false },
      harbor_reading: { font: "serif", size: 25 },
    }));
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(`chrome-extension://${new URL(worker.url()).host}/options.html`);
    await expect(page.locator("#groqApiKey")).toHaveValue("fixture-groq");
    await expect(page.locator("#harbor-token")).toHaveValue("fixture-eudic");
    await page.locator(".learning-advanced > summary").click();
    page.once("dialog", dialog => dialog.accept());
    await page.locator("#resetBtn").click();
    await expect(page.locator("#dataStatus")).toContainText("已删除");
    await expect(page.locator("#groqApiKey")).toHaveValue("");
    await expect(page.locator("#harbor-token")).toHaveValue("");
    await expect(page.locator("#harbor-category")).toHaveValue("0");
    await expect(page.locator("#harbor-explanation-language")).toHaveValue("zh-CN");
    await expect(page.locator("#transcriptionProvider")).toHaveValue("supadata");
    await expect(page.locator("#harbor-auto")).toBeChecked();
    await page.locator("#settingsForm button[type=submit]").click();
    await page.locator("#harbor-save").click();
    await expect.poll(() => worker.evaluate(async () => {
      const data = await chrome.storage.local.get(["harbor_services", "lens_settings"]);
      return { groq: data.harbor_services?.groqApiKey, eudic: data.lens_settings?.eudicToken };
    })).toEqual({ groq: "", eudic: "" });
    expect(errors).toEqual([]);
  } finally {
    await context.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
});
