# 星迹 · 热点搜索（STARTRAIL）

当前版本：**3.2.0**，更新日期：2026-10-27。

用于工作与学习的证据检索工具，包含网页界面、Codex 技能、研究记忆和回归测试。

## 启动

安装 Python 3 后，在本目录运行 `python3 serve.py`；macOS 也可双击 `启动星迹.command`。访问 http://127.0.0.1:8876/ 。网页负责任务、Prompt、附件和成果管理，实际联网研究由 Codex 执行。

## 技能

将 `startrail-search` 文件夹安装到 Codex 的 skills 目录。中文显示名为“星迹 · 热点搜索”，技术调用名保留 `$startrail-search`，避免破坏已有任务。

## 本版修复

- 全平台原帖全部图片核验、逐图摘录、作品预览与核验截图分开。
- 文献阅读、翻译、校对独立记录；摘要保留图文与因果解释。
- 支持不限时间的历史研究与多语言扩词。
- 旧任务包不能覆盖较新要求，旧核验不能恢复已撤回结论。
- 来源适用性按任务记录，SQLite 来源冲突会回滚。

完整变更与验证结果见 [使用与验证](使用与验证.txt)。

## 验证

需要 Node.js 和 Python 3，在本目录运行：

```sh
node tests/regression.mjs
node tests/legacy-regression.mjs
python3 tests/memory_regression.py
```

发布前以上测试通过。`manifest.json` 可核对原交付包内容。

已有研究记录通过 JSON 导入；不同浏览器来源不自动同步。上传附件的原文件需另行迁移。本目录不包含个人研究数据库或原始对话。
