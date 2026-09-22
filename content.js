/**
 * CONTENT SCRIPT
 *
 * This script runs ON the YouTube page itself. It can see and modify
 * the YouTube page DOM (the HTML elements).
 *
 * It handles:
 * 1. Extracting video info (title, channel name) from the page
 * 2. Injecting "key moment" markers onto YouTube's progress bar
 * 3. Adding a "Digest" button to YouTube's action bar (next to Share/Save)
 *
 * Think of it like a robot sitting inside the YouTube tab,
 * reading the page and making small visual changes.
 */

const DEBUG = false;
const debugLog = (...args) => {
  if (DEBUG) console.log(...args);
};

// ============================================================
// SITE DETECTION (YouTube / Bilibili / Apple Podcasts)
// ============================================================

function currentMedia() {
  return HarborSites.detect(location.href);
}

function currentMediaId() {
  return currentMedia()?.mediaId || null;
}

function currentSite() {
  return currentMedia()?.site || null;
}

// The primary playable element on the page. Bilibili uses a plain <video>;
// Apple Podcasts may expose an <audio> only while playing.
function findMediaElement() {
  return (
    document.querySelector("video.html5-main-video") ||
    document.querySelector(".bpx-player-video video") ||
    document.querySelector("video") ||
    document.querySelector("audio")
  );
}

// ============================================================
// GLOBAL STATE
// ============================================================

let ytdNoteButton = null;
let ytdNoteButtonTimer = null;
let ytdNoteKeyboardListenerAdded = false;
let ytdNoteButtonRetryTimer = null;
let ytdDigestButton = null;
let digestButtonObserver = null;
let digestButtonReconcileTimer = null;
let digestButtonResizeListenerAdded = false;

// ============================================================
// INITIALIZATION
// ============================================================

/**
 * When the page loads, inject our Digest button and Note button.
 * We wait a bit for YouTube's UI to fully render.
 */
function init() {
  // Register the global "n" keyboard shortcut once
  if (!ytdNoteKeyboardListenerAdded) {
    document.addEventListener("keydown", handleNoteKeyboardShortcut);
    ytdNoteKeyboardListenerAdded = true;
  }

  // Try to inject the buttons immediately
  injectDigestButton();
  tryInjectNoteButton();

  // Also set up an observer to handle dynamic content loading
  // (YouTube, Bilibili, and Apple Podcasts are all SPAs)
  setupButtonObserver();
  setupDigestButtonResizeListener();
}

/**
 * Attempts to inject the note button. If the player container isn't ready yet,
 * retry a few times with a short delay. YouTube renders the player asynchronously
 * after navigation, so a single immediate attempt can miss it.
 */
function tryInjectNoteButton() {
  const media = currentMedia();
  // Apple Podcasts has no video surface to overlay — notes come from the
  // side panel / keyboard shortcut there.
  if (!media || media.site === "apple") return;

  // Clear any existing retry so we don't stack timers
  if (ytdNoteButtonRetryTimer) {
    clearInterval(ytdNoteButtonRetryTimer);
    ytdNoteButtonRetryTimer = null;
  }

  let attempts = 0;
  const maxAttempts = 30; // ~3 seconds of retrying

  function attempt() {
    attempts++;
    const playerContainer = findPlayerContainer();

    if (playerContainer) {
      injectNoteButton();
      if (ytdNoteButtonRetryTimer) {
        clearInterval(ytdNoteButtonRetryTimer);
        ytdNoteButtonRetryTimer = null;
      }
      return;
    }

    if (attempts >= maxAttempts) {
      debugLog(
        "[Caption Harbor Content] Player container not found after retries, giving up",
      );
      if (ytdNoteButtonRetryTimer) {
        clearInterval(ytdNoteButtonRetryTimer);
        ytdNoteButtonRetryTimer = null;
      }
    }
  }

  attempt();
  if (!ytdNoteButton || !ytdNoteButton.isConnected) {
    ytdNoteButtonRetryTimer = setInterval(attempt, 100);
  }
}

// Run init when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

// ============================================================
// MESSAGE HANDLING
// ============================================================

/**
 * Listen for messages from the side panel or background script.
 * When they ask for video info, we read it from the page.
 * When they send key moments, we highlight them on the progress bar.
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  debugLog(
    "[Caption Harbor Content] Received message:",
    message.action,
    message,
  );

  if (message.action === "lensPlayer") {
    const video = findMediaElement();
    const videoId = currentMediaId();
    if (!video || videoId !== message.videoId) {
      sendResponse({ success: false, error: "视频已切换" });
      return false;
    }
    if (message.command === "toggle") {
      if (video.paused) video.play().catch(() => {});
      else video.pause();
    } else if (message.command === "previous") {
      harborLoop = null;
      video.currentTime = Math.max(0, Number(message.start) || 0);
      video.play().catch(() => {});
    } else if (message.command === "loop") {
      if (harborLoop) harborLoop = null;
      else if (
        Number.isFinite(message.start) &&
        Number.isFinite(message.end) &&
        message.end > message.start
      ) {
        harborLoop = { start: message.start, end: message.end, videoId };
        video.currentTime = message.start;
        video.play().catch(() => {});
      } else {
        sendResponse({ success: false, error: "请先加载字幕" });
        return false;
      }
    }
    sendResponse({ success: true, loop: !!harborLoop });
    return false;
  }
  if (message.action === "getVideoInfo") {
    // Read video title and channel name from the page
    const info = extractVideoInfo();
    debugLog("[Caption Harbor Content] Returning video info:", info);
    sendResponse(info);
    return false; // Synchronous response
  }

  if (message.action === "highlightMoments") {
    // Key moment markers disabled — chapters are shown in the side panel only.
    sendResponse({ success: true });
    return false;
  }

  if (message.action === "getCurrentTime") {
    const video = findMediaElement();
    const videoId = currentMediaId();
    if (
      !video ||
      !Number.isFinite(video.currentTime) ||
      (message.videoId && message.videoId !== videoId)
    ) {
      sendResponse({ success: false, error: "视频播放器尚未就绪或已切换" });
      return false;
    }
    sendResponse({
      success: true,
      currentTime: video.currentTime,
      paused: video.paused,
    });
    return false;
  }

  if (message.action === "seekTo") {
    // Jump the video to a specific timestamp
    const videoId = currentMediaId();
    if (message.videoId && message.videoId !== videoId) {
      sendResponse({ success: false, error: "Video changed" });
      return false;
    }
    debugLog("[Caption Harbor Content] Seeking to:", message.seconds);
    if (!seekToTimestamp(message.seconds)) {
      sendResponse({ success: false, error: "视频播放器尚未就绪" });
      return false;
    }
    sendResponse({ success: true });
    return false;
  }

  if (message.action === "showNoteSavedFeedback") {
    // Show brief feedback that note was saved
    showNoteSavedToast(message.note);
    sendResponse({ success: true });
    return false;
  }

  // Unknown action - still send a response to prevent hanging
  debugLog("[Caption Harbor Content] Unknown action:", message.action);
  sendResponse({ success: false, error: "Unknown action" });
  return false;
});

// ============================================================
// DIGEST BUTTON INJECTION
// ============================================================

/**
 * Injects a "Digest" button into YouTube's action bar.
 * The button appears next to Share, Save, etc. below the video.
 *
 * When clicked, it opens the Caption Harbor side panel.
 */
function isVisibleDigestHost(element) {
  if (!element || !element.isConnected) return false;

  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;

  const style = window.getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden";
}

/**
 * YouTube keeps hidden copies of its responsive action toolbar in the DOM.
 * querySelector() can return one of those 0x0 copies before the toolbar the
 * viewer can actually see, so inspect every candidate and resolve the native
 * button group inside the visible action row for the current video.
 */
function findDigestButtonHost(site = "youtube") {
  if (site === "bilibili") {
    // The ops row (like/coin/favorite) under the player.
    const toolbar = document.querySelector(
      ".video-toolbar .toolbar-left, #arc_toolbar_report .video-toolbar-left, .video-toolbar",
    );
    return isVisibleDigestHost(toolbar) ? toolbar : null;
  }
  if (site === "apple") return null; // uses the floating button instead

  const primaryActionRows = Array.from(
    document.querySelectorAll("ytd-watch-metadata #actions-inner"),
  );

  for (const actionRow of primaryActionRows) {
    if (!isVisibleDigestHost(actionRow)) continue;

    const visibleButtonGroup = Array.from(
      actionRow.querySelectorAll("#top-level-buttons-computed"),
    ).find(isVisibleDigestHost);
    if (visibleButtonGroup) return visibleButtonGroup;
  }

  const fallbackCandidates = Array.from(
    document.querySelectorAll(
      "ytd-watch-metadata #actions #top-level-buttons-computed, " +
        "ytd-watch-metadata #top-level-buttons-computed, " +
        "#primary #actions #top-level-buttons-computed",
    ),
  );

  return (
    fallbackCandidates.find(
      (candidate) =>
        isVisibleDigestHost(candidate) &&
        (candidate.closest("ytd-watch-metadata") ||
          candidate.closest("#primary")),
    ) || null
  );
}

/**
 * Gives the player container a positioning context for overlay buttons.
 * A :where() rule has zero specificity, so it applies only when the site
 * leaves position untouched and can never override the site's own rules —
 * Bilibili's fullscreen and mini-player modes reposition the container via
 * classes, and an inline style here used to silently win over
 * position:fixed and break them.
 */
function ensurePlayerOverlayBase(playerContainer) {
  if (!document.getElementById("caption-harbor-posfix")) {
    const posfix = document.createElement("style");
    posfix.id = "caption-harbor-posfix";
    posfix.textContent =
      ":where(.caption-harbor-posfix){position:relative}";
    document.head.appendChild(posfix);
  }
  playerContainer.classList.add("caption-harbor-posfix");
}

// Video player container used for the floating Note button overlay.
function findPlayerContainer() {
  const site = currentSite();
  if (site === "bilibili")
    // Must be the INNER container: #bilibili-player is the ancestor Bilibili
    // repositions with position:fixed for web fullscreen — touching it breaks
    // fullscreen. .bpx-player-container stays a plain child throughout.
    return (
      document.querySelector(".bpx-player-container") ||
      document.querySelector("#bilibili-player, .bpx-player")
    );
  if (site !== "youtube") return null;
  return document.querySelector(
    "#movie_player.html5-video-player, #movie_player, .html5-video-player",
  );
}

function createDigestButton() {
  const digestButton = document.createElement("button");
  digestButton.id = "ytd-digest-button";
  digestButton.type = "button";
  digestButton.setAttribute("aria-label", "Open Caption Harbor");
  digestButton.innerHTML = `<span class="ytd-digest-label">Digest</span>`;

  // Style the button — rounded pill in our green accent, sized to sit
  // comfortably among YouTube's native action buttons.
  digestButton.style.cssText = `
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 0 18px;
    height: 36px;
    border: none;
    border-radius: 18px;
    background: #3D755D;
    color: white;
    font-family: "Roboto", "Arial", sans-serif;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    margin-right: 8px;
    transition: background 0.2s, transform 0.1s;
    flex: 0 0 auto;
    align-self: center;
    width: max-content;
    min-width: max-content;
    max-width: max-content;
    white-space: nowrap;
  `;

  // Hover effects
  digestButton.addEventListener("mouseenter", () => {
    digestButton.style.background = "#315E4B";
    digestButton.style.transform = "scale(1.02)";
  });

  digestButton.addEventListener("mouseleave", () => {
    digestButton.style.background = "#3D755D";
    digestButton.style.transform = "scale(1)";
  });

  // Click handler — open the side panel
  digestButton.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();

    debugLog("[Caption Harbor] Digest button clicked");

    // Send message to background script to open side panel
    try {
      const result = await chrome.runtime.sendMessage({
        action: "openSidePanel",
      });
      debugLog("[Caption Harbor] openSidePanel response:", result);
    } catch (err) {
      console.error("[Caption Harbor] Failed to open side panel:", err);
    }
  });

  ytdDigestButton = digestButton;
  return digestButton;
}

/**
 * Reconciles the Digest button with YouTube's currently visible action row.
 * This is intentionally idempotent because YouTube rebuilds its watch page
 * during navigation and at responsive breakpoints.
 */
function injectDigestButton() {
  const existingButtons = Array.from(
    document.querySelectorAll("#ytd-digest-button"),
  );

  const media = currentMedia();
  if (!media) {
    existingButtons.forEach((button) => button.remove());
    ytdDigestButton = null;
    return false;
  }

  let digestButton = existingButtons.find(
    (button) => button === ytdDigestButton,
  );

  if (!digestButton) {
    existingButtons.forEach((button) => button.remove());
    digestButton = createDigestButton();
  }
  existingButtons.forEach((button) => {
    if (button !== digestButton) button.remove();
  });

  // Apple Podcasts has no stable action row — float above its playback bar.
  if (media.site === "apple") {
    digestButton.style.position = "fixed";
    digestButton.style.right = "24px";
    digestButton.style.bottom = "96px";
    digestButton.style.zIndex = "2147483646";
    digestButton.style.marginRight = "0";
    digestButton.style.boxShadow = "0 6px 20px rgba(0,0,0,0.3)";
    if (digestButton.parentElement !== document.body)
      document.body.appendChild(digestButton);
    return true;
  }
  digestButton.style.position = "";
  digestButton.style.right = "";
  digestButton.style.bottom = "";
  digestButton.style.zIndex = "";
  digestButton.style.marginRight = "";
  digestButton.style.boxShadow = "";

  // Bilibili's ops row is owned by the site's own renderer — a foreign child
  // inside .video-toolbar crashes its reconciliation (HierarchyRequestError)
  // and leaves web fullscreen dead. Overlay the button on the player instead;
  // the player container already tolerates our Note button.
  if (media.site === "bilibili") {
    const playerContainer = findPlayerContainer();
    if (!playerContainer) {
      debugLog(
        "[Caption Harbor Content] Player container not found yet",
      );
      return false;
    }
    ensurePlayerOverlayBase(playerContainer);
    digestButton.dataset.overlay = "1";
    digestButton.style.position = "absolute";
    digestButton.style.top = "16px";
    digestButton.style.left = "16px";
    digestButton.style.height = "auto";
    digestButton.style.padding = "9px 16px";
    digestButton.style.borderRadius = "999px";
    digestButton.style.zIndex = "9999";
    digestButton.style.marginRight = "0";
    digestButton.style.boxShadow = "0 4px 14px rgba(0,0,0,0.3)";
    digestButton.style.opacity = "0";
    digestButton.style.pointerEvents = "none";
    digestButton.style.transition =
      "opacity 0.18s ease, background 0.18s ease, transform 0.18s ease";
    if (digestButton.parentElement !== playerContainer)
      playerContainer.appendChild(digestButton);
    return true;
  }

  const actionsContainer = findDigestButtonHost(media.site);
  if (!actionsContainer) {
    debugLog(
      "[Caption Harbor Content] Visible actions container not found yet",
    );
    return false;
  }

  if (digestButton.parentElement !== actionsContainer) {
    // YouTube turns #actions-inner into a vertical flex column at narrow
    // breakpoints. A direct child there stretches into a full-width second
    // row, so keep Digest inside the native horizontal button group and
    // prepend it to preserve visibility when space is limited.
    actionsContainer.insertBefore(digestButton, actionsContainer.firstChild);
  }

  debugLog("[Caption Harbor Content] Digest button reconciled");
  return true;
}

function scheduleDigestButtonReconciliation(delay = 80) {
  if (digestButtonReconcileTimer) {
    clearTimeout(digestButtonReconcileTimer);
  }

  digestButtonReconcileTimer = setTimeout(() => {
    digestButtonReconcileTimer = null;
    injectDigestButton();
  }, delay);
}

function setupDigestButtonResizeListener() {
  if (digestButtonResizeListenerAdded) return;

  window.addEventListener("resize", () => {
    scheduleDigestButtonReconciliation(120);
  });
  digestButtonResizeListenerAdded = true;
}

/**
 * Sets up a MutationObserver to watch for YouTube's dynamic content changes.
 * When the action buttons container appears (after navigation), we inject our button.
 */
function setupButtonObserver() {
  if (digestButtonObserver) return;

  digestButtonObserver = new MutationObserver(() => {
    // Check if we need to inject the buttons
    if (currentMedia()) {
      scheduleDigestButtonReconciliation();
      if (!ytdNoteButton || !ytdNoteButton.isConnected) {
        tryInjectNoteButton();
      }
    }
  });

  // Watch the entire body for changes (YouTube rebuilds large chunks of the DOM)
  digestButtonObserver.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

// ============================================================
// NOTE BUTTON (Overlay on Video Player)
// ============================================================

/**
 * Injects a "Note" button overlay on top of the YouTube video player.
 * The button appears when the mouse enters or moves over the player and hides
 * after the cursor stays still for more than 2 seconds or leaves the player.
 */
function injectNoteButton() {
  const media = currentMedia();
  // Only inject on media pages with a real player surface.
  if (!media || media.site === "apple") return;

  // Don't inject if button already exists and is properly tracked.
  // If a stale button exists (e.g., from a previous content-script instance),
  // remove it and re-inject so event listeners are attached to the live one.
  const existingButton = document.getElementById("ytd-note-button");
  if (existingButton) {
    if (ytdNoteButton === existingButton && existingButton.isConnected) {
      return; // already injected and connected
    }
    existingButton.remove();
  }

  // Find the video player container. Sites rebuild this dynamically, so
  // we try the most common selectors.
  const playerContainer = findPlayerContainer();

  if (!playerContainer) {
    debugLog(
      "[Caption Harbor Content] Player container not found yet, will retry",
    );
    return;
  }

  // Positioning hint for the absolute note button (zero-specificity, see the
  // helper — an inline style here used to break Bilibili's fullscreen modes).
  ensurePlayerOverlayBase(playerContainer);

  debugLog("[Caption Harbor Content] Injecting note button");

  // Create the note button — a soft rounded pill that floats over the player
  const noteButton = document.createElement("button");
  noteButton.id = "ytd-note-button";
  noteButton.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" style="margin-right: 7px;">
      <path d="M12 20h9"></path>
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
    </svg>
    <span>Note</span>
  `;

  // Soft rounded pill in the green accent, with a gentle shadow.
  // Start hidden; visibility is controlled by mouse activity.
  noteButton.style.cssText = `
    position: absolute;
    top: 16px;
    right: 16px;
    z-index: 9999;
    display: flex;
    align-items: center;
    padding: 9px 16px;
    background: #3D755D;
    color: white;
    border: none;
    border-radius: 999px;
    font-family: system-ui, -apple-system, "Roboto", sans-serif;
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.2px;
    cursor: pointer;
    transition: opacity 0.18s ease, transform 0.18s ease, background 0.18s ease, box-shadow 0.18s ease;
    opacity: 0;
    pointer-events: none;
    box-shadow: 0 4px 14px rgba(0,0,0,0.3);
  `;

  ytdNoteButton = noteButton;

  // Show button when mouse enters or moves over the player.
  // Hide after 2 seconds of idle or when the mouse leaves.
  playerContainer.addEventListener("mouseenter", () => {
    showNoteButton();
    resetNoteButtonTimer();
  });

  playerContainer.addEventListener("mousemove", () => {
    showNoteButton();
    resetNoteButtonTimer();
  });

  playerContainer.addEventListener("mouseleave", () => {
    clearTimeout(ytdNoteButtonTimer);
    ytdNoteButtonTimer = null;
    hideNoteButton();
  });

  // Hover effect — lift slightly
  noteButton.addEventListener("mouseenter", () => {
    noteButton.style.background = "#315E4B";
    noteButton.style.boxShadow = "0 6px 18px rgba(0,0,0,0.35)";
    noteButton.style.transform = "translateY(-1px)";
  });

  noteButton.addEventListener("mouseleave", () => {
    noteButton.style.background = "#3D755D";
    noteButton.style.boxShadow = "0 4px 14px rgba(0,0,0,0.3)";
    noteButton.style.transform = "translateY(0)";
  });

  // Click handler — save the current moment as a note
  noteButton.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    await saveCurrentNote();
  });

  playerContainer.appendChild(noteButton);

  debugLog("[Caption Harbor Content] Note button injected");
}

function playerOverlayButtons() {
  const overlayDigest =
    ytdDigestButton && ytdDigestButton.dataset.overlay === "1"
      ? ytdDigestButton
      : null;
  return [ytdNoteButton, overlayDigest].filter(Boolean);
}

function showNoteButton() {
  for (const button of playerOverlayButtons()) {
    button.style.opacity = "1";
    button.style.pointerEvents = "auto";
  }
}

function hideNoteButton() {
  for (const button of playerOverlayButtons()) {
    button.style.opacity = "0";
    button.style.pointerEvents = "none";
  }
}

function resetNoteButtonTimer() {
  clearTimeout(ytdNoteButtonTimer);
  ytdNoteButtonTimer = setTimeout(() => {
    hideNoteButton();
  }, 2000);
}

/**
 * Handles the "n" keyboard shortcut for saving a note.
 * Only triggers on YouTube watch pages and when the user is not typing
 * in an input field.
 */
function handleNoteKeyboardShortcut(e) {
  if (!currentMedia()) return;
  if (e.key !== "n" && e.key !== "N") return;

  // Ignore if the user is typing in an input/textarea/contenteditable
  const active = document.activeElement;
  if (
    active &&
    (active.tagName === "INPUT" ||
      active.tagName === "TEXTAREA" ||
      active.isContentEditable)
  ) {
    return;
  }

  // Prevent YouTube's own "n" shortcut (e.g. next video in playlist)
  e.preventDefault();
  e.stopPropagation();

  // Show brief visual feedback on the button, then save
  showNoteButton();
  resetNoteButtonTimer();
  saveCurrentNote();
}

/**
 * Captures the current timestamp and saves it as a note.
 */
async function saveCurrentNote() {
  debugLog("[Caption Harbor] Saving note");

  let video = findMediaElement();
  let mediaSeconds = Number.isFinite(video?.currentTime)
    ? video.currentTime
    : null;

  // Apple Podcasts may keep its player only in the page's main world
  // (MusicKit) — the background worker can read it there.
  if (mediaSeconds === null) {
    try {
      const state = await chrome.runtime.sendMessage({
        action: "getPlaybackState",
        videoId: currentMediaId(),
      });
      if (state?.success && Number.isFinite(state.currentTime))
        mediaSeconds = state.currentTime;
    } catch {}
  }
  if (mediaSeconds === null) {
    console.error("[Caption Harbor] No playable media found");
    return;
  }

  // Go back 3 seconds to capture what was just said (user reacts after hearing it)
  const currentTime = Math.max(0, Math.floor(mediaSeconds) - 3);
  const videoInfo = extractVideoInfo();
  const videoId = currentMediaId();

  const noteButton = ytdNoteButton;
  const originalContent = noteButton ? noteButton.innerHTML : "";

  if (noteButton) {
    noteButton.innerHTML =
      '<span style="letter-spacing: 0.2px;">SAVING...</span>';
    noteButton.style.pointerEvents = "none";
  }

  try {
    const result = await chrome.runtime.sendMessage({
      action: "saveNote",
      videoId: videoId,
      timestamp: currentTime,
      videoTitle: videoInfo.title,
      channelName: videoInfo.channelName,
    });

    if (result.success) {
      if (noteButton) {
        noteButton.innerHTML =
          '<span style="letter-spacing: 0.2px;">SAVED</span>';
        noteButton.style.background = "#3D755D";
      }
      showNoteSavedToast(result.note);
    } else {
      if (noteButton) {
        noteButton.innerHTML =
          '<span style="letter-spacing: 0.2px;">ERROR</span>';
      }
      console.error("[Caption Harbor] Save note error:", result.error);
    }
  } catch (err) {
    if (noteButton) {
      noteButton.innerHTML =
        '<span style="letter-spacing: 0.2px;">ERROR</span>';
    }
    console.error("[Caption Harbor] Save note exception:", err);
  }

  setTimeout(() => {
    if (noteButton) {
      noteButton.innerHTML = originalContent;
      noteButton.style.background = "#3D755D";
      noteButton.style.pointerEvents = "auto";
    }
  }, 2000);
}

/**
 * Shows a toast notification when a note is saved.
 */
function showNoteSavedToast(note) {
  // Remove existing toast
  const existing = document.getElementById("ytd-note-toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.id = "ytd-note-toast";
  toast.innerHTML = `
    <div style="font-weight: 700; margin-bottom: 6px; color: #3D755D;">Note saved</div>
    <div style="font-size: 12px; color: #6b6258; margin-bottom: 8px;">${escapeHtmlForContent(note.timestamp)} — ${escapeHtmlForContent(note.videoTitle)}</div>
    <div style="font-size: 13px; line-height: 1.55; color: #2e2a24;">"${escapeHtmlForContent(note.text)}"</div>
    <div style="margin-top: 10px; font-size: 11px;">
      <a href="${escapeHtmlForContent(note.timestampedUrl)}" style="color: #3D755D; font-weight: 600; text-decoration: none;">Copy link</a>
    </div>
  `;

  toast.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    z-index: 999999;
    background: #ffffff;
    border: 1px solid #ece5d9;
    border-radius: 14px;
    padding: 16px 20px;
    max-width: 350px;
    box-shadow: 0 12px 32px rgba(50, 42, 32, 0.2);
    font-family: system-ui, -apple-system, "Roboto", sans-serif;
    animation: ytdSlideIn 0.3s ease;
  `;

  // Add animation keyframes
  const style = document.createElement("style");
  style.textContent = `
    @keyframes ytdSlideIn {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
  `;
  document.head.appendChild(style);

  // Copy link handler
  toast.querySelector("a").addEventListener("click", async (e) => {
    e.preventDefault();
    try {
      await navigator.clipboard.writeText(note.timestampedUrl);
      e.target.textContent = "Copied";
    } catch (err) {
      console.error("Copy failed:", err);
    }
  });

  document.body.appendChild(toast);

  // Auto-dismiss after 5 seconds
  setTimeout(() => {
    toast.style.animation = "ytdSlideIn 0.3s ease reverse";
    setTimeout(() => toast.remove(), 300);
  }, 5000);
}

// ============================================================
// VIDEO INFO EXTRACTION
// ============================================================

/**
 * Reads the video title, channel name, and description directly from YouTube's page.
 * These are just sitting in the HTML — we grab them from the DOM elements.
 */
function extractVideoInfo() {
  const site = currentSite();

  if (site === "bilibili") {
    const video = findMediaElement();
    return {
      title:
        document
          .querySelector("h1.video-title, .video-title, h1[title]")
          ?.textContent?.trim() || "",
      channelName:
        document
          .querySelector(".up-name, .up-info-container .up-name, .username")
          ?.textContent?.trim() || "",
      duration: Number.isFinite(video?.duration) ? video.duration : 0,
      description:
        document
          .querySelector(".desc-info-text, .basic-desc-info, #v_desc")
          ?.textContent?.trim() || "",
    };
  }

  if (site === "apple") {
    // The episode header renders the title in an h1; rich metadata arrives
    // through the background's catalog-API read (getVideoInfo relay).
    return {
      title:
        document.querySelector("h1")?.textContent?.trim() ||
        document.title.replace(/\s*[-–|].*$/, "").trim(),
      channelName:
        document
          .querySelector('[class*="subtitle"], .product-header__subtitle')
          ?.textContent?.trim() || "",
      duration: 0,
      description: "",
    };
  }

  // YouTube: title in an h1 element inside the #title container
  const titleElement = document.querySelector(
    "h1.ytd-watch-metadata yt-formatted-string, #title h1 yt-formatted-string",
  );

  // The channel name is in the channel info section
  const channelElement = document.querySelector(
    "#channel-name yt-formatted-string a, ytd-channel-name yt-formatted-string a",
  );

  // Video duration from the video element
  const videoElement = document.querySelector("video.html5-main-video");

  // Video description — YouTube has this in a few possible places
  const descriptionElement = document.querySelector(
    "#description-inner, " +
      "ytd-watch-metadata #description yt-attributed-string, " +
      "#description yt-formatted-string, " +
      "ytd-expander#description yt-attributed-string",
  );

  return {
    title: titleElement?.textContent?.trim() || "",
    channelName: channelElement?.textContent?.trim() || "",
    duration: videoElement?.duration || 0,
    description: descriptionElement?.textContent?.trim() || "",
  };
}

// ============================================================
// PROGRESS BAR KEY MOMENTS
// ============================================================

/**
 * Adds colored marker dots to YouTube's video progress bar
 * at the positions of key moments identified by the AI provider.
 *
 * How it works:
 * - YouTube's progress bar is a <div> element with a known class
 * - We calculate each moment's position as a percentage of total duration
 * - We inject small colored <div> elements at those positions
 * - The markers are absolutely positioned on top of the progress bar
 *
 * This is a "bonus feature" — it gives you a visual preview
 * of where the good stuff is in the video.
 */
function highlightKeyMoments(moments, videoDuration) {
  // Disabled: no timeline markers. Chapters live only in the side panel.
  return;
}

// ============================================================
// SEEK TO TIMESTAMP
// ============================================================

/**
 * Jumps the YouTube video to a specific timestamp (in seconds).
 * This is called when the user clicks a timestamp in the side panel.
 *
 * We simply set the video element's .currentTime property,
 * which is the standard HTML5 way to seek in a video.
 */
function seekToTimestamp(seconds) {
  const video = findMediaElement();
  if (!video || !Number.isFinite(video.currentTime)) {
    debugLog("[Caption Harbor Content] No media element found for seek");
    return false;
  }

  debugLog("[Caption Harbor Content] Seeking to:", seconds);
  video.currentTime = seconds;
  // Also play the video if it's paused
  if (video.paused) {
    video.play().catch(() => {}); // Ignore autoplay errors
  }
  return true;
}

function escapeHtmlForContent(text) {
  const div = document.createElement("div");
  div.textContent = text || "";
  return div.innerHTML;
}

// ============================================================
// PAGE NAVIGATION DETECTION
// ============================================================

/**
 * YouTube is a "Single Page Application" (SPA). This means when you
 * click on a new video, the page doesn't fully reload — YouTube
 * dynamically swaps out the content. So our content script stays alive
 * but needs to detect when the video changes.
 *
 * We watch for URL changes using the `yt-navigate-finish` event,
 * which YouTube fires after navigation completes. When that happens,
 * we clean up old markers and re-inject the button.
 */
document.addEventListener("yt-navigate-finish", () => {
  // Clean up old key moment markers when navigating to a new video
  const existingMarkers = document.querySelectorAll(".ytd-key-moment-markers");
  existingMarkers.forEach((m) => m.remove());

  // Remove old buttons (they will be re-injected for the new video)
  document
    .querySelectorAll("#ytd-digest-button")
    .forEach((button) => button.remove());
  ytdDigestButton = null;
  if (digestButtonReconcileTimer) {
    clearTimeout(digestButtonReconcileTimer);
    digestButtonReconcileTimer = null;
  }

  const existingNoteButton = document.getElementById("ytd-note-button");
  if (existingNoteButton) existingNoteButton.remove();

  // Reset note button state
  ytdNoteButton = null;
  clearTimeout(ytdNoteButtonTimer);
  ytdNoteButtonTimer = null;
  if (ytdNoteButtonRetryTimer) {
    clearInterval(ytdNoteButtonRetryTimer);
    ytdNoteButtonRetryTimer = null;
  }

  // Remove any toasts
  const existingToast = document.getElementById("ytd-note-toast");
  if (existingToast) existingToast.remove();

  // Re-inject buttons for the new video (with a small delay for YouTube to render)
  setTimeout(() => {
    scheduleDigestButtonReconciliation(0);
    tryInjectNoteButton();
  }, 500);
});

// Loop against media time, with automatic reset on SPA navigation.
let harborLoop = null;
document.addEventListener("yt-navigate-start", () => {
  harborLoop = null;
});
setInterval(() => {
  if (!harborLoop) return;
  if (currentMediaId() !== harborLoop.videoId) {
    harborLoop = null;
    return;
  }
  const video = findMediaElement();
  if (
    video &&
    !video.paused &&
    (video.currentTime >= harborLoop.end ||
      video.currentTime < harborLoop.start - 0.5)
  )
    video.currentTime = harborLoop.start;
}, 100);

// Bilibili and Apple Podcasts are SPAs without a yt-navigate-finish event.
// Poll the URL so media changes still re-trigger button injection and reset
// per-page state.
let harborLastHref = location.href;
setInterval(() => {
  if (location.href === harborLastHref) return;
  harborLastHref = location.href;
  harborLoop = null;
  setTimeout(() => {
    injectDigestButton();
    tryInjectNoteButton();
  }, 600);
}, 800);
