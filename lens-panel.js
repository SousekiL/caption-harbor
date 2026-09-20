/* Caption Harbor learning workspace. Shares the upstream panel's video state. */
let lensWords = [],
  lensActiveSelection = null,
  lensChat = [],
  lensVideo = null;
const lens$ = (id) => document.getElementById(id);
const lensMessage = async (message) => {
  const res = await chrome.runtime.sendMessage(message);
  if (!res?.success) throw new Error(res?.error || "请求失败");
  return res;
};
const lensStatus = (text) => {
  lens$("lens-status").textContent = text;
};
function lensNode(tag, text, className) {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  if (className) el.className = className;
  return el;
}
function lensButton(text, fn) {
  const b = lensNode("button", text);
  b.type = "button";
  b.addEventListener("click", async () => {
    b.disabled = true;
    try {
      await fn();
    } catch (e) {
      lensStatus(e.message);
    } finally {
      b.disabled = false;
    }
  });
  return b;
}
function lensOccurrence() {
  const s = lensActiveSelection;
  return s
    ? { ...s }
    : {
        videoId: currentVideoId,
        title: currentVideoTitle,
        start: 0,
        context: "",
        original: "",
      };
}
function lensCaptureSelection(text, start) {
  const entries = currentTranscript || [];
  let index = entries.findIndex(
    (e) => e.start + Math.max(e.duration || 0, 1) > start,
  );
  if (index < 0) index = 0;
  lensActiveSelection = {
    videoId: currentVideoId,
    title: currentVideoTitle,
    start,
    original: text,
    context: entries
      .slice(Math.max(0, index - 1), index + 3)
      .map((e) => e.text)
      .join(" "),
  };
}
async function lensExplain(kind) {
  const selected = lensOccurrence();
  if (!selected.original) return;
  const overlay = lensNode("div", undefined, "explain-modal-overlay");
  const box = lensNode("div", undefined, "explain-modal lens-dialog");
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-modal", "true");
  box.setAttribute(
    "aria-label",
    kind === "concept" ? "概念解释" : "词义与收藏",
  );
  overlay.append(box);
  const close = lensButton("关闭", () => overlay.remove());
  box.append(close, lensNode("h2", selected.original));
  const label = lensNode("label", "收藏词条（可编辑）");
  const word = lensNode("input");
  word.value = selected.original.slice(0, 160);
  word.maxLength = 160;
  label.append(word);
  box.append(label);
  const output = lensNode("p", "正在结合上下文解释…", "lens-pre");
  const info = lensNode("p", "");
  let meaning = "";
  let edited = false;
  word.addEventListener("input", () => (edited = true));
  box.append(
    output,
    lensButton("收藏并同步欧路", async () => {
      const result = await lensMessage({
        action: "lensSaveWord",
        ...selected,
        word: word.value,
        meaning,
      });
      info.textContent = "已保存到本地，正在同步欧路…";
      const sync = await lensMessage({
        action: "lensSyncWord",
        id: result.row.id,
      });
      info.textContent =
        sync.row.status === "synced"
          ? "已同步欧路"
          : `已保存在本地；${sync.row.error}`;
      await lensLoadWords();
    }),
    info,
  );
  if (kind === "concept")
    box.append(
      lensButton("保存概念笔记", async () => {
        await lensMessage({
          action: "saveNote",
          videoId: selected.videoId,
          timestamp: selected.start,
          videoTitle: selected.title,
          selectedText: selected.original + "\n\n" + meaning,
        });
        info.textContent = "概念笔记已保存";
        loadNotes(currentVideoId);
      }),
    );
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });
  overlay.addEventListener("keydown", (e) => {
    if (e.key === "Escape") overlay.remove();
    if (e.key === "Tab") {
      const items = [...box.querySelectorAll("button,input")].filter(
        (x) => !x.disabled,
      );
      const first = items[0],
        last = items.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });
  document.body.append(overlay);
  close.focus();
  try {
    const result = await lensMessage({
      action: "lensAI",
      kind,
      selected: selected.original,
      context: selected.context,
    });
    meaning = result.data.explanation;
    output.textContent = meaning;
    if (!edited && typeof result.data.lemma === "string")
      word.value = LensCore.cleanWord(result.data.lemma).slice(0, 160);
  } catch (e) {
    output.textContent = `解释暂不可用：${e.message}。仍可直接收藏。`;
  }
}
async function lensCollect() {
  const selected = lensOccurrence();
  if (!selected.original) return;
  const result = await lensMessage({
    action: "lensSaveWord",
    ...selected,
    word: selected.original,
  });
  lensStatus("已收藏，正在同步欧路…");
  await lensLoadWords();
  const sync = await lensMessage({ action: "lensSyncWord", id: result.row.id });
  lensStatus(
    sync.row.status === "synced"
      ? "已同步欧路"
      : `已本地保存；${sync.row.error}`,
  );
  await lensLoadWords();
}
async function lensLoadWords() {
  lensWords = (await chrome.storage.local.get("lens_words")).lens_words || [];
  lensRenderWords();
  lensHighlightWords();
}
function lensPlay(occ) {
  if (occ.videoId === currentVideoId) return seekTo(occ.start);
  return chrome.tabs.create({
    url: `https://www.youtube.com/watch?v=${encodeURIComponent(occ.videoId)}&t=${Math.floor(occ.start)}s`,
  });
}
function lensRenderWords() {
  const root = lens$("lens-word-list");
  root.replaceChildren();
  const query = lens$("lens-word-search").value.trim().toLowerCase();
  const words = lensWords.filter((w) =>
    (w.word + " " + w.meaning).toLowerCase().includes(query),
  );
  if (!words.length)
    root.append(lensNode("p", "在字幕中选中单词或短语，点击“收藏”即可开始。"));
  for (const w of words) {
    const card = lensNode("article", undefined, "lens-card");
    card.append(
      lensNode("h3", w.word),
      lensNode("p", w.meaning || "尚未保存 AI 解释", "lens-pre"),
      lensNode(
        "p",
        w.status === "synced" ? "✓ 已同步欧路" : w.error || "待同步",
        "lens-muted",
      ),
    );
    for (const occ of w.occurrences) {
      card.append(
        lensNode("blockquote", occ.context),
        lensButton(
          `${occ.title || occ.videoId} · ${LensCore.time(occ.start).slice(0, 8)}`,
          () => lensPlay(occ),
        ),
      );
    }
    if (w.status !== "synced")
      card.append(
        lensButton("重试同步", async () => {
          await lensMessage({ action: "lensSyncWord", id: w.id });
          await lensLoadWords();
        }),
      );
    card.append(
      lensButton("删除本地记录", async () => {
        if (!confirm("删除插件内的这条记录？欧路中的单词会保留。")) return;
        await lensMessage({ action: "lensDeleteWord", id: w.id });
        await lensLoadWords();
      }),
    );
    root.append(card);
  }
}
function lensHighlightWords() {
  if (!globalThis.CSS?.highlights || !globalThis.Highlight) return;
  const root = lens$("transcriptList");
  const ranges = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  // Use CSS ranges so highlights do not mutate caption text or fight search/translation.
  const terms = [
    ...new Set(
      lensWords
        .flatMap((w) => [w.word, ...w.occurrences.map((o) => o.original)])
        .filter(Boolean)
        .map((w) => w.toLowerCase()),
    ),
  ].sort((a, b) => b.length - a.length);
  let node;
  while ((node = walker.nextNode())) {
    if (node.parentElement.closest(".transcript-time")) continue;
    const text = node.textContent.toLowerCase();
    for (const term of terms) {
      let offset = 0;
      while ((offset = text.indexOf(term, offset)) !== -1) {
        const end = offset + term.length;
        if (
          !/[\p{L}\p{N}_]/u.test(text[offset - 1] || " ") &&
          !/[\p{L}\p{N}_]/u.test(text[end] || " ")
        ) {
          const r = new Range();
          r.setStart(node, offset);
          r.setEnd(node, end);
          ranges.push(r);
        }
        offset = end;
        if (ranges.length >= 2000) break;
      }
      if (ranges.length >= 2000) break;
    }
    if (ranges.length >= 2000) break;
  }
  CSS.highlights.set("harbor-vocabulary", new Highlight(...ranges));
}
function lensCitations(root, text, entries) {
  const pattern = /\[(\d{1,2}:\d{2}(?::\d{2})?)\]/g;
  let pos = 0;
  for (const match of text.matchAll(pattern)) {
    root.append(document.createTextNode(text.slice(pos, match.index)));
    const sec = match[1]
      .split(":")
      .map(Number)
      .reduce((a, b) => a * 60 + b, 0);
    if (entries.some((e) => Math.abs(e.start - sec) < 2))
      root.append(lensButton(match[0], () => seekTo(sec)));
    else root.append(document.createTextNode(match[0]));
    pos = match.index + match[0].length;
  }
  root.append(document.createTextNode(text.slice(pos)));
}
async function lensAsk(quiz = false) {
  if (!currentTranscript?.length) throw new Error("请先加载或导入字幕");
  const videoId = currentVideoId;
  const entries = currentTranscript;
  const question = lens$("lens-question").value.trim();
  if (!quiz && !question) throw new Error("请输入问题");
  const context = LensCore.selectContext(entries, quiz ? "" : question);
  const root = lens$("lens-conversation");
  const card = lensNode("article", undefined, "lens-card");
  card.append(lensNode("h3", quiz ? "理解自测" : question));
  const output = lensNode(
    "div",
    context.partial
      ? "根据抽选的字幕片段思考中（长视频未全文发送）…"
      : "思考中…",
    "lens-pre",
  );
  card.append(output);
  root.append(card);
  const history = lensChat.slice();
  try {
    const res = await lensMessage({
      action: "lensAI",
      kind: quiz ? "quiz" : "chat",
      selected: question,
      context: context.text,
      history,
    });
    if (videoId !== currentVideoId) return;
    output.replaceChildren();
    if (quiz) {
      for (const item of res.data.questions.slice(0, 5)) {
        output.append(lensNode("p", String(item.question || "")));
        const answer = lensNode("details");
        answer.append(lensNode("summary", "查看参考答案"));
        const p = lensNode("p");
        lensCitations(
          p,
          `${item.answer || ""} [${item.timestamp || ""}]`,
          entries,
        );
        answer.append(p);
        output.append(answer);
      }
    } else {
      lensCitations(output, res.text, entries);
      lensChat.push(
        { role: "user", text: question },
        { role: "assistant", text: res.text },
      );
      lens$("lens-question").value = "";
    }
    if (context.partial)
      card.append(
        lensNode(
          "small",
          "本次依据长视频的相关片段及分散抽样回答，未覆盖全文。",
        ),
      );
  } catch (e) {
    output.textContent = e.message;
  }
}
async function lensRenderHistory() {
  const result = await chrome.storage.local.get(["lens_history", "ytd_notes"]);
  const rows = Object.values(result.lens_history || {}).sort(
    (a, b) => b.lastSeen - a.lastSeen,
  );
  const root = lens$("lens-history-list");
  root.replaceChildren();
  for (const row of rows) {
    const card = lensNode("article", undefined, "lens-card");
    const words = lensWords.filter((w) =>
      w.occurrences.some((o) => o.videoId === row.videoId),
    ).length;
    const notes = (result.ytd_notes || []).filter(
      (n) => n.videoId === row.videoId,
    ).length;
    card.append(
      lensNode("h3", row.title),
      lensNode(
        "p",
        `${words} 个生词 · ${notes} 条笔记 · ${new Date(row.lastSeen).toLocaleDateString()}`,
      ),
      lensButton(`继续学习 · ${LensCore.time(row.position).slice(0, 8)}`, () =>
        lensPlay({ ...row, start: row.position }),
      ),
    );
    root.append(card);
  }
  if (!rows.length)
    root.append(lensNode("p", "学习记录会随着视频播放自动保存。"));
}
async function lensPlayer(command) {
  if (!youtubeTabId || !currentVideoId) throw new Error("请先打开视频");
  const state = await chrome.tabs.sendMessage(youtubeTabId, {
    action: "getCurrentTime",
  });
  const entries = currentTranscript || [];
  let i = entries.findLastIndex((e) => e.start <= state.currentTime);
  if (i < 0) i = 0;
  const entry = entries[i];
  const next = entries[i + 1];
  const result = await chrome.tabs.sendMessage(youtubeTabId, {
    action: "lensPlayer",
    videoId: currentVideoId,
    command,
    start:
      command === "previous"
        ? entries[Math.max(0, i - 1)]?.start || 0
        : entry?.start,
    end: entry
      ? Math.max(
          entry.start + 0.2,
          entry.start + (entry.duration || 0),
          next?.start || 0,
        )
      : undefined,
  });
  if (!result.success) throw new Error(result.error || "播放器操作失败");
  lensStatus(
    result.loop
      ? "已开启单句循环；再次点击可关闭"
      : command === "loop"
        ? "单句循环已关闭"
        : "",
  );
}
async function lensImport(file) {
  if (!file) return;
  if (!currentVideoId) throw new Error("请先打开目标 YouTube 视频");
  if (file.size > 5 * 1024 * 1024) throw new Error("字幕文件不能超过 5 MB");
  const videoId = currentVideoId;
  const entries = LensCore.parseSubtitles(await file.text());
  if (videoId !== currentVideoId) throw new Error("视频已切换，请重新导入");
  currentTranscript = entries;
  currentTranscriptText = entries.map((e) => e.text).join(" ");
  currentTranscriptTimestamped = entries
    .map((e) => `[${LensCore.time(e.start).slice(0, 8)}] ${e.text}`)
    .join("\n");
  currentTranscriptLanguage = null;
  currentAnalysis = null;
  translationGeneration++;
  transcriptParagraphCache.clear();
  interfaceTranslationCache.clear();
  currentTranscriptMode = "original";
  setTranscriptModeButtons("original");
  renderTranscript();
  showState("results");
  lens$("tabsNav").style.display = "flex";
  switchTab("transcript");
  setupExplainFeature();
  await saveToCache(videoId);
  const cached = (await chrome.storage.local.get(`digest_${videoId}`))[
    `digest_${videoId}`
  ];
  await chrome.storage.local.set({
    [`digest_${videoId}`]: { ...cached, imported: true },
  });
  lensStatus(`已导入 ${entries.length} 条字幕`);
}
function lensExportWords(format) {
  const rows = lensWords.map((w) => ({
    word: w.word,
    meaning: w.meaning,
    context: w.context,
    source: w.occurrences
      .map(
        (o) =>
          `https://www.youtube.com/watch?v=${o.videoId}&t=${Math.floor(o.start)}s`,
      )
      .join(" "),
  }));
  if (format === "csv") {
    const csv = (x) => '"' + String(x).replaceAll('"', '""') + '"';
    downloadTextFile(
      "\uFEFF" +
        [
          ["word", "meaning", "context", "source"],
          ...rows.map((w) => Object.values(w)),
        ]
          .map((r) =>
            r
              .map((v) => csv(/^[=+@-]/.test(String(v)) ? `'${v}` : v))
              .join(","),
          )
          .join("\r\n"),
      "caption-harbor-vocabulary.csv",
    );
  } else
    downloadTextFile(
      rows
        .map(
          (w) =>
            `## ${w.word}\n\n${w.meaning}\n\n> ${w.context}\n\n${w.source}`,
        )
        .join("\n\n"),
      "caption-harbor-vocabulary.md",
    );
}
function lensInit() {
  const nav = lens$("tabsNav");
  for (const [id, name] of [
    ["vocabulary", "生词"],
    ["learning", "问答"],
    ["history", "记录"],
  ]) {
    const b = lensNode("button", name, "tab");
    b.dataset.tab = id;
    b.addEventListener("click", () => {
      switchTab(id);
      if (id === "history") void lensRenderHistory();
    });
    nav.append(b);
  }
  const results = lens$("resultsState");
  const section = (id, html) => {
    const p = lensNode("div", undefined, "tab-panel lens-panel");
    p.dataset.panel = id;
    p.innerHTML = html;
    results.append(p);
  };
  section(
    "vocabulary",
    '<h2>我的生词</h2><input id="lens-word-search" type="search" aria-label="搜索收藏词" placeholder="搜索单词或解释"><div id="lens-word-actions" class="lens-actions"></div><div id="lens-word-list"></div>',
  );
  section(
    "learning",
    '<h2>理解与追问</h2><textarea id="lens-question" aria-label="视频问题" placeholder="这段视频里的概念有什么实际用途？"></textarea><div id="lens-ask-actions" class="lens-actions"></div><div id="lens-conversation"></div>',
  );
  section("history", '<h2>学习记录</h2><div id="lens-history-list"></div>');
  const toolbar = lensNode("div", undefined, "lens-tools");
  const brand = lensNode(
    "div",
    "CAPTION HARBOR · 字幕里的学习港湾",
    "lens-brand",
  );
  lens$("contentArea").before(brand, toolbar);
  const file = lensNode("input");
  file.type = "file";
  file.accept = ".srt,.vtt";
  file.hidden = true;
  file.addEventListener("change", async () => {
    try {
      await lensImport(file.files[0]);
    } catch (e) {
      lensStatus(e.message);
    }
    file.value = "";
  });
  toolbar.append(
    file,
    lensButton("导入字幕", () => file.click()),
  );
  for (const format of ["srt", "vtt"])
    toolbar.append(
      lensButton(format.toUpperCase(), () => {
        if (!currentTranscript?.length) throw new Error("还没有字幕");
        downloadTextFile(
          LensCore.exportSubtitles(currentTranscript, format),
          `${sanitizeFilename(currentVideoTitle || "transcript")}.${format}`,
        );
      }),
    );
  toolbar.append(
    lensButton("上一句", () => lensPlayer("previous")),
    lensButton("暂停 / 播放", () => lensPlayer("toggle")),
    lensButton("单句循环", () => lensPlayer("loop")),
  );
  const status = lensNode("p", "", "lens-status");
  status.id = "lens-status";
  status.setAttribute("role", "status");
  toolbar.after(status);
  lens$("lens-word-actions").append(
    lensButton("重试待同步", async () => {
      for (const row of lensWords.filter((w) => w.status !== "synced")) {
        await lensMessage({ action: "lensSyncWord", id: row.id });
      }
      await lensLoadWords();
      lensStatus("同步完成，请查看各词条状态");
    }),
    lensButton("导出 CSV", () => lensExportWords("csv")),
    lensButton("导出 Markdown", () => lensExportWords("md")),
  );
  lens$("lens-word-search").addEventListener("input", lensRenderWords);
  lens$("lens-ask-actions").append(
    lensButton("提问", () => lensAsk()),
    lensButton("生成自测", () => lensAsk(true)),
  );
  document.addEventListener("keydown", (e) => {
    if (e.target.closest('input,textarea,[contenteditable="true"]')) return;
    if (e.altKey && ["ArrowLeft", " ", "l"].includes(e.key)) {
      e.preventDefault();
      lensPlayer(
        e.key === "ArrowLeft" ? "previous" : e.key === "l" ? "loop" : "toggle",
      ).catch((err) => lensStatus(err.message));
    }
  });
  new MutationObserver(() => lensHighlightWords()).observe(
    lens$("transcriptList"),
    { childList: true, subtree: true, characterData: true },
  );
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.lens_words) void lensLoadWords();
  });
  lens$("transcriptList").addEventListener(
    "click",
    (event) => {
      if (hasNonCollapsedTextSelection()) return;
      const highlight = globalThis.CSS?.highlights?.get("harbor-vocabulary");
      if (!highlight) return;
      for (const range of highlight) {
        if (
          [...range.getClientRects()].some(
            (r) =>
              event.clientX >= r.left &&
              event.clientX <= r.right &&
              event.clientY >= r.top &&
              event.clientY <= r.bottom,
          )
        ) {
          event.preventDefault();
          event.stopImmediatePropagation();
          lens$("lens-word-search").value = range.toString();
          lensRenderWords();
          switchTab("vocabulary");
          return;
        }
      }
    },
    true,
  );
  void lensLoadWords();
  setInterval(async () => {
    try {
      if (currentVideoId !== lensVideo) {
        lensVideo = currentVideoId;
        lensChat = [];
        lens$("lens-conversation").replaceChildren();
        lensActiveSelection = null;
        lensStatus("");
      }
      if (!currentVideoId || !youtubeTabId || !currentTranscript?.length)
        return;
      const videoId = currentVideoId;
      const title = currentVideoTitle;
      const state = await chrome.tabs.sendMessage(youtubeTabId, {
        action: "getCurrentTime",
      });
      if (videoId !== currentVideoId) return;
      await lensMessage({
        action: "lensHistory",
        videoId,
        title,
        position: state.currentTime,
      });
    } catch {
      /* Tab may have closed. */
    }
  }, 5000);
}
if (document.readyState === "loading")
  document.addEventListener("DOMContentLoaded", lensInit);
else lensInit();

function lensOnVideoChange(videoId) {
  if (videoId === lensVideo) return;
  lensVideo = videoId;
  lensChat = [];
  lensActiveSelection = null;
  lens$("lens-conversation")?.replaceChildren();
  if (lens$("lens-status")) lensStatus("");
}
