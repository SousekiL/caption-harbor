const test = require("node:test");
const assert = require("node:assert/strict");
const sites = require("../sites");
const core = require("../lens-core");

test("detects YouTube watch, share, embed, and shorts URLs", () => {
  assert.equal(
    sites.detect("https://www.youtube.com/watch?v=Nhmyrh9I_bA")?.mediaId,
    "Nhmyrh9I_bA",
  );
  assert.equal(
    sites.detect("https://youtu.be/Nhmyrh9I_bA")?.mediaId,
    "Nhmyrh9I_bA",
  );
  assert.equal(
    sites.detect("https://www.youtube.com/shorts/abc123_xY")?.mediaId,
    "abc123_xY",
  );
  assert.equal(sites.detect("https://www.youtube.com/"), null);
  assert.equal(sites.detect("https://example.com/watch?v=x"), null);
});

test("detects Bilibili video pages including multi-part", () => {
  assert.deepEqual(
    sites.detect("https://www.bilibili.com/video/BV1xx411c7mD"),
    { site: "bilibili", mediaId: "bili_BV1xx411c7mD_1", bvid: "BV1xx411c7mD", part: 1 },
  );
  assert.equal(
    sites.detect("https://www.bilibili.com/video/BV1xx411c7mD?p=3")?.mediaId,
    "bili_BV1xx411c7mD_3",
  );
  assert.equal(sites.detect("https://www.bilibili.com/"), null);
});

test("detects Apple Podcasts episode pages only", () => {
  assert.equal(
    sites.detect(
      "https://podcasts.apple.com/us/podcast/how-a-1000-year-old-tapestry/id1200361736?i=1000790778095",
    )?.mediaId,
    "apple_1200361736_1000790778095",
  );
  // A show page without an episode id is not a media page
  assert.equal(
    sites.detect("https://podcasts.apple.com/us/podcast/the-daily/id1200361736"),
    null,
  );
});

test("hostSupported gates the panel to supported hosts", () => {
  assert.equal(sites.hostSupported("https://www.youtube.com/"), true);
  assert.equal(sites.hostSupported("https://www.bilibili.com/"), true);
  assert.equal(sites.hostSupported("https://podcasts.apple.com/us/"), true);
  assert.equal(sites.hostSupported("https://example.com/"), false);
  assert.equal(sites.hostSupported(""), false);
});

test("mediaUrl and timestampUrl round-trip per site", () => {
  assert.equal(
    sites.mediaUrl("bili_BV1xx411c7mD_2"),
    "https://www.bilibili.com/video/BV1xx411c7mD/?p=2",
  );
  assert.equal(
    sites.mediaUrl("apple_1200361736_1000790778095"),
    "https://podcasts.apple.com/us/podcast/id1200361736?i=1000790778095",
  );
  assert.equal(
    sites.timestampUrl("Nhmyrh9I_bA", 92),
    "https://www.youtube.com/watch?v=Nhmyrh9I_bA&t=92s",
  );
  assert.equal(
    sites.timestampUrl("bili_BV1xx411c7mD_2", 92),
    "https://www.bilibili.com/video/BV1xx411c7mD/?p=2&t=92s",
  );
  assert.throws(() => sites.mediaUrl('"><script>'));
});

test("siteOf identifies prefixed media ids", () => {
  assert.equal(sites.siteOf("Nhmyrh9I_bA"), "youtube");
  assert.equal(sites.siteOf("bili_BV1xx411c7mD_1"), "bilibili");
  assert.equal(sites.siteOf("apple_1_2"), "apple");
  assert.equal(sites.siteOf("bogus"), null);
});

test("bilibili track ranking prefers English over Chinese AI captions", () => {
  // The rank function lives inside an injected page function and cannot be
  // imported — evaluate the shipped source so the test covers real ordering.
  const src = require("fs").readFileSync(
    require("path").resolve(__dirname, "..", "browser-captions.js"),
    "utf8",
  );
  const body = src.match(/const rank = \(track\) => \{[\s\S]*?\n        \};/);
  assert.ok(body, "rank function not found");
  const rank = eval(
    `(${body[0].replace("const rank =", "").trim().replace(/;$/, "")})`,
  );
  const order = (list) =>
    [...list].sort((a, b) => rank(b) - rank(a)).map((t) => t.lan);
  assert.deepEqual(order([{ lan: "ai-zh" }, { lan: "en" }]), ["en", "ai-zh"]);
  assert.deepEqual(
    order([{ lan: "zh-Hans" }, { lan: "ai-en" }]),
    ["ai-en", "zh-Hans"],
  );
  assert.deepEqual(
    order([{ lan: "zh", ai_status: 1 }, { lan: "zh-Hans" }]),
    ["zh-Hans", "zh"],
  );
});

test("bilibili subtitles convert to millisecond content cues", () => {
  const content = core.bilibiliSubtitlesToContent({
    body: [
      { from: 31.79, to: 33.19, sid: 11, content: "我们自己也可以参与其中" },
      { from: 33.19, to: 35.0, sid: 12, content: "下一句" },
      { from: -1, to: 2, content: "invalid" },
      { from: 40, to: 41, content: "" },
    ],
  });
  assert.equal(content.length, 2);
  assert.deepEqual(content[0], {
    offset: 31790,
    duration: 1400,
    text: "我们自己也可以参与其中",
  });
  const result = core.transcriptResult({ content });
  assert.equal(result.transcript[0].start, 31.79);
});
