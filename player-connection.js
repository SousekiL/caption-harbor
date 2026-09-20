/* Read only the video explicitly bound to this panel. */
async function readBoundPlayerState(tabId, videoId) {
  const validateTab = async () => {
    const tab = await chrome.tabs.get(tabId);
    const url = new URL(tab.url);
    if (
      url.origin !== "https://www.youtube.com" ||
      url.searchParams.get("v") !== videoId
    )
      throw new Error("视频已切换，请重新打开侧栏");
  };
  await validateTab();
  let state;
  try {
    state = await chrome.tabs.sendMessage(tabId, {
      action: "getCurrentTime",
      videoId,
    });
  } catch {}
  if (state?.success === false || !Number.isFinite(state?.currentTime)) {
    // A reloaded extension can lose its content-script connection. Read media
    // state directly instead of reinjecting an entire script or reloading video.
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      args: [videoId],
      func: (expected) => {
        const url = new URL(location.href);
        if (
          url.origin !== "https://www.youtube.com" ||
          url.searchParams.get("v") !== expected
        )
          return { success: false, error: "视频已切换" };
        const video = document.querySelector("video.html5-main-video");
        if (!video || !Number.isFinite(video.currentTime))
          return {
            success: false,
            error: "视频播放器尚未就绪，请开始播放后重试",
          };
        return {
          success: true,
          currentTime: video.currentTime,
          paused: video.paused,
        };
      },
    });
    state = results?.[0]?.result;
  }
  await validateTab();
  if (state?.success === false || !Number.isFinite(state?.currentTime))
    throw new Error(state?.error || "暂时无法连接播放器，请重新打开侧栏");
  return state;
}
