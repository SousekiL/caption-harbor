# Caption Harbor

字幕里的学习港湾。基于 [Zara Zhang 的 YouTube Digest](https://github.com/zarazhangrui/youtube-digest) 改造，保留原项目 MIT 许可与署名。

## 已实现的学习流程

打开 YouTube → 读取字幕或自动转录音频 → 划词解释、理解概念 → 收藏到欧路 → 从原句和视频时间点复习。

- 保留原项目的双语字幕、搜索、章节、引用和笔记。
- 没有原生字幕时自动使用 Supadata 音频转录；设置中可关闭。异步任务保存在本机，重新打开侧栏继续查询。
- 导入 SRT/VTT，不要求 API key；导出 SRT、VTT 和文本字幕。
- 划选后直接收藏，或先查询词义和建议原形；原形可手动改写，短语保持完整。
- 概念解释和例子；可保存为带时间点的概念笔记。
- 连接欧路授权，读取、新建和选择生词本，发送单词及视频原句。收藏先保存本地，失败可手动重试。
- 已收藏词在后续视频中高亮；点击查看历史原句和来源。
- 上一句、暂停/播放、单句循环；侧栏快捷键 Alt+左箭头、Alt+空格、Alt+L（输入框内不触发）。
- 视频问答及追问，回答可跳转到有效时间点；长视频按相关片段和分散抽样处理，并标明未覆盖全文。
- 生成理解自测，答案默认折叠。
- 学习记录保存播放位置、生词数、笔记数；生词导出 CSV/Markdown。

## 安装和设置

1. 下载并解压安装包，或克隆仓库到长期保留的文件夹。
2. 在 Chrome 打开 `chrome://extensions`，开启开发者模式，选择“加载已解压的扩展程序”，选中含 `manifest.json` 的文件夹。
3. 在插件 Settings 中自行填写 Supadata key 和 DeepSeek key。
4. 在“Caption Harbor · 学习设置”中填写[欧路授权](https://my.eudic.net/OpenAPI/Authorization)，连接并选择生词本，然后保存。
5. 打开公开的 YouTube 视频，点击插件图标开始。

升级后需重新加载扩展并刷新 YouTube；不要移动或删除安装文件夹。新学习功能的界面目前为中文。

## 音频转录及同步说明

此版本默认开启自动转录，使用 Supadata 的 `mode=auto`：先查已有字幕，无字幕则由服务端转录音频，不是本机离线转录。已有字幕目前每次 1 credit，音频生成字幕目前每分钟 2 credits，实际以[服务商价格](https://supadata.ai/pricing)为准。长视频可能等待数分钟。未公开、要求登录或正在直播的视频不保证支持。

请求超时不代表服务端取消。插件会保留“不确定”状态，避免默默重复提交。请先核对服务商任务与额度，再在设置中输入视频 ID 重置该任务。

欧路收到词条和原句；完整 AI 解释、多个视频出处及时间链接保存在插件本地。词组能否得到字典释义取决于欧路收录。删除本地记录不会删除欧路中的词；切换默认词本也不会自动搬迁已同步词条。失败记录由你点击重试，不会在关闭浏览器后自动同步。

插件学习记录不跨设备同步，卸载前请导出生词。不要将 key 提交到 GitHub 或发送到聊天中。

## 验证

运行 `npm ci`、`npm test`、`npm run check`、`npm run package` 和 `npm run test:browser`。浏览器测试首次需要 `npx playwright install chromium`。安装包在 `dist/caption-harbor-v2.0.3.zip`。

自动化使用受控字幕、接口和浏览器测试数据；真实视频、账号授权与付费接口需要你填写 key 后进行验收，不应把模拟测试视为真实同步成功。

## 从本机环境配置读取欧路 key（2.0.1）

Chrome 插件无法直接读取系统环境变量，因此使用一个权限范围很小的本机桥接。它优先读取自身进程的 `EUDIC_TOKEN`；未设置时，从 `~/.config/caption-harbor/secrets.env` 加载这一变量。环境文件权限必须为 0600，只允许当前用户读写。它属于应用私有环境配置，不会修改系统全局环境或 shell 启动文件。

在 Chrome 实际加载的扩展文件夹中双击 **Install environment.command**（macOS），或运行 `python3 scripts/install-native-host.py`（macOS/Linux）。在设置中选“本机环境变量（EUDIC_TOKEN）”，检查连接，再读取和选择生词本。key 只在发起欧路请求时经过内存，不存入浏览器、不进入源码和安装包。切换到本机模式并保存会清除之前保存在浏览器中的 Token。

macOS 如果阻止写入 Chrome 配置目录，请在有相应文件访问权限的终端中运行安装器。扩展装在另一文件夹时，需要用其 `chrome://extensions` 页面显示的 ID 运行安装器的 `--extension-id` 参数。Windows 暂时使用手动填写模式。更新插件后需在扩展管理页重新加载，并接受新增的本机通信权限。


BrowserOS 用户可运行 `python3 scripts/install-native-host.py --browser browseros`；BrowserOS neo 使用 `--browser browseros-neo`。双击安装器会优先识别已有的 BrowserOS 配置目录，其次是 Chrome、BrowserOS neo；也可通过 `--profile-dir` 指定目录。


字幕外观：在侧栏展开“字幕外观”，或进入设置页，可选择系统默认、无衬线、衬线和等宽字体，以及 12–32 px 字号。原文和译文同步生效，自动保存，支持恢复默认。
