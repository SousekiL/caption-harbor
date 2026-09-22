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
test("YouTube JSON3 keeps word-level timing offsets", () => {
  const content = core.youtubeJson3ToContent({
    events: [
      {
        tStartMs: 1000,
        dDurationMs: 2200,
        segs: [
          { utf8: "Existing" },
          { utf8: " English", tOffsetMs: 700 },
          { utf8: " captions.", tOffsetMs: 1500 },
        ],
      },
    ],
  });
  assert.deepEqual(
    content.map(({ offset, duration, text }) => ({ offset, duration, text })),
    [
      { offset: 1000, duration: 700, text: "Existing" },
      { offset: 1700, duration: 800, text: "English" },
      { offset: 2500, duration: 700, text: "captions." },
    ],
  );
});

test("dictionary entries preserve IPA, senses and verified subtitle examples", () => {
  const entry = core.dictionaryEntry({ lemma: "reinforce", pronunciations: { uk: "/ˌriːɪnˈfɔːs/", us: "/ˌriːɪnˈfɔːrs/" }, senses: [{ partOfSpeech: "v.", definition: "加强；巩固。", examples: [{ text: "Practice reinforces learning.", translation: "练习巩固学习。", source: "subtitle" }, { text: "Reading reinforces vocabulary.", source: "subtitle" }] }] }, "reinforced", "Practice reinforces learning.", "zh-CN");
  assert.equal(entry.pronunciations.uk, "/ˌriːɪnˈfɔːs/");
  assert.equal(entry.senses[0].partOfSpeech, "v.");
  assert.equal(entry.senses[0].examples[0].source, "subtitle");
  assert.equal(entry.senses[0].examples[1].source, "adapted");
  assert.match(core.dictionaryText(entry), /原字幕/);
  assert.match(core.dictionaryText(entry), /改写例句/);
});
test("dictionary normalization ignores malformed fields and hides translations in English mode", () => {
  const entry = core.dictionaryEntry({ lemma: "run", pronunciations: { uk: null }, senses: [null, { definition: "Move quickly.", examples: [null, { text: "I run every day.", translation: "我每天跑步。", source: "generated" }] }], collocations: [null, "run fast"] }, "running", "", "en");
  assert.equal(entry.senses.length, 1);
  assert.equal(entry.senses[0].examples[0].translation, "");
  assert.equal(entry.pronunciations.uk, "");
  assert.doesNotMatch(core.dictionaryText(entry), /我每天/);
  assert.match(core.dictionaryText(entry), /Additional example/);
  assert.throws(() => core.dictionaryEntry({}, "word", "", "en"), /有效/);
  assert.equal(core.dictionaryEntry({ explanation: "Legacy definition" }, "word", "", "en").senses[0].definition, "Legacy definition");
});
