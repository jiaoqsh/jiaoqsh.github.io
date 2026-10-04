---
title: "Agent 的改装：扩展机制"
description: "Claude Code 发布 mods 的第二天，DeepSeek Harness 就合入了一个兼容层。事件和 API 大多能一一对上，搬不过去的几处却很说明问题：权限检查的先后，改写模型已经说出的参数，把一次调用重跑一遍。从这些差异看扩展机制的边界：改动发生在记录之前还是之后，改完之后哪一份算数。"
pubDate: 2026-10-04
category: "AI"
tags: ["AI", "Agent", "架构", "插件"]
draft: false
---

[黑匣子](/posts/agent-black-box-session-log/)那篇写会话日志，[塔台](/posts/agent-control-tower-session-protocol/)那篇写会话协议。这篇接着说第三件事：谁能改动一个 Agent 的行为，改动之后又怎么算数。

起因是两件前后脚发生的事。10 月 1 日，Anthropic 发了一篇 [Getting started with Claude Code mods](https://claude.dev/blog/getting-started-with-claude-code-mods/)，介绍 Claude Code 新的扩展机制 mods。第二天，[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（下文简称 dsh）就合入了一个实验性的兼容层，10 月 3 日随 0.2.1-alpha.1 发布。发布说明写得很克制：

> 目前阶段的主要目的是验证 Claude Code Mods API 功能大致为 DeepSeek Harness 插件的一个子集，而非为用户提供实际的完整兼容性。

一天就能搬过来，说明两边的扩展模型很接近。可兼容层附带的[差异文档](https://github.com/deepseek-ai/deepseek-harness/blob/5badb15009ae1756c3afe0ae0cef1faafc290ccc/docs/subsystems/claude-code-mods.md)里，有几处"不支持"不是没来得及做，而是现在的流程接不住。这篇想讨论的就是这几处：**同样是中间件链，为什么有的改写可以搬，有的不能搬？**

本文对照的是 Claude Code mods 的官方文档（mods 需要 v2.1.287 及以上）和 dsh 0.2.1-alpha.1 的源码（commit `5badb15009`）。两边都还在快速变化，下文的结论只对这两个版本负责。

## Mods 是什么

按[官方文档](https://code.claude.com/docs/en/plugins/mods/overview)的说法，mod 是一个 JavaScript 或 TypeScript 模块。它导出一个 `register(on, options)`，用 `on` 订阅事件。每个事件处理函数拿到三个参数：

- `$`：宿主提供的 API，读文件、跑进程、画界面、调模型都通过它。
- `e`：事件本身，是被深度冻结的纯数据。想改，只能复制一份交下去。
- `next`：链上的下一个处理者，最末端是 Claude Code 自己的行为。

同一个事件的处理函数串成一条中间件链。一个处理函数可以做三件事：

| 做法 | 写法 | 效果 |
|---|---|---|
| 观察 | `return next(e)` 或 `await next(e)` 之后再看结果 | 不改变任何东西 |
| 改写 | `next({ ...e, text })` | 后面的处理者和 Claude Code 只看到改过的版本 |
| 回答 | 不调 `next`，直接返回 `{ deny }` 或 `{ result }` | 后面的处理者和 Claude Code 本身的行为都不再执行 |

这套模型并不新。Koa 的洋葱模型、Emacs 的 `:around` advice，都是"包住原来的行为，自己决定要不要调用它"。新的地方在于它包住的对象：工具调用、提交的提示、发给模型的每一次请求，甚至界面上的每一个渲染位置。

还有一点值得注意。Claude Code 自己的一些功能就是 mod：加载 `AGENTS.md`、`/diff` 面板、企业策略守卫 `sec-default`、遥测上报。**宿主用自己开放的扩展点来构建自己。** 这是 Emacs 和 VS Code 走过的路，也是 dsh 一开始就选的路：它自称 all-plugin harness，主循环之外的能力几乎都是插件。

所以兼容层要做的事，本质上是把一种插件模型翻译成另一种。

## 事件对得上，顺序未必对得上

先看能对上的部分。大部分事件都能在 dsh 里找到出处：

| Mods 事件 | dsh 里的来源 |
|---|---|
| `session.start` / `session.end` | 根 agent 的 `agent/created` / `agent/disposed` |
| `prompt.submit`、`turn.start` | `agent/pre-step`，在用户消息写进日志之前 |
| `tool.call` | 包在 `tools/execute` 外面，在宿主的权限判定之后 |
| `turn.complete` | 会话事件 `turn/end` |
| `command.run` | 命令注册表 |

`$` 上的方法也大多落在现成的服务上：`$.tool.register` 落到工具注册表，`$.ui.ask` 落到向用户提问的服务，`$.store` 落到一个独立的存储域，`$.process.run` 落到子进程管理。dsh 自己的扩展点本来也是中间件链，`tools/execute` 的监听者必须调用 `next()` 才能把调用交下去。两边形状一样，所以大部分翻译很直接。

Anthropic 博客里的三个示例都能跑：Token Weather 在输入框上方画上下文占用；Blast Radius 拦住危险命令，等人按"继续"或"取消"；Replay Theater 记下本轮的编辑，逐个回放差异。Token Weather 的模块、类型和测试都是原样搬过来的；后两个博客里只给了片段，兼容层按文中的描述补全后跑通。

但表里 `tool.call` 那一行藏着一个重要的差别。两边的执行顺序是这样的：

```text
Claude Code：mod 的 tool.call → 权限检查 → 工具执行
dsh 兼容层：宿主权限判定 → mod 的 tool.call → 工具执行
```

在 Claude Code 里，mod 先看到调用，权限检查看到的是 mod 交下去的版本。在 dsh 里，权限已经判定完了，mod 看到的是一个已经获准的调用。它可以进一步拦下这个调用，却没法推翻之前的拒绝。Claude Code 还有一个专门的 `tool.check` 事件，让 mod 参与权限决定本身；dsh 的兼容层没有触发它。

所以同一个 Blast Radius，搬到 dsh 里之后，"危险命令要不要确认"这件事发生的位置变了。**事件名对得上，执行顺序和权限语义未必对得上。** 这比 API 能否一一对应更值得注意。

## 三种"不支持"

差异文档列了很多不支持的地方。归一下类，大致是三种：

| 类别 | 例子 | 性质 |
|---|---|---|
| 还没做 | 侧边面板、热键、`$.model`、`$.settings`、大部分界面事件 | 工作量问题，以后可以补 |
| 环境不同 | 界面在另一个进程；没有企业托管的层级 | 部署方式决定，换一种实现就行 |
| 需要先补齐一致性机制 | 改写已记录的参数、把调用改道到别的工具；由 mod 把下游再跑一遍 | 当前的扩展点接不住，要先有更早的改写阶段，或者明确的更正记录 |

前两类任何移植都会有。第三类才说明两个系统的流程不同，下面两节分别看。

顺带一提，Anthropic 官方仓库里的四个内置 mod，`diff`、`agents-md`、`sec-default`、`telemetry`，通过当前的兼容层都不能完整运行。这个结论来自兼容文档对它们源码的评估，没有实际运行。缺的主要是前两类：面板、设置、遥测、托管层级，以及 `agents-md` 依赖的 `prompt.context`、`agent.spawn` 两个事件。

## 改写模型已经说出的话

Mods 文档说，`tool.call` 的处理函数可以改参数：

> To change a call, pass changed arguments to `next`.

比如把 `rm -rf build` 改成 `rm -rf ./build`，或者把一次调用转给另一个工具。

dsh 的兼容层目前拒绝这两种改写。处理函数如果把不同的参数交给 `next`，或者换了工具名，这个处理函数会被跳过，并留下一条报告。源码里的注释只有一句：

> The call is logged before policy runs, so the arguments a hook passes down must be the logged ones.

意思是：轮到这条链运行的时候，这次调用已经记进日志了。

为什么在 dsh 里，参数这么早就落了日志？因为工具调用的参数，是**模型说出的话**。模型的回复里包含"我要调用某个工具，参数是什么"，这条回复作为 `assistant/message` 写进日志，之后才开始执行工具。dsh 有一份还在提案阶段的[设计笔记](https://github.com/deepseek-ai/deepseek-harness/blob/5badb15009ae1756c3afe0ae0cef1faafc290ccc/.agents/notes/proposed/feature/2026-06-30-pre-tool-input-rewrite.md)，专门讨论怎么支持参数改写。它指出，在执行之前，至少有三方已经读过这份参数：

| 读者 | 读的是什么 | 只改执行参数的后果 |
|---|---|---|
| 模型的历史 | `assistant/message` 里模型发出的调用 | 下一轮模型以为自己执行了原来的命令 |
| 审计记录 | `tool/call` 事件 | 日志说执行了 A，实际执行了 B |
| 界面 | 根据 `tool/call` 的参数渲染卡片 | 界面显示一条命令，实际跑的是另一条 |

所以 dsh 拒绝的不是参数改写本身，而是**只改执行参数**这种做法。提案给出的方向是：在调用的身份确定之前就选出有效参数，同时更新这三方，并在审计记录里保留原始参数。还有一个悬而未决的问题：把改写后的参数写回模型的历史，等于改了模型说过的话。有没有哪家模型服务在回放历史时会因此出错，要先实测才知道。另一个办法是不改历史，追加一条更正。

对照一下，同一个兼容层允许另外两种改写：

- `prompt.submit` 改写用户输入。它发生在 `agent/pre-step`，用户消息还没写进日志。
- 工具执行完之后替换结果。它发生在 `tools/post-execute`，`tool/result` 还没写进日志。

三处放在一起，在当前的 dsh 流程里，规则很清楚：**提交之前可以加工，提交之后需要显式更正。**

Claude Code 也有提交之前的加工入口。它提供了一个 `session.append` 事件，在会话的每一行存下来之前触发，处理函数可以改写这一行的内容。这和上面的规则并不矛盾，只是入口更多、更靠前。两边真正的区别，在于工具参数提交的时点：dsh 在模型回复结束时就把参数记下了，之后才轮到扩展；Claude Code 在 mod 处理完之后才做权限检查和执行。至于 Claude Code 在参数被改写之后，会话记录里存的是哪一份，文档没有说明，这里不做推断。

## 把下游再跑一遍

第二处差异更小。Mods 文档说，处理函数可以多次调用 `next`：

> To retry a call, call `next(e)` again: a hook that sees `isError` on the first result can run the tool a second time and return that result.

dsh 的兼容层里，一个处理函数的 `next` 只会让下游执行一次，第二次调用直接拿到第一次的结果。差异文档给的理由是：

> One tool execution per logged call

能确认的事实只有这一条：**兼容层不允许 mod 通过重复调用 `next` 重放下游。** 它不代表 dsh 整体上"一条记录对应一次执行"。dsh 自己的 `tools/execute` 层就允许插件包住执行过程，做超时或重试。

为什么兼容层要收紧这一处？下面是我的理解，不是文档的说法：重试的风险在于副作用。对 `ls` 来说跑两遍无所谓，对写文件、发请求、扣费就不是了。工具自己的重试逻辑，至少有机会知道这个工具能不能安全重跑；一个随手写的 mod 未必知道。

而且就算下游只调度一次，外部副作用也不保证恰好发生一次。工具内部的重试、请求超时后状态不明，都是另外的问题。一次执行中的每一次尝试和它们的副作用怎么记录，dsh 也还需要单独设计。

## 界面在另一个进程里

第三处差异来自部署方式，属于"环境不同"那一类，简单说一下。

dsh 的宿主和界面是分开的进程，Web 界面甚至可能在另一台机器上。兼容层只实现了输入框上方的那条带，做法是：宿主运行处理函数，把返回的元素树校验后序列化，推给界面；按钮的回调留在宿主里，界面只拿到一个"动作编号"。用户按下按钮，界面把编号连同它看到的那一版画面的版本号一起发回去；如果画面已经更新过，这次点击就被忽略。

这是远程界面的经典做法：界面是数据，回调变成消息。侧边面板、热键、输入框这些交互更密集的部分，差异文档列为后续工作。

## 谁来管住扩展

最后看信任。两边都说自己没有安全沙箱，但提供的约束并不相同。

Claude Code 给 mod 的运行环境是隔离过的。Anthropic 的博客写道：

> The module runs in a sandbox of its own, with no DOM and no Node, so everything outside it goes through `$`.

加载时还有一道静态检查：每次调用都要写成 `$.命名空间.方法` 的完整形式，不能把 `$` 赋给变量，事件名必须是字面量，只能从插件目录里按相对路径导入。正因为如此，`claude plugin validate` 能在安装之前列出一个 mod 订阅了哪些事件、调用了哪些方法。

但这不等于安全沙箱。官方文档同样写明：mod 以你的身份运行，通过 `$` 能读写文件、启动进程、访问网络，还能在你被问到之前就批准一次工具调用；它启动的进程也不受 Bash 沙箱的约束。也就是说，**直接能做什么被限制了，通过 `$` 能做什么没有被限制。**

Claude Code 管住扩展的另一个办法，是把策略本身也做成 mod。企业可以把自己的守卫放在链的最外层；守卫可以在别的 mod 加载时拒绝它（`plugin.register`），也可以在构建它的 `$` 时拿掉某些能力（`engine.create`）。链上越靠外，越早看到事件，也越晚看到结果。

dsh 的兼容层则明确开放了 Node 的全局对象：

> The hooks module runs in-process with Node's globals, no access rule, and the process's full authority

这里也没有层级，所有 mod 都按用户级加载。文档的建议很朴素：只挂载你愿意当插件运行的 mod。这和 dsh 对待普通插件的方式一致，兼容层没有为 mod 另立一套规矩。

## 还没解决的问题

回到发布说明里的那句话。"Mods API 大致是 dsh 插件的子集"，准确的意思是：**在扩展点的层面基本是子集，在执行顺序和记录方式上有差别。** Mods 能做的事，dsh 的插件大多也能做；但有几种做法，要等 dsh 先回答"改完之后怎么记"。

由此留下两个问题。

**改写怎么变成一条记录过的事实。** 改不改模型的历史，是参数改写最难的部分。改了，模型看到的是它没说过的话；不改，模型以为执行的是原来的命令；追加一条更正，又要决定模型该怎么理解它。还有权限：改写之后的调用，要不要重新走一遍权限判定？dsh 的提案把这一条列为待解决。

**跨宿主的扩展有没有标准。** dsh 的兼容层是一个适配器，翻译的是 Claude Code 的私有接口。[塔台](/posts/agent-control-tower-session-protocol/)那篇说，会话协议在向 LSP 靠拢。扩展机制会不会也出现一个大家共用的规范？从这次移植看，事件和 API 能对上的部分已经不少；对不上的，恰恰是执行顺序和记录方式这类不写在接口里的东西。

## 一点思考

中间件链是老东西。几十年来，Web 框架、编辑器、浏览器都在用它，"观察、改写、回答"三种做法也早就有了名字。

Agent 让这件老东西多了一层分量：被改写的对象，很多同时是模型看到的历史。改一个提示，改的是用户说的话；改一个工具参数，改的是模型说的话。扩展点开放得越多，越需要先回答一个问题：**改完之后，哪一份算数？**

这个问题的答案不在扩展接口里，而在宿主怎样把原始意图、有效调用、权限决定和执行结果记成彼此一致的事实。会话日志决定了什么是事实，会话协议决定了等待和恢复怎么进行，扩展机制决定了谁能改动、改动怎么算数。三件事最后落在同一个地方：先有一份可信的记录，扩展才有边界。
