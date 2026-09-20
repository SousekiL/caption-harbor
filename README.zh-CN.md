# Caption Harbor

基于 [Zara Zhang 的 YouTube Digest](https://github.com/zarazhangrui/youtube-digest) 改造，保留 MIT 许可和署名。

## 2.1 版本

设置分为「字幕与 AI」和「学习设置」。右上角的界面语言统一控制设置页和视频侧栏；原文、中文、双语等字幕内容选项独立保留。

- 已有字幕：先从 YouTube 当前页面读取，不要求 Supadata key；读取不到时，本机 yt-dlp 助手可补充获取。
- 没有字幕：开启自动转录后，选择 Supadata、Groq 或本地 Whisper，再显示对应配置。
- Supadata 是可选的云端备用服务。Groq 填写 API key，并需要本机组件准备视频音频；本地 Whisper 无转录接口费，但占用 CPU/GPU 和内存。
- 保留双语阅读、字幕上方时间戳、搜索、字体和字号、单句循环、问答、自测、笔记、生词本与欧路同步。
- 默认跟随视频跳转，只有手动滚动字幕才暂停跟随。

## 安装与设置

在 BrowserOS 或 Chrome 打开 `chrome://extensions`，开启开发者模式并加载包含 `manifest.json` 的长期保留目录。更新后重新加载扩展并重新打开侧栏。

在「字幕与 AI」配置所选的转录方式及 DeepSeek key。只读字幕不需要 AI key，也不强制填写 Supadata key。「学习设置」保留欧路连接、生词本和字体外观。

本机组件安装（macOS，在插件目录中运行）：

```sh
python3 scripts/setup-audio.py --model small.en
python3 scripts/install-native-host.py --browser browseros
```

只使用 Groq 时将 `--model small.en` 替换为 `--groq-only`。BrowserOS neo 使用 `--browser browseros-neo`，Chrome 使用 `--browser chrome`。安装器不指定浏览器时会识别已有配置目录；自定义安装可传 `--profile-dir` 和 `--extension-id`。

Base.en、Small.en 仅适用于英文，Small 为多语言模型。模型保存在 `~/.config/caption-harbor/models`，不进入仓库或安装包。选择本地 Whisper 后可点“检查本机组件”查看当前是否就绪。

## 限制与费用

YouTube 的页面变化、未加载的标签页或字幕访问限制可能导致直接读取失败，本机工具也不保证能获取每个视频。不伪造访问令牌，不自动导出浏览器账号 Cookie。

本机音频任务支持公开可访问、最长四小时且源文件不超过 500 MB 的视频。Groq 每五分钟上传一段音频并合并时间戳；分段边界可能影响识别。本地 Whisper 在电脑上处理下载后的音频。关闭侧栏后任务可继续，重新打开会查询进度。临时任务在新任务开始时清理超过 24 小时的记录，最多保留十个近期任务。

直接读取字幕和本地转录没有第三方转录费；Supadata、Groq、DeepSeek 分别按自身规则收费。Groq key 保存在浏览器的可信扩展存储，发送到本机任务进程的内存中，不写进音频任务文件。只有选择 Groq 时才向其上传音频。

欧路仍支持手动 Token 或本机环境变量 `EUDIC_TOKEN`，私有环境文件为 `~/.config/caption-harbor/secrets.env`（0600 权限）。不要把密钥写进源代码。

## 验证

运行 `npm test`、`npm run test:native`、`npm run test:browser`、`npm run check` 和 `npm run package`。浏览器测试首次需 `npx playwright install chromium`。

已实测 macOS 本机字幕获取及短音频 Whisper 转录。Groq 的请求和结果处理采用受控接口响应测试，真实账号调用需要填写 Groq key 后验证。安装包为 `dist/caption-harbor-v2.1.0.zip`。
