---
title: "Microservices with Spring-boot - part3"
description: "前面两篇文章对microservices架构做了介绍和应用分析，本文将使用spring-boot来快速创建microservices架构的应"
pubDate: 2015-02-03
category: "Architecture"
tags: ["microservices", "spring", "spring-boot", "mongodb", "rabbitmq"]
archived: true
---
*前面两篇文章对microservices架构做了[介绍](http://jiaoqsh.github.io/microservices-introduction-part1.html)和[应用分析](http://jiaoqsh.github.io/microservices-in-action-part2.html)，本文将使用[spring-boot](http://projects.spring.io/spring-boot/)来快速创建microservices架构的应用。探讨以更加通用的方法创建microservices应用。*

### about spring-boot

spring-boot用来简化基于spring平台应用的初始搭建以及开发过程。框架使用spring平台与第三方框架的特性，无需过多配置和代码编写，很容易创建出可立即运行的工业化水平的应用系统。有如下特性：

> -   创建独立的Spring应用
> -   应用内嵌web容器如Tomcat、Jetty，即无需部署war包到web容器
> -   提供各种‘starter’POMs简化maven配置，如spring-boot-starter-web、spring-boot-starter-amqp
> -   尽可能的自动化配置Spring
> -   提供生产环境需要的metrics、health等检查指标和外部化的配置
> -   没有强制的代码生成和XML配置要求

### microservices with spring-boot

从前面microservices介绍中我们获取，服务通信最常使用的两种协议是：使用资源描述API的HTTP请求响应和轻量级消息协议。spring平台已具有相应的成熟项目，如[spring-framework](http://projects.spring.io/spring-framework/)和[spring-amqp](http://projects.spring.io/spring-amqp/)，相应的列子为：[Building a RESTful Web Service](http://spring.io/guides/gs/rest-service/)、[Messaging with RabbitMQ](http://spring.io/guides/gs/messaging-rabbitmq/)。使用这样的通信协议更具通用性和广义性。

同时从spring-boot提供的特性看，spring-boot封装的各种start子项目可以帮助我们快速的搭建microservices应用。嵌入式web容器(Tomcat或Jetty)简化了部署（当然可以选择不适用嵌入式web容器即[传统方式](https://github.com/spring-projects/spring-boot/tree/master/spring-boot-samples/spring-boot-sample-traditional)）。内置数据库(H2,HSQL和Derby)的支持，即无需提供连接URL，可以快速进行系统原型开发。同时集成[spring-data](http://projects.spring.io/spring-data/)很容易使用各种数据库访问技术，使用统一的编程模型。

spring-boot提供了多种[配置方式](http://docs.spring.io/spring-boot/docs/1.2.x/reference/htmlsingle/#boot-features-external-config)，比如：命令行、JNDI属性、Java系统变量、操作系统变量，配置文件（application.properties、YAML配置文件）等。可以很灵活简便的将应用部署到各种环境（包括云平台）中。

### use case

接下来让我从一个用例开始，使用spring-boot创建一个microservices应用。使用“用户注册”用例，即：提供一个注册服务，注册服务将用户注册信息持久化到Mongodb中，发送注册成功邮件，以及操作其他用户注册成功的任务（如用户好友关系计算，好友、商品、文章推荐等）。

demo需要创建的服务和功能有：

> -   user-registration-backend：提供用户注册RESTful Web服务，持久化数据到mongodb中，发送用户注册成功的消息到rabbitqm中
> -   mail-service-backend：提供发送邮件服务，从rabbitmq中订阅用户注册成功的消息，接收到消息后发送通知邮件

### user-registration-backend

1) 定义POM文件，快速创建应用框架

```
<parent>
  <groupId>org.springframework.boot</groupId>
  <artifactId>spring-boot-starter-parent</artifactId>
  <version>1.2.1.RELEASE</version>
  <relativePath/> <!-- lookup parent from repository -->
</parent>
...
<dependencies>
  <dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-data-mongodb</artifactId>
  </dependency>
  <dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-amqp</artifactId>
  </dependency>
  <dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-web</artifactId>
  </dependency>
  <dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-test</artifactId>
    <scope>test</scope>
  </dependency>
</dependencies>
<build>
  <plugins>
    <plugin>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-maven-plugin</artifactId>
    </plugin>
  </plugins>
</build>
...
```

2) 编写config文件，扩展默认配置，自定义配置项

```
@Configuration
public class UserRegistrationConfig {
    @Bean
    RabbitTemplate rabbitTemplate(ConnectionFactory connectionFactory){
        RabbitTemplate template = new RabbitTemplate(connectionFactory);
        Jackson2JsonMessageConverter jsonConverter = new Jackson2JsonMessageConverter();
        template.setMessageConverter(jsonConverter);
        return template;
    }
    @Bean
    TopicExchange userRegistrationsExchange(){
        return new TopicExchange(MessagingNames.EXCHANGE_ANME);
    }
    ...
```

3) 使用spring-data的特性定义数据访问层接口，实现对Mongodb的CRUD操作方法

```
public interface RegisteredUserRepository extends MongoRepository<RegisteredUser, String>{
    RegisteredUser findByEmail(String email);
}
```

4) 提供用户注册RESTful Web服务

```
@RestController
public class UserRegistrationController {
...
    @RequestMapping(value = "/rest/user", method = RequestMethod.POST)
    public void registerUser(@RequestBody RegisteredUser registeredUser){
        registeredUserRepository.save(registeredUser);
        rabbitTemplate.convertAndSend(MessagingNames.EXCHANGE_ANME, MessagingNames.ROUTING_KEY, registeredUser);
    }
...
```

为了方便演示直接在controller方法中进行了业务逻辑操作，即持久化数据到mongodb，发送用户注册消息到rabbitmq。同时没有仔细考虑数据一致性问题。

通过上面这些定义和少量代码编写，完成了用例功能，构建了一个microservices应用。

### mail-service-backend

与user-registration-backend的创建过程一致，此处不再赘述，请查看[microservices-spring-boot-demo](https://github.com/jiaoqsh/microservices-spring-boot-demo)

### run application

1) 启动mongodb和rabbitmq服务，增加application-test.properties配置

```
#mongo
#spring.data.mongodb.uri=mongodb://127.0.0.1:27017/userregistration # connection URL
spring.data.mongodb.host=127.0.0.1
spring.data.mongodb.port=27017
spring.data.mongodb.database=userregistration
#rabbitmq
spring.rabbitmq.host=127.0.0.1
spring.rabbitmq.port=5672
```

然后启动应用

```
java -jar target/user-registration-backend-*.jar --spring.profiles.active=test
jar -jar target/mail-service-backend-*.jar --spring.profiles.active=test
```

2) 启动mongodb和rabbitmq服务，修改系统环境变量或者从命令行启动应用

```
java -jar target/user-registration-backend-*.jar --spring.data.mongodb.uri=mongodb://127.0.0.1:27017/userregistration --spring.rabbitmq.host=127.0.0.1
jar -jar target/mail-service-backend-*.jar --spring.rabbitmq.host=127.0.0.1
```

3) test

```
curl -v -d '{"email":"xxx@xxx.com", "password":"secret"}' -H "content-type: application/json"  http://127.0.0.1:8080/rest/user
```
