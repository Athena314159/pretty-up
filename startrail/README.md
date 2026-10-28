# 星迹 4.0

星迹是跑在你自己电脑上的研究工具。它负责翻页、抓取、去重、时间过滤和打分；模型只负责改写查询、判断要不要延伸、反思补搜和写综述。没有模型密钥时，会自动降级成规则模式，检索本身仍然能跑。

当前版本 **4.0.0**。v3.2.0 的技能和规则原样放在 `legacy/v3.2.0/`，没有改写那些检索规则。

网页、本地服务和 MCP 用的是同一套核心。界面是中文。

## 你需要准备什么

- macOS，Node.js 22 或更新版本
- 可选：Docker Desktop，用来启动 SearXNG
- 可选：Playwright Chromium，只用在小红书和抖音

在终端进入本目录：

```sh
cd startrail
node --version
```

核心功能没有第三方 npm 依赖。下面这条用来跑测试：

```sh
npm test
```

## 启动

```sh
npm start
```

浏览器打开 http://127.0.0.1:8877 。服务只听本机。

MCP 给其他 agent 用：

```sh
npm run mcp
```

数据默认写在 `startrail/data/`（可用环境变量 `STARTRAIL_DATA` 改位置）。这个目录不要提交。

## 你需要做的三件事

### 1. 配置模型密钥

默认主模型是 **deepseek-chat**，接口 `https://api.deepseek.com`。备用位留空，不预置一堆模型。

任选一种方式，不要把密钥写进仓库：

```sh
export STARTRAIL_MODEL_API_KEY="你的密钥"
export STARTRAIL_MODEL_BASE_URL="https://api.deepseek.com"
export STARTRAIL_MODEL_NAME="deepseek-chat"
```

备用模型用 `STARTRAIL_BACKUP_MODEL_API_KEY`、`STARTRAIL_BACKUP_MODEL_BASE_URL`、`STARTRAIL_BACKUP_MODEL_NAME`。

也可以复制 `config.example.json` 为 `startrail.local.json` 再填密钥，或在网页「模型与密钥」里保存。网页只会把密钥写到本机的 `startrail.local.json`。环境变量优先于文件。

不填密钥也可以用。这时规划、延伸、反思和综述都走规则。

### 2. 启动 SearXNG

独立网页检索的浏览器侧默认走你自己的 SearXNG，而不是某个官方搜索 API。

```sh
npm run searxng
```

脚本会用 `searxng/docker-compose.yml` 在 http://127.0.0.1:8088 启动。需要本机已经安装 Docker。地址可以用 `STARTRAIL_SEARXNG_URL` 修改，改完请重启星迹。

没启动时，这一路会记为失败并跳过，学术接口和本地索引仍继续。

### 3. 小红书 / 抖音只登录一次

这两处不是爬虫。星迹打开你自己的浏览器，你手动登录，登录态留在本机配置目录里。星迹不询问、不保存密码。

```sh
npm install playwright
npx playwright install chromium
npm run login:xhs
npm run login:douyin
```

登录完成后回到终端按回车。之后在参数里打开「使用小红书」或「使用抖音」。默认是关的。

检索会控制频率：动作之间大约停 8–15 秒，每个平台默认一小时最多 8 次，每次只打开有限几篇原帖。请不要把上限调得很大。

## 怎么用

1. 选工作或学习。工作模式的调研方向是「热点」。学习模式再选「论文/毕设」或「设计作业」。
2. 参数都有中文说明和默认值。抓取上限默认：热点 80，论文/毕设 300，设计作业 200，都可以改。
3. 可以存成预设，先放进队列，以后再执行。
4. 点「生成查询」后，先看改写结果。确认之后才会真正检索。
5. 执行过程中可以关掉页面再打开。任务中断后点「继续」，已抓过的链接不会重抓。
6. 完成后下载资料包。里面有综述、摘抄卡、图片、`bundle.json`、BibTeX，以及给其他工具用的飞书块。

语言默认按使用人数从高到低。系统会按主题加重，例如「西班牙历史」会把西语排到前面。语言权重填 0 表示不搜该语言。

学习模式默认不限制每一层扩多少，由查到的内容决定；深度和广度仍可调。工作模式按你设的广度封顶。

浏览器授权渠道和 API 渠道默认各占一半。合并结果时按相关性排序，不把官方 API 排在前面。

## 检索从哪来

| 渠道 | 作用 | 费用 |
| --- | --- | --- |
| SearXNG | 自建元搜索，算浏览器侧 | 本机计算，无接口费 |
| 网页正文抓取 | 打开结果页，抽正文和原图 | 流量 |
| OpenAlex、Crossref、arXiv | 开放学术接口 | 免费，请配 `STARTRAIL_MAILTO` |
| Semantic Scholar | 开放学术接口 | 免费额度，超限会提示 |
| RSS | 你在配置里填的订阅源 | 免费 |
| 本地 BM25 + 向量 | 已抓资料的再检索 | 无 |
| 小红书、抖音 | 你登录后的浏览器 | 无接口费，受频率限制 |
| 收费检索 | 默认关闭 | 只有免费额度用尽、你打开开关且没超过预算时才调用 |

免费额度用尽时，任务里会写明原因。不打开「允许收费检索」、或预算是 0，就不会去调用收费接口。收费接口地址用 `STARTRAIL_PAID_SEARCH_URL` 和 `STARTRAIL_PAID_API_KEY`，请求带 `q` 参数。

抓到的正文一律当数据，不会当成给你的指令。

## 导出

`bundle.json` 的 `schema` 是 `startrail.bundle`，`schema_version` 是 `4.0.0`。字段说明见 `schema/bundle-4.0.0.json`。

飞书没有默认凭证。资料包里的 `feishu.blocks.json` 就是预留接口；其他 agent 可以用这些块去做飞书文档、PPT 或论文。若设置 `STARTRAIL_FEISHU_WEBHOOK`，导出时会额外尝试推送，失败不影响压缩包。

## 成本

- 规则模式、SearXNG、开放学术接口、RSS、本地索引：不产生模型费用。
- 主模型按你选择的服务计费。deepseek-chat 走按量付费，星迹只在改写、延伸判断、反思和综述时调用，不拿它翻页。
- 收费搜索默认关闭，并用美元预算上限停住。
- 相同请求会进本地缓存，避免重复扣费。
- 学术接口请遵守对方的频率要求；社媒请维持真人节奏。

## 测试和评测

```sh
npm test
npm run eval
```

`eval/cases.json` 是小型回归集，用来看实体延伸、西语加重、摘抄是否逐字、提示注入、额度和收敛。没有密钥时只评规则模式，并给出默认主模型。配好主模型和备用模型后，可以把两边的返回接进 `eval/run.mjs` 的同一套打分再比较。

## 和 3.2 的关系

`legacy/v3.2.0/skill/` 仍是原来的 Codex Skill，L0–L6 规则没改。记忆库协议仍是 `schema_version: 1`，可以用原来的 `memory.py` 导入导出。v4 的网页会实际检索，不再只生成 Prompt。
