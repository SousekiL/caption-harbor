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

async function seekBoundPlayer(tabId, videoId, seconds) {
  const targetSeconds = Number(seconds);
  if (!Number.isFinite(targetSeconds) || targetSeconds < 0)
    throw new Error("无效的视频时间点");

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
  let result;
  try {
    result = await chrome.tabs.sendMessage(tabId, {
      action: "seekTo",
      videoId,
      seconds: targetSeconds,
    });
  } catch {}

  if (result?.success !== true) {
    const injected = await chrome.scripting.executeScript({
      target: { tabId },
      args: [videoId, targetSeconds],
      func: (expectedVideoId, targetTime) => {
        const url = new URL(location.href);
        if (
          url.origin !== "https://www.youtube.com" ||
          url.searchParams.get("v") !== expectedVideoId
        )
          return { success: false, error: "视频已切换" };
        const video = document.querySelector("video.html5-main-video");
        if (!video) return { success: false, error: "视频播放器尚未就绪" };
        video.currentTime = targetTime;
        return { success: true, currentTime: video.currentTime };
      },
    });
    result = injected?.[0]?.result;
  }

  await validateTab();
  if (result?.success !== true)
    throw new Error(result?.error || "无法跳转视频，请重新打开侧栏");
  return result;
}
