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

**第 1 步：下载**

点这个链接就会开始下载（7.6 KB）：

**[⬇ 下载 dsh-magic-indicator-0.1.0.tgz](https://github.com/a1109283205-glitch/dsh-magic-indicator/releases/download/v0.1.0/dsh-magic-indicator-0.1.0.tgz)**

如果没反应，就去 **[Release 页面](https://github.com/a1109283205-glitch/dsh-magic-indicator/releases/tag/v0.1.0)** 在下面的 Assets 里点那个 `.tgz`。

**第 2 步：让 DSH 装它**

把下载到的文件交给 DSH —— 拖进对话框，或者告诉它文件放在哪 —— 然后说一句：

```
装这个文件
```

**第 3 步：重启**

重启一次 DSH，刷新页面，输入框工具行就会出现那个灰色小框。

> 为什么不用「把链接粘给 DSH 让它自己下」？因为 DSH 自己的下载通道**不读系统代理**，在需要代理的网络下会失败（报 `fetch failed`）。用浏览器下载走的是系统代理，所以先下好、再装本地文件最稳。
>
> 习惯命令行的话：`dsh plugin --profile desktop add <文件完整路径>`，`desktop` 换成你的 profile 名（看 `C:\Users\<你的用户名>\.dsh\profiles\` 下有哪些文件夹）。

## 卸载

在插件管理里停用或移除它，然后删掉状态文件：

```sh
rm "$DSH_HOME/magic-support.json"
```

插件只写这一个文件，不改任何其他配置。

## 说明

- 装上后 Agent 会多出一个工具 `magic_support`，由它决定什么时候亮、什么时候灭
- **零依赖** —— 不 import 任何 `@deepseek-ai/*`，只用 Node 内置模块，不挑 dsh 版本
- 状态存在 `$DSH_HOME/magic-support.json`，浏览器半每 1.5 秒读一次，**无需刷新**
- 状态文件不存在 / 损坏 / 为空 → 一律视为空闲，不报错
- 它**不检测**你的代理是否可用 —— "该不该亮"完全由 Agent 决定
- 宿主半有独立单测（`test-host.mjs`，43 项断言）

## License

MIT
