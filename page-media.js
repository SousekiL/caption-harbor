/**
 * Page-context media helpers. These functions are passed verbatim to
 * chrome.scripting.executeScript, which serializes ONLY the function body —
 * so every helper must be declared inside the function itself. They run in
 * the MAIN world where the site's own player (e.g. MusicKit) is reachable.
 */
function harborPageReadMedia(expected) {
  function mediaId() {
    const url = new URL(location.href);
    if (url.hostname.endsWith("bilibili.com")) {
      const match = url.pathname.match(/^\/video\/(BV\w+)/);
      if (!match) return null;
      const part = Math.max(
        1,
        Math.floor(Number(url.searchParams.get("p")) || 1),
      );
      return `bili_${match[1]}_${part}`;
    }
    if (url.hostname === "podcasts.apple.com") {
      const showId = url.pathname.match(/\/id(\d+)/)?.[1];
      const episodeId = url.searchParams.get("i");
      if (!showId || !/^\d+$/.test(episodeId || "")) return null;
      return `apple_${showId}_${episodeId}`;
    }
    const id =
      url.searchParams.get("v") ||
      (url.hostname === "youtu.be" ? url.pathname.slice(1) : null) ||
      (url.pathname.match(/^\/(?:embed|shorts)\/([\w-]{6,20})/)?.[1] ?? null);
    return id && /^[\w-]{6,20}$/.test(id) ? id : null;
  }
  if (mediaId() !== expected) return { success: false, error: "视频已切换" };
  // MusicKit is authoritative on podcasts.apple.com — it owns any hidden
  // <audio> element, and its clock keeps running across queue changes.
  const mk = window.MusicKit?.getInstance?.();
  if (mk && Number.isFinite(mk.currentPlaybackTime))
    return {
      success: true,
      currentTime: mk.currentPlaybackTime,
      paused: !mk.isPlaying,
    };
  const media =
    document.querySelector("video.html5-main-video") ||
    document.querySelector("video") ||
    document.querySelector("audio");
  if (media && Number.isFinite(media.currentTime))
    return {
      success: true,
      currentTime: media.currentTime,
      paused: media.paused,
    };
  return { success: false, error: "视频播放器尚未就绪，请开始播放后重试" };
}

function harborPageSeekMedia(expected, seconds) {
  function mediaId() {
    const url = new URL(location.href);
    if (url.hostname.endsWith("bilibili.com")) {
      const match = url.pathname.match(/^\/video\/(BV\w+)/);
      if (!match) return null;
      const part = Math.max(
        1,
        Math.floor(Number(url.searchParams.get("p")) || 1),
      );
      return `bili_${match[1]}_${part}`;
    }
    if (url.hostname === "podcasts.apple.com") {
      const showId = url.pathname.match(/\/id(\d+)/)?.[1];
      const episodeId = url.searchParams.get("i");
      if (!showId || !/^\d+$/.test(episodeId || "")) return null;
      return `apple_${showId}_${episodeId}`;
    }
    const id =
      url.searchParams.get("v") ||
      (url.hostname === "youtu.be" ? url.pathname.slice(1) : null) ||
      (url.pathname.match(/^\/(?:embed|shorts)\/([\w-]{6,20})/)?.[1] ?? null);
    return id && /^[\w-]{6,20}$/.test(id) ? id : null;
  }
  if (mediaId() !== expected) return { success: false, error: "视频已切换" };
  const target = Number(seconds);
  const mk = window.MusicKit?.getInstance?.();
  if (mk && typeof mk.seekToTime === "function") {
    mk.seekToTime(target);
    return { success: true, currentTime: mk.currentPlaybackTime };
  }
  const media =
    document.querySelector("video.html5-main-video") ||
    document.querySelector("video") ||
    document.querySelector("audio");
  if (media && Number.isFinite(media.currentTime)) {
    media.currentTime = target;
    if (media.paused) media.play().catch(() => {});
    return { success: true, currentTime: media.currentTime };
  }
  return { success: false, error: "视频播放器尚未就绪" };
}
