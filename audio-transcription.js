async function harborAudioNative(message) {
  let result;
  try {
    result = await chrome.runtime.sendNativeMessage(
      "com.caption_harbor.environment",
      message,
    );
  } catch {
    throw new Error("本机助手尚未就绪，请先运行安装器。");
  }
  if (!result?.success)
    throw new Error(result?.error || "本机助手尚未就绪，请先运行安装器。");
  return result;
}
async function harborAlternativeTranscript(videoId, config) {
  const provider = config.transcriptionProvider;
  const key = `harbor_audio_${videoId}_${provider}`;
  const saved = (await chrome.storage.local.get(key))[key];
  let jobId = saved?.jobId;
  if (!jobId) {
    if (saved?.uncertain)
      throw new Error(
        "The previous audio request is unconfirmed. Reset the task in Settings before retrying.",
      );
    if (provider === "groq" && !config.groqApiKey)
      throw new Error("请在“字幕与 AI”中填写 Groq API 密钥。");
    const ready = await harborAudioNative({ action: "audioStatus" });
    if (!ready.ytdlp || !ready.ffmpeg)
      throw new Error(
        "Install yt-dlp and FFmpeg using the local setup instructions.",
      );
    if (
      provider === "local" &&
      (!ready.whisper ||
        !ready.models.includes(config.localModel || "small.en"))
    )
      throw new Error("本地 Whisper 尚未配置，请在设置中检查本机组件。");
    await chrome.storage.local.set({ [key]: { uncertain: true } });
    const task = await harborAudioNative({
      action: "audioStart",
      videoId,
      provider,
      model: config.localModel || "small.en",
      groqModel: config.groqModel || "whisper-large-v3-turbo",
      ...(provider === "groq" ? { apiKey: config.groqApiKey } : {}),
    });
    jobId = task.jobId;
    await chrome.storage.local.set({ [key]: { jobId, provider } });
  }
  const state = await harborAudioNative({ action: "audioPoll", jobId });
  if (state.status === "failed")
    throw new Error(state.error || "音频任务失败，请检查设置后重试。");
  if (state.status !== "completed")
    return {
      success: false,
      pending: true,
      message:
        state.stage === "download" ? "正在准备视频音频…" : "音频转录处理中…",
    };
  const result = LensCore.transcriptResult(state);
  await harborCacheTranscript(videoId, result);
  await chrome.storage.local.remove(key);
  return result;
}
async function harborCacheTranscript(videoId, result) {
  const key = `digest_${videoId}`;
  const existing = (await chrome.storage.local.get(key))[key];
  if (existing?.imported) return;
  await chrome.storage.local.set({
    [key]: {
      transcript: result.transcript,
      transcriptText: result.transcriptText,
      transcriptTimestamped: result.transcriptTextTimestamped,
      transcriptLanguage: result.language,
      timestamp: Date.now(),
    },
  });
}

async function harborNativeCaptions(videoId) {
  const key = `harbor_caption_${videoId}`;
  const saved = (await chrome.storage.local.get(key))[key];
  if (saved?.unavailable && Date.now() - saved.time < 3600000)
    return { success: false };
  let jobId = saved?.jobId;
  if (!jobId) {
    let ready;
    try {
      ready = await harborAudioNative({ action: "audioStatus" });
    } catch {
      return { success: false };
    }
    if (!ready.ytdlp) return { success: false };
    const task = await harborAudioNative({
      action: "audioStart",
      videoId,
      provider: "captions",
      model: "small.en",
    });
    jobId = task.jobId;
    await chrome.storage.local.set({ [key]: { jobId } });
  }
  const task = await harborAudioNative({ action: "audioPoll", jobId });
  if (task.status === "completed") {
    const result = LensCore.transcriptResult(task);
    await harborCacheTranscript(videoId, result);
    await chrome.storage.local.remove(key);
    return result;
  }
  if (task.status === "working")
    return { success: false, pending: true, message: "正在读取已有字幕…" };
  await chrome.storage.local.set({
    [key]: { unavailable: true, time: Date.now() },
  });
  return { success: false };
}
