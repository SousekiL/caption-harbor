/**
 * Supported media sites and their media-ID scheme.
 *
 * The internal mediaId doubles as the storage key, so YouTube keeps its bare
 * video ID for backward compatibility while other sites carry a prefix:
 *   youtube  → "Nhmyrh9I_bA"
 *   bilibili → "bili_BV1xx411c7mD_2"   (bvid + ?p= part number)
 *   apple    → "apple_1200361736_1000790778095"  (show id + ?i= episode id)
 */
var HarborSites = (() => {
  const YOUTUBE_ID = /^[\w-]{6,20}$/;
  const BILIBILI_ID = /^bili_BV\w+_\d+$/;
  const APPLE_ID = /^apple_\d+_\d+$/;

  const HOSTS = new Set([
    "www.youtube.com",
    "youtube.com",
    "m.youtube.com",
    "youtu.be",
    "www.bilibili.com",
    "bilibili.com",
    "podcasts.apple.com",
  ]);

  function detect(url) {
    let parsed;
    try {
      parsed = new URL(String(url || ""));
    } catch {
      return null;
    }
    if (parsed.protocol !== "https:" || !HOSTS.has(parsed.hostname))
      return null;

    if (parsed.hostname.endsWith("bilibili.com")) {
      const match = parsed.pathname.match(/^\/video\/(BV\w+)/);
      if (!match) return null;
      const part = Math.max(
        1,
        Math.floor(Number(parsed.searchParams.get("p")) || 1),
      );
      return {
        site: "bilibili",
        mediaId: `bili_${match[1]}_${part}`,
        bvid: match[1],
        part,
      };
    }

    if (parsed.hostname === "podcasts.apple.com") {
      const showId = parsed.pathname.match(/\/id(\d+)/)?.[1];
      const episodeId = parsed.searchParams.get("i");
      if (!showId || !/^\d+$/.test(episodeId || "")) return null;
      return { site: "apple", mediaId: `apple_${showId}_${episodeId}` };
    }

    // YouTube: watch?v=, youtu.be/, /embed/, /shorts/
    const id =
      parsed.searchParams.get("v") ||
      (parsed.hostname === "youtu.be" ? parsed.pathname.slice(1) : null) ||
      (parsed.pathname.match(/^\/(?:embed|shorts)\/([\w-]{6,20})/)?.[1] ??
        null);
    return id && YOUTUBE_ID.test(id)
      ? { site: "youtube", mediaId: id }
      : null;
  }

  // True when the URL is on a supported host even if it is not a media page
  // (e.g. YouTube home, a Bilibili ranking page). The panel stays open there
  // and shows the welcome state instead of closing.
  function hostSupported(url) {
    try {
      return HOSTS.has(new URL(String(url || "")).hostname);
    } catch {
      return false;
    }
  }

  function siteOf(mediaId) {
    if (BILIBILI_ID.test(mediaId)) return "bilibili";
    if (APPLE_ID.test(mediaId)) return "apple";
    if (YOUTUBE_ID.test(mediaId)) return "youtube";
    return null;
  }

  function mediaUrl(mediaId) {
    const site = siteOf(mediaId);
    if (site === "bilibili") {
      const [, bvid, part] = mediaId.split("_");
      return `https://www.bilibili.com/video/${bvid}/${part === "1" ? "" : `?p=${part}`}`;
    }
    if (site === "apple") {
      const [, showId, episodeId] = mediaId.split("_");
      return `https://podcasts.apple.com/us/podcast/id${showId}?i=${episodeId}`;
    }
    if (site === "youtube")
      return `https://www.youtube.com/watch?v=${mediaId}`;
    throw new Error("Invalid media ID.");
  }

  function timestampUrl(mediaId, seconds) {
    const base = mediaUrl(mediaId);
    const t = Math.max(0, Math.floor(Number(seconds) || 0));
    return `${base}${base.includes("?") ? "&" : "?"}t=${t}s`;
  }

  function isValidMediaId(mediaId) {
    return siteOf(mediaId) !== null;
  }

  return {
    detect,
    hostSupported,
    siteOf,
    mediaUrl,
    timestampUrl,
    isValidMediaId,
  };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = HarborSites;
}
