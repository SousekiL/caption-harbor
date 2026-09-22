/* Caption Harbor personal settings stay in trusted local extension storage. */
(async () => {
  const root = document.createElement("section");
  root.className = "lens-settings";
  root.innerHTML = `<h3>Eudic</h3>
  <label>欧路授权来源 <select id="harbor-source"><option value="environment">本机环境变量（EUDIC_TOKEN）</option><option value="manual">手动填写</option></select></label>
  <p>本机模式通过已安装的本机桥接读取，不会把 Token 保存进浏览器。<span id="harbor-environment-status"></span></p>
  <button id="harbor-environment" type="button">检查本机环境配置</button>
  <label>欧路授权 Token <input id="harbor-token" type="password" autocomplete="off" placeholder="填写你的欧路授权信息"></label>
  <p><a href="https://my.eudic.net/OpenAPI/Authorization" target="_blank" rel="noreferrer">获取欧路授权</a> · Token 仅保存在本机，不发送给 AI。</p>
  <button id="harbor-connect" type="button">保存并读取生词本</button>
  <label>默认生词本 <select id="harbor-category"><option value="0">默认生词本</option></select></label>
  <label>新生词本名称 <input id="harbor-new" placeholder="YouTube"></label><button id="harbor-create" type="button">新建生词本</button>
  <button id="harbor-save" type="button">保存学习设置</button>
  <details id="audioTaskControls" class="audio-task-controls"><summary>转录任务</summary><p>超时不代表服务端取消。请先核对服务商任务与额度；重置后重新请求可能产生额外费用。</p>
  <label>需要重置的视频 ID <input id="harbor-video-id" placeholder="如 Nhmyrh9I_bA、bili_BV…_1 或 apple_…_…"></label>
  <button id="harbor-reset" type="button">重置该视频转录任务</button></details><p id="harbor-status" role="status"></p>`;
  (
    document.getElementById("learningContent") ||
    document.querySelector("main") ||
    document.body
  ).append(root);
  document
    .querySelector("#settingsForm .form-actions")
    .before(document.getElementById("audioTaskControls"));
  const $ = (id) => document.getElementById(`harbor-${id}`);
  const config = {
    autoTranscribe: true,
    categoryId: "0",
    ...(await chrome.storage.local.get("lens_settings")).lens_settings,
  };

  $("token").value = config.eudicToken || "";
  $("source").value =
    config.credentialSource || (config.eudicToken ? "manual" : "environment");
  const updateSource = () => {
    $("token").disabled = $("source").value === "environment";
  };
  $("source").addEventListener("change", updateSource);
  updateSource();
  if (config.categoryId && config.categoryId !== "0")
    $("category").add(
      new Option(config.categoryName || config.categoryId, config.categoryId),
    );
  $("category").value = config.categoryId || "0";
  window.addEventListener("harbor-data-reset", () => {
    $("token").value = "";
    $("source").value = "environment";
    $("category").replaceChildren(new Option("默认生词本", "0"));
    $("new").value = "";
    $("video-id").value = "";
    $("status").textContent = "";
    $("environment-status").textContent = "";
    updateSource();
    HarborUI?.localize();
  });
  async function save() {
    await chrome.storage.local.set({
      lens_settings: {
        ...(await chrome.storage.local.get("lens_settings")).lens_settings,
        eudicToken:
          $("source").value === "manual" ? $("token").value.trim() : "",
        credentialSource: $("source").value,
        categoryId: $("category").value,
        categoryName: $("category").selectedOptions[0]?.textContent || "",
      },
    });
  }
  const run = (id, fn) =>
    $(id).addEventListener("click", async () => {
      $(id).disabled = true;
      try {
        await fn();
      } catch (e) {
        $("status").textContent = e.message;
      } finally {
        $(id).disabled = false;
      }
    });
  async function categories() {
    const res = await chrome.runtime.sendMessage({ action: "lensCategories" });
    if (!res.success) throw new Error(res.error);
    const previous = $("category").value;
    $("category").replaceChildren(new Option("默认生词本", "0"));
    for (const c of res.data)
      if (String(c.id) !== "0")
        $("category").add(new Option(c.name, String(c.id)));
    $("category").value = [...$("category").options].some(
      (o) => o.value === previous,
    )
      ? previous
      : "0";
    $("status").textContent = "已连接欧路，请选择目标生词本并保存。";
  }
  run("environment", async () => {
    const result = await chrome.runtime.sendMessage({
      action: "lensEnvironmentStatus",
    });
    if (!result.success) throw new Error(result.error);
    $("environment-status").textContent =
      "已找到本机 EUDIC_TOKEN（不显示内容）。";
  });
  run("connect", async () => {
    await save();
    await categories();
  });
  run("save", async () => {
    await save();
    $("status").textContent = "学习设置已保存";
  });
  run("create", async () => {
    const name = $("new").value.trim();
    if (!name) throw new Error("请输入名称");
    await save();
    const res = await chrome.runtime.sendMessage({
      action: "lensCreateCategory",
      name,
    });
    if (!res.success) throw new Error(res.error);
    await categories();
    const option = [...$("category").options].find(
      (o) => o.textContent === name,
    );
    if (option) $("category").value = option.value;
    await save();
    $("status").textContent = "已创建并选中新生词本";
  });
  run("reset", async () => {
    const id = $("video-id").value.trim();
    HarborSites.mediaUrl(id);
    if (
      !confirm(
        HarborUI.text("确认已核对服务端任务？重置后重新请求可能再次收费。"),
      )
    )
      return;
    await chrome.storage.local.remove([
      `lens_job_${id}`,
      `harbor_caption_${id}`,
      `harbor_audio_${id}_groq`,
      `harbor_audio_${id}_local`,
    ]);
    $("status").textContent = "任务已重置，重新打开视频即可重试";
  });
})().catch(() => {});
