/* Shared pure helpers. No credentials or network access. */
var LensCore = (() => {
  const cleanWord = (text) =>
    String(text || "")
      .normalize("NFKC")
      .trim()
      .replace(/^[\s“”".,!?;:]+|[\s“”".,!?;:]+$/g, "")
      .replace(/\s+/g, " ");
  function time(seconds, separator = ".") {
    const ms = Math.round(Math.max(0, Number(seconds) || 0) * 1000);
    return `${String(Math.floor(ms / 3600000)).padStart(2, "0")}:${String(Math.floor(ms / 60000) % 60).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}${separator}${String(ms % 1000).padStart(3, "0")}`;
  }
  function parseTime(value) {
    const parts = value.replace(",", ".").split(":").map(Number);
    if (
      parts.length < 2 ||
      parts.length > 3 ||
      parts.some((x) => !Number.isFinite(x) || x < 0)
    )
      throw new Error("字幕时间格式无效");
    return parts.reduce((a, b) => a * 60 + b, 0);
  }
  function parseSubtitles(text) {
    if (text.length > 5 * 1024 * 1024) throw new Error("字幕文件不能超过 5 MB");
    const entries = [];
    const blocks = text
      .replace(/^\uFEFF/, "")
      .replace(/\r\n?/g, "\n")
      .split(/\n\s*\n/);
    for (const block of blocks) {
      if (/^(WEBVTT|NOTE|STYLE|REGION)(\s|$)/.test(block.trim())) continue;
      const lines = block.trim().split("\n");
      const index = lines.findIndex((line) => line.includes("-->"));
      if (index < 0) continue;
      const match = lines[index].match(/^\s*([\d:.,]+)\s+-->\s+([\d:.,]+)/);
      if (!match) throw new Error("无法识别字幕时间点");
      const start = parseTime(match[1]),
        end = parseTime(match[2]);
      if (end <= start) throw new Error("字幕结束时间必须晚于开始时间");
      const content = lines
        .slice(index + 1)
        .join(" ")
        .replace(/<[^>]*>/g, "")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .trim();
      if (content)
        entries.push({ start, duration: end - start, text: content });
    }
    if (!entries.length) throw new Error("文件中没有有效的 SRT/VTT 字幕");
    return entries.sort((a, b) => a.start - b.start);
  }
  function exportSubtitles(entries, format) {
    return (
      (format === "vtt" ? "WEBVTT\n\n" : "") +
      entries
        .map(
          (e, i) =>
            `${format === "srt" ? `${i + 1}\n` : ""}${time(e.start, format === "srt" ? "," : ".")} --> ${time(e.start + Math.max(e.duration || 0, 0.1), format === "srt" ? "," : ".")}\n${e.text}\n`,
        )
        .join("\n")
    );
  }
  function transcriptResult(data) {
    const value = data.result || data;
    if (!Array.isArray(value.content))
      throw new Error("转录服务没有返回带时间点的字幕");
    const transcript = value.content
      .filter(
        (c) =>
          typeof c.text === "string" &&
          Number.isFinite(c.offset) &&
          c.offset >= 0,
      )
      .map((c) => ({
        text: c.text.replace(/>> ?/g, "").trim(),
        start: c.offset / 1000,
        duration: Math.max(0, c.duration || 0) / 1000,
        language: value.lang || c.lang || null,
      }))
      .filter((c) => c.text)
      .sort((a, b) => a.start - b.start);
    if (!transcript.length) throw new Error("未检测到可转录的语音");
    return {
      success: true,
      transcript,
      transcriptText: transcript.map((c) => c.text).join(" "),
      transcriptTextTimestamped: transcript
        .map((c) => `[${time(c.start).slice(0, 8)}] ${c.text}`)
        .join("\n"),
      language: value.lang || null,
    };
  }
  function youtubeJson3ToContent(data) {
    const content = [];
    for (const event of data?.events || []) {
      const start = Number(event?.tStartMs);
      const eventDuration = Number(event?.dDurationMs) || 1000;
      if (!Number.isFinite(start)) continue;
      const segments = Array.isArray(event?.segs) ? event.segs : [];
      segments.forEach((segment, index) => {
        const text = String(segment?.utf8 || "").trim();
        if (!text) return;
        const relative = Number.isFinite(Number(segment?.tOffsetMs))
          ? Number(segment.tOffsetMs)
          : 0;
        const following = segments
          .slice(index + 1)
          .find((item) => Number.isFinite(Number(item?.tOffsetMs)));
        const nextRelative = following
          ? Number(following.tOffsetMs)
          : eventDuration;
        content.push({
          offset: start + relative,
          duration: Math.max(1, nextRelative - relative),
          text,
        });
      });
    }
    return content;
  }
  // Bilibili subtitle JSON: { body: [{ from, to, content }] }, seconds-based.
  // Returns the {offset(ms), duration(ms), text} shape transcriptResult expects.
  function bilibiliSubtitlesToContent(data) {
    const content = [];
    for (const entry of data?.body || []) {
      const from = Number(entry?.from);
      const to = Number(entry?.to);
      const text = String(entry?.content || "").trim();
      if (!Number.isFinite(from) || from < 0 || !text) continue;
      content.push({
        offset: Math.round(from * 1000),
        duration: Math.max(1, Math.round(((Number.isFinite(to) ? to : from + 2) - from) * 1000)),
        text,
      });
    }
    return content;
  }
  function selectContext(entries, query, limit = 48000) {
    const lines = entries.map(
      (e) => `[${time(e.start).slice(0, 8)}] ${e.text}`,
    );
    if (lines.join("\n").length <= limit)
      return { text: lines.join("\n"), partial: false };
    const terms = cleanWord(query)
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 2);
    const ranked = lines
      .map((line, i) => ({
        i,
        score: terms.reduce(
          (sum, t) => sum + (line.toLowerCase().includes(t) ? 1 : 0),
          0,
        ),
      }))
      .sort((a, b) => b.score - a.score);
    const selected = new Set();
    let size = 0;
    const add = (i) => {
      if (
        i >= 0 &&
        i < lines.length &&
        !selected.has(i) &&
        size + lines[i].length < limit
      ) {
        selected.add(i);
        size += lines[i].length + 1;
      }
    };
    // Include a spread across the entire video before adding relevant neighborhoods.
    for (
      let i = 0;
      i < lines.length;
      i += Math.max(1, Math.floor(lines.length / 30))
    )
      add(i);
    for (const { i } of ranked) {
      add(i - 1);
      add(i);
      add(i + 1);
    }
    return {
      text: [...selected]
        .sort((a, b) => a - b)
        .map((i) => lines[i])
        .join("\n"),
      partial: true,
    };
  }
  function dictionaryEntry(data, selected, context, language) {
    const text = (value, limit) => typeof value === "string" ? value.trim().slice(0, limit) : "";
    const normalizeQuote = (value) => String(value || "").replace(/\s+/g, " ").trim();
    const transcript = normalizeQuote(context);
    const entry = {
      lemma: text(data?.lemma, 160) || text(selected, 160),
      explanationLanguage: language === "en" ? "en" : "zh-CN",
      pronunciations: { uk: text(data?.pronunciations?.uk, 100), us: text(data?.pronunciations?.us, 100) },
      senses: [],
      collocations: (Array.isArray(data?.collocations) ? data.collocations : []).filter(x => typeof x === "string" && x.trim()).slice(0, 4).map(x => text(x, 160)),
    };
    const senses = Array.isArray(data?.senses) ? data.senses : [];
    for (const sense of senses.slice(0, 3)) {
      const definition = text(sense?.definition, 2000);
      if (!definition) continue;
      const examples = (Array.isArray(sense.examples) ? sense.examples : [])
        .filter(example => typeof example?.text === "string" && example.text.trim())
        .slice(0, 2).map(example => {
          const quote = text(example.text, 1200);
          const exact = transcript && transcript.includes(normalizeQuote(quote));
          return {
            text: quote,
            translation: language === "en" ? "" : text(example.translation, 1200),
            source: exact ? "subtitle" : example.source === "generated" ? "generated" : "adapted",
          };
        });
      entry.senses.push({ partOfSpeech: text(sense.partOfSpeech, 50), definition, examples });
    }
    // Older models or saved responses may still return the plain definition.
    if (!entry.senses.length && text(data?.explanation, 6000))
      entry.senses.push({ partOfSpeech: "", definition: text(data.explanation, 6000), examples: [] });
    if (!entry.senses.length) throw new Error("AI 未返回有效解释，请重试");
    return entry;
  }
  function dictionaryText(entry) {
    const english = entry.explanationLanguage === "en";
    const labels = english
      ? { subtitle: "From the subtitles", adapted: "Adapted example", generated: "Additional example" }
      : { subtitle: "原字幕", adapted: "改写例句", generated: "补充例句" };
    const lines = [entry.lemma];
    for (const [region, ipa] of Object.entries(entry.pronunciations))
      if (ipa) lines.push(`${region.toUpperCase()} ${ipa}`);
    entry.senses.forEach((sense, index) => {
      lines.push("", `${index + 1}. ${sense.partOfSpeech ? sense.partOfSpeech + " " : ""}${sense.definition}`);
      for (const example of sense.examples) {
        lines.push(`${labels[example.source]}: ${example.text}`);
        if (example.translation) lines.push(example.translation);
      }
    });
    if (entry.collocations.length) lines.push("", (english ? "Collocations: " : "常见搭配：") + entry.collocations.join(" · "));
    return lines.join("\n");
  }
  return {
    cleanWord,
    dictionaryEntry,
    dictionaryText,
    time,
    parseSubtitles,
    exportSubtitles,
    transcriptResult,
    youtubeJson3ToContent,
    bilibiliSubtitlesToContent,
    selectContext,
  };
})();
if (typeof module !== "undefined") module.exports = LensCore;
