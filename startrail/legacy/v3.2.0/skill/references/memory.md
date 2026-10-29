# L0 持久研究记忆
默认数据库：`~/Documents/Codex/research-memory/startrail.sqlite3`。如用户指定存储位置则使用其位置。只有用户授权范围内的研究资料进入记忆，不保存登录凭证。未知历史不能推造。

使用本技能目录内`scripts/memory.py`，Python标准库即可：
- `python3 scripts/memory.py init`
- `python3 scripts/memory.py search '主题词'`
- `python3 scripts/memory.py import /absolute/bundle.json`
- `python3 scripts/memory.py export /absolute/bundle.json`
- 测试或独立任务库用`--db /absolute/path.sqlite3`放在子命令之前。

JSON协议：`schema_version:1`；数组tasks、sources、searches、observations、deliveries。每条必须有id。
任务：topic、mode、focus、created_at、brief。搜索：task_id、query、platform、start、end、status、searched_at；状态planned/opened/completed/failed/partial，不把opened算completed。
来源：url、title、platform、published_at、captured_at、verification(lead/verified/unavailable)、task_ids、case_id、trend_id、summary。脚本去跟踪参数按URL归并；同帖不同URL需人工核对平台ID，不盲目合并不同款式。
快照：source_id、observed_at(ISO含时区)、metrics(数值或null)、method、window；只追加，不覆盖。任务交付：task_id、source_id、case_id、delivered_at、decision及理由。

研究前：查来源和任务 → 判断覆盖/时效 → 复用、刷新、新搜。搜索指纹需包含关键词、平台、语言、筛选、时段；失败不算覆盖；新时段采用少量重叠并去重，以免漏延迟索引。
工作模式还记录发现入口、作者/关系路径、媒体读取状态与分层覆盖；可选字段见work-discovery.md。已搜某词不代表作者流或相关作品已检查。新增嵌套路径数组由执行者合并后导入，避免普通覆盖更新丢失旧路径。
重点趋势执行时刷新超过24小时的指标，普通候选3—7天检查，稳定事实复用并在正式交付前复核关键来源。这是启发式，不是后台计划。
只把最新一次任务相关结论作为分析线索，原始证据可共享；某任务排除不能全局屏蔽。保留日期、来源、版本与限制。任务删除默认不删共享来源，删除共享来源需明确意图。

网页使用当前浏览器localStorage，Codex使用SQLite，两者没有隐含同步。通过同协议JSON显式导入导出。网页规划/打开搜索不是实际抓取记录；网页新增来源默认lead。证据核验必须真实完成后才能标verified。

## 修订与撤回（3.2.0）
全局来源真实性核验更新用 verification_updated_at（ISO含时区）；较新的核验可把verified撤回lead/unavailable，旧导入不得恢复旧状态。同一来源在不同任务的适用性用task_reviews，以task_id为键，值含decision(accepted/rejected/needs_review)、reason、updated_at；任务排除不更改全局真实性。最新用户纠偏先更新该任务判定，再复用来源。
纠偏后的任务及results必须带updated_at；旧任务包不得覆盖较新的任务要求。没有时间或适用性记录的旧资料保留作待核验，不推造新核验时间。
