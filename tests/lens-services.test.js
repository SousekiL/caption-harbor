const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const core = require("../lens-core");
function harness(
  initial = {},
  fetcher = async () => ({ ok: true, status: 201, json: async () => ({}) }),
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
    fs.readFileSync(require.resolve("../lens-background"), "utf8"),
    ctx,
  );
  return { db, requests, listeners, run: (name, arg) => ctx[name](arg) };
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
      digest_video123: { imported: true, transcript: [{ text: "mine" }] },
    },
    async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        content: [{ offset: 0, duration: 1000, text: "provider" }],
      }),
    }),
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
