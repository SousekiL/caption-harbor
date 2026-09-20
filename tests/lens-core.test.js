const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../lens-core");
test("SRT preserves millisecond timing and multiline captions", () => {
  const entries = core.parseSubtitles(
    "1\n00:01:02,125 --> 00:01:04,750\nHello\nworld\n\n2\n00:01:05,000 --> 00:01:07,000\nNext",
  );
  assert.equal(entries[0].start, 62.125);
  assert.equal(entries[0].duration, 2.625);
  assert.equal(entries[0].text, "Hello world");
  assert.deepEqual(
    core.parseSubtitles(core.exportSubtitles(entries, "srt")),
    entries,
  );
});
test("VTT supports cue identifiers, settings, BOM and markup", () => {
  const entries = core.parseSubtitles(
    "\uFEFFWEBVTT\n\nNOTE ignored\ncomment\n\ncue-1\n01:00.500 --> 01:03.250 align:start\n<v Speaker>Hello &amp; welcome</v>",
  );
  assert.equal(entries[0].text, "Hello & welcome");
  assert.deepEqual(
    core.parseSubtitles(core.exportSubtitles(entries, "vtt")),
    entries,
  );
});
test("reject empty and invalid subtitle ranges", () => {
  assert.throws(() => core.parseSubtitles("plain text"));
  assert.throws(() => core.parseSubtitles("1\n00:01,000 --> 00:00,500\nhello"));
});
test("normalizes collection without splitting phrases", () => {
  assert.equal(
    core.cleanWord(" “diminishing   returns.” "),
    "diminishing returns",
  );
});
test("normalizes both documented job response shapes and rejects silence", () => {
  const input = {
    content: [{ offset: 120, duration: 1234, text: ">> hello" }],
    lang: "en",
  };
  assert.deepEqual(
    core.transcriptResult(input),
    core.transcriptResult({ result: input }),
  );
  assert.equal(core.transcriptResult(input).transcript[0].start, 0.12);
  assert.throws(() => core.transcriptResult({ content: [] }));
});
test("long transcript retrieval stays bounded and includes relevant late material", () => {
  const entries = Array.from({ length: 1000 }, (_, i) => ({
    start: i * 10,
    text: `${i === 980 ? "gradient descent" : "ordinary sample"} ${"text ".repeat(30)}`,
  }));
  const ctx = core.selectContext(entries, "gradient descent", 8000);
  assert.equal(ctx.partial, true);
  assert.ok(ctx.text.length <= 8000);
  assert.match(ctx.text, /gradient descent/);
  assert.equal(core.selectContext(entries.slice(0, 2), "hi").partial, false);
});
