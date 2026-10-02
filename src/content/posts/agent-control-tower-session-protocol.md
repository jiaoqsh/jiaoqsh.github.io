---
title: "Agent 的塔台：会话协议"
description: "把 Agent 嵌进应用，发出 prompt 只是开始：它还要停下来请求确认，等一个不会马上到来的回答，并在中断后接着做。从一次真实的集成出发，看等待由谁保存，迟到的回答什么时候仍然有效。"
pubDate: 2026-09-28
category: "AI"
tags: ["AI", "Agent", "架构", "协议"]
draft: false
---

[上一篇](/posts/agent-black-box-session-log/)写会话日志。日志记下的，是一次任务做完之后留下的事实。这篇换个角度，看任务进行的过程中，宿主和 Agent 之间怎么对话，也就是它们之间的会话协议。如果说会话日志是黑匣子，宿主就是塔台，会话协议则是双方的通话规程：怎么报告状态，怎么申请许可，中断之后又怎么接着协调。

起因是一次集成。我们把 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（下文简称 dsh）的 SDK 运行时作为子进程，嵌进了自己的应用，用 stdio 上的 JSON-RPC 驱动它。用下来陆续遇到四个问题，都提给了上游。回头整理时发现，这四类需求都能在 LSP 里找到对应的机制。

不过，这次集成真正让我们在意的，不是协议缺了哪几个方法，而是后面一个更难的问题：**某一步没法马上完成时，由谁来等；中断之后，又怎么接着做。**

## 四个问题，都能在 LSP 里找到对应

LSP（Language Server Protocol）是微软在开发 VS Code 时提出的，2016 年和 Red Hat、Codenvy 一起公布为开放协议。它的结构是：编辑器作为客户端，拉起一个语言服务器子进程，两边用 JSON-RPC 通信。宿主拉起一个 Agent 子进程，结构几乎一模一样。

所以，把我们遇到的问题放到 LSP 旁边对照，是很自然的事：

| 遇到的问题 | dsh SDK 协议当时的情况 | LSP 里对应的机制 |
|---|---|---|
| 进程启动后马上发 prompt，第一轮模型拿不到任何 MCP 工具，而且没有任何报错（[#1239](https://github.com/deepseek-ai/deepseek-harness/discussions/1239)） | `initialize` 立即返回，不等插件加载完 | `initialize` 请求加 `initialized` 通知，划出明确的初始化阶段；服务端回复之前，客户端不能发别的请求 |
| 想停下一轮对话，只能杀掉整个进程（[#1238](https://github.com/deepseek-ai/deepseek-harness/discussions/1238)） | 没有取消方法 | `$/cancelRequest`，双方都可以发 |
| stdout 被协议占用，插件报错无处可写（[#1241](https://github.com/deepseek-ai/deepseek-harness/discussions/1241)） | 没有日志通道 | `window/logMessage`：日志本身就是协议里的一种消息 |
| 模型想问用户一个问题，或者请求审批，却传不回宿主（[#4708](https://github.com/deepseek-ai/deepseek-harness/discussions/4708)） | 协议文档写明，服务端向客户端发请求是 "a dead capability" | `window/showMessageRequest`、`workspace/applyEdit` 等：服务端可以反过来向客户端发请求 |

第一个问题后来有了回应。LSP 提供了"先有一个明确的初始化阶段"的先例，dsh 在此基础上又往前走了一步：把 `initialize` 定为 ["runtime-readiness boundary"](https://github.com/deepseek-ai/deepseek-harness/blob/477b4f420553e8a52c2fbccc464d7561b239c443/packages/sdk/server/README.md#L48)，它返回时，首轮需要的插件能力已经加载完成。这是 dsh 自己加的约定，LSP 并没有承诺这一点，它甚至允许服务端在收到 `initialized` 之后再动态注册能力。其余三个问题，到 dsh 0.1.7-rc.2 为止还没有变化。

第一个问题也最值得警惕，因为它的失败方式最隐蔽：**不报错，只是变笨。** 模型不知道自己少了工具，就改用 bash 四处试探。我们在源码模式下一直没遇到它，因为 TypeScript 编译要花 8 秒左右，MCP 工具总能抢先注册完；换成打包好的运行时，1 秒左右就能发出第一个 prompt，于是每次都是 prompt 先到。握手真正的价值，不在于交换一份能力列表，而在于**让双方对"准备好了"有一个明确的约定**。

## 会话协议：越来越像 LSP

只看 dsh，容易以为这是某一个项目的疏漏。把几家放在一起看，趋势就清楚了：**宿主驱动 Agent 的协议，正在一项一项补齐 LSP 已有的机制。**

| | 消息格式 | 握手 | 取消 | 服务端向客户端请求审批 |
|---|---|---|---|---|
| [ACP](https://agentclientprotocol.com/overview/introduction)（Zed） | JSON-RPC | `initialize`，协商双方能力 | `session/cancel` | `session/request_permission` |
| [Codex app-server](https://learn.chatgpt.com/docs/app-server) | JSON-RPC | `initialize` + `initialized` | `turn/interrupt` | 命令执行、文件修改、权限各有一种审批请求 |
| [Claude Code](https://code.claude.com/docs/en/agent-sdk/typescript) 控制协议 | 自定义的 `control_request` 消息 | `initialize` 控制请求 | `interrupt` | `can_use_tool` |
| dsh SDK 协议 | JSON-RPC | `initialize`（已是就绪边界） | 无 | 无 |

ACP 是 Zed 在 2025 年 8 月发布的，[发布文章](https://zed.dev/blog/bring-your-own-agent-to-zed)直接拿 LSP 作类比：

> Just as the Language Server Protocol unbundled language intelligence from monolithic IDEs, our goal with the Agent Client Protocol is to enable you to switch between multiple agents without switching your editor.

[Codex 的文档](https://learn.chatgpt.com/docs/app-server)对审批的描述，几乎就是 LSP 里 `window/showMessageRequest` 的翻版：

> The app-server sends a server-initiated JSON-RPC request to the client, and the client responds with a decision payload.

有个反差出在 dsh 自己身上。dsh 可以把 Codex 当作子代理来用，这时 dsh 是 Codex 的**客户端**，要处理 Codex 发来的五类反向请求：命令审批、文件审批、权限申请、向用户提问、MCP elicitation；没人值守时，一律拒绝。可见 dsh 很清楚这类协议该怎么用，只是它自己对外的协议还没有这个方向。仓库里甚至还有一份[提案](https://github.com/deepseek-ai/deepseek-harness/blob/477b4f420553e8a52c2fbccc464d7561b239c443/.agents/notes/proposed/simplification/2026-09-19-python-sdk-directional-client.md)，要以"没有使用者"为由，删掉 Python 客户端里为反向请求预留的接口。可没有使用者，恰恰是因为服务端从来没发过这种请求。

## 一个不会马上到来的回答

一旦任务需要外部的回答，就会碰到下一个难题：问题发出去了，回答却不一定马上来。

举一个具体的例子：**Agent 准备修改一个文件，需要先得到确认。**

- 对方十秒后就点了"允许"：挂在那里等一会儿就行。
- 对方明天才回来：进程不该一直开着等，得把"待执行的这次修改"存下来，先退出，之后再接着做。
- 对方回来时，文件已经被别人改过了：原来那次确认，还算不算数？

这里说的"对方"，下文也简称"人"，指的是负责回答的一方：可以是坐在屏幕前的人，也可以是对接的审批系统，或者另一个 Agent。它总在客户端那一侧，服务端要问它，都得经过客户端转达。

前两种情况问的是**等待放在哪里**，第三种问的是**恢复时，原来的条件是否还成立**。下面几节都围绕这个例子展开。

## 对照：MCP 正在离开 LSP

在看各种放法之前，先看一个很好的对照组：MCP。它连接的是 Agent 和工具，不是宿主和 Agent；可它同样从 LSP 起步，也同样要解决"反过来问人"的问题，最后却走了相反的方向。

MCP 的规范开头就承认了它和 LSP 的渊源：

> MCP takes some inspiration from the Language Server Protocol, which standardizes how to add support for programming languages across a whole ecosystem of development tools.

早期的 MCP 也确实像 LSP。连接建立时要握手；服务端也可以反过来向客户端发请求，比如 `sampling/createMessage`（请客户端代为调用一次模型）、`roots/list`（询问客户端开放了哪些目录），以及 [2025-06-18 版](https://modelcontextprotocol.io/specification/2025-06-18/client/elicitation)新增的 `elicitation/create`（请客户端向用户要一些信息，用户可以接受、拒绝或者取消）。

到了 2026-07-28 版，这些都被拆掉了。[changelog](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2026-07-28/changelog.mdx) 里有这样两条：

> Make MCP stateless: remove the `initialize`/`notifications/initialized` handshake. Every request now carries its protocol version and client capabilities in `_meta`.

> Multi Round-Trip Requests (MRTR) pattern introduced which replaces the previous approach of sending server-initiated requests, such as `roots/list`, `sampling/createMessage`, or `elicitation/create`.

新的做法叫 [MRTR](https://modelcontextprotocol.io/specification/2026-07-28/basic/patterns/mrtr)（Multi Round-Trip Requests，多轮往返请求）。服务端需要向用户要信息时，不再反过来发请求，而是先给这次请求一个响应：一个"需要输入"的结果，里面带着要问的问题，还可以附上一段只有服务端自己看得懂的 `requestState`。客户端去问用户，拿到答案后，带上答案和原样的 `requestState`，用一个新的请求把原来的操作**再发一次**。

要注意，这时第一次请求已经有了响应，但原来要做的事还没有做完。"这次 RPC 结束了"和"这件事完成了"，在 MRTR 里是两回事。

规范给出的理由很直接：

> provides a standardized way to handle these server-requests without requiring a shared storage layer across server instances or requiring stateful load balancing.

背后的原因不难理解。MCP 服务端越来越多是跑在负载均衡后面的远程服务。挂着一个反向请求，就意味着这条连接、这个实例必须一直活着，还要记得自己在等什么。一对一的本地子进程做到这一点毫不费力；一组随时扩缩容的远程实例，做起来就很麻烦。

"无状态"也不等于服务端什么都不记。[规范](https://modelcontextprotocol.io/specification/2026-07-28/basic#statelessness)要求的是：需要跨越多个请求的状态，比如长时间运行的任务，必须由客户端在每次请求里用一个明确的标识去引用，而不是靠"还是这条连接"来默认。

## 等待放在哪一端

回到那个改文件的例子。把会话协议和 MCP 的做法放在一起，等待大致有三种放法：

| 等待由什么承载 | 典型做法 | 进程或连接断了之后 |
|---|---|---|
| 进程里挂着的请求 | 发出请求后，用回调或 Future 等回答 | 如果没有额外的恢复机制，没法凭原来的请求接着做 |
| 持久化的会话或任务记录 | 把待执行的动作存下来，进程先退出 | 凭会话或任务的标识恢复，接着做 |
| 交给客户端带回的状态 | 服务端把"从哪里接着做"交给客户端，随下一次请求带回 | 服务端根据新请求重建上下文 |

对应到前面几家：ACP、Codex app-server 的审批请求和 Claude Code 的 `can_use_tool` 回调，默认是第一种；Claude Code 的 `defer` 是第二种；MCP 的 MRTR 是第三种。

十秒后就有回答，第一种最简单；明天才有回答，就得用后两种。

这里其实有两件相互独立的事：**谁可以主动开口**，以及**等待由什么承载**。反向请求可以配合持久化的任务，无状态的协议也可以去引用服务端保存的状态。本文说的"形状"，指的就是这两件事的组合。

形状没有高下之分。本地子进程通常更容易维持短期的等待；远程的多实例服务，更要考虑下一次请求会落到别的实例上，所以 MCP 选择把状态交出去。**部署的形状，会影响协议的形状。** 但无论部署在哪里，等待一旦超过执行环境能可靠维持的时间，就需要明确的恢复机制，这一点最后一节再说。

我们在 #4708 里给 dsh 的建议，也可以放到这张表里看。dsh 后来做了一版"限时提问"：用户迟迟不答，就先给模型返回"待定"，让它继续干别的；等用户之后回答了，再把回答作为一条新消息送回会话。这版实现第一次合入当天就被撤回，9 月 28 日又重新合入，目前需要在预设里手动开启（`mode: timed`）。有了它，对通过 SDK 嵌入的宿主来说，提问这一侧只差一个从客户端发往服务端的"回答"方法，不再需要反向请求。

它和 MRTR 都避免了把等待一直挂在原来的请求上，但并不相同。MRTR 让客户端带着答案把原操作再发一次，答案对应的是哪个操作，一清二楚；迟到的答案作为一条新消息进入会话，就还得说清它回答的是哪个问题，以及模型在"待定"期间做出的决定，要不要重新检查。

## 提问和审批：都能晚到

提问和审批看起来都是"问人"，其实承载的是两种东西：一个是信息，一个是授权。

两者都可以异步完成，区别在等待期间能做什么。信息还没补齐时，Agent 有时可以先去做不依赖它的工作；授权还没拿到时，对应的那个动作必须保持未执行。**审批可以晚到，但必须准确对应那个待执行的动作。**

这正是例子里第三种情况的难处：明天回来点"允许"时，文件已经变了，这次批准还适用吗？Claude Code 的 `defer` 给了一个具体的做法。按它的[文档](https://code.claude.com/docs/en/hooks#defer-a-tool-call-for-later)，被搁置的工具调用连同参数保存在会话记录里；恢复会话时，"The same tool call fires PreToolUse again"。也就是说，恢复时决策点会重新执行一遍，原来的条件是否还成立，可以在这里重新检查。

落到这个例子上，可以这样做：保存待审批的修改时，一并记下文件的版本或内容摘要；恢复时如果发现文件已经变了，就重新生成差异，再判断要不要重新确认。只有在恢复时重新走一遍检查点，才有机会发现原来的批准已经不适用于眼前的修改。

MRTR 把恢复所需的上下文交给客户端带着，于是还要多操一份心：带回来的东西可能被改过，也可能被重复使用。规范对 `requestState` 的要求是分层的。它本身是可选的；一旦它影响授权、资源访问或业务逻辑，服务端就必须保护它的完整性：

> If `requestState` influences authorization, resource access, or business logic, servers **MUST** protect its integrity (e.g. HMAC or AEAD)

为了防重放，规范建议在其中写入身份、有效期和原始请求的摘要，但也明确提醒，这些措施只能缩小重放的范围，"do not by themselves guarantee single-use"。如果某个状态只能被消费一次，就必须在服务端保证。

换句话说，**恢复所需的上下文经过别人之手，服务端就得按它的用途去验证：涉及授权的要防篡改，涉及一次性操作的还要在服务端防重放。**

## 不回答，也是一种回答

协议一旦能问人，就要面对下一个问题：人一直不回答怎么办？

各家的规定差别很大：

- **LSP**：整份规范里找不到"超时"这个词。它要求被取消的请求也必须回一个响应，不能一直挂着；可如果对方始终不回，规范没有说该怎么办。
- **MCP**：[规定](https://modelcontextprotocol.io/specification/2026-07-28/basic/patterns/cancellation)得最明确。所有发出的请求都应该设置超时，超时后取消请求、不再等待；具体怎么取消看传输方式，stdio 发送取消通知，Streamable HTTP 直接关闭这次请求的 SSE 响应流。收到进度通知时可以重新计时，但仍然要有一个最长时限。
- **ACP**：规定客户端取消一轮对话时，要把所有还没答复的审批请求都答复为 `cancelled`；但对一直没人点的情况，没有规定超时。
- **Claude Code**：SDK [文档](https://code.claude.com/docs/en/agent-sdk/user-input)直接写明："The callback can stay pending indefinitely. Execution remains paused until your callback returns."

这并不只是纸面上的问题。dsh 的 ACP 桥接就收到过一份社区报告（[#4693](https://github.com/deepseek-ai/deepseek-harness/discussions/4693)）：客户端实现了审批方法，却一直没有应答，于是这一轮对话永远挂住，表现为 "`session/prompt` never returns, with no error and nothing in the log"。又是一次不报错的失败。

说到超时，其实有三种期限，需要分开管理：一次 RPC 等响应的时限，人给出答复的期限，以及那个待执行动作本身的有效期。MRTR 返回"需要输入"之后，RPC 已经有了响应，人却可能还在考虑，这时就不能拿一个超时概括全部。

超时之后怎么处理也有讲究。对提问，超时可以理解为人暂时不在，Agent 先去做别的；对审批，**超时不能产生授权**。它可以被记为过期、取消，或者继续待审，但这都和人明确点了"拒绝"不是一回事。

## 人离这条连接有多远

回头看 LSP，它的服务端其实很少需要问人。`window/showMessageRequest` 在 LSP 里只是个边角功能，语言服务器绝大多数时候都在回答编辑器的提问。

Agent 的会话协议不一样，**问人恰恰是它最核心的部分**。执行前请求审批，卡住时向人提问，动手前让人确认方案，这些都是 Agent 把控制权交还给人的时刻。一个只能"发 prompt、收事件"的协议，默认了人把任务交出去之后就离开了。要让人留在回路里，宿主必须能知道 Agent 正在等什么，并把答案准确交回对应的任务。反向请求只是做到这一点的一种方式，MRTR 或者"事件加答复接口"也都可以。

回答的一方在客户端那一侧，这一点没有悬念。真正在变的，是它离这条连接有多远。有时人就坐在编辑器前，几秒钟就能点下"允许"；有时要几个小时后才回来；有时回答的是一套审批系统，要走完自己的流程；还有时客户端本身就是另一个 Agent，比如 dsh 把 Codex 当子代理用时，替 Codex 回答审批的就是 dsh，它按自己的策略一律拒绝，真正的人还在更远的一层。

距离一远，即使是本地的会话协议，等待也不适合一直挂在连接上。Claude Code 的文档就建议：如果回答可能比进程能撑的时间还久，就别在回调里干等，而是用前面说的 `defer` 先退出，之后再从持久化的会话里恢复。所以，等待怎么放，要看回答要等多久、执行环境能活多久，以及恢复时原来的条件是否还成立。

[上一篇](/posts/agent-black-box-session-log/)说，会话日志记下过去发生了什么；到这里，它还可以保存未来还没做完的事。会话协议要约定的，则是另外几件事：等待期间什么能继续，中断之后怎么恢复，迟到的回答什么时候仍然有效。
