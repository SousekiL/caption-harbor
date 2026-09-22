/* Read captions already available to the signed-in YouTube page. */
async function readBrowserCaptions(videoId) {
  const tabs = await chrome.tabs.query({
    url: "https://www.youtube.com/watch*",
  });
  const tab =
    tabs.find(
      (t) =>
        t.id === (typeof youtubeTabId === "number" ? youtubeTabId : null) &&
        new URL(t.url).searchParams.get("v") === videoId,
    ) || tabs.find((t) => new URL(t.url).searchParams.get("v") === videoId);
  if (!tab) return { success: false };
  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    world: "MAIN",
    args: [videoId],
    func: async (expected) => {
      if (new URL(location.href).searchParams.get("v") !== expected)
        return { success: false };
      const fromDom = () => {
        const rows = [
          ...document.querySelectorAll("ytd-transcript-segment-renderer"),
        ];
        const content = rows
          .map((row) => {
            const stamp = row
              .querySelector(".segment-timestamp")
              ?.textContent?.trim();
            const text = row
              .querySelector(".segment-text")
              ?.textContent?.trim();
            if (!stamp || !text || !/^\d+(?::\d{2}){1,2}$/.test(stamp))
              return null;
            return {
              text,
              offset:
                stamp.split(":").reduce((t, n) => t * 60 + Number(n), 0) * 1000,
            };
          })
          .filter(Boolean);
        for (let i = 0; i < content.length; i++)
          content[i].duration = Math.max(
            100,
            (content[i + 1]?.offset ?? content[i].offset + 4000) -
              content[i].offset,
          );
        return content.length ? { success: true, content } : null;
      };
      const existing = fromDom();
      if (existing) return existing;
      const player = document.getElementById("movie_player");
      const response = player?.getPlayerResponse?.();
      const tracks = [
        ...(response?.captions?.playerCaptionsTracklistRenderer
          ?.captionTracks || []),
      ].sort(
        (a, b) =>
          (b.languageCode?.startsWith("en") ? 2 : 0) -
          (a.languageCode?.startsWith("en") ? 2 : 0),
      );
      for (const track of tracks.slice(0, 2)) {
        try {
          const url = new URL(track.baseUrl);
          if (
            !["www.youtube.com", "youtube.com"].includes(url.hostname) ||
            url.protocol !== "https:" ||
            url.pathname !== "/api/timedtext"
          )
            continue;
          url.searchParams.set("fmt", "json3");
          const result = await fetch(url, {
            credentials: "include",
            signal: AbortSignal.timeout(4000),
          });
          if (!result.ok) continue;
          const data = await result.json();
          if ((data.events || []).some((event) => event.segs?.length))
            return { success: true, json3: data, lang: track.languageCode };
        } catch {}
      }
      // The user-visible transcript is a second source when timed-text requests
      // require player-only tokens. Never invent such tokens or use a paid API here.
      let button = document.querySelector(
        "ytd-video-description-transcript-section-renderer button",
      );
      if (!button) {
        const expand = document.querySelector(
          "ytd-watch-metadata #description-inline-expander #expand",
        );
        expand?.click();
        await new Promise((r) => setTimeout(r, 250));
        button = document.querySelector(
          "ytd-video-description-transcript-section-renderer button",
        );
      }
      if (!button) return { success: false };
      const wasOpen = [
        ...document.querySelectorAll(
          "ytd-engagement-panel-section-list-renderer",
        ),
      ].some(
        (panel) =>
          /transcript/i.test(panel.getAttribute("target-id") || "") &&
          panel.getAttribute("visibility") ===
            "ENGAGEMENT_PANEL_VISIBILITY_EXPANDED",
      );
      button.click();
      return await new Promise((resolve) => {
        let timer;
        const finish = (value) => {
          observer.disconnect();
          clearTimeout(timer);
          if (!wasOpen) {
            const panel = [
              ...document.querySelectorAll(
                "ytd-engagement-panel-section-list-renderer",
              ),
            ].find(
              (panel) =>
                /transcript/i.test(panel.getAttribute("target-id") || "") &&
                panel.getAttribute("visibility") ===
                  "ENGAGEMENT_PANEL_VISIBILITY_EXPANDED",
            );
            panel
              ?.querySelector(
                'button[aria-label*="Close"],button[aria-label*="关闭"]',
              )
              ?.click();
          }
          resolve(value);
        };
        const observer = new MutationObserver(() => {
          const result = fromDom();
          if (result) finish(result);
        });
        observer.observe(document.body, { childList: true, subtree: true });
        const immediate = fromDom();
        if (immediate) {
          finish(immediate);
          return;
        }
        timer = setTimeout(() => finish({ success: false }), 5000);
      });
    },
  });
  const data = results?.[0]?.result;
  if (!data?.success) return { success: false };
  const current = await chrome.tabs.get(tab.id);
  if (new URL(current.url).searchParams.get("v") !== videoId)
    return { success: false };
  const normalized = data.json3
    ? { ...data, content: LensCore.youtubeJson3ToContent(data.json3) }
    : data;
  return { ...LensCore.transcriptResult(normalized), source: "youtube" };
}

/**
 * Reads Bilibili's own subtitle tracks with the signed-in page's cookies.
 * The chain mirrors what the site does: /x/web-interface/view resolves the
 * cid for the current part, /x/player/v2 lists tracks, and the subtitle JSON
 * itself is served from aisubtitle.hdslb.com without credentials.
 */
async function readBilibiliCaptions(videoId) {
  const tabs = await chrome.tabs.query({
    url: ["https://www.bilibili.com/video/*", "https://bilibili.com/video/*"],
  });
  const boundTabId = typeof youtubeTabId === "number" ? youtubeTabId : null;
  const tab =
    tabs.find(
      (t) =>
        t.id === boundTabId &&
        HarborSites.detect(t.url)?.mediaId === videoId,
    ) ||
    tabs.find((t) => HarborSites.detect(t.url)?.mediaId === videoId);
  if (!tab) return { success: false };
  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    world: "MAIN",
    func: async () => {
      try {
        const url = new URL(location.href);
        const bvid = url.pathname.match(/^\/video\/(BV\w+)/)?.[1];
        if (!bvid) return { success: false };
        const part = Math.max(
          1,
          Math.floor(Number(url.searchParams.get("p")) || 1),
        );
        const view = await fetch(
          `https://api.bilibili.com/x/web-interface/view?bvid=${encodeURIComponent(bvid)}`,
          { credentials: "include", signal: AbortSignal.timeout(8000) },
        ).then((r) => (r.ok ? r.json() : null));
        const page = view?.data?.pages?.[part - 1];
        const cid = page?.cid || view?.data?.cid;
        if (!cid) return { success: false };
        const player = await fetch(
          `https://api.bilibili.com/x/player/v2?bvid=${encodeURIComponent(bvid)}&cid=${cid}`,
          { credentials: "include", signal: AbortSignal.timeout(8000) },
        ).then((r) => (r.ok ? r.json() : null));
        const tracks = player?.data?.subtitle?.subtitles || [];
        if (!tracks.length) return { success: false };
        const rank = (track) => {
          // This app teaches English — an English track beats Chinese AI
          // captions, and human-authored beats AI within a language.
          const raw = String(track?.lan || "");
          const lang = raw.replace(/^ai-/i, "");
          const ai = track?.ai_status || /^ai-/i.test(raw);
          const base = /^en/i.test(lang) ? 3 : /^zh/i.test(lang) ? 2 : 0;
          return base * 2 - (ai ? 1 : 0);
        };
        const ordered = [...tracks].sort((a, b) => rank(b) - rank(a));
        for (const track of ordered.slice(0, 2)) {
          try {
            const raw = String(track?.subtitle_url || "");
            if (!raw) continue;
            const subtitleUrl = new URL(
              raw.startsWith("//") ? `https:${raw}` : raw,
            );
            if (
              subtitleUrl.protocol !== "https:" ||
              !["hdslb.com", "bilibili.com", "biliapi.net"].some(
                (host) => subtitleUrl.hostname === host || subtitleUrl.hostname.endsWith(`.${host}`),
              )
            )
              continue;
            const data = await fetch(subtitleUrl, {
              credentials: "omit",
              signal: AbortSignal.timeout(8000),
            }).then((r) => (r.ok ? r.json() : null));
            if ((data?.body || []).length)
              return { success: true, body: data.body, lang: track.lan || "" };
          } catch {}
        }
        return { success: false };
      } catch {
        return { success: false };
      }
    },
  });
  const data = results?.[0]?.result;
  if (!data?.success) return { success: false };
  const current = await chrome.tabs.get(tab.id);
  if (HarborSites.detect(current.url)?.mediaId !== videoId)
    return { success: false };
  const normalized = {
    content: LensCore.bilibiliSubtitlesToContent({ body: data.body }),
    lang: data.lang,
  };
  return { ...LensCore.transcriptResult(normalized), source: "bilibili" };
}

/**
 * Routes caption reading to the site's own mechanism. Apple Podcasts has no
 * web transcript surface, so it falls through to audio transcription.
 */
async function readSiteCaptions(videoId) {
  switch (HarborSites.siteOf(videoId)) {
    case "youtube":
      return readBrowserCaptions(videoId);
    case "bilibili":
      return readBilibiliCaptions(videoId);
    default:
      return { success: false };
  }
}
