---
title: "Dianping River Plugin for Elasticsearch"
description: "下文通过接入大众点评开放数据API，介绍如何利用ES的plugin机制，实现一个River Plugin。Elasticserach提供Ri"
pubDate: 2015-01-25
category: "Elasticsearch"
tags: ["elasticsearch"]
archived: true
---
*下文通过接入大众点评开放数据API，介绍如何利用ES的plugin机制，实现一个River Plugin。Elasticserach提供[River](http://www.elasticsearch.org/blog/the-river/)模块意在将不同来源的数据通过统一的模型机制生成ES索引。*

ES使用[Google Guice](https://github.com/google/guice)作为依赖注入框架，通过Guice的[GettingStarted](https://github.com/google/guice/wiki/GettingStarted)，实现Guice的依赖注入，需要：

> 1.  定义类xxxService，在其构造方法上加入@Inject注解
> 2.  定义xxxModule，继承AbstractModule类， 使用bindings将依赖类与具体实现映射
> 3.  使用时通过xxxModule创建一个injector，获取xxxService实例。

接下来我们开始编写ES River插件：

#### 1\. 定义插件类，实现Plugin接口

通常是通过继承AbstractPlugin类，使用通用的模板方法，实现接口方法。

```
    @Override
    public String name() {
        return "river-dianping";
    }
    @Override
    public String description() {
        return "River DianPing Plugin";
    }
```

一个ES Plugin可以动态的injected模块通过实现onModule(AnyModule)方法，所以实现一个ES Plugin还需要实现onModule方法，方法参数为ES模块父类类型。

*即注册插件的组件，每个插件增加了ES的一些功能，这些功能需要注册到ES。*

实现一个RiversModule的插件，需要：

```
    public void onModule(RiversModule module) {
        module.registerRiver("dianping", DianpingRiverModule.class);
    }
```

同理，要实现RestModule或ActionModule的插件，需要：

```
    public void onModule(RestModule module) {
        module.addRestAction(RestTermlistAction.class);
    }
    public void onModule(ActionModule module) {
        module.registerAction(TermlistAction.INSTANCE, TransportTermlistAction.class);
    }
```

但是，ES如何感知插件，并且在初始化时加载插件？这就还需要提供插件的配置，即在类路径上定义一个es-plugin.properties文件，配置：

```
plugin=org.elasticsearch.plugin.river.dianping.DianpingRiverPlugin
```

#### 2\. 定义DianpingRiver类，实现River接口

通常是继承AbstractRiverComponent类，实现River接口，AbstractRiverComponent初始化了logger，提供了riverName和riverSettings两个属性。

按照实现Guice的依赖注入的要求，需要在构造方法上加入@Inject注解。

```
@Inject
    protected DianpingRiver(RiverName riverName, RiverSettings settings, Client client, ThreadPool threadPool) {
        super(riverName, settings);
        this.client = client;
        this.threadPool = threadPool;
```

并在构造方法中，对外部定义的配置信息做解析，设置属性值。

同时还需要提供DianpingRiverModule类，实现Guice的bind机制。

```
public class DianpingRiverModule extends AbstractModule {
    @Override
    protected void configure() {
        bind(River.class).to(DianpingRiver.class).asEagerSingleton();
    }
}
```

实现River接口定义的start和close方法。start中定义index信息，调用dianping开放数据API接口，生成index。

```
client.admin().indices().prepareCreate(indexName).addMapping(typeName, mapping).execute().actionGet();
...
// Creating bulk processor
this.bulkProcessor = BulkProcessor.builder(client, new BulkProcessor.Listener() {
...
startApi();
}
```

如上，即可完成ES River插件的开发。[demo地址](https://github.com/jiaoqsh/elasticsearch-river-dianping)

#### 3\. 运行插件，查询索引

安装插件：

```
bin/plugin -install jiaoqsh/elasticsearch-river-dianping
```

创建River：

```
curl -XPUT localhost:9200/_river/dianping_river/_meta -d '
{
    "type" : "dianping",
    "dianping" : {
        "app" : {
            "appKey" : "xxx",
            "secret" : "xxx"
        },
        "appType" : "deal",
        "city" : "xxx"
    },
    "index" : {
        "index" : "my_dianping_river",
        "type" : "deal",
        "bulk_size" : 100,
        "flush_interval" : "10s"
    }
}
```

查看index mapping：

```
curl -XGET  http://localhost:9200/my_dianping_river/_mapping?pretty=true
```

查询对应城市的团购信息：

```
curl -XGET  http://localhost:9200/my_dianping_river/_search?q=city:*
```
