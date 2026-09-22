# Caption Harbor 2.1.6 完整版

2.1.6 新增：设置 → 学习设置 → 查词与解释，选择“纯英文解释”或“中文解释（英文辅助）”，自动保存。

这是完整功能安装包。保留字幕阅读、翻译、概览、划词解释、生词、欧路同步、笔记、问答、学习记录和可选音频转录功能；没有附带任何人的密钥、浏览器资料或学习记录。

## 首次安装

1. 解压 ZIP，将整个文件夹放到长期保留的位置。
2. Chrome / BrowserOS 打开 `chrome://extensions`；Edge 打开 `edge://extensions`。
3. 开启开发者模式，选择“加载已解压的扩展程序”，选中直接包含 `manifest.json` 的文件夹。
4. 打开 YouTube 视频、Bilibili 视频或 Apple Podcasts 的具体节目页面，点击扩展图标打开侧栏。
5. 先测试读取已有字幕、搜索和点击字幕跳转，再按需开启下方服务。

不是手机插件；Safari 和 Firefox 不支持本包。本次自动化浏览器测试使用桌面 Chromium。

## 从旧版升级

为了保留原有扩展身份、密钥和学习记录，请先备份原插件目录，再把本包文件覆盖到**原来的插件目录**；不要先卸载扩展，也不要点“重置扩展数据”。在扩展管理页重新加载插件，刷新视频页后再打开侧栏。

如果另外加载到新目录，浏览器可能把它识别为另一扩展，旧记录不会自动迁移。

**从 2.1.5 升级到 2.1.6 无需重装助手；更早版本首次升级到修复版时，要重新运行助手安装命令。** 助手代码是复制安装的，仅重新加载浏览器扩展不会更新它；已有模型和私有配置可保留。

## 按需配置

| 使用方式 | 需要什么 |
| --- | --- |
| 读取页面可用字幕、搜索、跳转、原句笔记、本地生词 | 无需 AI 密钥；字幕取决于视频能否读取 |
| 翻译、概览、解释、问答、AI 整理笔记 | 在设置页填写自己的 DeepSeek API key |
| Supadata 字幕／云端转录 | 自己的 Supadata key 和额度 |
| Groq 转录 | 自己的 Groq key、本机助手、yt-dlp、FFmpeg |
| 本地 Whisper 转录 | 本机助手、yt-dlp、FFmpeg、whisper.cpp 及模型 |
| 欧路同步 | 自己的欧路授权；手动输入可不装环境桥接 |

所有密钥都直接填写在插件设置里。没有附赠 API 额度或托管服务，选择的云端服务可能收费。Apple Podcasts 应打开具体单集；部分单集需要音频转录。网络、站点限制和第三方服务状态仍可能影响获取。

## 本机助手：macOS / Linux

在本插件文件夹的终端里运行与浏览器匹配的命令：

```sh
# Chrome
python3 scripts/install-native-host.py --browser chrome
# Edge
python3 scripts/install-native-host.py --browser edge
# BrowserOS
python3 scripts/install-native-host.py --browser browseros
# BrowserOS neo
python3 scripts/install-native-host.py --browser browseros-neo
```

只执行你实际使用的那一条即可。若加载的扩展 ID 与安装器推导结果不一致，可添加 `--extension-id` 并填写扩展管理页显示的 ID。

如果 macOS 已安装 Homebrew，需要补音频组件时运行：

```sh
# 本地英文转录：同时准备所需组件和 small.en 模型
python3 scripts/setup-audio.py --model small.en
# 或仅为 Groq 准备音频组件
python3 scripts/setup-audio.py --groq-only
```

`small.en` 只适合英文；多语言选 `small`。模型不在此 ZIP 内，首次安装需要下载并占用磁盘空间。Windows 可用基本浏览器功能，但本包不提供 Windows 本机助手安装器。Linux 音频依赖需自行安装；自动依赖安装脚本使用 macOS Homebrew。

完成后，在设置页选择转录方式，点击“检查本机组件”，再保存设置。若已有模型，不需要重复执行模型安装。

## 遇到问题

- 无字幕：先确认视频可访问，按“重新载入字幕”；需要时配置一种转录方式。
- 助手未就绪：核对安装命令里的浏览器和实际扩展 ID，重新安装助手。
- 字幕不跟随：手动滚动会暂停跟随，点击“跟随播放”恢复。
- 转录结果不明确：插件会阻止自动重复提交；先检查任务状态，再决定是否重置。
- AI／欧路失败：检查对应密钥和服务额度；本地收藏失败重试前不会丢失。

完整功能与数据流见 README.zh-CN.md、PRIVACY.md 和 SECURITY.md。
