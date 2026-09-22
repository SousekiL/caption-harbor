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
    window.__playbackReads = 0;
    window.__timeAfterNextRead = null;
    window.__afterPlaybackRead = null;
    window.__failSeekMessage = false;
    window.__fallbackSeek = null;
    window.__currentTab = {
      id: 1,
      url: "https://www.youtube.com/watch?v=video123",
      windowId: 1,
      active: true,
    };
    window.__videoFixtures = {
      video123: {
        title: "Learning, one sentence at a time",
        channelName: "Caption Harbor",
        transcript: [
          "Reinforced learning helps us understand diminishing returns.",
          "Practice with a specific example to understand the concept.",
        ],
      },
    };
    const tabUpdatedListeners = [];
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
        get: async () => ({ ...window.__currentTab }),
        query: async () => [{ ...window.__currentTab }],
        onUpdated: {
          addListener(listener) {
            tabUpdatedListeners.push(listener);
          },
        },
        onActivated: { addListener() {} },
        sendMessage: async (id, payload) => {
          window.__player.push(payload);
          if (payload.action === "getCurrentTime") {
            window.__playbackReads += 1;
            window.__lastPlayback = { tabId: id, videoId: payload.videoId };
            const reportedTime = window.__time;
            if (window.__timeAfterNextRead !== null) {
              const nextTime = window.__timeAfterNextRead;
              window.__timeAfterNextRead = null;
              queueMicrotask(() => {
                window.__time = nextTime;
                window.__afterPlaybackRead?.();
                window.__afterPlaybackRead = null;
              });
            }
            return {
              success: true,
              currentTime: reportedTime,
              paused: false,
            };
          }
          if (payload.action === "seekTo" && window.__failSeekMessage)
            throw new Error("Receiving end does not exist");
          return {
            success: true,
            currentTime: window.__time,
            loop: payload.command === "loop",
          };
        },
        create: async () => ({}),
      },
      scripting: {
        executeScript: async ({ args }) => {
          if (args?.length === 2) {
            window.__fallbackSeek = {
              videoId: args[0],
              seconds: args[1],
            };
            window.__time = args[1];
            return [{ result: { success: true, currentTime: args[1] } }];
          }
          return [
            {
              result: {
                success: true,
                currentTime: window.__time,
                paused: false,
              },
            },
          ];
        },
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
          if (message.action === "fetchTranscript") {
            const fixture = window.__videoFixtures[message.videoId];
            if (fixture?.transcriptDelay)
              await new Promise((resolve) =>
                setTimeout(resolve, fixture.transcriptDelay),
              );
            const transcript = (fixture?.transcript || []).map(
              (text, index) => ({
                start: index * 4,
                duration: 4,
                text,
              }),
            );
            return {
              success: true,
              transcript,
              transcriptText: transcript.map((item) => item.text).join(" "),
              transcriptTextTimestamped: transcript
                .map((item) => `[00:00:0${item.start}] ${item.text}`)
                .join("\n"),
              language: "en",
              transcriptSource: "audio",
            };
          }
          if (message.action === "getNotes")
            return { success: true, notes: [] };
          if (message.action === "relayToContent") {
            const videoId = new URL(window.__currentTab.url).searchParams.get(
              "v",
            );
            const fixture = window.__videoFixtures[videoId];
            if (fixture?.metadataDelay)
              await new Promise((resolve) =>
                setTimeout(resolve, fixture.metadataDelay),
              );
            return {
              success: true,
              response: {
                title: fixture?.title || videoId,
                channelName: fixture?.channelName || "Caption Harbor",
                duration: 8,
                currentTime: 0,
              },
            };
          }
          return { success: true };
        },
      },
    };
    window.getSettings = async () => ({ supadataApiKey: "fixture" });
    window.parseLooseJson = JSON.parse;
    window.__navigateVideo = (videoId) => {
      const url = `https://www.youtube.com/watch?v=${videoId}`;
      window.__currentTab = { ...window.__currentTab, url };
      for (const listener of tabUpdatedListeners) {
        listener(window.__currentTab.id, { url }, { ...window.__currentTab });
      }
    };
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
test("transcript header marks an audio-sourced transcript", async ({
  page,
}) => {
  await setup(page);
  await expect(page.locator("#transcriptSourceBadge")).toHaveText("音频转录");
});
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

test("playback follow reacts within 350ms after a cue boundary", async ({
  page,
}) => {
  await setup(page);
  await page.evaluate(() => {
    currentTranscript = [
      { start: 0, duration: 4, text: "First sentence." },
      { start: 4, duration: 4, text: "Next sentence." },
    ];
    renderTranscriptModeRows(
      currentTranscript.map((entry, index) => ({
        ...entry,
        id: String(index),
      })),
      "bilingual",
    );
  });

  await page.evaluate(
    () =>
      new Promise((resolve) => {
        window.__timeAfterNextRead = 4.1;
        window.__afterPlaybackRead = resolve;
      }),
  );
  await page.waitForTimeout(350);
  expect(
    await page.locator(".active-playback").getAttribute("data-seconds"),
  ).toBe("4");
});

test("clicking a caption seeks the bound video when page messaging is disconnected", async ({
  page,
}) => {
  await setup(page);
  await page.evaluate(() => {
    window.__failSeekMessage = true;
  });
  await page.locator('.transcript-entry[data-seconds="4"]').click();
  await expect
    .poll(() => page.evaluate(() => window.__fallbackSeek))
    .toEqual({ videoId: "video123", seconds: 4 });
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

test("a slower previous navigation cannot replace the current video's transcript", async ({
  page,
}) => {
  await setup(page);
  await page.evaluate(() => {
    window.__videoFixtures.videoA12 = {
      title: "Video A",
      channelName: "Channel A",
      transcript: ["This transcript belongs to the previous video."],
      metadataDelay: 1500,
    };
    window.__videoFixtures.videoB34 = {
      title: "Video B",
      channelName: "Channel B",
      transcript: ["This transcript belongs to the current video."],
    };
    window.__navigateVideo("videoA12");
  });
  await page.waitForTimeout(700);
  await page.evaluate(() => window.__navigateVideo("videoB34"));

  await expect(page.locator("#videoTitle")).toHaveText("Video B", {
    timeout: 4000,
  });
  await expect(page.locator("#transcriptList")).toContainText("current video");
  await page.waitForTimeout(1000);
  await expect(page.locator("#videoTitle")).toHaveText("Video B");
  await expect(page.locator("#transcriptList")).toContainText("current video");
  await expect(page.locator("#transcriptList")).not.toContainText(
    "previous video",
  );
});

test("reload captions refreshes only the current video's transcript", async ({
  page,
}) => {
  await setup(page);
  await page.evaluate(async () => {
    window.__videoFixtures.video123.transcript = [
      "Fresh captions from the current video.",
    ];
    await chrome.storage.local.set({
      lens_job_video123: { jobId: "paid-job-must-survive" },
      lens_words: [{ id: "word-1", word: "learning", occurrences: [] }],
    });
  });

  const reload = page.getByRole("button", {
    name: "重新载入当前视频字幕",
  });
  await expect(reload).toBeVisible();
  await reload.click();

  await expect(page.locator("#transcriptList")).toContainText(
    "Fresh captions from the current video.",
  );
  await expect(page.locator("#transcriptList")).not.toContainText(
    "Reinforced learning",
  );
  const retained = await page.evaluate(async () => {
    const stored = await chrome.storage.local.get([
      "lens_job_video123",
      "lens_words",
    ]);
    return {
      jobId: stored.lens_job_video123?.jobId,
      word: stored.lens_words?.[0]?.word,
    };
  });
  expect(retained).toEqual({
    jobId: "paid-job-must-survive",
    word: "learning",
  });
});

test("late analysis cannot overwrite the next video's analysis or cache", async ({
  page,
}) => {
  await setup(page);
  await page.evaluate(() => {
    const send = chrome.runtime.sendMessage;
    chrome.runtime.sendMessage = (message) =>
      message.action === "analyzeTranscript"
        ? new Promise((resolve) => {
            window.__finishAnalysis = resolve;
          })
        : send(message);
    window.__analysisTask = triggerAnalysis();
    window.__videoFixtures.videoB34 = {
      title: "Video B",
      transcript: ["The current video's transcript."],
    };
    window.__navigateVideo("videoB34");
  });
  await expect(page.locator("#videoTitle")).toHaveText("Video B");
  await page.evaluate(async () => {
    window.__finishAnalysis({
      success: true,
      analysis: {
        summary: "Old analysis",
        chapters: [],
        quotes: [],
        keyMoments: [],
      },
    });
    await window.__analysisTask;
  });
  expect(
    await page.evaluate(() => ({
      analysis: currentAnalysis,
      saved: __store.digest_videoB34?.analysis,
    })),
  ).toEqual({ analysis: null, saved: null });
});

test("a cache save retains the transcript captured before a video switch", async ({
  page,
}) => {
  await setup(page);
  const result = await page.evaluate(async () => {
    const get = chrome.storage.local.get;
    let release;
    chrome.storage.local.get = (keys) =>
      keys === "digest_video123"
        ? new Promise((resolve) => {
            release = () =>
              resolve({ digest_video123: __store.digest_video123 });
          })
        : get(keys);
    const saving = saveToCache(currentVideoId);
    currentVideoId = "videoB34";
    currentTranscript = [{ start: 0, duration: 4, text: "Different video" }];
    currentTranscriptText = "Different video";
    currentVideoTitle = "Video B";
    release();
    await saving;
    return __store.digest_video123;
  });
  expect(result.transcriptText).toContain("Reinforced learning");
  expect(result.videoTitle).toBe("Learning, one sentence at a time");
});

test("a slow notes filter response cannot replace the newest filter", async ({
  page,
}) => {
  await setup(page);
  await page.evaluate(async () => {
    const send = chrome.runtime.sendMessage;
    let release;
    chrome.runtime.sendMessage = (message) => {
      if (message.action !== "getNotes") return send(message);
      if (message.videoId)
        return new Promise((resolve) => {
          release = resolve;
        });
      return Promise.resolve({
        success: true,
        notes: [
          {
            id: "new",
            videoId: "video123",
            text: "Newest filter notes",
            timestamp: "00:00",
            timestampSeconds: 0,
            timestampedUrl: "https://www.youtube.com/watch?v=video123",
            videoTitle: "Video",
          },
        ],
      });
    };
    const first = loadNotes("video123");
    await loadNotes(null);
    release({ success: true, notes: [] });
    await first;
  });
  expect(await page.evaluate(() => currentNotesFilterVideoId)).toBeNull();
  await expect(page.locator("#notesList")).toContainText("Newest filter notes");
});

test("a pending playback shortcut cannot control a newly selected video", async ({
  page,
}) => {
  await setup(page);
  const commands = await page.evaluate(async () => {
    const send = chrome.tabs.sendMessage;
    let release;
    chrome.tabs.sendMessage = (tabId, message) => {
      if (message.action === "getCurrentTime")
        return new Promise((resolve) => {
          release = resolve;
        });
      return send(tabId, message);
    };
    const action = lensPlayer("loop").catch(() => {});
    // The guarded path also checks the tab before asking for playback state.
    while (!release) await Promise.resolve();
    currentVideoId = "videoB34";
    window.__currentTab.url = "https://www.youtube.com/watch?v=videoB34";
    currentTranscript = [{ start: 30, duration: 4, text: "Different video" }];
    release({ success: true, currentTime: 0 });
    await action;
    return __player.filter((message) => message.action === "lensPlayer");
  });
  expect(commands).toEqual([]);
});

test("an answer arriving later preserves the next question being drafted", async ({
  page,
}) => {
  await setup(page);
  await page.evaluate(async () => {
    const send = chrome.runtime.sendMessage;
    let release;
    chrome.runtime.sendMessage = (message) =>
      message.action === "lensAI"
        ? new Promise((resolve) => {
            release = resolve;
          })
        : send(message);
    document.getElementById("lens-question").value = "First question";
    const answer = lensAsk();
    document.getElementById("lens-question").value = "My next question";
    release({ success: true, text: "The answer" });
    await answer;
  });
  await expect(page.locator("#lens-question")).toHaveValue("My next question");
});

test("closing an explanation while it loads does not reject or overwrite a later dialog", async ({
  page,
}) => {
  await setup(page);
  const result = await page.evaluate(async () => {
    const send = chrome.runtime.sendMessage;
    let release;
    chrome.runtime.sendMessage = (message) =>
      message.action === "explainSelection"
        ? new Promise((resolve) => {
            release = resolve;
          })
        : send(message);
    const explanation = showExplanation("Reinforced");
    document.getElementById("closeExplain").click();
    release({ success: true, explanation: "An explanation" });
    return explanation.then(
      () => "closed",
      (error) => error.message,
    );
  });
  expect(result).toBe("closed");
});

test("selection menu has four compact actions without wrapping at narrow widths", async ({ page }) => {
  await setup(page);
  await page.evaluate(() => chrome.storage.local.set({ ytd_options_language: "en", harbor_reading: { font: "lexend", size: 32 } }));
  for (const width of [320, 430]) {
    await page.setViewportSize({ width, height: 850 });
    await selectWord(page);
    const toolbar = page.locator('#explainTooltip');
    await expect(toolbar.locator('button')).toHaveCount(4);
    const dimensions = await toolbar.evaluate(el => {
      const bounds = el.getBoundingClientRect();
      const buttons = [...el.querySelectorAll('button')].map(button => button.getBoundingClientRect());
      return { left: bounds.left, right: bounds.right, height: bounds.height, rows: new Set(buttons.map(b=>Math.round(b.top))).size, fits: [...el.querySelectorAll('button')].every(b=>b.scrollWidth<=b.clientWidth) };
    });
    expect(dimensions.left).toBeGreaterThanOrEqual(9);
    expect(dimensions.right).toBeLessThanOrEqual(width - 9);
    expect(dimensions.height).toBeLessThanOrEqual(100);
    expect(dimensions.rows).toBe(2);
    expect(dimensions.fits).toBe(true);
  }
  await page.evaluate(() => chrome.storage.local.set({ harbor_reading: { font: "lexend", size: 13.5 }, ytd_options_language: "zh-CN" }));
  await selectWord(page);
  await expect(page.locator('#explainTooltip')).toHaveCSS('opacity', '1');
  await page.screenshot({path:'dist/selection-menu-v2.1.6.png', animations:'disabled'});
  await page.locator('#explainTooltip').screenshot({path:'dist/selection-menu-detail-v2.1.6.png', animations:'disabled'});
});
