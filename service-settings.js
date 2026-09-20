/* Transcription controls share the existing API-settings save operation. */
(async () => {
  const advanced=document.createElement("details");advanced.className="learning-advanced";
  const summary=document.createElement("summary");summary.textContent="Advanced";advanced.append(summary);
  for(const item of document.querySelectorAll(".customization-card,.data-card"))advanced.append(item);
  document.getElementById("learningModule").append(advanced);
  const config = await chrome.storage.local.get([
    "harbor_services",
    "lens_settings",
  ]);
  const values = {
    transcriptionProvider: "supadata",
    groqApiKey: "",
    groqModel: "whisper-large-v3-turbo",
    localModel: "small.en",
    ...config.harbor_services,
  };
  const $ = (id) => document.getElementById(id);
  $("harbor-auto").checked = config.lens_settings?.autoTranscribe ?? true;
  $("transcriptionProvider").value = values.transcriptionProvider;
  $("groqApiKey").value = values.groqApiKey;
  $("groqModel").value = values.groqModel;
  $("localWhisperModel").value = values.localModel;
  const render = () => {
    const enabled = $("harbor-auto").checked;
    const provider = $("transcriptionProvider").value;
    $("transcriptionChoices").hidden = !enabled;
    $("supadataConfiguration").hidden = enabled && provider !== "supadata";
    $("groqConfiguration").hidden = !enabled || provider !== "groq";
    $("localConfiguration").hidden = !enabled || provider !== "local";
    $("nativeAudioSetup").hidden = !enabled || provider === "supadata";
    $("supadataTranscriptionHint").hidden = !enabled || provider !== "supadata";
    HarborUI?.localize();
  };
  $("harbor-auto").addEventListener("change", render);
  $("transcriptionProvider").addEventListener("change", render);
  render();
  window.HarborServiceSettings = {
    read: () => ({
      transcriptionProvider: $("transcriptionProvider").value,
      groqApiKey: $("groqApiKey").value.trim(),
      groqModel: $("groqModel").value,
      localModel: $("localWhisperModel").value,
    }),
    enabled: () => $("harbor-auto").checked,
  };
  $("checkAudioSetup").addEventListener("click", async () => {
    const button = $("checkAudioSetup");
    button.disabled = true;
    try {
      const status = await harborAudioNative({ action: "audioStatus" });
      const missing = [
        !status.ytdlp && "yt-dlp",
        !status.ffmpeg && "FFmpeg",
        $("transcriptionProvider").value === "local" &&
          !status.whisper &&
          "whisper.cpp",
        $("transcriptionProvider").value === "local" &&
          !status.models.includes($("localWhisperModel").value) &&
          $("localWhisperModel").value,
      ].filter(Boolean);
      $("audioSetupStatus").textContent =
        HarborUI.language === "en"
          ? missing.length
            ? "Missing: " + missing.join(", ")
            : "Ready"
          : missing.length
            ? "待安装：" + missing.join("、")
            : "已就绪";
    } catch (error) {
      $("audioSetupStatus").textContent = HarborUI.text(error.message);
    } finally {
      button.disabled = false;
    }
  });
})().catch(() => {});
