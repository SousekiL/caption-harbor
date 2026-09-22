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
  if (!result?.success) {
    const error = new Error(result?.error || "本机助手尚未就绪，请先运行安装器。");
    // Only an explicit host rejection proves that a start was not accepted.
    error.nativeRejected = result?.success === false;
    throw error;
  }
  return result;
}
async function harborAlternativeTranscript(videoId, config, mediaUrl) {
  const provider = config.transcriptionProvider;
  const key = `harbor_audio_${videoId}_${provider}`;
  const saved = (await chrome.storage.local.get(key))[key];
  let jobId = saved?.jobId;
  if (!jobId) {
    if (saved?.uncertain) {
      const error = new Error(
        "The previous audio request is unconfirmed. Reset the task in Settings before retrying.",
      );
      error.audioTaskUnconfirmed = true;
      throw error;
    }
    let groqApiKey = typeof config.groqApiKey === "string" ? config.groqApiKey.trim() : "";
    if (provider === "groq" && !groqApiKey) {
      const credential = await harborAudioNative({ action: "getServiceKey", service: "groq" });
      groqApiKey = typeof credential.key === "string" ? credential.key.trim() : "";
      if (!groqApiKey) throw new Error("Groq key not configured. Enter it in Settings or configure the local environment.");
    }
    const ready = await harborAudioNative({ action: "audioStatus" });
    if (!ready.ytdlp || !ready.ffmpeg)
      throw new Error(
        "Install yt-dlp and FFmpeg using the local setup instructions.",
      );
    if (
      provider === "local" &&
      (!ready.whisper ||
        !Array.isArray(ready.models) ||
        !ready.models.includes(config.localModel || "small.en"))
    )
      throw new Error("本地 Whisper 尚未配置，请在设置中检查本机组件。");
    await chrome.storage.local.set({ [key]: { uncertain: true } });
    let task;
    try {
      task = await harborAudioNative({
        action: "audioStart",
        videoId,
        provider,
        model: config.localModel || "small.en",
        groqModel: config.groqModel || "whisper-large-v3-turbo",
        ...(typeof mediaUrl === "string" && mediaUrl.startsWith("https://")
          ? { url: mediaUrl }
          : {}),
        ...(provider === "groq" ? { apiKey: groqApiKey } : {}),
      });
    } catch (error) {
      // A lost native reply can occur after the job started. Keep the latch
      // in that case so retrying does not submit a second paid request.
      if (error.nativeRejected) await chrome.storage.local.remove(key);
      throw error;
    }
    if (typeof task.jobId !== "string" || !task.jobId) {
      const error = new Error("The audio start returned no task ID. Reset the unconfirmed task in Settings before retrying.");
      error.audioTaskUnconfirmed = true;
      throw error;
    }
    jobId = task.jobId;
    await chrome.storage.local.set({ [key]: { jobId, provider } });
  }
  const state = await harborAudioNative({ action: "audioPoll", jobId });
  if (state.status === "failed") {
    // A terminal failure is not resumable. Keeping its job ID would make all
    // later attempts skip YouTube caption detection and replay the same error.
    await chrome.storage.local.remove(key);
    throw new Error(state.error || "音频任务失败，请检查设置后重试。");
  }
  if (state.status !== "completed")
    return {
      success: false,
      pending: true,
      // Native jobs are cancelled when their page closes — the panel warns
      // about that. Cloud jobs (Supadata) keep running regardless.
      nativeJob: true,
      progress:
        typeof state.progress === "number" ? state.progress : null,
      message:
        state.stage === "download" ? "正在准备视频音频…" : "音频转录处理中…",
    };
  const result = LensCore.transcriptResult(state);
  result.transcriptSource = "audio";
  await harborCacheTranscript(videoId, result, {
    sourceUrl: state.sourceUrl || mediaUrl,
    source: "audio",
  });
  await chrome.storage.local.remove(key);
  return result;
}
async function harborCacheTranscript(videoId, result, meta = {}) {
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
      // How the transcript was made. "audio" means the real speech was
      // transcribed, "captions" means a site track was reused — the
      // preferOriginalAudio setting treats a captions cache as stale.
      ...(meta.source ? { transcriptSource: meta.source } : {}),
      // The exact audio rendition transcribed. Podcasts re-stitch ads per
      // session, so a different sourceUrl later means stale timestamps.
      ...(typeof meta.sourceUrl === "string" &&
      meta.sourceUrl.startsWith("https://")
        ? { sourceUrl: meta.sourceUrl }
        : {}),
      // When an audio-first preference fell back to captions after a
      // failure, remember when so the next open doesn't immediately burn
      // another transcription job — and why, so the panel can say so.
      ...(meta.audioFailedAt ? { audioFailedAt: meta.audioFailedAt } : {}),
      ...(meta.audioError ? { audioError: meta.audioError } : {}),
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
    result.transcriptSource = "captions";
    await harborCacheTranscript(videoId, result, { source: "captions" });
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
