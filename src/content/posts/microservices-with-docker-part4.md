---
title: "Microservices with Docker - part4"
description: "前面的文章指出需要将microservices应用快速无差异的部署到生产环境，本文将使用Docker来快速部署基于spring-boot构建"
pubDate: 2015-02-07
category: "Architecture"
tags: ["microservices", "docker", "fig", "spring-boot", "mongodb", "rabbitmq"]
archived: true
---
*前面的文章指出需要将microservices应用快速无差异的部署到生产环境，本文将使用[Docker](https://www.docker.com/)来快速部署基于spring-boot构建的microservices应用。探讨快速标准化部署microservices应用的方法。*

### about docker

Docker是一个重新定义了程序开发测试、交付和部署过程的开放平台。Docker也是容器技术的一种，它运行于Linux宿主机之上，每个运行的容器都是相互隔离的，也被称为轻量级虚拟技术或容器型虚拟技术。而且它有点类似Java的编译一次，到处运行，Docker则可以称为构建一次，在各种平台上运行，包括本地服务器和云主机等（Build once，run anywhere）。

具体说来，Docker 在如下几个方面具有较大的优势：

> -   更快速的交付和部署。
> 
> > -   开发者可以使用一个标准的镜像来构建一套开发容器，开发完成之后，运维人员可以直接使用这个容器来部署代码。
> > -   Docker 可以快速创建容器，快速迭代应用程序，并让整个过程全程可见，使团队中的其他成员更容易理解应用程序是如何创建和工作的。
> > -   Docker 容器很轻很快！容器的启动时间是秒级的，大量地节约开发、测试、部署的时间。
> 
> -   更高效的虚拟化。Docker 容器的运行不需要额外的 hypervisor 支持，它是内核级的虚拟化，因此可以实现更高的性能和效率。
> -   更轻松的迁移和扩展。Docker 容器几乎可以在任意的平台上运行，包括物理机、虚拟机、公有云、私有云、个人电脑、服务器等。 这种兼容性可以让用户把一个应用程序从一个平台直接迁移到另外一个。
> -   更简单的管理。使用 Docker，只需要小小的修改，就可以替代以往大量的更新工作。所有的修改都以增量的方式被分发和更新，从而实现自动化并且高效的管理。

### spring-boot and docker

以[上一篇](http://jiaoqsh.github.io/microservices-with-spring-boot-part3.html)为例，基于spring-boot构建的microservices应用打包后是一个可执行jar文件，部署需要如下的条件：

> -   服务程序对应版本的Java环境。JDK的安装、Java环境变量的设置
> -   安装和配置服务程序需要的第三方应用的信息。如 MongoDB、RabbitMQ
> -   运行服务程序的命令或脚本

使用docker部署服务程序需要先创建Docker镜像（image），使用从image创建的运行实例即Docker容器（container）运行应用。这里有三个概念：

> -   Docker镜像（image)：Docker 镜像就是一个只读的模板。镜像可以用来创建 Docker 容器。
> -   Docker容器（container）：Docker 利用容器来运行应用。容器是从镜像创建的运行实例。它可以被启动、开始、停止、删除。每个容器都是相互隔离的、保证安全的平台。
> -   Docker仓库（repository）：仓库是集中存放镜像文件的场所。仓库分为公开仓库（Public）和私有仓库（Private）两种形式。最大的公开仓库是 [Docker Hub](https://hub.docker.com/)，存放了数量庞大的镜像供用户下载。当然，用户也可以在本地网络内创建一个私有仓库。

因此，我们需要进行如下操作：

> -   从repository中获取mongodb、rabbitmq的image，启动container
> -   编写服务程序的Dockerfile，创建image
> -   设置运行参数，创建服务程序的container，运行服务程序

### deploying infrastructure services

1）mongodb

从 repository 中获取 image ：

```
docker pull mongo
```

创建 container 并启动：

```
docker run -d -p 27017:27017 -v /home/app/docker/mongodb:/data/db --name mongodb mongo
```

2）rabbitmq

从 repository 中获取 image ：

```
docker pull rabbitmq
```

创建 container 并启动：

```
docker run -d -p 5672:5672 -p 15672:15672 -v /home/app/docker/rabbitmq/log:/data/log -v /home/app/docker/rabbitmq/data:/data/mnesia --name rabbitmq  rabbitmq
```

### deploying spring-boot with docker

1）编写Dockerfile

```
# Pull base image.
FROM dockerfile/java:oracle-java7
# Define working directory.
WORKDIR /data
# Copy file to the filesystem of the container
COPY bulid/user-registration-backend-*.jar /data/user-registration-backend.jar 
# Expose ports.
EXPOSE 8080
# Define default command.
CMD java -jar user-registration-backend.jar
```

2）从Dockerfile创建image

```
docker build -t user_registration . 
```

3）设置运行参数，创建服务程序的container，运行服务程序

根据 spring-boot 的配置特性可以识别系统环境变量参数，参数设置如下

```
docker run -d -p 8080:8080 \
-e SPRING_DATA_MONGODB_HOST=127.0.0.1  \
-e SPRING_RABBITMQ_HOST=127.0.0.1 \
--name user-registration-demo user_registration
```

4) 查看容器运行日志

```
docker logs user-registration-demo
```

注意：上面的演示中将mongodb和rabbitmq的端口暴露到了外部网络。为了避免此问题，使用 --link 参数可以让容器之间安全的进行交互。如下：

```
docker run -d -v /home/app/docker/mongodb:/data/db --name mongodb mongo
docker run -d -p 8080:8080 --link mongodb:mongodb \
-e SPRING_DATA_MONGODB_HOST=127.0.0.1  \
--name user-registration-demo user_registration
```

Docker 在两个互联的容器之间创建了一个安全隧道，而且不用映射它们的端口到宿主主机上。在启动 mongodb 容器的时候并没有使用 -p 和 -P 标记，从而避免了暴露数据库端口到外部网络上。

### use fig

同时我们可以选择使用 [Fig](http://www.fig.sh/) 快速搭建基于 Docker 的隔离开发环境。添加一个 fig.yml 文件，并指定一些简单的内容，执行 fig up 它就能帮你快速建立起一个容器。

在上面的 Dockerfile 路径位置，添加一个fig.yml 文件，编写：

```
web:
  build: .
  command: java -jar user-registration-backend.jar 
  links:
    - mongodb
    - rabbitmq
  ports:
    - "8000:8000"
mongodb:
  image: mongo
  volumes: 
    - /home/app/docker/mongodb: /data/db 
rabbitmq:
  image: rabbitmq
  volumes: 
    - /home/app/docker/rabbitmq/log: /data/log
    - /home/app/docker/rabbitmq/data: /data/mnesia
```

然后运行 fig up ，即可快速创建出一个容器。
