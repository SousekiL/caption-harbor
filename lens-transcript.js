// Runs in the trusted side panel so synchronous audio generation can take up to two minutes.
const lensTranscriptInFlight = new Map();
async function lensFetchTranscript(videoId) {
  if (lensTranscriptInFlight.has(videoId))
    return lensTranscriptInFlight.get(videoId);
  const task = (
    globalThis.navigator?.locks
      ? navigator.locks.request(`caption-harbor-transcript-${videoId}`, () =>
          lensDoFetchTranscript(videoId),
        )
      : lensDoFetchTranscript(videoId)
  ).finally(() => lensTranscriptInFlight.delete(videoId));
  lensTranscriptInFlight.set(videoId, task);
  return task;
}
async function lensDoFetchTranscript(videoId) {
  const url = YTD_SETTINGS.canonicalYouTubeUrl(videoId);
  const cached = (await chrome.storage.local.get(`digest_${videoId}`))[
    `digest_${videoId}`
  ];
  if (
    cached?.transcript?.length &&
    Date.now() - cached.timestamp < 30 * 24 * 60 * 60 * 1000
  ) {
    return {
      success: true,
      transcript: cached.transcript,
      transcriptText: cached.transcriptText,
      transcriptTextTimestamped: cached.transcriptTimestamped,
      language: cached.transcriptLanguage || null,
    };
  }
  const serviceStore = await chrome.storage.local.get([
    "harbor_services",
    "lens_settings",
  ]);
  const config = {
    transcriptionProvider: "supadata",
    autoTranscribe: true,
    ...serviceStore.lens_settings,
    ...serviceStore.harbor_services,
  };
  const audioKey = `harbor_audio_${videoId}_${config.transcriptionProvider}`;
  const audioJob = (await chrome.storage.local.get(audioKey))[audioKey];
  const savedSupadataJob = (
    await chrome.storage.local.get(`lens_job_${videoId}`)
  )[`lens_job_${videoId}`];
  const savedCaptionJob = (
    await chrome.storage.local.get(`harbor_caption_${videoId}`)
  )[`harbor_caption_${videoId}`];
  if (
    !audioJob &&
    !savedSupadataJob &&
    !savedCaptionJob?.jobId &&
    typeof readBrowserCaptions === "function"
  ) {
    try {
      const native = await readBrowserCaptions(videoId);
      if (native.success) {
        await harborCacheTranscript(videoId, native);
        return native;
      }
    } catch {}
  }
  if (
    !audioJob &&
    !savedSupadataJob &&
    typeof harborNativeCaptions === "function"
  ) {
    const native = await harborNativeCaptions(videoId);
    if (native.success || native.pending) return native;
  }
  if (
    config.autoTranscribe &&
    ["groq", "local"].includes(config.transcriptionProvider)
  )
    return harborAlternativeTranscript(videoId, config);
  const settings =
    typeof getSettings === "function"
      ? await getSettings()
      : YTD_SETTINGS.normalize(
          (await chrome.storage.local.get(YTD_SETTINGS.STORAGE_KEY))[
            YTD_SETTINGS.STORAGE_KEY
          ],
        );
  if (!settings.supadataApiKey)
    return {
      success: false,
      error: "NO_SUPADATA_KEY",
      message: "请在设置中填写 Supadata key，或导入字幕文件",
    };
  const key = `lens_job_${videoId}`;
  const saved = (await chrome.storage.local.get(key))[key];
  const headers = { "x-api-key": settings.supadataApiKey };
  let response;
  if (saved?.jobId) {
    response = await fetch(
      `https://api.supadata.ai/v1/transcript/${encodeURIComponent(saved.jobId)}`,
      { headers, signal: AbortSignal.timeout(25000) },
    );
  } else {
    if (saved?.uncertain)
      throw new Error(
        "上次转录请求的结果尚不明确。请先在 Supadata 核对任务与额度，再在设置中重置该视频任务。",
      );
    const config = {
      autoTranscribe: true,
      ...(await chrome.storage.local.get("lens_settings")).lens_settings,
    };
    const endpoint = new URL("https://api.supadata.ai/v1/transcript");
    endpoint.search = new URLSearchParams({
      url,
      text: "false",
      lang: "en",
      mode: config.autoTranscribe ? "auto" : "native",
    }).toString();
    await chrome.storage.local.set({
      [key]: { uncertain: true, createdAt: Date.now() },
    });
    response = await fetch(endpoint, {
      headers,
      signal: AbortSignal.timeout(120000),
    });
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok || response.status === 206) {
    if (!saved?.jobId) await chrome.storage.local.remove(key);
    throw new Error(
      response.status === 206
        ? "没有可用字幕，请开启自动转录或导入字幕"
        : response.status === 401
          ? "Supadata key 无效"
          : response.status === 429
            ? "Supadata 达到限额，请稍后重试"
            : `字幕服务返回 ${response.status}。可在设置里检查或重置任务。`,
    );
  }
  if (response.status === 202 && typeof data.jobId === "string") {
    await chrome.storage.local.set({
      [key]: { jobId: data.jobId, createdAt: Date.now() },
    });
    return {
      success: false,
      pending: true,
      message: "正在转录音频，可关闭侧栏，稍后打开会继续查询",
    };
  }
  if (data.status === "queued" || data.status === "active")
    return { success: false, pending: true, message: "音频转录处理中…" };
  if (data.status === "failed")
    throw new Error("音频转录失败，可在设置中重置任务后重试");
  const result = LensCore.transcriptResult(data);
  // Persist the finished result before clearing the job, even if its panel closed.
  const existing = (await chrome.storage.local.get(`digest_${videoId}`))[
    `digest_${videoId}`
  ];
  if (!existing?.imported)
    await chrome.storage.local.set({
      [`digest_${videoId}`]: {
        transcript: result.transcript,
        transcriptText: result.transcriptText,
        transcriptTimestamped: result.transcriptTextTimestamped,
        transcriptLanguage: result.language,
        timestamp: Date.now(),
      },
    });
  await chrome.storage.local.remove(key);
  return result;
}
