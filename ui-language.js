/* One persisted interface language for options and the video side panel. */
var HarborUI = (() => {
  let language = "en";
  const pairs = {
    Settings: "设置",
    "Settings saved": "设置已保存",
    "Subtitles & AI": "字幕与 AI",
    "Learning settings": "学习设置",
    "Lookup explanations": "查词与解释",
    "Explanation language": "解释语言",
    "English explanations only": "纯英文解释",
    "Chinese explanations with English support": "中文解释（英文辅助）",
    "Saved automatically. Applies to word and concept explanations; independent of interface and subtitle language. Existing saved definitions stay unchanged.": "自动保存，对下一次词义和概念查询生效；独立于界面及字幕语言，已收藏的释义保持原样。",
    "Automatically transcribe when captions are unavailable":
      "没有字幕时自动转录音频",
    "Transcription method": "转录方式",
    "Local Whisper": "本地 Whisper",
    "Local model": "本地模型",
    "Save service settings": "保存服务设置",
    "Read existing captions first. Transcription starts only when captions are unavailable.":
      "优先读取已有字幕；没有字幕时才转录音频。",
    "Transcribe the original audio instead of site captions":
      "转写原声音频（跳过站点自带字幕）",
    "Use when a site's own captions don't match the spoken language, like Bilibili AI captions in Chinese over English audio. Whisper and Groq transcribe the actual audio, so the transcript follows the spoken language.":
      "适用于站点字幕与音频语言不符的情况，例如 Bilibili 在英文音频上提供中文 AI 字幕。Whisper 和 Groq 转写的是实际音频，因此转录结果跟随音频语言。",
    "Supadata processes public video audio in the cloud and uses additional credits.":
      "Supadata 在云端处理公开视频音频，会消耗额外额度。",
    "Groq processes audio in the cloud and charges by usage. Preparing video audio also requires the local helper.":
      "Groq 在云端处理音频，按用量计费；获取视频音频还需要本机助手。",
    "Runs on this Mac using CPU/GPU and memory. May increase heat and battery use; no transcription API fee.":
      "在本机运行，会占用 CPU/GPU 和内存，可能增加发热与耗电；不收取转录接口费。",
    "Check local components": "检查本机组件",
    "Check local API keys": "检查本机 API 密钥",
    "Not configured": "未配置",
    "Update the local helper to check API keys.": "请更新本机助手后检查密钥。",
    "Requested local credential is unavailable. Check the private environment file.": "未能读取对应密钥，请检查本机私有环境配置。",
    "Groq key not configured. Enter it in Settings or configure the local environment.": "尚未配置 Groq 密钥，请填写设置或配置本机环境。",
    "Leave the DeepSeek or Groq key field empty to read it from the local helper. A manually entered key takes priority. Environment keys are not copied into this browser.": "DeepSeek 或 Groq 密钥栏留空时，自动从本机助手读取；手动填写的密钥优先。本机环境中的密钥不会复制到浏览器存储。",
    "Local setup": "本机配置",
    "Install yt-dlp and FFmpeg for Groq; local transcription also needs whisper.cpp and a downloaded model.":
      "Groq 需要安装 yt-dlp 和 FFmpeg；本地转录还需要 whisper.cpp 和下载模型。",
    "See local setup instructions": "查看本机配置说明",
    "Supadata API key": "Supadata API 密钥",
    "Groq API key": "Groq API 密钥",
    "Create a Groq key": "获取 Groq 密钥",
    "Groq model": "Groq 模型",
    "English only": "仅英文",
    Multilingual: "多语言",
    "AI provider": "AI 服务",
    "Transcript provider": "字幕服务",
    "Use your own API keys": "使用你自己的 API 密钥",
    "Eudic authorization source": "欧路授权来源",
    "Local environment (EUDIC_TOKEN)": "本机环境变量（EUDIC_TOKEN）",
    "Enter manually": "手动填写",
    "Local mode reads through the installed helper and does not store the token in the browser.":
      "本机模式通过已安装的本机桥接读取，不会把 Token 保存进浏览器。",
    "Check local environment": "检查本机环境配置",
    "Eudic token": "欧路授权 Token",
    "Get Eudic authorization": "获取欧路授权",
    "Token stays on this device and is not sent to AI.":
      "Token 仅保存在本机，不发送给 AI。",
    "Save and load wordbooks": "保存并读取生词本",
    "Default wordbook": "默认生词本",
    "New wordbook name": "新生词本名称",
    "Create wordbook": "新建生词本",
    "Save learning settings": "保存学习设置",
    "Learning settings saved": "学习设置已保存",
    "Transcription tasks": "转录任务",
    "Video ID to reset": "需要重置的视频 ID",
    "Reset this video task": "重置该视频转录任务",
    "A timeout does not mean the server stopped. Check the provider task and balance first; resubmission may cost extra.":
      "超时不代表服务端取消。请先核对服务商任务与额度；重置后重新请求可能产生额外费用。",
    "Transcript appearance": "字幕外观",
    Font: "字体",
    Size: "字号",
    "System default": "系统默认",
    "Reset to defaults": "恢复默认",
    "Read one sentence at a time.": "一句一句，读懂视频。",
    "Applied to originals and translations and saved automatically. Roboto Slab and Lexend are bundled; Chinese uses system fonts.":
      "原文和译文同时生效，自动保存。Roboto Slab 和 Lexend 已内置；中文使用系统字体。",
    Saved: "已保存",
    "Could not save. Please try again.": "保存失败，请重试",
    "Unable to load settings; using the default font.":
      "暂时无法读取设置，已使用默认字体",
    Original: "原文",
    Chinese: "中文",
    Bilingual: "双语",
    Transcript: "字幕",
    Overview: "概览",
    Notes: "笔记",
    Vocabulary: "生词",
    Ask: "问答",
    History: "记录",
    "Previous sentence": "上一句",
    "Play / pause": "暂停 / 播放",
    "Loop sentence": "单句循环",
    "Subtitle files": "字幕文件",
    "Import subtitles": "导入字幕",
    "Copy transcript": "复制全文",
    "Export TXT": "导出 TXT",
    "Search transcript": "搜索字幕",
    "Follow playback": "跟随播放",
    "Word meaning": "词义",
    Concept: "概念",
    Collect: "收藏",
    Explain: "解释",
    Note: "笔记",
    Close: "关闭",
    "Selected text": "已选文字",
    "Dismiss selection": "收起划词菜单",
    "My vocabulary": "我的生词",
    "Search words or definitions": "搜索单词或解释",
    "Retry pending syncs": "重试待同步",
    "Export CSV": "导出 CSV",
    "Export Markdown": "导出 Markdown",
    "Select a word or phrase in the transcript and click Collect to begin.":
      "在字幕中选中单词或短语，点击“收藏”即可开始。",
    "No AI explanation saved yet": "尚未保存 AI 解释",
    "Pending sync": "待同步",
    "✓ Synced to Eudic": "✓ 已同步欧路",
    "Retry sync": "重试同步",
    "Delete local record": "删除本地记录",
    "Delete this local record? The word will remain in Eudic.":
      "删除插件内的这条记录？欧路中的单词会保留。",
    "Understanding & questions": "理解与追问",
    "Ask a question": "提问",
    "Generate quiz": "生成自测",
    "Self-test": "理解自测",
    "Show answer": "查看参考答案",
    "Learning history": "学习记录",
    "Saved locally; syncing to Eudic…": "已保存到本地，正在同步欧路…",
    "Collected; syncing to Eudic…": "已收藏，正在同步欧路…",
    "Synced to Eudic": "已同步欧路",
    "Collect and sync to Eudic": "收藏并同步欧路",
    "Save concept note": "保存概念笔记",
    "Concept note saved": "概念笔记已保存",
    "Word to collect (editable)": "收藏词条（可编辑）",
    "Explaining in context…": "正在结合上下文解释…",
    "Thinking…": "思考中…",
    "Thinking from selected excerpts (the full video was not sent)…":
      "根据抽选的字幕片段思考中（长视频未全文发送）…",
    "This answer uses relevant and sampled excerpts of the long video, not its entire transcript.":
      "本次依据长视频的相关片段及分散抽样回答，未覆盖全文。",
    "What are practical uses of this concept?":
      "这段视频里的概念有什么实际用途？",
    "Enter a question": "请输入问题",
    "Load or import captions first": "请先加载或导入字幕",
    "History is saved as the video plays.": "学习记录会随着视频播放自动保存。",
    "Sync finished; check each word for its status.":
      "同步完成，请查看各词条状态",
    "Sentence loop enabled; click again to stop":
      "已开启单句循环；再次点击可关闭",
    "Sentence loop disabled": "单句循环已关闭",
    "Open a video first": "请先打开视频",
    "No captions yet": "还没有字幕",
    "Open the target YouTube video first": "请先打开目标 YouTube 视频",
    "Subtitle files must be smaller than 5 MB": "字幕文件不能超过 5 MB",
    "The video changed; please import again": "视频已切换，请重新导入",
    "Invalid subtitle timing": "字幕时间格式无效",
    "Unrecognized subtitle timestamp": "无法识别字幕时间点",
    "Subtitle end time must be after its start": "字幕结束时间必须晚于开始时间",
    "No valid SRT/VTT captions found": "文件中没有有效的 SRT/VTT 字幕",
    "The video changed; reopen the panel": "视频已切换，请重新打开侧栏",
    "The player is not ready; start playback and try again":
      "视频播放器尚未就绪，请开始播放后重试",
    "Unable to connect to the player; reopen the panel":
      "暂时无法连接播放器，请重新打开侧栏",
    "Enter a wordbook name": "请输入名称",
    "Wordbook created and selected": "已创建并选中新生词本",
    "Connected to Eudic. Choose a wordbook and save.":
      "已连接欧路，请选择目标生词本并保存。",
    "Local EUDIC_TOKEN found (value hidden).":
      "已找到本机 EUDIC_TOKEN（不显示内容）。",
    "Task reset. Reopen the video to retry.":
      "任务已重置，重新打开视频即可重试",
    "Have you checked the server task? Resubmission may incur another charge.":
      "确认已核对服务端任务？重置后重新请求可能再次收费。",
    "Supadata limit reached; try again later": "Supadata 达到限额，请稍后重试",
    "Invalid Supadata key": "Supadata key 无效",
    "No native captions. Enable transcription or import subtitles.":
      "没有可用字幕，请开启自动转录或导入字幕",
    "Audio transcription is in progress…": "音频转录处理中…",
    "Transcribing audio": "音频转录中",
    "Preparing video audio…": "正在准备视频音频…",
    "Checking existing captions…": "正在读取已有字幕…",
    "Audio task failed. Check settings and retry.":
      "音频任务失败，请检查设置后重试。",
    "Local helper unavailable. Run the helper installer first.":
      "本机助手尚未就绪，请先运行安装器。",
    "Enter a Groq API key in Subtitles & AI.":
      "请在“字幕与 AI”中填写 Groq API 密钥。",
    "Local Whisper is not configured. Check the local components in Settings.":
      "本地 Whisper 尚未配置，请在设置中检查本机组件。",
    "Supadata API key not configured. Add a key or import captions.":
      "请在设置中填写 Supadata key，或导入字幕文件",
    "Saved Notes": "已保存的笔记",
    "This Video": "当前视频",
    "All Notes": "全部笔记",
    Chapters: "章节",
    "Key Quotes": "关键引用",
    "Search words or phrases": "搜索单词或短语",
    "Fetching transcript": "正在读取字幕",
    "Analyzing…": "正在分析…",
    "Analyzing...": "正在分析…",
    "Try Again": "重试",
    Error: "错误",
    Copy: "复制",
    Export: "导出",
    "Full Transcript": "全部字幕",
    "Ready to Digest": "开始学习",
    "No transcript found": "未找到字幕",
    "API key missing": "缺少 API 密钥",
    "Loading...": "正在加载…",
    "Saving...": "正在保存…",
    Delete: "删除",
  };
  Object.assign(pairs, {
    "Open Caption Harbor settings": "打开 Caption Harbor 设置",
    "Reload current video captions": "重新载入当前视频字幕",
    "Open a YouTube, Bilibili, or Apple Podcasts episode and click the extension icon to get an AI-powered digest.":
      "打开 YouTube、Bilibili 或 Apple 播客内容，点击插件图标开始学习。",
    "Extracting captions from video...": "正在读取视频字幕…",
    "Chapters will appear here": "章节将显示在这里",
    "Quotes will be extracted when you view this tab...":
      "打开此标签页后会提取关键引用…",
    'Move your mouse over the video and click Note to save a timestamped note, or press the "n" key while the video is focused.':
      "将鼠标移至视频上方，点击“笔记”保存带时间点的笔记；视频获得焦点时也可按 n。",
    "Your previous transcription request is unconfirmed. Check the Supadata task and balance, then reset this video task in Settings.":
      "上次转录请求的结果尚不明确。请先在 Supadata 核对任务与额度，再在设置中重置该视频任务。",
    "Transcribing audio. You can close the panel and reopen it to check progress.":
      "正在转录音频，可关闭侧栏，稍后打开会继续查询",
    "Closing this page stops the transcription.": "关闭此网页将停止转录任务",
    "Audio transcription failed. Reset the task in Settings to retry.":
      "音频转录失败，可在设置中重置任务后重试",
    "Audio transcript": "音频转录",
    "Site captions": "站内字幕",
    Imported: "已导入字幕",
    "Audio transcription failed; showing site captions.":
      "音频转录失败，当前显示站内字幕",
    "No English transcript is available for this video — captions in other languages are hidden by your transcript language setting.":
      "该视频没有英文字幕——按“字幕语言”设置，其他语言的字幕已隐藏",
    "No Chinese transcript is available for this video — captions in other languages are hidden by your transcript language setting.":
      "该视频没有中文字幕——按“字幕语言”设置，其他语言的字幕已隐藏",
    "Reset task": "重置任务",
    Ready: "已就绪",

    Advanced: "高级设置",
    "Caption Harbor settings": "Caption Harbor 设置",
    "Meaning & collection": "词义与收藏",
    "Concept explanation": "概念解释",
    "Enter your Eudic authorization": "填写你的欧路授权信息",
    "The video ID after v= in a YouTube link": "YouTube 链接 v= 后面的 ID",
    "Paste your Supadata key": "填写 Supadata 密钥",
    "Paste your DeepSeek key": "填写 DeepSeek 密钥",
    "Select a word or phrase up to 160 characters":
      "请选择不超过 160 字符的单词或短语",
    "Word not found": "生词不存在",
    "Eudic authorization is invalid or expired. Please reconnect.":
      "欧路授权无效或已过期，请重新连接",
    "Eudic rate limit reached. Please try again later.":
      "欧路访问过于频繁，请稍后重试",
    "Connect Eudic in Settings: the local bridge is not ready. Install it and configure EUDIC_TOKEN.":
      "请先在设置里连接欧路词典：本机环境读取未就绪，请安装本机桥接并配置 EUDIC_TOKEN。",
    "Local EUDIC_TOKEN is empty": "本机 EUDIC_TOKEN 为空",
    "The transcription service did not return timestamped captions":
      "转录服务没有返回带时间点的字幕",
    "No speech was detected": "未检测到可转录的语音",
    "The AI did not return valid questions. Please try again.":
      "AI 未返回有效的题目，请重试",
    "The AI did not return a valid explanation. Please try again.":
      "AI 未返回有效解释，请重试",
    "No video player connection. Refresh the video page.":
      "无法读取视频播放位置，请刷新视频页面",
    "The player is not ready or the video changed":
      "视频播放器尚未就绪或已切换",
    "The video changed": "视频已切换",
    "Player action failed": "播放器操作失败",
    "Request failed": "请求失败",
    "Invalid video tab": "视频标签页无效",
    "Install yt-dlp and FFmpeg using the local setup instructions.":
      "请按本机配置说明安装 yt-dlp 和 FFmpeg。",
    "Local Whisper or the selected model is not installed.":
      "尚未安装本地 Whisper 或所选模型。",
    "The previous audio request is unconfirmed. Reset the task in Settings before retrying.":
      "上次音频请求结果尚不明确，请先在设置中重置任务。",
    "Unable to prepare or transcribe this video. Check the local tools and video accessibility.":
      "无法获取或转录此视频，请检查本机组件和视频是否可公开访问。",
    "Groq transcription failed. Check the key and usage limits; completed requests may still be billable.":
      "Groq 转录失败，请检查密钥和额度；已完成的请求仍可能收费。",
    "Audio was unavailable or exceeded the four-hour/500 MB limit.":
      "无法获取音频，或超过四小时/500 MB 限制。",
    "Local audio task failed. Check the setup and try again.":
      "本机音频任务失败，请检查配置后重试。",
    "Too many recent audio tasks; try again later.":
      "近期音频任务过多，请稍后重试。",
    "Audio task timed out; reset it in Settings.":
      "音频任务超时，请在设置中重置。",
  });
  const reverse = new Map(Object.entries(pairs).map(([en, zh]) => [zh, en]));
  function text(value) {
    if (typeof value !== "string") return value;
    const leading = value.match(/^[\s·•]*/)[0],
      trailing = value.match(/\s*$/)[0];
    const body = value.slice(leading.length).trim().replace(/\s+/g, " ");
    if (language === "en") {
      const patterns = [
        [/^待安装：(.+)$/, (m) => `Missing: ${m[1]}`],
        [/^已导入 (\d+) 条字幕$/, (m) => `Imported ${m[1]} captions`],
        [
          /^(\d+) 个生词 · (\d+) 条笔记 · (.+)$/,
          (m) => `${m[1]} words · ${m[2]} notes · ${m[3]}`,
        ],
        [/^继续学习 · (.+)$/, (m) => `Continue · ${m[1]}`],
        [
          /^已(?:保存在|本地保存；)(.*)$/,
          (m) => `Saved locally; ${text(m[1].replace(/^本地；/, ""))}`,
        ],
        [
          /^解释暂不可用：(.+)。仍可直接收藏。$/,
          (m) =>
            `Explanation unavailable: ${text(m[1])}. You can still collect this word.`,
        ],
        [/^欧路同步失败 \((\d+)\)$/, (m) => `Eudic sync failed (${m[1]})`],
      ];
      for (const [pattern, render] of patterns) {
        const match = body.match(pattern);
        if (match) return leading + render(match) + trailing;
      }
    }
    if (language === "zh-CN") {
      const patterns = [
        [/^Missing: (.+)$/, (m) => `待安装：${m[1]}`],
        [/^Imported (\d+) captions$/, (m) => `已导入 ${m[1]} 条字幕`],
        [
          /^(\d+) words · (\d+) notes · (.+)$/,
          (m) => `${m[1]} 个生词 · ${m[2]} 条笔记 · ${m[3]}`,
        ],
        [/^Continue · (.+)$/, (m) => `继续学习 · ${m[1]}`],
      ];
      for (const [pattern, render] of patterns) {
        const match = body.match(pattern);
        if (match) return leading + render(match) + trailing;
      }
    }
    const translated =
      language === "en" ? reverse.get(body) || body : pairs[body] || body;
    return leading + translated + trailing;
  }
  const originals = new WeakMap();
  function translateNode(node) {
    const current = node.nodeValue;
    const record = originals.get(node);
    const original =
      record && current === record.output ? record.original : current;
    const output = text(original);
    originals.set(node, { original, output });
    if (current !== output) node.nodeValue = output;
  }
  function localize(root = document.body) {
    if (!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (
        node.parentElement?.closest(
          "script,style,textarea,#transcriptList,.video-info,.lens-card h3,.lens-card blockquote,.explain-selected-text,.explain-text,[data-user-content]",
        )
      )
        continue;
      translateNode(node);
    }
    for (const el of root.querySelectorAll(
      "[placeholder],[aria-label],[title]",
    )) {
      for (const attr of ["placeholder", "aria-label", "title"])
        if (el.hasAttribute(attr))
          el.setAttribute(attr, text(el.getAttribute(attr)));
    }
  }
  function set(value) {
    language = value === "zh-CN" ? "zh-CN" : "en";
    document.documentElement.lang = language;
    localize();
  }
  async function init() {
    let revision = 0;
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && changes.ytd_options_language) {
        revision++;
        set(changes.ytd_options_language.newValue);
      }
    });
    const initial = revision;
    try {
      const saved = await chrome.storage.local.get("ytd_options_language");
      if (revision === initial) set(saved.ytd_options_language);
    } catch {
      set("en");
    }
    const observer = new MutationObserver(() => {
      observer.disconnect();
      localize();
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }
  if (typeof document !== "undefined") {
    if (document.readyState === "loading")
      document.addEventListener("DOMContentLoaded", init);
    else void init();
  }
  return {
    text,
    localize,
    set,
    get language() {
      return language;
    },
  };
})();
