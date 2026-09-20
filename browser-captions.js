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
