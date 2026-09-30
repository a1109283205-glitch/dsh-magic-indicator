# dsh-magic-indicator

给 DeepSeek Harness 的**状态指示框**：Agent 卡在境外资源上、需要你开代理时，输入框工具行会亮起一个黄底黑字的小框「需要魔法支援」；你开好后它自动变灰。

不可点击，纯展示 —— 让"Agent 正卡在网络上等你"这件事**看得见**，而不是它默默失败或默默绕路。

```
框挂在输入框左侧工具行的末尾：
┌────────────────────────────┐
│  [ 需要魔法支援 ]           │
│      ↑ 黄底黑字 = 它在等你 .│
└────────────────────────────┘
```

## 安装

```sh
dsh plugin --profile <你的profile> add github:a1109283205-glitch/dsh-magic-indicator
```

然后**重启 DSH**，刷新页面。

## 使用

装上后 Agent 会多出一个工具：

```
magic_support { action: "on" }      # 需要你开代理时点亮
magic_support { action: "off" }     # 你开好之后熄灭
magic_support { action: "status" }  # 读当前状态
```

没有这个工具时也可以走 HTTP（`<端口>` = 你的 DSH Web 端口，`dsh web` 默认 3080）：

```sh
curl -X POST http://127.0.0.1:<端口>/dsh-magic/set -H 'content-type: application/json' -d '{"active":true}'
```

## 卸载

停用或移除该插件，然后删掉状态文件：

```sh
rm "$DSH_HOME/magic-support.json"
```

插件只写这一个文件，不改任何其他配置。

## 说明

- **零依赖** —— 不 import 任何 `@deepseek-ai/*`，只用 Node 内置模块，不挑 dsh 版本
- 状态存在 `$DSH_HOME/magic-support.json`，宿主半经 `GET /dsh-magic/status` 暴露，浏览器半每 1.5 秒轮询一次，**无需刷新**
- 状态文件不存在 / 损坏 / 为空 → 一律视为空闲，不报错
- 它**不检测**你的代理是否可用 —— "该不该亮"完全由 Agent 决定
- 宿主没有 `tools` 服务时，Agent 工具自动不注册，插件其余功能不受影响
- 宿主半有独立单测（`test-host.mjs`，43 项断言）

## License

MIT
