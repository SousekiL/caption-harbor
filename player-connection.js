/* Read only the video explicitly bound to this panel. */
function harborVideoChangedError() {
  const error = new Error("视频已切换，请重新打开侧栏");
  error.videoChanged = true;
  return error;
}

async function readBoundPlayerState(tabId, videoId) {
  const validateTab = async () => {
    const tab = await chrome.tabs.get(tabId);
    if (HarborSites.detect(tab.url)?.mediaId !== videoId)
      throw harborVideoChangedError();
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
    // The MAIN world also reaches site players such as Apple Podcasts'
    // MusicKit, which a content script cannot see.
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      args: [videoId],
      func: harborPageReadMedia,
    });
    state = results?.[0]?.result;
  }
  await validateTab();
  if (state?.success === false || !Number.isFinite(state?.currentTime)) {
    if (state?.error === "Video changed") throw harborVideoChangedError();
    throw new Error(state?.error || "暂时无法连接播放器，请重新打开侧栏");
  }
  return state;
}

async function seekBoundPlayer(tabId, videoId, seconds) {
  const targetSeconds = Number(seconds);
  if (!Number.isFinite(targetSeconds) || targetSeconds < 0)
    throw new Error("无效的视频时间点");

  const validateTab = async () => {
    const tab = await chrome.tabs.get(tabId);
    if (HarborSites.detect(tab.url)?.mediaId !== videoId)
      throw harborVideoChangedError();
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
      world: "MAIN",
      args: [videoId, targetSeconds],
      func: harborPageSeekMedia,
    });
    result = injected?.[0]?.result;
  }

  await validateTab();
  if (result?.success !== true) {
    if (result?.error === "Video changed") throw harborVideoChangedError();
    throw new Error(result?.error || "无法跳转视频，请重新打开侧栏");
  }
  return result;
}
