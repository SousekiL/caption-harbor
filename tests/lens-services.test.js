const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const core = require("../lens-core");
function harness(
  initial = {},
  fetcher = async () => ({ ok: true, status: 201, json: async () => ({}) }),
  native = async () => {
    throw new Error("not installed");
  },
) {
  const db = structuredClone(initial),
    listeners = [],
    requests = [];
  const ctx = vm.createContext({
    console,
    URL,
    URLSearchParams,
    AbortSignal,
    crypto: require("node:crypto").webcrypto,
    LensCore: core,
    setTimeout: (fn) => {
      fn();
      return 1;
    },
    Date,
    chrome: {
      runtime: {
        id: "ext",
        sendNativeMessage: native,
        getURL: (x) => "chrome-extension://ext/" + x,
        onMessage: { addListener: (fn) => listeners.push(fn) },
      },
      storage: {
        local: {
          get: async (key) =>
            Object.fromEntries(
              (Array.isArray(key) ? key : [key]).map((k) => [
                k,
                structuredClone(db[k]),
              ]),
            ),
          set: async (obj) => Object.assign(db, structuredClone(obj)),
          remove: async (key) => delete db[key],
        },
      },
    },
    YTD_SETTINGS: {
      canonicalYouTubeUrl: (id) => {
        if (!/^[\w-]{6,20}$/.test(id)) throw Error("invalid id");
        return "https://www.youtube.com/watch?v=" + id;
      },
    },
    HarborSites: require("../sites"),
    getSettings: async () => ({ supadataApiKey: "fixture-key" }),
    fetch: async (url, opts) => {
      requests.push({ url: String(url), opts });
      return fetcher(url, opts);
    },
    requestAiCompletion: async () => ({
      text: '{"explanation":"定义","lemma":"run"}',
    }),
    parseLooseJson: JSON.parse,
  });
  vm.runInContext(
    fs.readFileSync(require.resolve("../lens-transcript"), "utf8"),
    ctx,
  );
  vm.runInContext(
    fs.readFileSync(require.resolve("../audio-transcription"), "utf8"),
    ctx,
  );
  vm.runInContext(
    fs.readFileSync(require.resolve("../lens-background"), "utf8"),
    ctx,
  );
  return {
    db,
    requests,
    listeners,
    context: ctx,
    run: (name, arg) => ctx[name](arg),
  };
}
test("concurrent collections preserve all words and merge duplicate occurrences", async () => {
  const h = harness();
  await Promise.all(
    ["alpha", "beta", "alpha"].map((word, i) =>
      h.run("lensHandle", {
        action: "lensSaveWord",
        word,
        videoId: "video123",
        start: i,
        context: "an original sentence",
      }),
    ),
  );
  assert.equal(h.db.lens_words.length, 2);
  assert.equal(
    h.db.lens_words.find((w) => w.word === "alpha").occurrences.length,
    2,
  );
  assert.equal(h.requests.length, 0);
});
test("sync sends selected wordbook and original context, never other provider keys", async () => {
  const h = harness({
    lens_settings: { eudicToken: "fixture-token", categoryId: "12" },
  });
  const saved = await h.run("lensHandle", {
    action: "lensSaveWord",
    word: "diminishing returns",
    videoId: "video123",
    context: "These are diminishing returns.",
  });
  await h.run("lensHandle", { action: "lensSyncWord", id: saved.row.id });
  const request = h.requests[0];
  assert.deepEqual(JSON.parse(request.opts.body), {
    language: "en",
    word: "diminishing returns",
    context_line: "These are diminishing returns.",
    category_ids: ["12"],
  });
  assert.equal(request.opts.headers.Authorization, "NIS fixture-token");
  assert.equal(h.db.lens_words[0].status, "synced");
  await h.run("lensHandle", { action: "lensSyncWord", id: saved.row.id });
  assert.equal(h.requests.length, 1);
});
test("failed authorization retains the local word and visible retry state", async () => {
  const h = harness(
    { lens_settings: { eudicToken: "fixture-token" } },
    async () => ({ ok: false, status: 401 }),
  );
  const saved = await h.run("lensHandle", {
    action: "lensSaveWord",
    word: "hello",
    videoId: "video123",
  });
  await h.run("lensHandle", { action: "lensSyncWord", id: saved.row.id });
  assert.equal(h.db.lens_words[0].status, "failed");
  assert.match(h.db.lens_words[0].error, /授权/);
});
test("transcription job persists and resumes by polling without resubmission", async () => {
  let call = 0;
  const h = harness({}, async () =>
    ++call === 1
      ? { ok: true, status: 202, json: async () => ({ jobId: "job-1" }) }
      : {
          ok: true,
          status: 200,
          json: async () => ({
            status: "completed",
            result: {
              content: [{ offset: 0, duration: 1000, text: "hello" }],
              lang: "en",
            },
          }),
        },
  );
  const first = await h.run("lensFetchTranscript", "video123");
  assert.equal(first.pending, true);
  assert.match(h.requests[0].url, /mode=auto/);
  assert.equal(h.db.lens_job_video123.jobId, "job-1");
  const second = await h.run("lensFetchTranscript", "video123");
  assert.equal(second.success, true);
  assert.match(h.requests[1].url, /transcript\/job-1$/);
  assert.equal(h.db.lens_job_video123, undefined);
  assert.equal(h.db.digest_video123.transcript[0].text, "hello");
});
test("uncertain timeout blocks automatic duplicate paid submission", async () => {
  const h = harness({}, async () => {
    throw Error("timeout");
  });
  await assert.rejects(h.run("lensFetchTranscript", "video123"));
  await assert.rejects(h.run("lensFetchTranscript", "video123"), /上次转录/);
  assert.equal(h.requests.length, 1);
});
test("native-only preference and imported captions survive late provider result", async () => {
  const h = harness(
    {
      lens_settings: { autoTranscribe: false },
    },
    async () => {
      // The user imports their own captions while a provider request is in flight.
      h.db.digest_video123 = { imported: true, transcript: [{ text: "mine" }] };
      return {
        ok: true,
        status: 200,
        json: async () => ({ content: [{ offset: 0, duration: 1000, text: "provider" }] }),
      };
    },
  );
  await h.run("lensFetchTranscript", "video123");
  assert.match(h.requests[0].url, /mode=native/);
  assert.equal(h.db.digest_video123.transcript[0].text, "mine");
});
test("content scripts cannot invoke learning provider services", () => {
  const h = harness();
  let result;
  const handled = h.listeners[0](
    { action: "lensCategories" },
    {
      id: "ext",
      tab: { id: 1 },
      url: "https://www.youtube.com/watch?v=video123",
    },
    (r) => (result = r),
  );
  assert.equal(handled, false);
  assert.equal(result.success, false);
  assert.equal(h.requests.length, 0);
});

test("finished cached transcript does not submit a second paid request", async () => {
  const h = harness({
    digest_video123: {
      timestamp: Date.now(),
      transcript: [{ start: 0, text: "cached" }],
      transcriptText: "cached",
    },
  });
  const result = await h.run("lensFetchTranscript", "video123");
  assert.equal(result.transcriptText, "cached");
  assert.equal(h.requests.length, 0);
});

test("environment credential is used only in request memory, not browser storage", async () => {
  const h = harness(
    { lens_settings: { credentialSource: "environment" } },
    undefined,
    async (name, message) => {
      assert.equal(name, "com.caption_harbor.environment");
      return message.action === "status"
        ? { success: true, configured: true }
        : { success: true, token: "NIS local-fixture" };
    },
  );
  await h.run("lensHandle", { action: "lensCategories" });
  assert.equal(h.requests[0].opts.headers.Authorization, "NIS local-fixture");
  assert.doesNotMatch(JSON.stringify(h.db), /local-fixture/);
  const status = await h.run("lensHandle", { action: "lensEnvironmentStatus" });
  assert.equal(status.configured, true);
  assert.equal(status.token, undefined);
});

test("YouTube captions work without a Supadata key or request", async () => {
  const h = harness();
  h.context.getSettings = async () => ({ supadataApiKey: "" });
  h.context.readBrowserCaptions = async () => ({
    success: true,
    transcript: [{ start: 0, duration: 1, text: "native" }],
    transcriptText: "native",
  });
  h.context.harborCacheTranscript = async (video, result) => {
    h.db[`digest_${video}`] = result;
  };
  const result = await h.run("lensFetchTranscript", "video123");
  assert.equal(result.success, true);
  assert.equal(result.transcriptText, "native");
  assert.equal(h.requests.length, 0);
});
test("selected local provider is used when browser captions are unavailable", async () => {
  const h = harness({
    lens_settings: { autoTranscribe: true },
    harbor_services: { transcriptionProvider: "local" },
  });
  h.context.getSettings = async () => ({ supadataApiKey: "" });
  h.context.readBrowserCaptions = async () => ({ success: false });
  h.context.harborAlternativeTranscript = async (video, config) => ({
    success: true,
    provider: config.transcriptionProvider,
  });
  const result = await h.run("lensFetchTranscript", "video123");
  assert.equal(result.provider, "local");
  assert.equal(h.requests.length, 0);
});

test("preferOriginalAudio falls back to site captions when audio fails", async () => {
  const h = harness({
    lens_settings: { autoTranscribe: true, preferOriginalAudio: true },
    harbor_services: { transcriptionProvider: "groq", groqApiKey: "fixture" },
  });
  h.context.harborAlternativeTranscript = async () => {
    throw new Error("native helper missing");
  };
  h.context.readSiteCaptions = async () => ({
    success: true,
    transcript: [{ start: 0, text: "fallback captions" }],
  });
  let cachedMeta;
  h.context.harborCacheTranscript = async (video, result, meta) => {
    cachedMeta = meta;
  };
  const result = await h.run("lensFetchTranscript", "bili_BV1abc1234_1");
  assert.equal(result.transcript[0].text, "fallback captions");
  // The captions fallback is marked so the cache knows audio failed recently.
  assert.equal(cachedMeta.source, "captions");
  assert.equal(typeof cachedMeta.audioFailedAt, "number");
  // The failure reason is persisted so the panel can explain the badge.
  assert.equal(cachedMeta.audioError, "native helper missing");
  assert.equal(result.transcriptSource, "captions");
  assert.equal(result.audioError, "native helper missing");
});

test("preferOriginalAudio treats a captions-source cache as stale", async () => {
  const h = harness({
    lens_settings: { autoTranscribe: true, preferOriginalAudio: true },
    harbor_services: { transcriptionProvider: "groq", groqApiKey: "fixture" },
    digest_bili_BV1abc1234_1: {
      timestamp: Date.now(),
      transcript: [{ start: 0, text: "中文字幕" }],
      transcriptSource: "captions",
    },
  });
  h.context.readSiteCaptions = async () => ({
    success: true,
    transcript: [{ start: 0, text: "中文字幕" }],
  });
  h.context.harborAlternativeTranscript = async () => ({
    success: true,
    transcript: [{ start: 0, text: "English audio" }],
  });
  const result = await h.run("lensFetchTranscript", "bili_BV1abc1234_1");
  assert.equal(result.transcript[0].text, "English audio");
});

test("preferOriginalAudio keeps an audio-source cache", async () => {
  const h = harness({
    lens_settings: { autoTranscribe: true, preferOriginalAudio: true },
    harbor_services: { transcriptionProvider: "groq", groqApiKey: "fixture" },
    digest_bili_BV1abc1234_1: {
      timestamp: Date.now(),
      transcript: [{ start: 0, text: "English audio" }],
      transcriptSource: "audio",
    },
  });
  h.context.harborAlternativeTranscript = async () => {
    throw new Error("should not re-transcribe");
  };
  const result = await h.run("lensFetchTranscript", "bili_BV1abc1234_1");
  assert.equal(result.transcript[0].text, "English audio");
});

test("preferOriginalAudio keeps an unmarked cache that is already English", async () => {
  // Written before transcriptSource tracking — but clearly not the Chinese
  // site track, so re-transcribing would waste a job for no benefit.
  const h = harness({
    lens_settings: { autoTranscribe: true, preferOriginalAudio: true },
    harbor_services: { transcriptionProvider: "groq", groqApiKey: "fixture" },
    digest_bili_BV1abc1234_1: {
      timestamp: Date.now(),
      transcript: [
        { start: 0, text: "The man you're looking at is Relix." },
        { start: 5, text: "Heir to the Eric Group." },
      ],
    },
  });
  h.context.harborAlternativeTranscript = async () => {
    throw new Error("should not re-transcribe");
  };
  const result = await h.run("lensFetchTranscript", "bili_BV1abc1234_1");
  assert.equal(result.transcript[0].text, "The man you're looking at is Relix.");
});

test("preferOriginalAudio re-transcribes an unmarked Chinese cache", async () => {
  const h = harness({
    lens_settings: { autoTranscribe: true, preferOriginalAudio: true },
    harbor_services: { transcriptionProvider: "groq", groqApiKey: "fixture" },
    digest_bili_BV1abc1234_1: {
      timestamp: Date.now(),
      transcript: [
        { start: 0, text: "你现在看到的这个男人叫雷利克斯。" },
        { start: 5, text: "埃里克集团的继承人。" },
      ],
    },
  });
  h.context.harborAlternativeTranscript = async () => ({
    success: true,
    transcript: [{ start: 0, text: "English audio" }],
  });
  const result = await h.run("lensFetchTranscript", "bili_BV1abc1234_1");
  assert.equal(result.transcript[0].text, "English audio");
});

test("a recent audio failure keeps serving the captions cache", async () => {
  const h = harness({
    lens_settings: { autoTranscribe: true, preferOriginalAudio: true },
    harbor_services: { transcriptionProvider: "groq", groqApiKey: "fixture" },
    digest_bili_BV1abc1234_1: {
      timestamp: Date.now(),
      transcript: [{ start: 0, text: "中文字幕" }],
      transcriptSource: "captions",
      audioFailedAt: Date.now(),
    },
  });
  h.context.harborAlternativeTranscript = async () => {
    throw new Error("should not retry within the cooldown");
  };
  const result = await h.run("lensFetchTranscript", "bili_BV1abc1234_1");
  assert.equal(result.transcript[0].text, "中文字幕");
});

test("requiredTranscriptLanguage=en hides Chinese site captions", async () => {
  const h = harness({
    lens_settings: {
      autoTranscribe: true,
      preferOriginalAudio: true,
      requiredTranscriptLanguage: "en",
    },
    harbor_services: { transcriptionProvider: "groq", groqApiKey: "fixture" },
  });
  h.context.harborAlternativeTranscript = async () => {
    throw new Error("native helper missing");
  };
  h.context.readSiteCaptions = async () => ({
    success: true,
    transcript: [{ start: 0, text: "中文字幕内容" }],
  });
  let cached = false;
  h.context.harborCacheTranscript = async () => {
    cached = true;
  };
  // The audio failure is the actionable error, and the wrong-language
  // captions must neither be returned nor cached.
  await assert.rejects(
    h.run("lensFetchTranscript", "bili_BV1abc1234_1"),
    /native helper missing/,
  );
  assert.equal(cached, false);
});

test("requiredTranscriptLanguage=en rejects a Chinese audio transcript", async () => {
  // The speech itself is Chinese — no English transcript can exist, so the
  // panel reports the mismatch instead of showing the wrong language.
  const h = harness({
    lens_settings: {
      autoTranscribe: true,
      preferOriginalAudio: true,
      requiredTranscriptLanguage: "en",
    },
    harbor_services: { transcriptionProvider: "groq", groqApiKey: "fixture" },
  });
  h.context.harborAlternativeTranscript = async () => ({
    success: true,
    transcript: [{ start: 0, text: "这是一段中文语音的转录结果" }],
    language: "zh",
  });
  h.context.readSiteCaptions = async () => ({
    success: true,
    transcript: [{ start: 0, text: "中文字幕" }],
  });
  const result = await h.run("lensFetchTranscript", "bili_BV1abc1234_1");
  assert.equal(result.success, false);
  assert.equal(result.error, "LANGUAGE_MISMATCH");
});

test("requiredTranscriptLanguage=en still accepts an English audio transcript", async () => {
  const h = harness({
    lens_settings: {
      autoTranscribe: true,
      preferOriginalAudio: true,
      requiredTranscriptLanguage: "en",
    },
    harbor_services: { transcriptionProvider: "groq", groqApiKey: "fixture" },
  });
  h.context.harborAlternativeTranscript = async () => ({
    success: true,
    transcript: [{ start: 0, text: "The man you're looking at is Relix." }],
    language: "en",
  });
  const result = await h.run("lensFetchTranscript", "bili_BV1abc1234_1");
  assert.equal(result.transcript[0].text, "The man you're looking at is Relix.");
});

test("requiredTranscriptLanguage=en rejects a stale Chinese cache", async () => {
  const h = harness({
    lens_settings: {
      autoTranscribe: true,
      preferOriginalAudio: true,
      requiredTranscriptLanguage: "en",
    },
    harbor_services: { transcriptionProvider: "groq", groqApiKey: "fixture" },
    // Cooling-down captions cache — the language filter outranks the cooldown.
    digest_bili_BV1abc1234_1: {
      timestamp: Date.now(),
      transcript: [{ start: 0, text: "中文字幕" }],
      transcriptSource: "captions",
      audioFailedAt: Date.now(),
    },
  });
  h.context.readSiteCaptions = async () => ({
    success: true,
    transcript: [{ start: 0, text: "中文字幕" }],
  });
  h.context.harborAlternativeTranscript = async () => ({
    success: true,
    transcript: [{ start: 0, text: "English audio" }],
    language: "en",
  });
  const result = await h.run("lensFetchTranscript", "bili_BV1abc1234_1");
  assert.equal(result.transcript[0].text, "English audio");
});

test("preferOriginalAudio without an audio provider still reads site captions", async () => {
  const h = harness({
    lens_settings: { autoTranscribe: true, preferOriginalAudio: true },
    harbor_services: { transcriptionProvider: "supadata" },
  });
  let audioCalls = 0;
  h.context.harborAlternativeTranscript = async () => {
    audioCalls++;
    return { success: true };
  };
  h.context.readSiteCaptions = async () => ({
    success: true,
    transcript: [{ start: 0, text: "site captions" }],
  });
  h.context.harborCacheTranscript = async () => {};
  const result = await h.run("lensFetchTranscript", "bili_BV1abc1234_1");
  assert.equal(audioCalls, 0);
  assert.equal(result.transcript[0].text, "site captions");
});

test("preferOriginalAudio skips Bilibili site captions and transcribes audio", async () => {
  const h = harness({
    lens_settings: { autoTranscribe: true, preferOriginalAudio: true },
    harbor_services: { transcriptionProvider: "groq", groqApiKey: "fixture" },
  });
  let siteCaptionsRead = 0;
  h.context.readSiteCaptions = async () => {
    siteCaptionsRead++;
    return { success: true, transcript: [{ start: 0, text: "中文字幕" }] };
  };
  h.context.harborAlternativeTranscript = async (video, config, mediaUrl) => ({
    success: true,
    mediaUrl,
    provider: config.transcriptionProvider,
  });
  const result = await h.run("lensFetchTranscript", "bili_BV1abc1234_1");
  assert.equal(siteCaptionsRead, 0);
  assert.equal(result.provider, "groq");
  assert.match(result.mediaUrl, /bilibili\.com/);
});

test("site captions still win when preferOriginalAudio is unset", async () => {
  const h = harness({
    lens_settings: { autoTranscribe: true },
    harbor_services: { transcriptionProvider: "groq", groqApiKey: "fixture" },
  });
  h.context.readSiteCaptions = async () => ({
    success: true,
    transcript: [{ start: 0, text: "site captions" }],
  });
  h.context.harborCacheTranscript = async () => {};
  h.context.harborAlternativeTranscript = async () => {
    throw new Error("should not transcribe audio");
  };
  const result = await h.run("lensFetchTranscript", "bili_BV1abc1234_1");
  assert.equal(result.success, true);
  assert.equal(result.transcript[0].text, "site captions");
});

test("stale Apple rendition bypasses cache and re-transcribes the served audio", async () => {
  const h = harness(
    {
      lens_settings: { autoTranscribe: true },
      harbor_services: { transcriptionProvider: "groq", groqApiKey: "fixture" },
      digest_apple_1_2: {
        timestamp: Date.now(),
        transcript: [{ start: 0, text: "old ad stitch" }],
        sourceUrl: "https://cdn.example/old.mp3",
      },
    },
    undefined,
    async (_name, message) =>
      message.action === "audioResolve"
        ? { success: true, url: "https://cdn.example/new.mp3" }
        : { success: false },
  );
  // The harness runs timers synchronously; freeze it so resolution wins.
  h.context.setTimeout = () => 1;
  h.context.chrome.runtime.sendMessage = async () => ({
    success: true,
    mediaUrl: "https://podtrac.example/enclosure.mp3",
  });
  let used;
  h.context.harborAlternativeTranscript = async (video, config, mediaUrl) => {
    used = mediaUrl;
    return { success: true };
  };
  const result = await h.run("lensFetchTranscript", "apple_1_2");
  assert.equal(used, "https://podtrac.example/enclosure.mp3");
  assert.equal(result.success, true);
});

test("matching Apple rendition and imported digests still serve the cache", async () => {
  let rendition = "https://cdn.example/rotated.mp3";
  const h = harness(
    {
      digest_apple_1_2: {
        timestamp: Date.now(),
        transcript: [{ start: 0, text: "aligned" }],
        sourceUrl: "https://cdn.example/same.mp3",
      },
      digest_apple_3_4: {
        timestamp: Date.now(),
        transcript: [{ start: 0, text: "user imported" }],
        imported: true,
      },
    },
    undefined,
    async (_name, message) =>
      message.action === "audioResolve"
        ? { success: true, url: rendition }
        : { success: false },
  );
  h.context.setTimeout = () => 1;
  h.context.chrome.runtime.sendMessage = async () => ({
    success: true,
    mediaUrl: "https://podtrac.example/enclosure.mp3",
  });
  h.context.harborAlternativeTranscript = async () => {
    throw new Error("should not re-transcribe");
  };
  const result = await h.run("lensFetchTranscript", "apple_3_4");
  assert.equal(result.transcript[0].text, "user imported");
  rendition = "https://cdn.example/same.mp3";
  const aligned = await h.run("lensFetchTranscript", "apple_1_2");
  assert.equal(aligned.transcript[0].text, "aligned");
});

test("an explicitly rejected audio start releases the unconfirmed latch", async () => {
  const key = "harbor_audio_video123_groq";
  let starts = 0;
  const h = harness({}, undefined, async (_name, message) => {
    if (message.action === "audioStatus")
      return { success: true, ytdlp: true, ffmpeg: true };
    if (message.action === "audioStart") {
      starts += 1;
      if (starts === 1) return { success: false, error: "本机助手拒绝启动" };
      return { success: true, jobId: "job-9" };
    }
    if (message.action === "audioPoll")
      return {
        success: true,
        status: "completed",
        content: [{ offset: 0, duration: 1000, text: "hello" }],
        lang: "en",
      };
    return { success: false };
  });
  await assert.rejects(
    h.context.harborAlternativeTranscript("video123", {
      transcriptionProvider: "groq",
      groqApiKey: "fixture",
    }),
    /本机助手/,
  );
  assert.equal(
    h.db[key],
    undefined,
    "a failed start must not wedge the latch",
  );
  const retry = await h.context.harborAlternativeTranscript("video123", {
    transcriptionProvider: "groq",
    groqApiKey: "fixture",
  });
  assert.equal(retry.success, true);
  assert.equal(retry.transcript[0].text, "hello");
});

test("a failed Groq task is removed so caption detection can retry", async () => {
  const key = "harbor_audio_video123_groq";
  const h = harness(
    { [key]: { jobId: "failed-job", provider: "groq" } },
    undefined,
    async (_name, message) => {
      assert.equal(message.action, "audioPoll");
      return { success: true, status: "failed", error: "Groq failed" };
    },
  );
  await assert.rejects(
    h.context.harborAlternativeTranscript("video123", {
      transcriptionProvider: "groq",
      groqApiKey: "fixture",
    }),
    /Groq failed/,
  );
  assert.equal(h.db[key], undefined);
});


test("lost audio start replies retain the latch to prevent duplicate paid jobs", async () => {
  let starts = 0;
  const h = harness({}, undefined, async (_name, message) => {
    if (message.action === "audioStatus") return { success: true, ytdlp: true, ffmpeg: true };
    starts++;
    throw new Error("reply lost after process launch");
  });
  const config = { transcriptionProvider: "groq", groqApiKey: "fixture" };
  await assert.rejects(h.context.harborAlternativeTranscript("video123", config));
  assert.equal(h.db.harbor_audio_video123_groq.uncertain, true);
  await assert.rejects(h.context.harborAlternativeTranscript("video123", config), /unconfirmed/);
  assert.equal(starts, 1);
});

test("an imported transcript stays authoritative after thirty days", async () => {
  const h = harness({ digest_video123: {
    imported: true, timestamp: 1,
    transcript: [{ start: 0, duration: 1, text: "my import" }], transcriptText: "my import",
  } });
  const result = await h.run("lensFetchTranscript", "video123");
  assert.equal(result.transcriptText, "my import");
  assert.equal(h.requests.length, 0);
});

test("Supadata honors merged auto-transcription and language settings", async () => {
  const h = harness({
    lens_settings: { autoTranscribe: true },
    harbor_services: { autoTranscribe: false, requiredTranscriptLanguage: "zh" },
  }, async () => ({ ok: true, status: 200, json: async () => ({ content: [{ offset: 0, text: "中文字幕" }], lang: "zh" }) }));
  await h.run("lensFetchTranscript", "video123");
  const url = new URL(h.requests[0].url);
  assert.equal(url.searchParams.get("mode"), "native");
  assert.equal(url.searchParams.get("lang"), "zh");
});

test("wrong-language site captions allow the configured audio fallback", async () => {
  const h = harness({
    lens_settings: { requiredTranscriptLanguage: "en" },
    harbor_services: { transcriptionProvider: "groq", groqApiKey: "fixture" },
  });
  h.context.readSiteCaptions = async () => ({ success: true, language: "zh", transcript: [{ text: "中文字幕" }] });
  h.context.harborAlternativeTranscript = async () => ({ success: true, language: "en", transcript: [{ text: "English speech" }] });
  const result = await h.run("lensFetchTranscript", "bili_BV1abc1234_1");
  assert.equal(result.success, true);
  assert.equal(result.transcript[0].text, "English speech");
});

test("AI quiz rejects malformed question entries instead of breaking the panel", async () => {
  const h = harness();
  h.context.requestAiCompletion = async () => ({ text: '{"questions":[null]}' });
  await assert.rejects(h.run("lensHandle", { action: "lensAI", kind: "quiz" }), /有效.*题目/);
});


test("Bilibili rejects lookalike subtitle domains", async () => {
  const h = harness();
  const requested = [];
  h.context.chrome.tabs = {
    query: async () => [{ id: 4, url: "https://www.bilibili.com/video/BV1abc1234/" }],
    get: async () => ({ url: "https://www.bilibili.com/video/BV1abc1234/" }),
  };
  h.context.chrome.scripting = { executeScript: async ({ func }) => [{ result: await vm.runInNewContext(`(${func.toString()})()`, {
    URL, AbortSignal, location: { href: "https://www.bilibili.com/video/BV1abc1234/" },
    fetch: async url => {
      requested.push(String(url));
      return { ok: true, json: async () => requested.length === 1
        ? { data: { pages: [{ cid: 12 }] } }
        : requested.length === 2
          ? { data: { subtitle: { subtitles: [{ lan: "en", subtitle_url: "https://evilhdslb.com/tracking" }] } } }
          : { body: [{ from: 0, to: 1, content: "wrong captions" }] } };
    },
  }) }] };
  vm.runInContext(fs.readFileSync(require.resolve("../browser-captions"), "utf8"), h.context);
  const result = await h.context.readBilibiliCaptions("bili_BV1abc1234_1");
  assert.equal(result.success, false);
  assert.equal(requested.length, 2);
});


test("Supadata server failure does not automatically submit another paid job", async () => {
  const h = harness({}, async () => ({ ok: false, status: 500, json: async () => ({}) }));
  await assert.rejects(h.run("lensFetchTranscript", "video123"), /500/);
  await assert.rejects(h.run("lensFetchTranscript", "video123"), /上次转录/);
  assert.equal(h.requests.length, 1);
});

test("Bilibili AI English tracks satisfy the English language preference", async () => {
  const h = harness({ lens_settings: { requiredTranscriptLanguage: "en" } });
  h.context.readSiteCaptions = async () => ({ success: true, language: "ai-en", transcript: [{ text: "English automatic captions" }] });
  const result = await h.run("lensFetchTranscript", "bili_BV1abc1234_1");
  assert.equal(result.success, true);
});

test("lookup language is independent of interface language for words and concepts", async () => {
  for (const kind of ["word", "concept"]) {
    for (const [language, ui] of [["en", "zh-CN"], ["zh-CN", "en"]]) {
      const h = harness({ lens_settings: { explanationLanguage: language }, ytd_options_language: ui });
      let request;
      h.context.requestAiCompletion = async (value) => { request = value; return { text: '{"lemma":"tomato","explanation":"A definition"}' }; };
      await h.run("lensHandle", { action: "lensAI", kind, selected: "tomatoes", context: "Some tomatoes." });
      const prompt = request.messages[0].content;
      if (language === "en") {
        assert.match(prompt, /English only/);
        assert.doesNotMatch(prompt, /中文含义|中文解释|请使用中文回答|用中文解释/);
      } else {
        assert.match(prompt, /Simplified Chinese/);
        assert.match(prompt, /English examples/);
        assert.doesNotMatch(prompt, /values must be English/);
      }
    }
  }
});

test('Groq reads its own private key into request memory and never stores it', async () => {
  const requests=[];
  const h=harness({},undefined,async(host,request)=>{
    requests.push(request);
    if(request.action==='getServiceKey') {assert.equal(request.service,'groq');return {success:true,key:'fixture-env-groq'};}
    if(request.action==='audioStatus')return {success:true,ytdlp:true,ffmpeg:true};
    if(request.action==='audioStart')return {success:true,jobId:'fixture-job'};
    if(request.action==='audioPoll')return {success:true,status:'working'};
  });
  const result=await h.context.harborAlternativeTranscript('video123',{transcriptionProvider:'groq'},'https://www.youtube.com/watch?v=video123');
  assert.equal(result.pending,true);
  assert.equal(requests.find(r=>r.action==='audioStart').apiKey,'fixture-env-groq');
  assert.ok(!JSON.stringify(h.db).includes('fixture-env-groq'));
});
