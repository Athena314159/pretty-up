# 星迹 · 热点搜索 3.2.1

2026-10-28 本地修订，基于 GitHub 下载的 3.2.0。2026-10-29 已同步到本仓库目录「星迹热点搜索」。大图媒体未入库，换设备需另行携带 library/media。未替换全局已安装技能。

## 启动与查看

Windows 双击“启动星迹.bat”，macOS 使用“启动星迹.command”（需要 Python 3）。默认访问 http://127.0.0.1:8876/ 。顶部“资源库”查看分类记录与本批图册。

离线查看 [50款人物拼图图册](library/collage/batches/2026-10-28-person-collage/gallery.html)。参考图、来源、逐图判定和排除记录都在同一批次目录。50款来自14帖，小红书10款、Lemon8 40款。

## 新增工作规则

- 已查、排除和交付均压缩回存，保留快照和seen标记。
- 跨平台、跨地区采集，未知信息不推断。
- 拼图、美妆、模板、其他分类隔离。
- 拼图必须人物出镜且有设计；非人物、无装饰四/九宫格和基础纯拼接拉黑。
- 单次20—100款，默认50款。

详细规则见 [工作资源规则](startrail-search/references/work-resource-policy.md)。

## 换设备与回退

复制整个工具（包含library）可携带图片、台账与快照；也可在资源库导入最新ledger.json.gz再合并增量。仅台账导出不含图片。大图媒体未入库，换设备需另行携带 library/media。没有自动云同步；未交换记录的离线设备无法互相知晓最新结果。回退保留之后新增的seen历史。

## 已知范围

已对照716条历史来源和200张可获取历史图；部分旧候选缺图，不能保证识别所有跨作者同款。早期作品标为常青参考，34款地区未知。图册包含参考预览，不包含付费或可编辑模板源文件。

## 验证

工作规则和资源库回归、原有工作学习与记忆回归均通过；全部50张参考图可解码（该结论来自含媒体的本地包）；分类隔离和图册筛选实测通过。技能官方校验器缺PyYAML，采用简单结构/引用路径检查。详细记录见 [使用与验证](使用与验证.txt) 和 [验收报告](validation-report.json)。manifest.json记录已入库文件校验值；未入库大图的SHA256在omitted_media。

可重跑：node tests/regression.mjs、node tests/legacy-regression.mjs、node tests/resources-regression.mjs、python tests/library-regression.py、python tests/memory_regression.py。
