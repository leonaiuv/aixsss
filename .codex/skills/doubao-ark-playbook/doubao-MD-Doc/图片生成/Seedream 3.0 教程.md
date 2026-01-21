<span id="a554c566"></span>

# 模型概述

Seedream 3.0 是一款支持原生高分辨率的中英双语图像生成基础模型，综合能力媲美GPT-4o，处于世界第一梯队。响应速度更快；小字生成更准确，文本排版效果增强；指令遵循能力强，美感&结构提升，保真度和细节表现较好。
通过这篇教程您可以学习到如何通过调用Seedream 3.0模型 API 来生成图片。

| | | | | | | \
|**模型名称** |**版本** |\
| |<div style="width:150px"></div> |模型 ID（Model ID） |\
| | |<div style="width:150px"></div> |**模型能力** |\
| | | |<div style="width:150px"></div> |**限流 IPM** |\
| | | | |每分钟生成图片数量上限 |\
| | | | |（张 / 分钟） |定价 |
|---|---|---|---|---|---|
| | | | | | | \
|[doubao-seedream-3.0-t2i](/docs/82379/1555133) |250415`强烈推荐` |doubao-seedream-3-0-t2i-250415 |文生图 |500 |[图片生成模型](/docs/82379/1544106#5e813e2f) |

<span id="88612aa1"></span>

# 前提条件

- 您已有方舟 API Key，作为模型推理服务调用鉴权使用。如无，请参考[1.获取 API Key](/docs/82379/1399008#10d67aef)。
- 在[开通管理页](https://console.volcengine.com/ark/region:ark+cn-beijing/openManagement?LLM=%7B%7D&OpenTokenDrawer=false)开通所需模型的服务。
- 在[模型列表](/docs/82379/1330310)获取所需模型的ID（Model ID），后续调用模型服务时需使用。

<span id="386b6ea2"></span>

# 快速开始

您可以通过下面代码快速体验文生图片能力。

```Python
import os
# 通过 pip install 'volcengine-python-sdk[ark]' 安装方舟SDK
from volcenginesdkarkruntime import Ark

# 请确保您已将 API Key 存储在环境变量 ARK_API_KEY 中
# 初始化Ark客户端，从环境变量中读取您的API Key
client = Ark(
    # 此为默认路径，您可根据业务所在地域进行配置
    base_url="https://ark.cn-beijing.volces.com/api/v3",
    # 从环境变量中获取您的 API Key。此为默认方式，您可根据需要进行修改
    api_key=os.environ.get("ARK_API_KEY"),
)

imagesResponse = client.images.generate(
    model="doubaoseedream-3-0-t2i-250415",
    prompt="鱼眼镜头，一只猫咪的头部，画面呈现出猫咪的五官因为拍摄方式扭曲的效果。"
)

print(imagesResponse.data[0].url)
```

<span id="e36d7d78"></span>

# 使用示例

<span id="dd8e0b15"></span>

## 图片生成

根据您输入的文本提示词生成图片。

```mixin-react
return (<Tabs>
<Tabs.TabPane title="Python" key="drYKk8xTpZ"><RenderMd content={`\`\`\`Python
import os
# 通过 pip install 'volcengine-python-sdk[ark]' 安装方舟SDK
from volcenginesdkarkruntime import Ark

# 请确保您已将 API Key 存储在环境变量 ARK_API_KEY 中
# 初始化Ark客户端，从环境变量中读取您的API Key
client = Ark(
    # 此为默认路径，您可根据业务所在地域进行配置
    base_url="https://ark.cn-beijing.volces.com/api/v3",
    # 从环境变量中获取您的 API Key。此为默认方式，您可根据需要进行修改
    api_key=os.environ.get("ARK_API_KEY"),
)

imagesResponse = client.images.generate(
    model="doubaoseedream-3-0-t2i-250415",
    prompt="鱼眼镜头，一只猫咪的头部，画面呈现出猫咪的五官因为拍摄方式扭曲的效果。"
)

print(imagesResponse.data[0].url)
\`\`\`

`}></RenderMd></Tabs.TabPane>
<Tabs.TabPane title="Java" key="WV92zW27Zk"><RenderMd content={`\`\`\`Java
package com.volcengine.ark.runtime;

import com.volcengine.ark.runtime.model.content.generation.*;
import com.volcengine.ark.runtime.model.images.generation.GenerateImagesRequest;
import com.volcengine.ark.runtime.model.images.generation.ImagesResponse;
import com.volcengine.ark.runtime.service.ArkService;
import okhttp3.ConnectionPool;
import okhttp3.Dispatcher;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;

public class ImageGenerationsExample {
    public static void main(String[] args) {
        String apiKey = System.getenv("ARK_API_KEY");
        ConnectionPool connectionPool = new ConnectionPool(5, 1, TimeUnit.SECONDS);
        Dispatcher dispatcher = new Dispatcher();
        ArkService service = ArkService.builder().dispatcher(dispatcher).connectionPool(connectionPool).apiKey(apiKey).build();

        GenerateImagesRequest generateRequest = GenerateImagesRequest.builder()
                .model("doubao-seedream-3-0-t2i-250415")
                .prompt("鱼眼镜头，一只猫咪的头部，画面呈现出猫咪的五官因为拍摄方式扭曲的效果。")
                .build();

        ImagesResponse imagesResponse = service.generateImages(generateRequest);
        System.out.println(imagesResponse.getData().get(0).getUrl());

        service.shutdownExecutor();
    }
}
\`\`\`

`}></RenderMd></Tabs.TabPane>
<Tabs.TabPane title="Go" key="RGha36LWkn"><RenderMd content={`\`\`\`Go
package main

import (
    "context"
    "fmt"
    "os"

    "github.com/volcengine/volcengine-go-sdk/service/arkruntime"
    "github.com/volcengine/volcengine-go-sdk/service/arkruntime/model"
)

func main() {
    client := arkruntime.NewClientWithApiKey(os.Getenv("ARK_API_KEY"))
    ctx := context.Background()

    generateReq := model.GenerateImagesRequest{
       Model:  "doubao-seedream-3-0-t2i-250415",
       Prompt: "鱼眼镜头，一只猫咪的头部，画面呈现出猫咪的五官因为拍摄方式扭曲的效果。",
    }

    imagesResponse, err := client.GenerateImages(ctx, generateReq)
    if err != nil {
       fmt.Printf("generate images error: %v\\n", err)
       return
    }

    fmt.Printf("%s\\n", *imagesResponse.Data[0].Url)
}
\`\`\`

`}></RenderMd></Tabs.TabPane>
<Tabs.TabPane title="OpenAI" key="rAdCWpHoCr"><RenderMd content={`\`\`\`Python
import os
from openai import OpenAI

# 请确保您已将 API Key 存储在环境变量 ARK_API_KEY 中
# 初始化Ark客户端，从环境变量中读取您的API Key
client = OpenAI(
    # 此为默认路径，您可根据业务所在地域进行配置
    base_url="https://ark.cn-beijing.volces.com/api/v3",
    # 从环境变量中获取您的 API Key。此为默认方式，您可根据需要进行修改
    api_key=os.environ.get("ARK_API_KEY"),
)

response = client.images.generate(
    # 指定您创建的方舟推理接入点 ID，此处已帮您修改为您的推理接入点 ID
    model="doubao-seedream-3-0-t2i-250415",
    prompt="鱼眼镜头，一只猫咪的头部，画面呈现出猫咪的五官因为拍摄方式扭曲的效果。",
    size="1024x1024",
    response_format="url"
)

print(response.data[0].url)
\`\`\`

`}></RenderMd></Tabs.TabPane></Tabs>);
```

<span id="86655393"></span>

# 附录：应用场景

| | | \
|场景 |描述 |
|---|---|
| | | \
|广告设计 |快速生成多样化的广告素材，根据产品特点和目标受众，定制创意海报、宣传图片，节省设计时间与成本。 |
| | | \
|游戏开发 |辅助创建游戏场景、角色形象和道具，通过输入关键词，生成高分辨率、风格统一的美术资源，加速游戏开发进程。 |
| | | \
|电商平台 |为商品自动生成多角度、多场景展示图，模拟商品在不同环境下的使用效果，增强用户购物体验，提升商品吸引力。 |
| | | \
|教育领域 |生成教学所需的插图、示意图，将抽象知识转化为可视化图像，辅助教师讲解复杂概念，帮助学生更好地理解知识。 |
| | | \
|影视制作 |协助完成概念图绘制、特效场景设计，快速生成虚拟角色和奇幻场景的参考图，为影视创作提供灵感和视觉基础。 |
