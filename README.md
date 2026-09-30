# dsh-magic-indicator

给 DeepSeek Harness 的**被动状态指示框**：Agent 需要你开启代理/魔法才能继续时，输入框工具行上会亮起一个黄底黑字的小框「需要魔法支援」；你开好之后它自动熄灭变灰。

框**不可点击、纯展示**，存在的意义是：让"Agent 正卡在网络上等你"这件事**看得见**，而不是它默默失败或默默绕路。

框挂在**输入框左侧工具行的末尾**，与同行其它按钮同尺寸：

```
输入框左侧工具行（示意，其它按钮取决于你自己装了哪些插件）
┌──────────────────────────────────────────────────┐
│  [+]  …你已有的按钮…      [ 需要魔法支援 ]       │
│                              ↑ 黄底黑字 = 它在等你 │
└──────────────────────────────────────────────────┘
```

亮起时是**黄底黑字**，熄灭后同尺寸的框变为**透明底灰字**（不会因为状态切换而位移或抖动）。

> 注：本插件只往这一行**追加**一个格子（`order: 20`），不会替换或影响任何既有按钮。

## 特性

- **被动**：`<span>`，无点击、无焦点、`pointer-events: none`
- **即时**：浏览器每 1.5 秒轮询一次，**无需刷新页面**状态就跟着变
- **零依赖**：不 import 任何 `@deepseek-ai/*` 包，只用了 Node 内置模块，因此不挑 dsh 版本
- **不占位**：与同行其它按钮同尺寸（高 24px、内边距 8px、圆角 6px、字号 11px），两种状态下尺寸一致不抖动
- **两条切换通道**：Agent 工具 + HTTP 接口（下面详述）

## 安装

### 方式一：从 tarball（最简单）

把 `dsh-magic-indicator-<版本>.tgz` 发给对方，然后在 DSH 里：

```
设置 → 插件 → 从本地文件安装 → 选中该 .tgz
```

或命令行：

```sh
dsh plugin --profile <你的profile> add /绝对路径/dsh-magic-indicator-0.1.0.tgz
```

装完**重启 DSH**（宿主半是新的 loader 行，必须重启才加载）。

### 方式二：从 Git 仓库

若已推到仓库：

```sh
dsh plugin --profile <你的profile> add github:<user>/<repo>
```

### 安装后

刷新一次页面，输入框左侧工具行的末尾就会出现那个灰字小框（空闲态）。

## 使用

### 给 Agent 用（推荐）

装上后 Agent 会多出一个工具 `magic_support`：

```
magic_support { action: "on" }      # 需要用户开代理时点亮 —— 必须在开口请求之前
magic_support { action: "off" }     # 用户开好、请求成功之后熄灭
magic_support { action: "status" }  # 读当前状态
```

若宿主没有暴露 `tools` 服务，这个工具会自动不注册（插件其余功能不受影响）。

### 给人用 / 通用兜底（HTTP）

宿主半注册了两个同源接口：

```
GET  /dsh-magic/status                 -> {"active":false,"text":"需要魔法支援"}
POST /dsh-magic/set  {"active":true}   -> 点亮，返回新状态
POST /dsh-magic/set  {"active":false}  -> 熄灭
```

`<端口>` 就是你的 DSH Web 端口（`dsh web` 默认 3080）：

```sh
curl -X POST http://127.0.0.1:3080/dsh-magic/set -H 'content-type: application/json' -d '{"active":true}'
```

想换文案就带上 `text`：`{"active":true,"text":"需要魔法支援"}`。

## 工作原理

```
Agent ──写入──> $DSH_HOME/magic-support.json  {"active":true,"text":"需要魔法支援"}
                        │
        宿主半读文件 ────┘  暴露 GET /dsh-magic/status（同源、无鉴权门槛）
                        │
        浏览器半每 1.5s 轮询 ┘  按 active 渲染黄色或灰色
```

**为什么用状态文件而不是 Host Remote**：写状态的一方是 Agent，它在宿主端只有文件系统能力。文件不需要 schema、不需要代码生成、不需要重启，而且**你可以随时用记事本打开改它**。

状态文件不存在 / 内容损坏 / 是空文件，**一律视为空闲**（不会报错、不会崩溃）。

## 卸载

在插件管理里停用或移除该 bundle，然后删掉状态文件：

```sh
rm "$DSH_HOME/magic-support.json"
```

插件只写了这一个文件，不碰任何其他配置。

## 自测

仓库里的 `test-host.mjs` 是宿主半的独立单测（mock 掉 Cordis context，把 `DSH_HOME` 指向临时目录，不触碰真实状态）。37 项断言覆盖路由、参数校验、坏文件容错、工具注册与降级：

```sh
node test-host.mjs dsh/index.js
```

## 已知边界

- **不内置任何网络能力**：它只是个指示框，不检测你的代理是否可用。"该不该亮"完全由 Agent 决定。
- **端口无需配置**：浏览器半用的是相对路径 `/dsh-magic/status`，跟着当前页面走，换端口/换机器都不用改。
- **`text` 只是文案**：换文案不会改变行为。

## License

MIT
