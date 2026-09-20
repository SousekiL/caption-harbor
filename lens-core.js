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
  return {
    cleanWord,
    time,
    parseSubtitles,
    exportSubtitles,
    transcriptResult,
    selectContext,
  };
})();
if (typeof module !== "undefined") module.exports = LensCore;
