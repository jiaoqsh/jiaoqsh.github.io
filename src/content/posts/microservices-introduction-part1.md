---
title: "Microservices Introduction - part1"
description: "在开始描述microservice前，我们先看一下什么是monolithic架构。即将一个应用系统按照垂直分层设计开发后构建打包为一个应用部"
pubDate: 2015-01-30
category: "Architecture"
tags: ["microservices"]
archived: true
---
## what are monolithic?

在开始描述microservice前，我们先看一下什么是[monolithic架构](http://microservices.io/patterns/monolithic.html)。即将一个应用系统按照垂直分层设计开发后构建打包为一个应用部署包，比如java平台的war包。

对于简单的应用或网站早期monolithic架构有许多优势，比如：

> -   开发简单：很容易使用IDEs或其他工具开发一个应用
> -   部署简单：只需将一个部署包（\*.war/ear）部署到运行时容器（web容器如：tomcat）
> -   扩展简单：拷贝多份部署包到多台机器前置负载均衡器即可实现

但是随着网站的高速发展，一个庞大的monolithic架构系统将带来许多问题。比如：

> -   开发人员不能容易理解和维护，需要对这个庞大的系统要有全面认知，不易快速上手开发，修改将变的困难。显然重构也将是一件很困难的事情
> -   快速部署上线将不再容易，构建、打包这个庞大的应用系统将变的复杂和耗时，需要协调许多开发人员和增加测试周期长
> -   新技术或更合理的技术引入将变得很困难

## what are microservices?

为了避免上述问题提出了[microservices架构](http://microservices.io/patterns/microservices.html)。可以看出这种架构思想与Unix的KISS原则是一致的。应用系统分解为一系列的服务，每个服务专注于自身的业务职责，足够的轻量。每个服务独立部署和扩展，可以选用不同的技术栈和数据存储，可以由不同的团队开发管理。

microservices架构的优势是：

> -   每一个服务足够小。有利于开发人员快速理解，同时web容器可以快速启动，有利于开发人员开发、构建、部署应用
> -   每一个服务可以单独部署，可以频繁快速上线新版本
> -   提升故障隔离，方便服务降级
> -   可以灵活的选取更合理的技术，避免长期对单一技术栈的依赖

相比monolithic架构，采用microservices架构的劣势是：

> -   创建一个分布式系统的额外复杂度
> 
> > -   需要更好的IDEs或其他工具支持开发、构建、打包应用
> > -   测试将变得更加困难
> > -   开发人员必须选取合适的服务间通信机制，实现分布式事务处理
> > -   不同服务之间的调用需要更多的资源协调
> 
> -   在生产环境部署的复杂度
> -   服务划分的挑战

对于大型应用系统，microservices架构的优势远大于劣势。许多大型网站如Taobao、Netflix、Amazon、eBay都已从monolithic架构演变为microservices架构。

## characteristics of a microservice architecture

### 1\. 服务化的组件

Microservice架构也使用类库,但是他们组件化的主要方式是将软件分解成服务。我们说的类库化组件指链接到一个程序，使用内存中的函数调用,而服务化组件指进程外通信机制,比如web服务请求，或远程过程调用。(这是一个不同的概念)

使用服务化组件的一个主要原因(而不是类库)是服务独立部署。如果有一个应用程序,包含多个类库在一个单一的进程中,改变任何单个组件将导致不得不重新部署整个应用程序。但是如果应用程序分解为多个服务,你只能期待许多单个服务的变化需要重新部署该服务。这不是绝对的，一些变化会改变服务接口导致一些协调处理，但一个好的microservice架构的目的是最小化这些通过高内聚服务边界和演化机制在服务契约中。

使用服务化组件的另一个原因是拥有一个更明晰的组件接口。大多数语言没有一个好的机制来定义一个显式的 [Published Interface](http://martinfowler.com/bliki/PublishedInterface.html)。通常只有文档和约定防止客户打破组件的封装，导致过度聚集组件之间的耦合。服务更容易避免通过使用显式的远程调用机制。

使用这样的服务化组件也有缺点。比起进程间调用远程调用更加昂贵，因此远程 API 需要粗粒度的，但这通常是不好把控的。

### 2\. 围绕业务能力

microservice划分服务围绕业务能力。这样的服务需要完整的实现软件业务领域,包括用户界面、持久化存储，以及外部调用。因此需要跨职能团队，包括所需的全套技能发展：用户体验，数据库，和项目管理。

以这种方式组织的一个公司是[www.comparethemarket.com](http://www.comparethemarket.com/)。跨职能团队负责建造和运营每个产品，每个产品划分为多个服务，服务间通过消息总线通信。

### 3\. 产品而不是项目

大多数应用程序开发使用项目模型，完成项目任务后即被视为完成。在完成软件后移交给维护人员，同时项目团队解散重组开始新的任务。

Microservice支持者倾向于避免这种模式，而是认为一个团队应该拥有一个产品的完成生命周期。正如Amazon描述的"[you build, you run it](https://queue.acm.org/detail.cfm?id=1142065)"。

### 4\. smart endpoints and dumb pipes

在构建不同进程之间的通信机制时，我们看到了许多产品和方法，主要在处理通信机制本身。比如企业服务总线(ESB)，ESB产品通常包括消息路由的转发，编码，转换和应用业务规则。

microservice社区则支持另一种方法：smart endpoints 和 dumb pipes。应用程序由microservices组成旨在尽可能实现高内聚低耦合，他们拥有自己的领域逻辑，接收到一个请求时经过应用程序业务逻辑处理生成一个响应。通过精心设计使用简单RESTish协议而不是复杂的协议如WS-Choreography、BPEL。

最常使用的两种协议是：使用资源描述API的HTTP请求响应和轻量级消息协议。

### 5\. 多样的数据管理

Microservices喜欢让每个服务管理其自己的数据库,相同的数据库的不同实例,或者完全不同的数据库系统——这被称为 [Polyglot Persistence](http://martinfowler.com/bliki/PolyglotPersistence.html)。您可以在monolith中使用Polyglot Persistence,但似乎在microservices中更常用。

分散的数据更新管理在microservices中有一定的意义。在monolith中常见的方法是使用事务处理更新，更新多个资源时保证一致性。

使用事务有助于一致性,但需要提升耦合性,这对多服务是有问题的。分布式事务的实现是比较有难度的，因此microservice架构强调服务之间的transactionless，并明确说明可能只是最终一致性或一致性问题是由补偿处理来操作。

选择以这种方式来管理不一致对于许多开发团队是一个新的挑战，但这是一个经常与业务匹配的实践。通常业务处理一定程度的不一致性，以快速响应需求，同时拥有某种回溯过程来处理错误。如果在一致性上修复错误的成本小于失去业务的成本这样做的代价是值得的。

### 6\. 故障转移设计

服务可能在任何时候失败,重要的是能够及时探测到故障,如果可能的话,自动恢复服务。Microservice应用程序把重点放在应用程序的实时监控，检查架构元素(每秒多少次请求数据库)和业务相关的度量指标(比如每分钟接受的订单个数)。监控系统提供预警,触发开发团队跟进排查问题。

Microservice团队希望看到为每个单独的服务做完善的监控和日志记录，如用 dashboards 显示向上/向下状态和各种操作与业务相关的度量指标，以及我们常见的服务链路状态、系统当前吞吐量和延迟。

### 参考文章

[http://microservices.io](http://microservices.io)

[http://martinfowler.com/articles/microservices.html](http://martinfowler.com/articles/microservices.html)
