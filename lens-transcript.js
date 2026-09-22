// Runs in the trusted side panel so synchronous audio generation can take up to two minutes.
const lensTranscriptInFlight = new Map();

function harborTranscriptConfig(serviceStore) {
  return {
    transcriptionProvider: "supadata",
    autoTranscribe: true,
    ...serviceStore?.lens_settings,
    ...serviceStore?.harbor_services,
  };
}

function harborAudioCapable(config) {
  return (
    config.autoTranscribe &&
    ["groq", "local"].includes(config.transcriptionProvider)
  );
}

// preferOriginalAudio transcribes the real audio first, so the transcript
// follows the spoken language instead of whichever site track exists (e.g.
// Bilibili zh AI subs on English audio). YouTube timedtext is left alone
// since it is already original-language.
function harborAudioFirst(videoId, config) {
  const site =
    typeof HarborSites === "object"
      ? HarborSites.siteOf(videoId) || "youtube"
      : "youtube";
  return (
    site !== "youtube" &&
    config.preferOriginalAudio &&
    harborAudioCapable(config)
  );
}

// A transcript written before provenance tracking (or one whose fields were
// stripped by an older panel save) carries no transcriptSource/sourceUrl.
// If its content is clearly not Chinese it cannot be the wrong-language site
// track the audio-first rule exists to replace, so trust it rather than
// burning a redundant transcription job.
function harborTextLooksCJK(cached) {
  const sample = (
    cached?.transcriptText ||
    (cached?.transcript || [])
      .slice(0, 40)
      .map((entry) => entry?.text || "")
      .join(" ")
  ).slice(0, 4000);
  const letters = sample.replace(/[^\p{L}]/gu, "");
  if (!letters.length) return false;
  const cjk = (letters.match(/[\p{Script=Han}]/gu) || []).length;
  return cjk / letters.length > 0.3;
}

// A hard language requirement ("en"/"zh") rejects transcripts in any other
// language instead of showing them. The reported track language is checked
// first; when it is missing the text itself decides. A mislabeled tag does
// not override clearly CJK content for the "en" filter.
function harborTranscriptLanguageOk(payload, filter) {
  if (filter !== "en" && filter !== "zh") return true;
  const lang = String(
    payload?.transcriptLanguage || payload?.language || "",
  ).toLowerCase().replace(/^ai-/, "");
  const cjk = harborTextLooksCJK(payload);
  if (filter === "en") return (!lang || lang.startsWith("en")) && !cjk;
  return lang.includes("zh") || cjk;
}

function harborLanguageFilteredResult(filter) {
  return {
    success: false,
    error: "LANGUAGE_MISMATCH",
    message:
      filter === "en"
        ? "No English transcript is available for this video — captions in other languages are hidden by your transcript language setting."
        : "No Chinese transcript is available for this video — captions in other languages are hidden by your transcript language setting.",
  };
}

/**
 * Whether a digest cache entry may be served. Shared by the panel's cache
 * read and the transcript pipeline so both apply the same staleness rules:
 * - renditionUrl: podcasts re-stitch ads per session, so a transcript made
 *   from a different rendition is desynced.
 * - audioFirst: a captions-sourced transcript is stale when the user prefers
 *   original-audio transcription — unless audio already failed recently
 *   (audioFailedAt cooldown avoids burning a job on every open).
 * - languageFilter: a required transcript language ("en"/"zh") rejects a
 *   cache in any other language.
 */
function harborDigestUsable(
  cached,
  { audioFirst = false, renditionUrl = null, languageFilter = null } = {},
) {
  if (!cached?.transcript?.length) return false;
  if (cached.imported) return true;
  if (!harborTranscriptLanguageOk(cached, languageFilter)) return false;
  if (renditionUrl && cached.sourceUrl !== renditionUrl) return false;
  if (audioFirst) {
    // Older audio transcripts carry sourceUrl but no transcriptSource;
    // captions caches have neither.
    const audioMade =
      cached.transcriptSource === "audio" ||
      (typeof cached.sourceUrl === "string" &&
        cached.sourceUrl.startsWith("https://")) ||
      (!cached.transcriptSource &&
        !cached.sourceUrl &&
        !harborTextLooksCJK(cached));
    const cooling =
      cached.audioFailedAt &&
      Date.now() - cached.audioFailedAt < 24 * 60 * 60 * 1000;
    if (!audioMade && !cooling) return false;
  }
  return true;
}

// Podcast CDNs re-stitch ads per session, so the served MP3 changes over
// time. Resolve the currently served content-addressed rendition so cache
// freshness can be checked against the exact stitched file.
async function harborResolveAppleRendition(videoId) {
  const timeout = (ms) =>
    new Promise((resolve) => setTimeout(() => resolve(null), ms));
  let media;
  try {
    media = await Promise.race([
      chrome.runtime.sendMessage({ action: "resolveMediaUrl", videoId }),
      timeout(6000),
    ]);
  } catch {
    return null;
  }
  if (!media?.mediaUrl?.startsWith("https://")) return media || null;
  try {
    const resolved = await Promise.race([
      harborAudioNative({ action: "audioResolve", url: media.mediaUrl }),
      timeout(8000),
    ]);
    if (resolved?.url) media.renditionUrl = resolved.url;
  } catch {}
  return media;
}
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
  const site =
    typeof HarborSites === "object"
      ? HarborSites.siteOf(videoId) || "youtube"
      : "youtube";
  const url =
    site === "youtube"
      ? YTD_SETTINGS.canonicalYouTubeUrl(videoId)
      : HarborSites.mediaUrl(videoId);
  // Settings decide whether a cached transcript is still acceptable (audio
  // first vs captions), so load them before the cache check.
  const serviceStore = await chrome.storage.local.get([
    "harbor_services",
    "lens_settings",
  ]);
  const config = harborTranscriptConfig(serviceStore);
  const audioCapable = harborAudioCapable(config);
  const preferAudio = harborAudioFirst(videoId, config);
  // Podcast CDNs re-stitch ads per session, so the served MP3 changes over
  // time. Resolve the current content-addressed rendition first: a cached
  // transcript is only valid while it was made from the same rendition.
  let appleMedia = null;
  if (site === "apple")
    appleMedia = await harborResolveAppleRendition(videoId);
  const cached = (await chrome.storage.local.get(`digest_${videoId}`))[
    `digest_${videoId}`
  ];
  const languageFilter = config.requiredTranscriptLanguage;
  if (
    harborDigestUsable(cached, {
      audioFirst: preferAudio,
      renditionUrl:
        typeof appleMedia?.renditionUrl === "string"
          ? appleMedia.renditionUrl
          : null,
      languageFilter,
    }) &&
    (cached.imported || Date.now() - cached.timestamp < 30 * 24 * 60 * 60 * 1000)
  ) {
    return {
      success: true,
      transcript: cached.transcript,
      transcriptText: cached.transcriptText,
      transcriptTextTimestamped: cached.transcriptTimestamped,
      language: cached.transcriptLanguage || null,
      transcriptSource: cached.transcriptSource || null,
      audioError: cached.audioError || null,
    };
  }
  const audioKey = `harbor_audio_${videoId}_${config.transcriptionProvider}`;
  const audioJob = (await chrome.storage.local.get(audioKey))[audioKey];
  const savedSupadataJob = (
    await chrome.storage.local.get(`lens_job_${videoId}`)
  )[`lens_job_${videoId}`];
  const savedCaptionJob = (
    await chrome.storage.local.get(`harbor_caption_${videoId}`)
  )[`harbor_caption_${videoId}`];
  const siteCaptionReader =
    typeof readSiteCaptions === "function"
      ? readSiteCaptions
      : typeof readBrowserCaptions === "function"
        ? readBrowserCaptions
        : null;
  // Apple Podcasts episodes stream from a signed assetUrl resolved through
  // the page's MusicKit session (appleMedia, fetched above). Resolve once
  // here so the audio-first path and the fallback share it.
  let mediaUrl = url;
  if (site === "apple") {
    mediaUrl =
      (typeof appleMedia?.mediaUrl === "string" && appleMedia.mediaUrl) ||
      (typeof currentMediaUrl === "string" && currentMediaUrl) ||
      "";
    if (!mediaUrl)
      try {
        const fresh = await chrome.runtime.sendMessage({
          action: "resolveMediaUrl",
          videoId,
        });
        if (fresh?.mediaUrl) mediaUrl = fresh.mediaUrl;
      } catch {}
  }

  const languageOk = (result) =>
    harborTranscriptLanguageOk(result, languageFilter);
  let audioError = null;
  let wrongLanguage = false;
  if (
    preferAudio &&
    (site !== "apple" || mediaUrl.startsWith("https://"))
  ) {
    try {
      const audio = await harborAlternativeTranscript(videoId, config, mediaUrl);
      if (audio?.pending) return audio;
      if (audio?.success) {
        if (languageOk(audio)) return audio;
        // The real speech is another language — site captions might still
        // carry the required one, so keep looking before reporting.
        wrongLanguage = true;
      }
    } catch (error) {
      audioError = error;
    }
  }

  if (!audioJob && !savedSupadataJob && !savedCaptionJob?.jobId && siteCaptionReader) {
    try {
      const native = await siteCaptionReader(videoId);
      if (native.success) {
        native.transcriptSource = "captions";
        if (audioError)
          native.audioError = String(audioError.message || audioError);
        if (languageOk(native)) {
          await harborCacheTranscript(videoId, native, {
            source: "captions",
            ...(audioError
              ? {
                  audioFailedAt: Date.now(),
                  audioError: String(audioError.message || audioError),
                }
              : {}),
          });
          return native;
        }
        // Captions exist but violate the required language — do not cache
        // or display them.
        wrongLanguage = true;
      }
    } catch {}
  }
  // Captions were the fallback: surface the audio failure rather than retry.
  if (audioError) throw audioError;
  if (wrongLanguage && preferAudio) return harborLanguageFilteredResult(languageFilter);
  // yt-dlp's subtitle download only helps YouTube — Bilibili subtitle
  // downloads require login cookies yt-dlp does not have, and Apple Podcasts
  // has no caption files at all.
  if (
    site === "youtube" &&
    !audioJob &&
    !savedSupadataJob &&
    typeof harborNativeCaptions === "function"
  ) {
    const native = await harborNativeCaptions(videoId);
    if (native.pending) return native;
    if (native.success) {
      if (languageOk(native)) return native;
      wrongLanguage = true;
    }
  }
  if (audioCapable) {
    // mediaUrl was resolved above; for Apple it must be a streamable https
    // URL or there is nothing to transcribe.
    if (site === "apple" && !mediaUrl.startsWith("https://"))
      return {
        success: false,
        error: "NO_MEDIA_URL",
        message:
          "找不到该集的音频地址，请刷新播客页面后重试。",
      };
    const audio = await harborAlternativeTranscript(videoId, config, mediaUrl);
    if (audio?.success && !languageOk(audio))
      return harborLanguageFilteredResult(languageFilter);
    return audio;
  }
  if (wrongLanguage && site !== "youtube") return harborLanguageFilteredResult(languageFilter);
  // Supadata only understands YouTube URLs; other sites need Groq/local audio.
  if (site !== "youtube")
    return {
      success: false,
      error: "NO_TRANSCRIPTION_PROVIDER",
      message:
        "此站点没有可直接读取的字幕，请在设置的“字幕与 AI”中选择 Groq 或本机 Whisper 转录。",
    };
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
    const endpoint = new URL("https://api.supadata.ai/v1/transcript");
    endpoint.search = new URLSearchParams({
      url,
      text: "false",
      lang: languageFilter === "zh" ? "zh" : "en",
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
    // A server or gateway failure may arrive after the provider accepted
    // billable work. Only definitive client rejection releases the latch.
    if (!saved?.jobId && response.status < 500 && response.status !== 408)
      await chrome.storage.local.remove(key);
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
  result.transcriptSource = config.autoTranscribe ? "audio" : "captions";
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
        transcriptSource: config.autoTranscribe ? "audio" : "captions",
        timestamp: Date.now(),
      },
    });
  await chrome.storage.local.remove(key);
  if (!languageOk(result)) return harborLanguageFilteredResult(languageFilter);
  return result;
}
