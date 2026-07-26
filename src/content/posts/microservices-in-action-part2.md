---
title: "Microservices In Action - part2"
description: "上一篇介绍了microservices架构，从中我们获知microservices架构需要面临的问题，本文将结合实际系统做应用分析。"
pubDate: 2015-02-02
category: "Architecture"
tags: ["microservices", "spring", "hessian", "jenkins", "maven"]
archived: true
---
*[上一篇](http://jiaoqsh.github.io/microservices-introduction-part1.html)介绍了microservices架构，从中我们获知microservices架构需要面临的问题，本文将结合实际系统做应用分析。*

### 背景

系统划分为多个子系统各自提供服务首先是因为系统业务发展的需要和系统分阶段建设的特性决定的，同时由于当时开发团队人员梯度的配置，更能让大家各自专注于相应业务和技术点，更好的保障项目质量（系统上线总结中也证明这样做是合理的）。

确认子系统划分和服务能力后，很自然的想到SOA架构，但是发现基于SOA的技术（使用ESB集成monolithic应用）实施对我们的系统建设太重量了。

由于我们是新项目，服务能力可以显示定义，统一风格。我们需要的是各子系统之间按照一定的通信协议进行同步或者异步的服务调用，简单的发布服务。各子系统有同样的代码结构，部署模型。各子系统按照系统建设目标不断独立迭代开发更新部署。所以我们建设了这一阶段的面向服务的分布式系统，建设完成后发现与microservices架构风格一致。

### 服务发布与调用

我们首先要解决的是各子系统服务之间的RPC调用问题。选择合适的RPC框架，制定统一的约定规则。

需要满足以下特性：

> -   服务发布和服务调用声明式、配置化
> -   透明化的服务调用，就像调用本地方法一样调用远程方法
> -   服务扩容简单，实现负载均衡
> -   服务部署模型简单

同时，具有以下状况：

> -   Java开发平台，使用Spring做系统集成
> -   允许业务边界的服务耦合，即子系统不需要拆分的很细，可以后期重构
> -   项目时间要求高，业务功能较多，没有过多时间做技术调研

通过上述分析，我们选择了Spring+Hessian的RPC框架。这样选择的主要原因是：

> -   Spring对Hessian做了良好的封装，服务发布和调用可以很容易通过配置定义。服务方法调用和调用本地方法一样，无需关注方法参数与返回结果的序列化
> -   Hessian基于Http协议进行传输，部署在web容器，与其他web服务一样通过Nginx实现负载均衡

同时由于系统服务规模有限，不需要服务动态注册与发现，以及服务治理能力。所以没有选择 [Dubbo](https://github.com/alibaba/dubbo) 这样高大上的分布式服务框架。由于系统在Java平台上开发，已规划的系统目标范围内无需考虑其他语言提供服务的情况，所以也没选择 [Thrift](https://thrift.apache.org) 这样的跨语言服务框架。

### 代码模型

选择好RPC框架后，我们需要对服务的代码模型做定义，以便服务调用时方便处理。使用Maven的项目对象模型，一个服务被分为xx-domain、xx-dao、xx-service、xx-api、xx-web五个工程。这样分层管理是由于：

> -   与常见的分层代码模型一样，domain为领域对象模型，dao负责处理数据持久化，service处理业务逻辑
> -   服务调用方在service层向调用本地方法一样调用服务
> -   api声明需要发布的服务，服务调用方依赖api，api依赖domain
> -   web用来定义服务配置，发布服务到web容器

使用Maven的Archetype插件可以快速生成各子系统五个工程的Quickstart代码。

服务发布的spring配置：

```
<bean name="/xxxFacade" class="org.springframework.remoting.caucho.HessianServiceExporter">
    <property name="service" ref="xxxFacade" />
    <property name="serviceInterface" value="com.XxxFacade" />
</bean>
```

服务调用的spring配置：

```
<bean id="xxxFacade"
      class="org.springframework.remoting.caucho.HessianProxyFactoryBean"
      lazy-init="true">
  <property name="serviceUrl" value="${mvn.xxx.url}/xxxFacade" />
  <property name="serviceInterface" value="com.XxxFacade" />
  <property name="proxyFactory">
      <bean class="com.caucho.hessian.client.HessianProxyFactory"
            p:readTimeout="20000" p:connectTimeout="20000"  p:hessian2Request="true" p:hessian2Reply="true" />
  </property>
</bean>
```

服务调用service层的pom依赖配置：

```
<dependency>
  <groupId>${project.groupId}</groupId>
  <artifactId>xxx-api</artifactId>
  <version>${project.version}</version>
</dependency>
```

### 事务处理

分布式系统必然涉及分布式事务处理，即跨服务器的事务处理，也就是跨服务器的数据一致性问题。同时我们认为服务之间由于网络异常或者服务应用本身异常造成服务调用失败的情况随时都能发生。

我们处理分布式事务的方式主要是：定时调度系统 + 服务接口幂等性 + 本地事务记录表 + 补偿任务处理。同时根据业务规则处理服务异常。

下面我们以“下单减库存，取消订单增加库存”举例，描述处理过程： *注：举例此处涉及两个子系统：库存子系统（A）和订单子系统（B）*

> -   下单时B系统调用A系统的减库存服务。如果调用异常（即服务调用超时）:
> 
> > -   此时返回下单失败
> > -   记录异常日志记录用于监控系统预警。
> > -   此时可能会出现A系统减库存成功，网络原因没能返回给B系统调用结果的情况，会出现数据不一致的情况。所以在A系统执行减库存操作时在本地同一事务中插入减库存记录。
> > -   定时调度系统定时读取A系统记录表中读取记录，查询B系统服务是否存在对应订单记录。然后标记记录表中的记录，决定执行补偿操作。
> 
> -   取消订单时B系统调用A系统的增加库存服务。如果调用异常（即服务调用超时）：
> 
> > -   此时返回取消成功
> > -   B系统会在调用记录表中增加一条记录
> > -   定时调度系统会定时读取B系统记录表中的记录，调用A系统的增加库存服务。直到调用成功，标记记录为操作成功

可以看出服务能反复调用，说明A系统的提供的增或减库存服务具有幂等性。

同时看出上述分布式事务处理过程目前都是以编程的方式操作的，后期考虑对通用模式做抽象，定义处理框架，通过声明式、配置化的方式处理分布式事务。

### 构建部署

目前使用 Jenkins + Maven + SVN 搭建的持续集成环境。主要解决了两方面的问题。

1) 不同环境下配置信息的管理

使用maven的profile属性做集中化的配置管理。即在maven项目结构的顶层定义dev、test、production级别的profile。Jenkins构建时用maven变量替换代码工程配置文件中的变量。

maven的profile定义：

```
<profiles>
    <profile>
        <id>dev</id>
        <activation>
            <activeByDefault>true</activeByDefault>
        </activation>
        <properties>
            <mvn.jdbc.driver>com.mysql.jdbc.Driver</mvn.jdbc.driver>
            ...
        </properties>
    </profile>
    ...
</profiles>
```

Jenkins中xx工程maven命令配置：

```
clean install -Pdev
```

2) 自动部署服务到开发和测试环境

由于服务需要部署到web容器，我们选用的web容器为tomcat。利用maven插件和tomcat的/manager/text服务，自动化的将多个子系统的多个服务部署到相应的环境。

xx-web层maven的pom.xml配置：

```
<plugins>
  <plugin>
    <groupId>org.apache.tomcat.maven</groupId> 
    <artifactId>tomcat7-maven-plugin</artifactId> 
    <configuration>
      <url>${server.host}:${server.port}/manager/text</url> 
      <server>${profiles.server}</server> 
      <path>/${project.build.finalName}</path> 
      <contextReloadable>true</contextReloadable> 
    </configuration>
  </plugin>
</plugins>
```

Jenkins中xx-web工程maven命令配置：

```
clean tomcat7:redeploy  -Dmaven.test.skip=true -Pdev
```

目前以这样的方式满足了开发和测试环境的自动构建部署要求，但是部署到生产环境由于生产环境的要求还需要运维配合部署。如何能无差异的部署到生产环境将在后面的文章中做探讨分析。
