# 字幕小港 · 小红书离线版 1.2.1

Caption Harbor 的独立离线 H5 产物，源码位于 `minitool/`，不会加入桌面扩展安装包。

1.2.1 将页面和上传图标统一为 CH，简化首页、操作提示、空状态和示例解释文案。

## 功能

- 粘贴 SRT、VTT、带时间戳的字幕或普通文本。
- 六句示例字幕带可点击的重点词，以及“查生词含义”和“概念解释”入口。
- 预置离线解释可切换中英文，词义可直接收藏，概念可直接保存为笔记；未收录的导入内容仍使用手动学习流程，不伪装成在线 AI。
- 逐句阅读、搜索、分页及已读标记。
- 生词、手写音标／词性／释义／例句、原句笔记、本地记录和可手动复制的摘录。
- 使用说明提供 Caption Harbor 桌面完整版的 Chrome 应用商店地址；小工具内不打开外链。
- 不联网、不使用 AI 或浏览器扩展 API、不直接读取视频，也不调用欧路。

## 构建和验证

```sh
node --test tests/minitool.test.js
npx playwright test tests/browser/minitool.spec.js
npm run package:minitool
```

输出 `dist/caption-harbor-xiaohongshu-v1.2.1.zip`，根目录只有 `index.html`、`style.css`、`core.js`、`app.js`、`ch.svg`。压缩包不能带外层目录。

按用户提供的 minitool-zip-builder 1.6.0 规范制作：离线资源、经典外置脚本、ES2017、Chrome 61 基线 CSS、无被禁端能力。署名及 MIT 许可在应用“使用说明”中保留。

测试包括严格 CSP 下的交互流程、导入错误、HTML 注入、本地空间不可用及 320/390/768/1100 宽度。静态目录和 ZIP 通过 skill 的审计脚本，无体积警告。测试在现代 Chromium 中运行；正式小红书模拟器、Android 8.1 / WebView 61、iOS 真机和真机性能未实测，平台审核结果未验证。

## 发布信息

名称：字幕小港

简介：粘贴字幕，逐句精读，整理音标、生词与笔记。离线使用，不用配置 API。

建议标题：把字幕变成自己的学习笔记

建议正文：

看完一段视频，有些句子想记住，却常常散落在截图和备忘录里。我把 Caption Harbor 里的精读流程，做成了一个独立的离线小工具：字幕小港。

粘贴 SRT、VTT 或普通文本，就能逐句阅读、搜索、标记已读。遇到想留下的词，补充音标、词性、释义和例句；遇到有感触的句子，保存原句和想法。最后把生词与笔记整理成一份可手动复制的摘录。

桌面浏览器完整版：https://chromewebstore.google.com/detail/caption-harbor/kopjchpnhjdekbjljikkjcebojcalmil

小红书版专注离线精读：不抓取视频、不自动翻译、不调用 AI，也不用填 API key。内容缓存在当前工具里，重要笔记记得手动留存。

适合用自己已有的字幕、课程文字和短文，做一点轻量的阅读积累。

#英语学习 #字幕精读 #学习工具 #阅读笔记 #生词积累
