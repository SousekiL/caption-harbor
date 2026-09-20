const { test, expect } = require("@playwright/test");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "../..");
async function setup(page) {
  await page.addInitScript(() => {
    const db = {};
    const handlers = [];
    window.__store = db;
    window.__player = [];
    const local = {
      get: async (keys) =>
        keys === null
          ? { ...db }
          : Object.fromEntries(
              (Array.isArray(keys) ? keys : [keys]).map((k) => [
                k,
                structuredClone(db[k]),
              ]),
            ),
      set: async (data) => Object.assign(db, structuredClone(data)),
      remove: async (keys) =>
        (Array.isArray(keys) ? keys : [keys]).forEach((k) => delete db[k]),
    };
    window.chrome = {
      storage: { local, session: local, onChanged: { addListener() {} } },
      windows: { getCurrent: async () => ({ id: 1 }) },
      tabs: {
        query: async () => [
          {
            id: 1,
            url: "https://www.youtube.com/watch?v=video123",
            windowId: 1,
          },
        ],
        onUpdated: { addListener() {} },
        onActivated: { addListener() {} },
        sendMessage: async (id, payload) => {
          window.__player.push(payload);
          return {
            success: true,
            currentTime: 0,
            loop: payload.command === "loop",
          };
        },
        create: async () => ({}),
      },
      runtime: {
        id: "fixture",
        getURL: (s) => "https://harbor.test/" + s,
        onMessage: { addListener: (fn) => handlers.push(fn) },
        sendMessage: async (message) => {
          if (message.action.startsWith("lens"))
            return window.lensHandle(message);
          if (message.action === "checkConfig")
            return { hasSupadataKey: false, hasAiKey: false };
          if (message.action === "fetchTranscript")
            return {
              success: true,
              transcript: [
                {
                  start: 0,
                  duration: 4,
                  text: "Reinforced learning helps us understand diminishing returns.",
                },
                {
                  start: 4,
                  duration: 4,
                  text: "Practice with a specific example to understand the concept.",
                },
              ],
              transcriptText:
                "Reinforced learning helps us understand diminishing returns. Practice with a specific example to understand the concept.",
              transcriptTextTimestamped:
                "[00:00:00] Reinforced learning helps us understand diminishing returns.\n[00:00:04] Practice with a specific example.",
              language: "en",
            };
          if (message.action === "getNotes")
            return { success: true, notes: [] };
          if (message.action === "relayToContent")
            return {
              success: true,
              response: {
                title: "Learning, one sentence at a time",
                channelName: "Caption Harbor",
                duration: 8,
                currentTime: 0,
              },
            };
          return { success: true };
        },
      },
    };
    window.getSettings = async () => ({ supadataApiKey: "fixture" });
    window.parseLooseJson = JSON.parse;
    window.requestAiCompletion = async ({ messages }) => {
      const system = messages[0].content;
      if (system.includes("questions"))
        return {
          text: JSON.stringify({
            questions: [
              {
                question: "什么是边际收益递减？",
                answer: "增加投入所带来的新增收益逐渐减少。",
                timestamp: "00:00:00",
              },
            ],
          }),
        };
      if (system.includes("lemma"))
        return {
          text: JSON.stringify({
            lemma: "reinforce",
            explanation: "reinforce：加强、巩固。这里描述学习过程。",
          }),
        };
      return { text: "字幕说明学习需要具体的例子。[00:00:04]" };
    };
  });
  await page.route("https://harbor.test/**", async (route) => {
    const file =
      new URL(route.request().url()).pathname.slice(1) || "sidepanel.html";
    const full = path.join(root, file);
    if (!full.startsWith(root) || !fs.existsSync(full))
      return route.fulfill({ status: 404, body: "" });
    let body = fs.readFileSync(full);
    if (file === "lens-transcript.js")
      body = Buffer.from(
        `async function lensFetchTranscript(videoId) { return chrome.runtime.sendMessage({action:"fetchTranscript", videoId}); }`,
      );
    if (file === "sidepanel.html")
      body = Buffer.from(
        body
          .toString()
          .replace(
            '<script src="sidepanel.js">',
            '<script src="lens-background.js"></script><script src="sidepanel.js">',
          ),
      );
    return route.fulfill({
      body,
      contentType: file.endsWith(".js")
        ? "application/javascript"
        : file.endsWith(".css")
          ? "text/css"
          : "text/html",
    });
  });
  await page.goto("https://harbor.test/sidepanel.html");
  await expect(page.locator("#transcriptList")).toContainText("Reinforced");
}
async function selectWord(page) {
  await page
    .locator(".transcript-text")
    .first()
    .evaluate((el) => {
      const node = el.firstChild;
      const range = document.createRange();
      range.setStart(node, 0);
      range.setEnd(node, 10);
      getSelection().removeAllRanges();
      getSelection().addRange(range);
      el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    });
}
test("selection, immediate collection, failure recovery and vocabulary rendering", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await setup(page);
  await selectWord(page);
  await page.getByRole("button", { name: "收藏", exact: true }).click();
  await expect(page.locator("#lens-status")).toContainText("本地保存");
  await page.getByRole("button", { name: "生词", exact: true }).click();
  await expect(page.locator("#lens-word-list")).toContainText("Reinforced");
  await expect(page.locator("#lens-word-list")).toContainText(
    "请先在设置里连接欧路词典",
  );
  expect(errors).toEqual([]);
});
test("context explanation suggests editable lemma and saves it", async ({
  page,
}) => {
  await setup(page);
  await selectWord(page);
  await page.getByRole("button", { name: "词义", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("加强");
  await expect(page.getByRole("dialog").locator("input")).toHaveValue(
    "reinforce",
  );
  await page.getByRole("dialog").locator("input").fill("reinforced learning");
  await page.getByRole("button", { name: "收藏并同步欧路" }).click();
  await expect
    .poll(() => page.evaluate(() => __store.lens_words?.[0]?.word))
    .toBe("reinforced learning");
});
test("imports subtitles without keys, exports VTT, and sends loop boundaries", async ({
  page,
}) => {
  await setup(page);
  await page.locator("input[type=file]").setInputFiles({
    name: "example.srt",
    mimeType: "text/plain",
    buffer: Buffer.from(
      "1\n00:00:00,000 --> 00:00:02,500\nImported subtitles\n\n2\n00:00:03,000 --> 00:00:05,000\nSecond sentence",
    ),
  });
  await expect(page.locator("#transcriptList")).toContainText(
    "Imported subtitles",
  );
  await page.getByRole("button", { name: "单句循环", exact: true }).click();
  expect(await page.evaluate(() => __player.at(-1).command)).toBe("loop");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "VTT", exact: true }).click();
  expect((await download).suggestedFilename()).toMatch(/\.vtt$/);
});
test("video questions and self-test reveal answers only on request", async ({
  page,
}) => {
  await setup(page);
  await page.getByRole("button", { name: "问答", exact: true }).click();
  await page.locator("#lens-question").fill("解释视频的内容");
  await page.getByRole("button", { name: "提问", exact: true }).click();
  await expect(page.locator("#lens-conversation")).toContainText("具体的例子");
  await page.getByRole("button", { name: "[00:00:04]", exact: true }).click();
  expect(await page.evaluate(() => __player.at(-1).seconds)).toBe(4);
  await page.getByRole("button", { name: "生成自测" }).click();
  await expect(page.locator("#lens-conversation details")).toHaveCount(1);
  await expect(page.locator("#lens-conversation details")).not.toHaveAttribute(
    "open",
    "",
  );
  await page.locator("#lens-conversation summary").click();
  await expect(page.locator("#lens-conversation details")).toContainText(
    "新增收益逐渐减少",
  );
});
test("narrow panel is readable and produces a review screenshot", async ({
  page,
}) => {
  await setup(page);
  await page.setViewportSize({ width: 380, height: 850 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "dist/caption-harbor-preview.png",
    fullPage: true,
    animations: "disabled",
  });
});

test("subtitle appearance applies to both languages and resets", async ({
  page,
}) => {
  await setup(page);
  await page.locator(".harbor-reading summary").click();
  for (const [id, family] of [
    ["robotoSlab", "Harbor Roboto Slab"],
    ["lexend", "Harbor Lexend"],
  ]) {
    await page.locator("#reading-font").selectOption(id);
    const loaded = await page.evaluate(async (family) => {
      const faces = await document.fonts.load(`16px "${family}"`);
      return (
        faces.length > 0 && faces.every((face) => face.status === "loaded")
      );
    }, family);
    expect(loaded).toBe(true);
    await expect(page.locator(".transcript-text").first()).toHaveCSS(
      "font-family",
      new RegExp(family),
    );
  }
  await page.locator("#reading-font").selectOption("mono");
  await page.locator("#reading-size").focus();
  await page.keyboard.press("End");
  await expect(page.locator(".transcript-text").first()).toHaveCSS(
    "font-size",
    "32px",
  );
  await expect(page.locator(".transcript-text").first()).toHaveCSS(
    "font-family",
    /Menlo/,
  );
  await page.evaluate(() =>
    renderTranscriptModeRows(getActiveTranscriptSegments(), "bilingual"),
  );
  await expect(page.locator(".transcript-original").first()).toHaveCSS(
    "font-size",
    "32px",
  );
  await expect(page.locator(".transcript-translation").first()).toHaveCSS(
    "font-size",
    "32px",
  );
  await page.locator("#reading-reset").click();
  await expect(page.locator(".transcript-original").first()).toHaveCSS(
    "font-size",
    "13.5px",
  );
});
