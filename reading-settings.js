/* Local, shared subtitle typography preferences; no network or API calls. */
(() => {
  const KEY = "harbor_reading";
  const FONTS = {
    system: {
      label: "系统默认",
      css: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    },
    sans: {
      label: "无衬线 · 清晰",
      css: 'Arial, "PingFang SC", "Microsoft YaHei", sans-serif',
    },
    serif: {
      label: "衬线 · 书本",
      css: 'Georgia, "Songti SC", "SimSun", serif',
    },
    robotoSlab: {
      label: "Roboto Slab",
      css: '"Harbor Roboto Slab", "Songti SC", serif',
    },
    lexend: {
      label: "Lexend",
      css: '"Harbor Lexend", "PingFang SC", sans-serif',
    },
    mono: {
      label: "等宽 · 代码",
      css: '"SFMono-Regular", Menlo, Consolas, "PingFang SC", monospace',
    },
  };
  const defaults = { font: "system", size: 13.5 };
  const normalize = (value = {}) => ({
    font: Object.hasOwn(FONTS, value?.font) ? value.font : defaults.font,
    size:
      typeof value?.size === "number" && Number.isFinite(value.size)
        ? Math.round(Math.max(12, Math.min(32, value.size)) * 2) / 2
        : defaults.size,
  });
  async function init() {
    const inPanel = !!document.getElementById("transcriptList");
    const root = document.createElement(inPanel ? "details" : "section");
    root.className = "harbor-reading";
    root.innerHTML = `${inPanel ? "<summary>字幕外观</summary>" : "<h2>字幕外观</h2>"}
      <div class="harbor-reading-controls">
        <label>字体<select id="reading-font" aria-label="字幕字体"></select></label>
        <label>字号 <output id="reading-size-label" for="reading-size"></output><input id="reading-size" aria-label="字幕字号" type="range" min="12" max="32" step="0.5"></label>
        <button type="button" id="reading-reset">恢复默认</button>
        <p class="harbor-reading-preview">Learn one sentence at a time.<br>一句一句，读懂视频。</p>
        <small>原文和译文同时生效，自动保存。Roboto Slab 和 Lexend 已内置；中文使用系统字体。</small>
        <span id="reading-status" role="status"></span>
      </div>`;
    if (inPanel) document.getElementById("contentArea").before(root);
    else (document.querySelector("main") || document.body).append(root);
    const font = root.querySelector("#reading-font");
    const size = root.querySelector("#reading-size");
    const label = root.querySelector("#reading-size-label");
    const status = root.querySelector("#reading-status");
    for (const [id, value] of Object.entries(FONTS))
      font.add(new Option(value.label, id));
    const apply = (value) => {
      const pref = normalize(value);
      document.documentElement.style.setProperty(
        "--harbor-caption-font",
        FONTS[pref.font].css,
      );
      document.documentElement.style.setProperty(
        "--harbor-caption-size",
        `${pref.size}px`,
      );
      font.value = pref.font;
      size.value = pref.size;
      label.textContent = `${pref.size} px`;
    };
    apply(defaults);
    let changed = false;
    let writes = Promise.resolve();
    const save = () => {
      changed = true;
      const pref = normalize({ font: font.value, size: Number(size.value) });
      apply(pref);
      writes = writes
        .catch(() => {})
        .then(() => chrome.storage.local.set({ [KEY]: pref }))
        .then(() => {
          status.textContent = "已保存";
        })
        .catch(() => {
          status.textContent = "保存失败，请重试";
        });
    };
    size.addEventListener("input", () => {
      changed = true;
      apply({ font: font.value, size: Number(size.value) });
      status.textContent = "";
    });
    size.addEventListener("change", save);
    font.addEventListener("change", save);
    root.querySelector("#reading-reset").addEventListener("click", () => {
      apply(defaults);
      save();
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && changes[KEY]) apply(changes[KEY].newValue);
    });
    try {
      const stored = await chrome.storage.local.get(KEY);
      if (!changed) apply(stored[KEY]);
    } catch {
      status.textContent = "暂时无法读取设置，已使用默认字体";
    }
  }
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", init);
  else void init();
})();
