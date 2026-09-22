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
  $("harbor-original").checked =
    config.lens_settings?.preferOriginalAudio ?? false;
  $("requiredTranscriptLanguage").value =
    config.lens_settings?.requiredTranscriptLanguage ?? "auto";
  $("transcriptionProvider").value = values.transcriptionProvider;
  $("groqApiKey").value = values.groqApiKey;
  $("groqModel").value = values.groqModel;
  $("localWhisperModel").value = values.localModel;
  const render = () => {
    const enabled = $("harbor-auto").checked;
    const provider = $("transcriptionProvider").value;
    $("harbor-original-line").hidden = !enabled;
    $("harbor-original-help").hidden = !enabled;
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
  window.addEventListener("harbor-data-reset", () => {
    $("harbor-auto").checked = true;
    $("harbor-original").checked = false;
    $("requiredTranscriptLanguage").value = "auto";
    $("transcriptionProvider").value = "supadata";
    $("groqApiKey").value = "";
    $("groqModel").value = "whisper-large-v3-turbo";
    $("localWhisperModel").value = "small.en";
    $("audioSetupStatus").textContent = "";
    render();
  });
  window.HarborServiceSettings = {
    read: () => ({
      transcriptionProvider: $("transcriptionProvider").value,
      groqApiKey: $("groqApiKey").value.trim(),
      groqModel: $("groqModel").value,
      localModel: $("localWhisperModel").value,
    }),
    enabled: () => $("harbor-auto").checked,
    originalAudio: () => $("harbor-original").checked,
    requiredLanguage: () => $("requiredTranscriptLanguage").value,
  };
  $("checkLocalCredentials").addEventListener("click", async () => {
    const button = $("checkLocalCredentials");
    button.disabled = true;
    try {
      const status = await harborAudioNative({ action: "credentialsStatus" });
      if (!status.configured || typeof status.configured !== "object") throw new Error("Update the local helper to check API keys.");
      $("localCredentialsStatus").textContent = ["deepseek", "groq"].map(service =>
        `${service === "deepseek" ? "DeepSeek" : "Groq"}: ${HarborUI.text(status.configured[service] ? "Ready" : "Not configured")}`
      ).join(" · ");
    } catch (error) {
      $("localCredentialsStatus").textContent = HarborUI.text(error.message);
    } finally {
      button.disabled = false;
    }
  });
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
