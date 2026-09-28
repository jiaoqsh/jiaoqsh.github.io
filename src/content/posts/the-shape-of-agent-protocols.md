---
title: "Agent 协议的形状：等待放在哪一端"
description: "把 Agent 运行时嵌进自己的应用，踩到的坑 LSP 当年都遇到过。但 Agent 协议没有简单地重走 LSP 的路：会话协议越来越像 LSP，工具协议 MCP 却在离开它。分岔的关键是，一个抛给人的问题，等待由哪一端保管；而这取决于部署的形状，也取决于人离这条连接有多远。"
pubDate: 2026-09-28
category: "AI"
tags: ["AI", "Agent", "架构", "协议"]
draft: false
---

[上一篇](/posts/agent-black-box-session-log/)写会话日志。日志记下的，是一次任务做完之后留下的事实。这篇换个角度，看任务进行的过程中，宿主和 Agent 之间怎么对话，也就是它们之间的协议。

起因是一次集成。我们把 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（下文简称 dsh）的 SDK 运行时作为子进程，嵌进了自己的应用，用 stdio 上的 JSON-RPC 驱动它。用下来陆续遇到四个问题，都提给了上游。后来回头整理，发现这四个问题一点都不新：**LSP 当年都遇到过，也都给出了答案。**

## 四个问题，LSP 都答过

LSP（Language Server Protocol）是微软在开发 VS Code 时提出的，2016 年和 Red Hat、Codenvy 一起公布为开放协议。它的结构是：编辑器作为客户端，拉起一个语言服务器子进程，两边用 JSON-RPC 通信。宿主拉起一个 Agent 子进程，结构几乎一模一样。

所以，把我们遇到的问题放到 LSP 旁边对照，是很自然的事：

| 遇到的问题 | dsh SDK 协议当时的情况 | LSP 的做法 |
|---|---|---|
| 进程启动后马上发 prompt，第一轮模型拿不到任何 MCP 工具，而且没有任何报错（[#1239](https://github.com/deepseek-ai/deepseek-harness/discussions/1239)） | `initialize` 立即返回，不等插件加载完 | 用 `initialize` 请求加 `initialized` 通知完成握手；服务端回复之前，客户端不能发别的请求 |
| 想停下一轮对话，只能杀掉整个进程（[#1238](https://github.com/deepseek-ai/deepseek-harness/discussions/1238)） | 没有取消方法 | `$/cancelRequest`，双方都可以发 |
| stdout 被协议占用，插件报错无处可写（[#1241](https://github.com/deepseek-ai/deepseek-harness/discussions/1241)） | 没有日志通道 | `window/logMessage`：日志本身就是协议里的一种消息 |
| 模型想问用户一个问题，或者请求审批，却传不回宿主（[#4708](https://github.com/deepseek-ai/deepseek-harness/discussions/4708)） | 协议文档写明，服务端向客户端发请求是 "a dead capability" | `window/showMessageRequest`、`workspace/applyEdit` 等：服务端可以反过来向客户端发请求 |

第一个问题后来有了回应：dsh 把 `initialize` 定为 ["runtime-readiness boundary"](https://github.com/deepseek-ai/deepseek-harness/blob/477b4f420553e8a52c2fbccc464d7561b239c443/packages/sdk/server/README.md#L48)，等所有插件加载稳定后才回复。这正是 LSP 握手的用意。其余三个，到 0.1.7-rc.2 为止还没有变化。

第一个问题也最值得警惕，因为它的失败方式最隐蔽：**不报错，只是变笨。** 模型不知道自己少了工具，就改用 bash 四处试探。我们在源码模式下一直没遇到它，因为 TypeScript 编译要花 8 秒左右，MCP 工具总能抢先注册完；换成打包好的运行时，1 秒左右就能发出第一个 prompt，于是每次都是 prompt 先到。握手真正的价值，不在于交换一份能力列表，而在于**给"准备好了"定一个明确的时刻**。

## 会话协议：越来越像 LSP

只看 dsh，容易以为这是某一个项目的疏漏。把几家放在一起看，趋势就清楚了：**宿主驱动 Agent 的协议，正在一项一项补齐 LSP 已有的机制。**

| | 握手 | 取消 | 服务端向客户端请求审批 |
|---|---|---|---|
| [ACP](https://agentclientprotocol.com/overview/introduction)（Zed） | `initialize`，协商双方能力 | `session/cancel` | `session/request_permission` |
| [Codex app-server](https://learn.chatgpt.com/docs/app-server) | `initialize` + `initialized` | `turn/interrupt` | 命令执行、文件修改、权限各有一种审批请求 |
| [Claude Code](https://code.claude.com/docs/en/agent-sdk/typescript) 控制协议 | `initialize` 控制请求 | `interrupt` | `control_request`（`can_use_tool`） |
| dsh SDK 协议 | `initialize`（已是就绪边界） | 无 | 无 |

ACP 是 Zed 在 2025 年 8 月发布的，发布时就直接拿 LSP 作类比：

> Just as the Language Server Protocol unbundled language intelligence from monolithic IDEs, our goal with the Agent Client Protocol is to enable you to switch between multiple agents without switching your editor.

Codex 文档对审批的描述，几乎就是 LSP 里 `window/showMessageRequest` 的翻版：

> The app-server sends a server-initiated JSON-RPC request to the client, and the client responds with a decision payload.

有个反差出在 dsh 自己身上。dsh 可以把 Codex 当作子代理来用，这时 dsh 是 Codex 的**客户端**，要处理 Codex 发来的五类反向请求：命令审批、文件审批、权限申请、向用户提问、MCP elicitation；没人值守时，一律拒绝。可见 dsh 很清楚这类协议该怎么用，只是它自己对外的协议还没有这个方向。仓库里甚至还有一份[提案](https://github.com/deepseek-ai/deepseek-harness/blob/477b4f420553e8a52c2fbccc464d7561b239c443/.agents/notes/proposed/simplification/2026-09-19-python-sdk-directional-client.md)，要以"没有使用者"为由，删掉 Python 客户端里为反向请求预留的接口。可没有使用者，恰恰是因为服务端从来没发过这种请求。

## 工具协议：正在离开 LSP

如果故事到这里结束，结论会很简单：Agent 协议在重新发明 LSP。但 MCP 走了相反的方向。

MCP 的规范开头就承认了它和 LSP 的渊源：

> MCP takes some inspiration from the Language Server Protocol, which standardizes how to add support for programming languages across a whole ecosystem of development tools.

早期的 MCP 也确实像 LSP。连接建立时要握手；服务端也可以反过来向客户端发请求，比如 `sampling/createMessage`（请客户端代为调用一次模型）、`roots/list`（询问客户端开放了哪些目录），以及 [2025-06-18 版](https://modelcontextprotocol.io/specification/2025-06-18/client/elicitation)新增的 `elicitation/create`（请客户端向用户要一些信息，用户可以接受、拒绝或者取消）。

到了 2026-07-28 版，这些都被拆掉了。[changelog](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2026-07-28/changelog.mdx) 里有这样两条：

> Make MCP stateless: remove the `initialize`/`notifications/initialized` handshake. Every request now carries its protocol version and client capabilities in `_meta`.

> Multi Round-Trip Requests (MRTR) pattern introduced which replaces the previous approach of sending server-initiated requests, such as `roots/list`, `sampling/createMessage`, or `elicitation/create`.

新的做法叫 MRTR（Multi Round-Trip Requests，多轮往返请求）。服务端需要向用户要信息时，不再反过来发请求，而是**先把这次请求结束掉**，返回一个"需要输入"的结果。结果里带着要问的问题，和一个只有服务端自己看得懂的 `requestState`。客户端去问用户，拿到答案后，带上答案和原样的 `requestState`，把原来的请求**重新发一次**。

规范给出的理由很直接：

> provides a standardized way to handle these server-requests without requiring a shared storage layer across server instances or requiring stateful load balancing.

背后的原因不难理解。MCP 服务端越来越多是跑在负载均衡后面的远程服务。挂着一个反向请求，就意味着这条连接、这个实例必须一直活着，还要记得自己在等什么。一对一的本地子进程做到这一点毫不费力；一组随时扩缩容的远程实例，做起来就很麻烦。

## 等待放在哪一端

把两条路放在一起，分岔点只有一个：**一个抛给人的问题，由哪一端来保管这份等待。**

- **LSP、ACP、Codex 和 Claude Code**：服务端发出请求后，就停在那里等回答，等待的状态保存在这条连接里。好处是代码写起来很自然，问完再往下走；代价是连接和进程都得一直活着。
- **MCP 2026**：服务端把"我在等什么、等到之后从哪里接着做"打包成一个令牌，交给客户端保管，自己什么都不记。这是 REST 无状态原则的老思路：每个请求都自带处理它所需要的全部信息。它也很像编程语言里的 continuation：把"接下来要做的事"当成一个值交出去。

两种做法没有高下之分，取决于连接是什么样子。会话协议几乎都是一个宿主拉起一个本地子进程，状态放在连接上最便宜；工具协议面对的是需要横向扩展的远程服务，状态放在服务端最昂贵。**协议的形状，是由部署的形状决定的。**

除了部署，还有一个因素：人回来得有多快。即使是本地的会话协议，等待也未必适合一直挂在连接上。Claude Code 的 SDK 文档在说完回调可以无限期挂起之后，紧接着给了另一条路：

> If a user might take longer to respond than your process can reasonably stay running, register a PreToolUse hook that returns the defer decision instead of waiting in the callback, so the process can exit and resume later from the persisted session.

人可能要几个小时后才回来，那就不让进程干等：先把这次工具调用搁置，进程退出，等人回来之后，再从持久化的会话里恢复。等待从连接上挪了出来，落进了[上一篇](/posts/agent-black-box-session-log/)写的那份会话日志里。

这个区分对设计很有用。回头看，我们在 #4708 里给 dsh 的建议，正好一半落在这条线的一边，一半落在另一边。

dsh 曾经设计过一版"限时提问"：用户迟迟不答，就先给模型返回"待定"；等用户之后回答了，再把回答作为一条新消息送回去。可惜这版实现合入当天就被撤回了。要是它落地，嵌入方只需要一个从客户端发往服务端的"回答"方法，完全不需要反向请求，形状和 MRTR 如出一辙。

审批却不能这样处理。一次审批批准的是"现在执行这一个动作"，必须当场、针对这一个动作给出，不能变成一条事后补上的消息。

MRTR 规范在这一点上考虑得很细。既然"从哪里接着做"交给了客户端，服务端就必须把拿回来的 `requestState` 当作不可信的输入：

> If `requestState` influences authorization, resource access, or business logic, servers **MUST** protect its integrity (e.g. HMAC or AEAD)

规范还要求防止重放，必要时保证同一个 `requestState` 只能用一次。**等待一旦交给别人保管，授权就必须变成一次性的、防篡改的令牌。** 这和 Web 上的 CSRF token、OAuth 的 state 参数，是同一类问题。

## 不回答，也是一种回答

协议一旦能问人，就要面对下一个问题：人一直不回答怎么办？

各家的答案差别很大：

- **LSP**：整份规范里找不到"超时"这个词。它要求被取消的请求也必须回一个响应，不能一直挂着；可如果对方始终不回，规范没有说该怎么办。
- **MCP**：说得最明确。所有发出的请求都应该设置超时，超时后发送取消通知，不再等待；收到进度通知时可以重新计时，但仍然要有一个最长时限。
- **ACP**：规定客户端取消一轮对话时，要把所有还没答复的审批请求都答复为 `cancelled`；但对一直没人点的情况，没有规定超时。
- **Claude Code**：SDK 文档直接写明："The callback can stay pending indefinitely. Execution remains paused until your callback returns."

这并不只是纸面上的问题。dsh 的 ACP 桥接就收到过一份社区报告（[#4693](https://github.com/deepseek-ai/deepseek-harness/discussions/4693)）：客户端实现了审批方法，却一直没有应答，于是这一轮对话永远挂住，表现为 "`session/prompt` never returns, with no error and nothing in the log"。又是一次不报错的失败。

超时怎么处理也有讲究。对提问，超时可以理解为用户暂时不在，Agent 可以先去做别的；对审批，超时只能理解为拒绝，**绝不能当作默许**。这又回到了前面那条线：提问和审批看起来都是"问人"，承载的却是两种不同的东西，一个是信息，一个是授权。

## 人离这条连接有多远

回头看 LSP，它的服务端其实很少需要问人。`window/showMessageRequest` 在 LSP 里只是个边角功能，语言服务器绝大多数时候都在回答编辑器的提问。

Agent 协议不一样，**问人恰恰是它最核心的部分**。执行前请求审批，卡住时向人提问，动手前让人确认方案，这些都是 Agent 把控制权交还给人的时刻。一个只能"发 prompt、收事件"的协议，默认了人把任务交出去之后就离开了；要让人留在回路里，协议就得能反过来问人。

这里说的"人"，其实是负责回答的那一方：可以是坐在屏幕前的人，也可以是对接的审批系统，或者另一个 Agent。它在协议的哪一端，没有悬念：在客户端那一侧，服务端要问它，都得经过客户端转达。真正在变的，是它离这条连接有多远。有时人就坐在编辑器前，几秒钟就能点下"允许"；有时要几个小时后才回来；有时回答的是一套审批系统，要走完自己的流程；还有时客户端本身就是另一个 Agent，比如 dsh 把 Codex 当子代理用时，替 Codex 回答审批的就是 dsh，它按自己的策略一律拒绝，真正的人还在更远的一层。

人离得越远、回来得越慢，等待就越不该挂在一条活着的连接上。LSP 的这些机制，是在编辑器和语言服务器多年的磨合中一点点稳定下来的，通用的进度机制直到 3.15 版才加入。Agent 协议正在用更短的时间走这段路，而且已经分成了两条。设计自己的 Agent 协议时，最先要问的也许不是"要不要支持审批"，而是：**人离这条连接有多远，等待该放在哪一端。**
