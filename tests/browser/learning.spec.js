const { test, expect } = require("@playwright/test");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "../..");
async function setup(page) {
  await page.addInitScript(() => {
    const db = { ytd_options_language: "zh-CN" };
    const handlers = [];
    window.__store = db;
    window.__player = [];
    window.__time = 0;
    const storageListeners = [];
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
      set: async (data) => {
        Object.assign(db, structuredClone(data));
        for (const fn of storageListeners)
          fn(
            Object.fromEntries(
              Object.entries(data).map(([key, newValue]) => [
                key,
                { newValue },
              ]),
            ),
            "local",
          );
      },
      remove: async (keys) =>
        (Array.isArray(keys) ? keys : [keys]).forEach((k) => delete db[k]),
    };
    window.chrome = {
      storage: {
        local,
        session: local,
        onChanged: {
          addListener(fn) {
            storageListeners.push(fn);
          },
        },
      },
      windows: { getCurrent: async () => ({ id: 1 }) },
      tabs: {
        get: async (id) => ({
          id,
          url: "https://www.youtube.com/watch?v=video123",
        }),
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
          if (payload.action === "getCurrentTime")
            window.__lastPlayback = { tabId: id, videoId: payload.videoId };
          return {
            success: true,
            currentTime: window.__time,
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
          if (message.action === "getPlaybackState") {
            window.__lastPlayback = message;
            return { success: true, currentTime: window.__time };
          }
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
test("reader keeps search and copy/export without the extra toolbar", async ({
  page,
}) => {
  await setup(page);
  await expect(page.locator(".lens-tools,.lens-file-menu")).toHaveCount(0);
  await expect(page.locator("#copyTranscriptBtn")).toBeVisible();
  await expect(page.locator("#exportTranscriptBtn")).toBeVisible();
  await page.locator("#transcriptSearchInput").fill("understand");
  await expect(page.locator("#transcriptSearchCount")).toHaveText("1 of 2");
  await page.locator("#transcriptSearchNextBtn").click();
  await expect(page.locator("#transcriptSearchCount")).toHaveText("2 of 2");
  const download = page.waitForEvent("download");
  await page.locator("#exportTranscriptBtn").click();
  expect((await download).suggestedFilename()).toMatch(/\.txt$/);
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
  await page.setViewportSize({ width: 380, height: 540 });
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
  await page.evaluate(() =>
    chrome.storage.local.set({ ytd_options_language: "en" }),
  );
  await expect(page.locator("#settingsBtn")).toHaveText("Settings");
  await page.screenshot({
    path: "dist/caption-harbor-preview-en.png",
    fullPage: true,
    animations: "disabled",
  });
});

test("settings-only fonts apply live in all caption modes with timestamps above", async ({
  page,
}) => {
  await setup(page);
  await expect(page.locator(".harbor-reading")).toHaveCount(0);
  for (const [font, family] of [
    ["robotoSlab", "Harbor Roboto Slab"],
    ["lexend", "Harbor Lexend"],
  ]) {
    await page.evaluate(
      (font) =>
        chrome.storage.local.set({ harbor_reading: { font, size: 26 } }),
      font,
    );
    expect(
      await page.evaluate(
        async (family) =>
          (await document.fonts.load(`16px "${family}"`)).length > 0,
        family,
      ),
    ).toBe(true);
    await expect(page.locator(".transcript-text").first()).toHaveCSS(
      "font-family",
      new RegExp(family),
    );
  }
  for (const mode of ["original", "zh", "bilingual"]) {
    await page.evaluate(
      (mode) =>
        mode === "original"
          ? renderTranscript()
          : renderTranscriptModeRows(getActiveTranscriptSegments(), mode),
      mode,
    );
    const geometry = await page
      .locator(".transcript-entry")
      .first()
      .evaluate((row) => {
        const time = row
          .querySelector(".transcript-time")
          .getBoundingClientRect();
        const text = row
          .querySelector(".transcript-text,.transcript-copy")
          .getBoundingClientRect();
        return {
          above: time.bottom <= text.top,
          aligned: Math.abs(time.left - text.left) < 1,
        };
      });
    expect(geometry).toEqual({ above: true, aligned: true });
    await expect(
      page.locator(".transcript-text,.transcript-translation").first(),
    ).toHaveCSS("font-size", "26px");
  }
});

test("follow playback refreshes stale highlight and scrolls only the caption area", async ({
  page,
}) => {
  await setup(page);
  await page.evaluate(() => {
    currentTranscript = Array.from({ length: 30 }, (_, i) => ({
      start: i * 10,
      duration: 10,
      text: `Sentence ${i}. ` + "A readable caption with context. ".repeat(5),
    }));
    renderTranscript();
    autoScrollEnabled = false;
    highlightActiveEntry(0);
    document.getElementById("contentArea").scrollTop = 0;
    window.__time = 120;
    document.getElementById("followPlaybackBtn").style.display = "block";
  });
  await page.locator("#followPlaybackBtn").click();
  await expect(page.locator(".active-playback")).toHaveAttribute(
    "data-seconds",
    "120",
  );
  await expect
    .poll(() => page.locator("#contentArea").evaluate((el) => el.scrollTop))
    .toBeGreaterThan(0);
  expect(await page.evaluate(() => scrollY)).toBe(0);
  expect(await page.evaluate(() => __lastPlayback.tabId)).toBe(1);
  await page.evaluate(() => (window.__time = 180));
  await expect(page.locator(".active-playback")).toHaveAttribute(
    "data-seconds",
    "180",
  );
  await expect(page.locator("#followPlaybackBtn")).not.toBeVisible();
});

test("video seeks stay in sync; only manual caption scrolling pauses follow", async ({
  page,
}) => {
  await setup(page);
  await page.evaluate(() => {
    currentTranscript = Array.from({ length: 30 }, (_, i) => ({
      start: i * 10,
      duration: 10,
      text: `Sentence ${i}. ` + "Readable subtitle context. ".repeat(6),
    }));
    renderTranscriptModeRows(
      currentTranscript.map((entry, i) => ({ ...entry, id: String(i) })),
      "bilingual",
    );
    window.__time = 120;
  });
  await expect(page.locator(".active-playback")).toHaveAttribute(
    "data-seconds",
    "120",
  );
  await expect(page.locator("#followPlaybackBtn")).not.toBeVisible();
  // Browser-generated scroll events must not be mistaken for manual input.
  await page
    .locator("#contentArea")
    .evaluate((el) => el.dispatchEvent(new Event("scroll")));
  await page.evaluate(() => (window.__time = 200));
  await expect(page.locator(".active-playback")).toHaveAttribute(
    "data-seconds",
    "200",
  );
  await expect(page.locator("#followPlaybackBtn")).not.toBeVisible();
  await page.locator("#contentArea").hover();
  await page.mouse.wheel(0, -240);
  await expect(page.locator("#followPlaybackBtn")).toBeVisible();
  const readingPosition = await page
    .locator("#contentArea")
    .evaluate((el) => el.scrollTop);
  await page.evaluate(() => (window.__time = 250));
  await expect(page.locator(".active-playback")).toHaveAttribute(
    "data-seconds",
    "250",
  );
  expect(
    await page.locator("#contentArea").evaluate((el) => el.scrollTop),
  ).toBeCloseTo(readingPosition, 0);
  await page.getByRole("button", { name: "笔记", exact: true }).click();
  await page.getByRole("button", { name: "字幕", exact: true }).click();
  await expect(page.locator("#followPlaybackBtn")).toBeVisible();
  await page.locator("#followPlaybackBtn").click();
  await expect(page.locator("#followPlaybackBtn")).not.toBeVisible();
  await page.evaluate(() => (window.__time = 40));
  await expect(page.locator(".active-playback")).toHaveAttribute(
    "data-seconds",
    "40",
  );
  await expect(page.locator("#followPlaybackBtn")).not.toBeVisible();
});

test("panel buttons switch to English without translating video captions", async ({
  page,
}) => {
  await setup(page);
  await page.evaluate(() =>
    chrome.storage.local.set({ ytd_options_language: "en" }),
  );
  await expect(page.locator('[data-tab="vocabulary"]')).toHaveText(
    "Vocabulary",
  );
  await expect(page.locator("#settingsBtn")).toHaveText("Settings");
  await page.locator('[data-tab="vocabulary"]').click();
  const text = await page.locator("#contentArea").innerText();
  expect(text).not.toMatch(/[\u4e00-\u9fff]/);
  await page.locator('[data-tab="transcript"]').click();
  await expect(page.locator("#transcriptList")).toContainText("Reinforced");
});
