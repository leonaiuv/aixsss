本文介绍如何使用Context API 实现 Session 缓存以及前缀缓存能力。
:::tip
方舟平台的新用户？获取 API Key 及 开通模型等准备工作，请参见 [快速入门](/docs/82379/1399008)。
:::
<span id="f9fb2aaf"></span>

# 开通功能

- 访问[开通管理](https://console.volcengine.com/ark/region:ark+cn-beijing/openManagement)，在 **推理(缓存)定价** 开通缓存。

<span>![图片](https://p9-arcosite.byteimg.com/tos-cn-i-goo7wpa0wc/e96b4642ab314149b7de8566f6bb7a79~tplv-goo7wpa0wc-image.image =508x) </span>
<span id="03e16406"></span>

# 模型及API

API：

- [Responses API](https://www.volcengine.com/docs/82379/1569618)：推荐，教程见 [上下文缓存](/docs/82379/1602228)。
- Context API：[Context Create API](https://www.volcengine.com/docs/82379/1528789)、[Context Chat API](https://www.volcengine.com/docs/82379/1529329)。

模型支持：

- 请参见 [上下文缓存能力](/docs/82379/1330310#476e6f25)

<span id="029c3928"></span>

# Session 缓存教程

> 快速跳转至 [前缀缓存教程](/docs/82379/1396491#c665d4d2)

Session 缓存为会话级别的缓存，将会话的上下文（Context）进行缓存，并在对话进行中不断更新缓存内容，保障每轮对话能获取历史轮次的对话信息，维持对话内容延续，适合角色扮演、情景聊天等长轮数对话场景。开通 Session 缓存后，通过缓存输入的内容会有较大的折扣，可有效降低使用成本。

> 因使用缓存来存储您的上下文信息，您开通并使用了该功能后，会产生相应的存储费用。

<span id="18cf565a"></span>

## 快速开始

```mixin-react
return (<Tabs>
<Tabs.TabPane title="Curl" key="p7GD3nJ09V"><RenderMd content={`<span id="ad8c3ef5"></span>
### 1.创建 Session 缓存
使用 Session 缓存前，您需要调用 [创建上下文缓存 API](https://www.volcengine.com/docs/82379/1528789) 创建缓存，并写入初始信息。后续只要在 [上下文缓存对话 API](https://www.volcengine.com/docs/82379/1529329) 中引入此缓存，即可让方舟为您管理历史对话以及享受使用缓存带来的费用降低。
\`\`\`Shell
curl https://ark.cn-beijing.volces.com/api/v3/context/create \\
-H "Authorization: Bearer $ARK_API_KEY" \\
-H 'Content-Type: application/json' \\
-d '{
    "model":"<YOUR_ENDPOINT_ID>",
    "messages":[
        {"role":"system","content":"你是李雷，你只会说“我是李雷”"}
     ],
     "ttl":3600,
     "mode": "session"
}'
\`\`\`

其中：

* \`$ARK_API_KEY\`替换为您的 API Key，或者配置 API Key 至环境变量。
* \`<YOUR_ENDPOINT_ID>\`替换为您的推理接入点 ID。
* \`"ttl":3600\`代表 Session 缓存 TTL，当前为 3600 秒。
* \`"mode": "session"\`代表使用的 Session 缓存模式。

模型回复预览。
\`\`\`Shell
{
    "id": "<YOUR_CONTEXT_ID>",
    "model": "<YOUR_ENDPOINT_ID>",
    "ttl": "3600",
    "mode": "session",
    "truncation_strategy": {
            "type": "last_history_tokens",
            "last_history_tokens": 4096
            },
    "usage": {
        "prompt_tokens": 18,
        "completion_tokens": 0,
        "total_tokens": 18,
        "prompt_tokens_details": {
            "cached_tokens": 0
        }
    }
}
\`\`\`

返回的创建的 Session 缓存的基本信息，其中\`<YOUR_CONTEXT_ID>\`是创建的 Session 缓存的 ID，格式类似\`ctx-****\`，需要记录并在后面请求模型推理服务时使用。
<span id="2c058d63"></span>
### 2.使用 Session 缓存进行对话
我们使用接口 [创建上下文缓存 API](https://www.volcengine.com/docs/82379/1528789) ，来进行使用 Session 缓存的对话。
\`\`\`Shell
curl https://ark.cn-beijing.volces.com/api/v3/context/chat/completions \\
-H "Authorization: Bearer $ARK_API_KEY" \\
-H 'Content-Type: application/json' \\
-d '{
    "context_id": "<YOUR_CONTEXT_ID>",
    "model": "<YOUR_ENDPOINT_ID>",
    "messages":[
        {
            "role":"user",
            "content": "你好"
        }
    ]
}'
\`\`\`

其中。

* \`$ARK_API_KEY\`替换为您的 API Key，或者配置 API Key 至环境变量。
* \`<YOUR_CONTEXT_ID>\`替换为之前创建的 Session 缓存 ID。
* \`<YOUR_ENDPOINT_ID>\`替换为您的推理接入点 ID。

模型回复预览。
\`\`\`Shell
{
  "id": "****",
  "object": "chat.completion",
  "created": 167765****,
  "model": "<YOUR_ENDPOINT_ID>",
  "choices": [{
    "index": 0,
    "message": {
      "role": "assistant",
      "content": "我是李雷",
    },
    "finish_reason": "stop"
  }],
 "usage": {
    "prompt_tokens": 28,
    "completion_tokens": 4,
    "total_tokens": 32,
    "prompt_tokens_details": {
      "cached_tokens": 18
  }
}
\`\`\`

`}></RenderMd></Tabs.TabPane>
<Tabs.TabPane title="Python" key="wb8dNS6uie"><RenderMd content={`\`\`\`Python
# 导入datetime模块，用于处理日期和时间
import datetime
# 导入os模块，用于获取环境变量
import os
# 需升级方舟 Python SDK到1.0.116版本或以上，pip install --upgrade 'volcengine-python-sdk[ark]'
from volcenginesdkarkruntime import Ark

# 从环境变量中获取 API Key（https://www.volcengine.com/docs/82379/1361424）
api_key = os.environ.get("ARK_API_KEY")
# 替换为您的推理接入点ID（https://www.volcengine.com/docs/82379/1099522）
model = "<YOUR_ENDPOINT_ID>"

# 创建一个Ark客户端实例，传入API密钥
client = Ark(
    api_key=api_key,
    base_url="https://ark.cn-beijing.volces.com/api/v3",
    )

# 如果当前脚本是作为主程序运行
if __name__ == "__main__":
    # 打印创建上下文的提示信息
    print("----- create context -----")
    # 调用client的context.create方法创建一个会话上下文
    response = client.context.create(
        # 指定模型
        model=model,
        # 指定模式为会话
        mode="session",
        # 设置消息列表，包含一个系统角色的消息
        messages=[
            {"role": "system", "content": "你是李雷"},
        ],
        # 设置会话的生存时间为60分钟
        ttl=datetime.timedelta(minutes=60),
    )
    # 打印创建上下文的响应结果
    print(response)

    # 打印第一轮非流式聊天的提示信息
    print("----- chat round 1 (non-stream) -----")
    # 调用client的context.completions.create方法进行非流式聊天
    chat_response = client.context.completions.create(
        # 指定上下文ID
        context_id=response.id,
        # 指定模型
        model=model,
        # 设置消息列表，包含一个用户角色的消息
        messages=[
            {"role": "user", "content": "我是方方"},
        ],
        # 设置为非流式
        stream=False,
    )
    # 打印聊天响应的消息内容
    print(chat_response.choices[0].message.content)
    # 打印聊天响应的使用情况
    print(chat_response.usage)

    # 打印第二轮流式聊天的提示信息
    print("----- chat round 2 (streaming) -----")
    # 调用client的context.completions.create方法进行流式聊天
    stream = client.context.completions.create(
        # 指定上下文ID
        context_id=response.id,
        # 指定模型
        model=model,
        # 设置消息列表，包含一个用户角色的消息
        messages=[
            {"role": "user", "content": "你是谁，我是谁？"},
        ],
        # 设置流式选项，包含使用情况
        stream_options={
            "include_usage": True,
        },
        # 设置为流式
        stream=True,
    )
    # 遍历流式响应的每个块
    for chunk in stream:
        # 如果块中包含使用情况信息，则打印使用情况
        if chunk.usage:
            print(chunk.usage)
        # 如果块中不包含选择信息，则继续下一个块
        if not chunk.choices:
            continue
        print(chunk.choices[0].delta.content, end="")
\`\`\`

`}></RenderMd></Tabs.TabPane>
<Tabs.TabPane title="Go" key="bQ9yf9S8PQ"><RenderMd content={`\`\`\`Go
package main

import (
    "context"
    "fmt"
    "io"
    "os"

    "github.com/volcengine/volcengine-go-sdk/service/arkruntime"
    "github.com/volcengine/volcengine-go-sdk/service/arkruntime/model"
    "github.com/volcengine/volcengine-go-sdk/volcengine"
)

// main 函数是程序的入口点
func main() {
    // 替换为您的推理接入点ID（https://www.volcengine.com/docs/82379/1099522）
    const Model = "<YOUR_ENDPOINT_ID>"
    // 使用 API Key创建一个客户端，从环境变量中获取 API Key（https://www.volcengine.com/docs/82379/1361424）
    client := arkruntime.NewClientWithApiKey(
        os.Getenv("ARK_API_KEY"),
        arkruntime.WithBaseUrl("https://ark.cn-beijing.volces.com/api/v3"),
        )
    // 创建一个新的上下文
    goCtx := context.Background()

    // 打印创建上下文的提示信息
    fmt.Println("----- create context -----")
    // 创建一个新的上下文请求
    createCtxReq := model.CreateContextRequest{
        // 设置模型为常量 Model
        Model: Model,
        // 设置模式为会话模式
        Mode: model.ContextModeSession,
        // 设置初始消息
        Messages: []*model.ChatCompletionMessage{
            {
                // 设置角色为系统
                Role: model.ChatMessageRoleSystem,
                // 设置内容为系统消息
                Content: &model.ChatCompletionMessageContent{
                    // 设置字符串值为系统消息内容
                    StringValue: volcengine.String("你是李雷"),
                },
            },
        },
        // 设置 TTL 为 3600 秒
        TTL: volcengine.Int(3600),
    }

    // 发送创建上下文请求并获取响应
    createCtxRsp, err := client.CreateContext(goCtx, createCtxReq)
    // 如果发生错误，打印错误信息并返回
    if err != nil {
        fmt.Printf("create context error: %v\\\\n", err)
        return
    }
    // 打印创建上下文的响应
    fmt.Printf("create context response: %v\\\\n", createCtxRsp)

    // 打印非流式聊天的提示信息
    fmt.Println("----- chat round 1 (non-stream) -----")
    // 创建一个新的聊天请求
    req := model.ContextChatCompletionRequest{
        // 设置上下文ID为创建上下文的响应ID
        ContextID: createCtxRsp.ID,
        // 设置模型为常量 Model
        Model: Model,
        // 设置消息
        Messages: []*model.ChatCompletionMessage{
            {
                // 设置角色为用户
                Role: model.ChatMessageRoleUser,
                // 设置内容为用户消息
                Content: &model.ChatCompletionMessageContent{
                    // 设置字符串值为用户消息内容
                    StringValue: volcengine.String("我的名字是方方"),
                },
            },
        },
    }

    // 发送聊天请求并获取响应
    resp, err := client.CreateContextChatCompletion(goCtx, req)
    // 如果发生错误，打印错误信息并返回
    if err != nil {
        fmt.Printf("non-stream chat error: %v\\\\n", err)
        return
    }
    // 打印聊天响应的内容
    fmt.Println(*resp.Choices[0].Message.Content.StringValue)

    // 打印流式聊天的提示信息
    fmt.Println("----- chat round 2 (stream) -----")
    // 创建一个新的聊天请求
    req = model.ContextChatCompletionRequest{
        // 设置上下文ID为创建上下文的响应ID
        ContextID: createCtxRsp.ID,
        // 设置模型为常量 Model
        Model: Model,
        // 设置消息
        Messages: []*model.ChatCompletionMessage{
            {
                // 设置角色为用户
                Role: model.ChatMessageRoleUser,
                // 设置内容为用户消息
                Content: &model.ChatCompletionMessageContent{
                    // 设置字符串值为用户消息内容
                    StringValue: volcengine.String("你是谁，我是谁？"),
                },
            },
        },
    }
    // 发送聊天请求并获取流式响应
    stream, err := client.CreateContextChatCompletionStream(goCtx, req)
    // 如果发生错误，打印错误信息并返回
    if err != nil {
        fmt.Printf("stream chat error: %v\\\\n", err)
        return
    }
    // 延迟关闭流式响应
    defer stream.Close()

    // 循环接收流式响应
    for {
        // 接收流式响应
        recv, err := stream.Recv()
        // 如果接收到 EOF，返回
        if err == io.EOF {
            return
        }
        // 如果发生错误，打印错误信息并返回
        if err != nil {
            fmt.Printf("Stream chat error: %v\\\\n", err)
            return
        }
        // 如果接收到的响应中有选择项
        if len(recv.Choices) > 0 {
            // 打印选择项的内容
            fmt.Print(recv.Choices[0].Delta.Content)
        }
    }
}
\`\`\`

`}></RenderMd></Tabs.TabPane>
<Tabs.TabPane title="Java" key="WbfHfFF3Eo"><RenderMd content={`\`\`\`Java
package com.example;

import com.volcengine.ark.runtime.model.completion.chat.ChatCompletionResult;
import com.volcengine.ark.runtime.model.completion.chat.ChatMessage;
import com.volcengine.ark.runtime.model.completion.chat.ChatMessageRole;
import com.volcengine.ark.runtime.model.context.CreateContextRequest;
import com.volcengine.ark.runtime.model.context.CreateContextResult;
import com.volcengine.ark.runtime.model.context.chat.ContextChatCompletionRequest;
import com.volcengine.ark.runtime.service.ArkService;
import com.volcengine.ark.runtime.Const;
import java.util.Collections;

public class ContextChatCompletionsExample {

    /**
     * 主方法，程序入口
     * @param args 命令行参数
     */
    public static void main(String[] args) {

        // 从环境变量中获取 API Key（https://www.volcengine.com/docs/82379/1361424）
        String apiKey = System.getenv("ARK_API_KEY");
        // 替换为您的推理接入点ID（https://www.volcengine.com/docs/82379/1099522）
        String model = "<YOUR_ENDPOINT_ID>";
        // 创建 ArkService 实例
        ArkService service = ArkService.builder().apiKey(apiKey).baseUrl("https://ark.cn-beijing.volces.com/api/v3").build();

        // 打印创建上下文的提示信息
        System.out.println("\\\\n----- create context -----");
        // 创建上下文请求
        CreateContextRequest createContextRequest = CreateContextRequest.builder()
                // 设置模型
                .model(model)
                // 设置上下文模式为会话模式
                .mode(Const.CONTEXT_MODE_SESSION)
                // 设置系统消息
                .messages(Collections.singletonList(ChatMessage.builder().role(ChatMessageRole.SYSTEM)
                        .content("你是李雷").build()))
                // 设置上下文的生存时间（秒）
                .ttl(3600)
                .build();

        // 发送创建上下文请求并获取结果
        CreateContextResult createContextResult = service.createContext(createContextRequest);
        // 打印创建的上下文 ID
        System.out.println("created context, id = " + createContextResult.getId());

        // 打印第一轮聊天（非流式）的提示信息
        System.out.println("\\\\n----- chat round 1 (non-stream) -----");
        // 创建聊天补全请求
        ContextChatCompletionRequest chatCompletionRequest = ContextChatCompletionRequest.builder()
                // 设置上下文 ID
                .contextId(createContextResult.getId())
                // 设置模型
                .model(model)
                // 设置用户消息
                .messages(Collections.singletonList(ChatMessage.builder().role(ChatMessageRole.USER)
                        .content("我是方方").build()))
                .build();

        // 发送聊天补全请求并获取结果
        ChatCompletionResult chatCompletionResult = service.createContextChatCompletion(chatCompletionRequest);
        // 遍历并打印聊天补全结果中的消息内容
        chatCompletionResult.getChoices()
                .forEach(choice -> System.out.println(choice.getMessage().getContent()));

        // 打印第二轮聊天（流式）的提示信息
        System.out.println("\\\\n----- chat round 2 (stream) -----");
        // 创建流式聊天补全请求
        ContextChatCompletionRequest streamChatCompletionRequest = ContextChatCompletionRequest.builder()
                // 设置上下文 ID
                .contextId(createContextResult.getId())
                // 设置模型
                .model(model)
                // 设置用户消息
                .messages(Collections.singletonList(ChatMessage.builder().role(ChatMessageRole.USER)
                        .content("你是谁，我是谁？").build()))
                .build();

        // 发送流式聊天补全请求并处理结果
        service.streamContextChatCompletion(streamChatCompletionRequest)
                // 处理错误
                .doOnError(Throwable::printStackTrace)
                // 阻塞式遍历结果
                .blockingForEach(
                        choice -> {
                            // 如果结果不为空，则打印消息内容
                            if (!choice.getChoices().isEmpty()) {
                                System.out.print(choice.getChoices().get(0).getMessage()
                                        .getContent());
                            }
                        });

        // 关闭服务
        service.shutdownExecutor();
    }
}
\`\`\`

`}></RenderMd></Tabs.TabPane></Tabs>);
```

<span id="d86010f4"></span>

## 典型使用

<span id="f6eb27bb"></span>

### 手动管理 Session 缓存

使用了支持[rolling_tokens 模式](/docs/82379/1396491#a0e4efde)的模型，可以通过下面方法创建 Session 缓存，并可以根据需要来启用自动管理和手动管理 Session 缓存。

```HTTP
curl https://ark.cn-beijing.volces.com/api/v3/context/create \
-H "Authorization: Bearer $ARK_API_KEY" \
-H 'Content-Type: application/json' \
-d '{
    "model":"<YOUR_ENDPOINT_ID>",
    "messages":[
        {"role":"system","content":"你是李雷，你只会说“我是李雷”"}
     ],
     "ttl":3600,
     "mode": "session",
     "truncation_strategy":{
         "type":"rolling_tokens",
         "rolling_tokens": false
     }
}'
```

设置`truncation_strategy.type`为`rolling_tokens`，即可创建 Session 缓存。

- 当您希望自行控制触发 Session 缓存上限时的处理，可以将`truncation_strategy.rolling_tokens`设置为`false`，在历史消息长度超过上下文长度时模型会停止输出，并在返回信息中返回`finish_reason`为`length`，您获取此信息后可以根据您按需进行后续处理。
  > 当您希望自动控制触发 Session 缓存上限时的处理，可以将`truncation_strategy.rolling_tokens`设置为`true`，这是会按照默认的方式进行处理，处理方式请参见[rolling_tokens 模式](/docs/82379/1396491#a0e4efde)。

<span id="7900ebcf"></span>

## 使用说明

- 了解 Session 缓存与前缀缓存，参见 [缓存类型](/docs/82379/1398933#a8910b9a)。
- Session 缓存 API 为有状态 API，不支持并发调用同一 Session 缓存，即不能在同一时刻发起多个带相同 Session 缓存 ID（`context_id`）的请求。
- 不支持 Partial 模式（又称 [Prefill Response](/docs/82379/1359497)），调用 [创建上下文缓存 API](https://www.volcengine.com/docs/82379/1528789) 时，提交的`messages`数组的最后一条消息`role`可以是`user`或`system`，而不能为`assistant`。

```JSON
// 正例
"messages":[
    {"role":"user","content":"你是谁"},
    {"role":"assistant","content":"我是李雷"},
    {"role":"user","content":"今天天气如何"}
 ],
```

```JSON
 // 反例
"messages":[
    {"role":"user","content":"你是谁"},
    {"role":"assistant","content":"我是李雷"}
],
```

- Session 缓存当前只支持在线推理，不支持与批量推理一起使用。

<span id="c03b7f8c"></span>

## 缓存上限说明

随着对话轮数增加，内容会达到 Session 缓存的上限。按照处理方式的不同，可以分为 2 种模式。
<span id="9db98e8d"></span>

### last_history_tokens 模式

触发上限则滚动信息窗口，遵循先进先出的策略。触发缓存上限时，先删除最早的缓存对话记录（初始消息不会删除，即在创建 session 缓存时写入缓存的信息不会删除），再存入新的对话信息。这个模式下，滚动数据不会产生额外的计算成本。
<span id="a0e4efde"></span>

### rolling_tokens 模式

触发上限则定量删除信息并重新计算，使用固定长度 A 来限制 Session 缓存上限，固定长度 B 来控制删除上下文的长度。当 Session 缓存达到上限时，即达到 A 长度时，会进行下面两个动作：

1. 清除 Session 缓存 B 长度的陈旧消息（初始消息不会删除，即在创建 session 缓存时写入的信息不会删除），为后续新的消息腾挪存储空间。
2. 重新计算缓存中历史信息，以确保模型回复与历史交互的连贯性。
   > 具体计算逻辑供您了解：以Doubao\-pro\-32k模型为例，Session 缓存的 token 量达到 `32k（最大上下文长度）-4k（最大输出长度）`时，会删除 4k 陈旧的历史信息（除了初始消息），然后重新计算和存储保留的缓存内容。

触发 Session 缓存上限引起重新计算的轮次，会将保留的历史信息和新消息一样进行计算和存储。表现为此轮 Session 缓存的 token 比例降低为 0，该轮无缓存输入 token，后续又会趋于正常。
<span id="82ae22e3"></span>

## 过期时间

Session 缓存未被使用时会开始计时，达到 TTL（Time To Live），会被删除；如果中途被使用，那么此缓存 TTL 会被重置，并继续保留。

> 举例：您在 8:00 创建了 Session 缓存 A、B，并设置 TTL 为 2 小时。10:00 时，缓存 A 没被使用，缓存 B 在 9:00 被使用。那么，缓存 A 会被删除，B TTL 还有 1 小时。

:::warning
没有触发清除的 Session 缓存，均会占用缓存，从而产生存储费用。您可以根据自己业务合理设置 TTL，保证请求的内容能享受 Session 缓存带来的低成本；又避免 Session 缓存删除前的长期空闲时间。
:::
<span id="8b9c585e"></span>

## 计费说明

计费单价请参见：[模型价格](/docs/82379/1544106)。

```mixin-react
return (<Tabs>
<Tabs.TabPane title="计费项" key="x8jyzlX2Vm"><RenderMd content={`与未使用 Session 缓存相比，模型服务费用会产生在：

* **输入**（元/千 token）：新的请求中您无需重新发送历史对话，输入 token 仅代表添加到正在进行的对话中的新文本。
> 在 rolling_tokens 模式下触发重新计算时，会将保存的历史对话重新计算和缓存，与新输入内容一样计费。

* **缓存输入**（元/千 token）：缓存中使用的内容。方舟自动处理历史记录，并输入给模型，这部分内容即缓存输入内容，他们也会产生费用，但是减少了计算和存储开销，计费费率会显著低于新输入内容。
* **存储**（元/千 token/小时）：历史对话存储在 Session 缓存中，会产生存储费用。计算方式根据每个自然小时使用缓存的最大量乘以单价进行累加。
   举例说明（单价仅为举例使用）：单价为 0.000017 元/千 token/小时，第 1 小时 Session 缓存最大的缓存用量 10k token，第 2 小时 Session 缓存最大的缓存用量 15k token，那么存储费用为：
   \`0.000017*10+0.000017*15 = 0.000425 元\`
   :::warning
   * 在 Session 缓存创建即产生，直到该 Session 缓存被删除（一直未被使用，达 TTL 被删除），停止计费。
   * 存储费用在每个自然小时如 8:00，9:00 等整点出账，不足 1 小时按照 1 小时计算。
   :::
* **输出**（元/千 token）：模型根据输入信息生成的内容。计费方式与未使用 Session 缓存的调用方式一致。
`}></RenderMd></Tabs.TabPane>
<Tabs.TabPane title="计费逻辑" key="uh9Jk4UpPQ"><RenderMd content={`下面介绍对于使用特定缓存的请求（创建缓存后特定的某个 Context ID）的计费逻辑。
每次调用计费用量可在返回的\`usage\`结构体看到。
\`\`\`JSON
"usage": {
    "prompt_tokens": 20,
    "completion_tokens": 8,
    "total_tokens": 28,
    "prompt_tokens_details": {
      "cached_tokens": 10
    }
}
\`\`\`

其中，各个字段含义：

* \`prompt_tokens\`：此次请求输入给模型处理的总的 token 数。
* \`completion_tokens\`：此次请求模型回复的 token 数，即输出的 token 量，对应的计费项为**输出**。
* \`total_tokens\`：此次请求，总共使用的 token 数。
* \`prompt_tokens_details.cached_tokens\`：此次请求，缓存输入的 token 量，对应计费项**缓存输入**。

其中费用计算重要数据。

* **输入 token 量**：可以通过\`prompt_tokens\`\\- \`cached_tokens\`来获得。
* **存储费用**：每个自然小时计算，该小时内\`cache_tokens\`的最大值。如果该小时未请求及变更缓存，则取上个小时\`cache_tokens\`的最大值，以此类推。

某缓存涉及的费用分为请求产生的 token 费用和存储费用，计算逻辑如下：
\`\`\`Shell
使用缓存的请求费用
= 使用缓存的所有请求费用累加
= 请求1(输入费用 + 缓存输入费用 + 输出费用) +请求2(输入费用 + 缓存输入费用 + 输出费用) +...+请求N(输入费用 + 缓存输入费用 + 输出费用)
= 请求1((prompt_tokens-cached_tokens) * 输入单价 + cached_tokens * 缓存输入单价 + completion_tokens * 输出单价 )
+ 请求2((prompt_tokens-cached_tokens) * 输入单价 + cached_tokens * 缓存输入单价 + completion_tokens * 输出单价 )
+...
+ 请求N ((prompt_tokens-cached_tokens) * 输入单价 + cached_tokens * 缓存输入单价 + completion_tokens * 输出单价 )
\`\`\`

\`\`\`Shell
缓存存储花费
= 缓存生命周期内各个自然小时缓存存储费用之和
= 第1小时内缓存 token 最大值 * 存储单价 + 第2小时内缓存 token 最大值 * 存储单价 + ... + 第N小时内缓存 token 最大值 * 存储单价
\`\`\`


> * 自然小时：以实际整点为准，举例缓存存储从 13:59开始，到14:00 时，会被计算为第 1小时。
`}></RenderMd></Tabs.TabPane></Tabs>);
```

<span id="b65d52eb"></span>

## 工作原理

请参见[Session 缓存](/docs/82379/1398933#78048664)。
<span id="c665d4d2"></span>

# 前缀缓存教程

> 快速跳转至 [上下文缓存(Context API)](/docs/82379/1396491)

使用前缀缓存可以降低模型调用的成本。您可以预先存储常用信息如角色、背景等信息作为初始化信息，后续调用模型时无需重复发送此信息给模型，降低开销和成本，尤其适用于具有重复提示或标准化开头文本的应用。
<span id="cbada5ca"></span>

## 快速开始

```mixin-react
return (<Tabs>
<Tabs.TabPane title="Curl" key="wCfdXVNVxU"><RenderMd content={`<span id="610f8556"></span>
### 1.创建前缀缓存
使用前缀缓存前，您需要调用 [创建上下文缓存 API](https://www.volcengine.com/docs/82379/1528789) 创建缓存，并写入初始信息。后续只要在 [上下文缓存对话 API](https://www.volcengine.com/docs/82379/1529329) 中引入此缓存，即可让方舟为您保留初始信息以及享受使用缓存带来的费用折扣。
\`\`\`HTTP
curl https://ark.cn-beijing.volces.com/api/v3/context/create \\
-H "Authorization: Bearer $ARK_API_KEY" \\
-H 'Content-Type: application/json' \\
-d '{
    "model":"<YOUR_ENDPOINT_ID>",
    "messages":[
        {"role":"system","content":"你是李雷，你只会说“我是李雷”"}
     ],
     "ttl":3600,
     "mode": "common_prefix"
}'
\`\`\`

其中：

* \`$ARK_API_KEY\`替换为您的 API Key，或者配置 API Key 至环境变量。
* \`<YOUR_ENDPOINT_ID>\`替换为您的推理接入点 ID。
* \`"ttl":3600\`代表前缀缓存 TTL，当前为 3600 秒。
* \`"mode": "common_prefix"\`代表使用的前缀缓存模式。

模型回复预览：
\`\`\`Shell
{
    "id": "<YOUR_CONTEXT_ID>",
    "model": "<YOUR_ENDPOINT_ID>",
    "ttl": "259200",
    "mode": "common_prefix",
    "usage": {
        "prompt_tokens": 18,
        "completion_tokens": 0,
        "total_tokens": 18,
        "prompt_tokens_details": {
            "cached_tokens": 0
        }
    }
}
\`\`\`

返回的创建的前缀缓存的基本信息，其中\`<YOUR_CONTEXT_ID>\`是创建的前缀缓存的 ID，格式类似\`ctx-****\`，需要记录并在后面请求模型推理服务时使用。
<span id="2ba6482f"></span>
### 2.使用前缀缓存进行对话
我们使用接口，来进行使用前缀缓存的对话。
\`\`\`Shell
curl https://ark.cn-beijing.volces.com/api/v3/context/chat/completions \\
-H "Authorization: Bearer \\$ARK_API_KEY" \\
-H 'Content-Type: application/json' \\
-d '{
    "context_id": "<YOUR_CONTEXT_ID>",
    "model": "<YOUR_ENDPOINT_ID>",
    "messages":[
        {
            "role":"user",
            "content": "你好"
        }
    ]
}'
\`\`\`

其中。

* \`$ARK_API_KEY\`替换为您的 API Key，或者配置 API Key 至环境变量。
* \`<YOUR_CONTEXT_ID>\`替换为之前创建的缓存 ID。
* \`<YOUR_ENDPOINT_ID>\`替换为您的推理接入点 ID。

模型回复预览。
\`\`\`Shell
{
  "id": "****",
  "object": "chat.completion",
  "created": 167765****,
  "model": "<YOUR_ENDPOINT_ID>",
  "choices": [{
    "index": 0,
    "message": {
      "role": "assistant",
      "content": "我是李雷。",
    },
    "logprobs": null,
    "finish_reason": "stop"
  }],
 "usage": {
    "prompt_tokens": 28,
    "completion_tokens": 5,
    "total_tokens": 33,
    "prompt_tokens_details": {
      "cached_tokens": 18
  }
}
\`\`\`

`}></RenderMd></Tabs.TabPane>
<Tabs.TabPane title="Python" key="KzNI1CN4Cb"><RenderMd content={`\`\`\`Python
# 导入datetime模块，用于处理日期和时间
import datetime
# 导入os模块，用于获取环境变量
import os
# 需升级方舟 Python SDK到1.0.116版本或以上，pip install --upgrade 'volcengine-python-sdk[ark]'
from volcenginesdkarkruntime import Ark

# 从环境变量中获取 API Key（https://www.volcengine.com/docs/82379/1361424）
api_key = os.environ.get("ARK_API_KEY")
# 替换为您的推理接入点ID（https://www.volcengine.com/docs/82379/1099522）
model = "<YOUR_ENDPOINT_ID>"

# 创建一个Ark客户端实例，传入API密钥
client = Ark(
    api_key=api_key,
    base_url="https://ark.cn-beijing.volces.com/api/v3",
    )

# 如果当前脚本是作为主程序运行
if __name__ == "__main__":
    # 打印创建上下文的提示信息
    print("----- create context -----")
    # 调用client的context.create方法创建一个会话上下文
    response = client.context.create(
        # 指定模型
        model=model,
        # 指定模式为会话
        mode="common_prefix",
        # 设置消息列表，包含一个系统角色的消息
        messages=[
            {"role": "system", "content": "你是李雷"},
        ],
        # 设置会话的生存时间为60分钟
        ttl=datetime.timedelta(minutes=60),
    )
    # 打印创建上下文的响应结果
    print(response)

    # 打印第一轮非流式聊天的提示信息
    print("----- chat round 1 (non-stream) -----")
    # 调用client的context.completions.create方法进行非流式聊天
    chat_response = client.context.completions.create(
        # 指定上下文ID
        context_id=response.id,
        # 指定模型
        model=model,
        # 设置消息列表，包含一个用户角色的消息
        messages=[
            {"role": "user", "content": "我是方方"},
        ],
        # 设置为非流式
        stream=False,
    )
    # 打印聊天响应的消息内容
    print(chat_response.choices[0].message.content)
    # 打印聊天响应的使用情况
    print(chat_response.usage)

    # 打印第二轮流式聊天的提示信息
    print("----- chat round 2 (streaming) -----")
    # 调用client的context.completions.create方法进行流式聊天
    stream = client.context.completions.create(
        # 指定上下文ID
        context_id=response.id,
        # 指定模型
        model=model,
        # 设置消息列表，包含一个用户角色的消息
        messages=[
            {"role": "user", "content": "你是谁，我是谁？"},
        ],
        # 设置流式选项，包含使用情况
        stream_options={
            "include_usage": True,
        },
        # 设置为流式
        stream=True,
    )
    # 遍历流式响应的每个块
    for chunk in stream:
        # 如果块中包含使用情况信息，则打印使用情况
        if chunk.usage:
            print(chunk.usage)
        # 如果块中不包含选择信息，则继续下一个块
        if not chunk.choices:
            continue
        print(chunk.choices[0].delta.content, end="")
\`\`\`

`}></RenderMd></Tabs.TabPane>
<Tabs.TabPane title="Go" key="useVSHBy4m"><RenderMd content={`\`\`\`Go
package main

import (
    "context"
    "fmt"
    "io"
    "os"

    "github.com/volcengine/volcengine-go-sdk/service/arkruntime"
    "github.com/volcengine/volcengine-go-sdk/service/arkruntime/model"
    "github.com/volcengine/volcengine-go-sdk/volcengine"
)

// main 函数是程序的入口点
func main() {
    // 替换为您的推理接入点ID（https://www.volcengine.com/docs/82379/1099522）
    const Model = "<YOUR_ENDPOINT_ID>"
    // 使用 API Key创建一个客户端，从环境变量中获取 API Key（https://www.volcengine.com/docs/82379/1361424）
    client := arkruntime.NewClientWithApiKey(
        os.Getenv("ARK_API_KEY"),
        arkruntime.WithBaseUrl("https://ark.cn-beijing.volces.com/api/v3"),
        )
    // 创建一个新的上下文
    goCtx := context.Background()

    // 打印创建上下文的提示信息
    fmt.Println("----- create context -----")
    // 创建一个新的上下文请求
    createCtxReq := model.CreateContextRequest{
        // 设置模型为常量 Model
        Model: Model,
        // 设置模式为会话模式
        Mode: model.ContextModeCommonPrefix,
        // 设置初始消息
        Messages: []*model.ChatCompletionMessage{
            {
                // 设置角色为系统
                Role: model.ChatMessageRoleSystem,
                // 设置内容为系统消息
                Content: &model.ChatCompletionMessageContent{
                    // 设置字符串值为系统消息内容
                    StringValue: volcengine.String("你是李雷"),
                },
            },
        },
        // 设置 TTL 为 3600 秒
        TTL: volcengine.Int(3600),
    }

    // 发送创建上下文请求并获取响应
    createCtxRsp, err := client.CreateContext(goCtx, createCtxReq)
    // 如果发生错误，打印错误信息并返回
    if err != nil {
        fmt.Printf("create context error: %v\\\\n", err)
        return
    }
    // 打印创建上下文的响应
    fmt.Printf("create context response: %v\\\\n", createCtxRsp)

    // 打印非流式聊天的提示信息
    fmt.Println("----- chat round 1 (non-stream) -----")
    // 创建一个新的聊天请求
    req := model.ContextChatCompletionRequest{
        // 设置上下文ID为创建上下文的响应ID
        ContextID: createCtxRsp.ID,
        // 设置模型为常量 Model
        Model: Model,
        // 设置消息
        Messages: []*model.ChatCompletionMessage{
            {
                // 设置角色为用户
                Role: model.ChatMessageRoleUser,
                // 设置内容为用户消息
                Content: &model.ChatCompletionMessageContent{
                    // 设置字符串值为用户消息内容
                    StringValue: volcengine.String("我的名字是方方"),
                },
            },
        },
    }

    // 发送聊天请求并获取响应
    resp, err := client.CreateContextChatCompletion(goCtx, req)
    // 如果发生错误，打印错误信息并返回
    if err != nil {
        fmt.Printf("non-stream chat error: %v\\\\n", err)
        return
    }
    // 打印聊天响应的内容
    fmt.Println(*resp.Choices[0].Message.Content.StringValue)

    // 打印流式聊天的提示信息
    fmt.Println("----- chat round 2 (stream) -----")
    // 创建一个新的聊天请求
    req = model.ContextChatCompletionRequest{
        // 设置上下文ID为创建上下文的响应ID
        ContextID: createCtxRsp.ID,
        // 设置模型为常量 Model
        Model: Model,
        // 设置消息
        Messages: []*model.ChatCompletionMessage{
            {
                // 设置角色为用户
                Role: model.ChatMessageRoleUser,
                // 设置内容为用户消息
                Content: &model.ChatCompletionMessageContent{
                    // 设置字符串值为用户消息内容
                    StringValue: volcengine.String("你是谁，我是谁？"),
                },
            },
        },
    }
    // 发送聊天请求并获取流式响应
    stream, err := client.CreateContextChatCompletionStream(goCtx, req)
    // 如果发生错误，打印错误信息并返回
    if err != nil {
        fmt.Printf("stream chat error: %v\\\\n", err)
        return
    }
    // 延迟关闭流式响应
    defer stream.Close()

    // 循环接收流式响应
    for {
        // 接收流式响应
        recv, err := stream.Recv()
        // 如果接收到 EOF，返回
        if err == io.EOF {
            return
        }
        // 如果发生错误，打印错误信息并返回
        if err != nil {
            fmt.Printf("Stream chat error: %v\\\\n", err)
            return
        }
        // 如果接收到的响应中有选择项
        if len(recv.Choices) > 0 {
            // 打印选择项的内容
            fmt.Print(recv.Choices[0].Delta.Content)
        }
    }
}
\`\`\`

`}></RenderMd></Tabs.TabPane>
<Tabs.TabPane title="Java" key="l6nOjDoKt3"><RenderMd content={`\`\`\`Java
package com.example;

import com.volcengine.ark.runtime.model.completion.chat.ChatCompletionResult;
import com.volcengine.ark.runtime.model.completion.chat.ChatMessage;
import com.volcengine.ark.runtime.model.completion.chat.ChatMessageRole;
import com.volcengine.ark.runtime.model.context.CreateContextRequest;
import com.volcengine.ark.runtime.model.context.CreateContextResult;
import com.volcengine.ark.runtime.model.context.chat.ContextChatCompletionRequest;
import com.volcengine.ark.runtime.service.ArkService;
import com.volcengine.ark.runtime.Const;
import java.util.Collections;

public class ContextChatCompletionsExample {

    /**
     * 主方法，程序入口
     * @param args 命令行参数
     */
    public static void main(String[] args) {

        // 从环境变量中获取 API Key（https://www.volcengine.com/docs/82379/1361424）
        String apiKey = System.getenv("ARK_API_KEY");
        // 替换为您的推理接入点ID（https://www.volcengine.com/docs/82379/1099522）
        String model = "<YOUR_ENDPOINT_ID>";
        // 创建 ArkService 实例
        ArkService service = ArkService.builder().apiKey(apiKey).baseUrl("https://ark.cn-beijing.volces.com/api/v3").build();

        // 打印创建上下文的提示信息
        System.out.println("\\\\n----- create context -----");
        // 创建上下文请求
        CreateContextRequest createContextRequest = CreateContextRequest.builder()
                // 设置模型
                .model(model)
                // 设置上下文模式为会话模式
                .mode(Const.CONTEXT_MODE_COMMON_PREFIX)
                // 设置系统消息
                .messages(Collections.singletonList(ChatMessage.builder().role(ChatMessageRole.SYSTEM)
                        .content("你是李雷").build()))
                // 设置上下文的生存时间（秒）
                .ttl(3600)
                .build();

        // 发送创建上下文请求并获取结果
        CreateContextResult createContextResult = service.createContext(createContextRequest);
        // 打印创建的上下文 ID
        System.out.println("created context, id = " + createContextResult.getId());

        // 打印第一轮聊天（非流式）的提示信息
        System.out.println("\\\\n----- chat round 1 (non-stream) -----");
        // 创建聊天补全请求
        ContextChatCompletionRequest chatCompletionRequest = ContextChatCompletionRequest.builder()
                // 设置上下文 ID
                .contextId(createContextResult.getId())
                // 设置模型
                .model(model)
                // 设置用户消息
                .messages(Collections.singletonList(ChatMessage.builder().role(ChatMessageRole.USER)
                        .content("我是方方").build()))
                .build();

        // 发送聊天补全请求并获取结果
        ChatCompletionResult chatCompletionResult = service.createContextChatCompletion(chatCompletionRequest);
        // 遍历并打印聊天补全结果中的消息内容
        chatCompletionResult.getChoices()
                .forEach(choice -> System.out.println(choice.getMessage().getContent()));

        // 打印第二轮聊天（流式）的提示信息
        System.out.println("\\\\n----- chat round 2 (stream) -----");
        // 创建流式聊天补全请求
        ContextChatCompletionRequest streamChatCompletionRequest = ContextChatCompletionRequest.builder()
                // 设置上下文 ID
                .contextId(createContextResult.getId())
                // 设置模型
                .model(model)
                // 设置用户消息
                .messages(Collections.singletonList(ChatMessage.builder().role(ChatMessageRole.USER)
                        .content("你是谁，我是谁？").build()))
                .build();

        // 发送流式聊天补全请求并处理结果
        service.streamContextChatCompletion(streamChatCompletionRequest)
                // 处理错误
                .doOnError(Throwable::printStackTrace)
                // 阻塞式遍历结果
                .blockingForEach(
                        choice -> {
                            // 如果结果不为空，则打印消息内容
                            if (!choice.getChoices().isEmpty()) {
                                System.out.print(choice.getChoices().get(0).getMessage()
                                        .getContent());
                            }
                        });

        // 关闭服务
        service.shutdownExecutor();
    }
}
\`\`\`

`}></RenderMd></Tabs.TabPane></Tabs>);
```

<span id="5112bb7d"></span>

## 支持的模型

请参见文档 [上下文缓存](/docs/82379/1330310#e6772192)。
<span id="8d90bd01"></span>

## 使用限制

- 与 Session 缓存不同，前缀缓存支持并发调用。
- 不支持 Partial 模式（又称 [Prefill Response](/docs/82379/1359497)），调用[上下文缓存对话 API](https://www.volcengine.com/docs/82379/1529329) 时，`messages`数组的最后一条消息的`role`字段取值可以是`user`或`system`，而不能为`assistant`。

```JSON
// 正例
"messages":[
    {"role":"user","content":"你是谁"},
    {"role":"assistant","content":"我是李雷"},
    {"role":"user","content":"今天天气如何"}
 ],
```

```JSON
 // 反例
"messages":[
    {"role":"user","content":"你是谁"},
    {"role":"assistant","content":"我是李雷"}
],
```

- 当前前缀缓存过期时长可配置范围在1小时到7天，即`ttl`字段设置范围（单位：秒）为 [3600, 604800]。具体字段配置说明，请参见 [请求体](/docs/82379/1346559#%E8%AF%B7%E6%B1%82%E4%BD%93)。
- 前缀缓存当前只支持在线推理，不支持与批量推理一起使用。

如果您需要使用Java来调用模型推理服务，您可以使用方舟的 Java SDK 来很方便使用前缀缓存。
<span id="3c13d4e8"></span>

## 计费说明

计费单价请参见：[后付费（按tokens使用量付费）](/docs/82379/66619f83f281250274ef4eaa#%E5%90%8E%E4%BB%98%E8%B4%B9%EF%BC%88%E6%8C%89tokens%E4%BD%BF%E7%94%A8%E9%87%8F%E4%BB%98%E8%B4%B9%EF%BC%89)。

```mixin-react
return (<Tabs>
<Tabs.TabPane title="计费项" key="LkGLQcvTZR"><RenderMd content={`与 Session 缓存类似，前缀缓存采用透明的计费方式，基于以下四个关键因素：

* 输入（元/千 token）：输入 tokens 代表发送给大语言模型的新文本，不包括缓存的前缀。
* 输出（元/千 token）：输出标记代表大语言模型生成的文本。输出标记的计费与标准大语言模型使用方式一致。
* 缓存输入（元/千 token）：每次从前缀缓存中检索标记都会产生缓存输入费用。此费用通常低于输入标记费用。
* 存储（元/千 token/小时）：存储费用按小时计费，基于每个自然小时内所有前缀存储的最大标记数。存储费用将持续到前缀的生存时间 (TTL) 到期。
`}></RenderMd></Tabs.TabPane>
<Tabs.TabPane title="计费逻辑" key="j5lRzGVPbu"><RenderMd content={`您发起带前缀缓存的请求时，会因为下面行为产生费用：

* 新的输入。
* 缓存输入。
* 模型生成的输出。
* 初始信息存储费用（按存储信息大小以及小时计费）。

每次调用模型服务的用量，除了存储初始信息的费用，均可在返回的\`usage\`结构体看到。
\`\`\`JSON
{
    ...
    "usage": {
        "prompt_tokens": 20,
        "completion_tokens": 8,
        "total_tokens": 28,
        "prompt_tokens_details": {
          "cached_tokens": 10
      }
  }
\`\`\`

其中，各个字段含义：

* \`prompt_tokens\`：此次请求输入给模型处理的总的 token 数。
* \`completion_tokens\`：此次请求模型回复的 token 数，即输出的 token 量，对应的计费项为**输出**。
* \`total_tokens\`：此次请求，总共使用的 token 数。
* \`prompt_tokens_details.cached_tokens\`：此次请求模型的缓存入的 token 量，对应计费项**缓存输入**。

其中费用计算重要数据。

* **输入 token 量**：可通过\`prompt_tokens\`\\- \`cached_tokens\`来获得。
* **存储费用**：每个自然小时计算\`cache_tokens\`的值。

某缓存涉及的费用分为请求产生的 token 费用和存储费用，计算逻辑如下：
\`\`\`Shell
使用缓存的请求费用
= 使用缓存的所有请求费用累加
= 请求1(输入费用 + 缓存输入费用 + 输出费用) +请求2(输入费用 + 缓存输入费用 + 输出费用) +...+请求N(输入费用 + 缓存输入费用 + 输出费用)
= 请求1((prompt_tokens-cached_tokens) * 输入单价 + cached_tokens * 缓存输入单价 + completion_tokens * 输出单价 )
+ 请求2((prompt_tokens-cached_tokens) * 输入单价 + cached_tokens * 缓存输入单价 + completion_tokens * 输出单价 )
+...
+ 请求N ((prompt_tokens-cached_tokens) * 输入单价 + cached_tokens * 缓存输入单价 + completion_tokens * 输出单价 )
\`\`\`

\`\`\`Shell
缓存存储花费
= 缓存生命周期内各个自然小时缓存存储费用之和
= 缓存 token 量 * 存储自然小时数 * 存储单价
\`\`\`


> * 存储自然小时数：和存储时长可能存在差异，以实际整点为准，举例缓存存储从 13:59开始，到14:00 时，会被计算为 1 小时。
> * 成本优化技巧：分析初始信息的使用频率，合理配置缓存生存时间（ttl），平衡缓存收益和存储支出。
`}></RenderMd></Tabs.TabPane></Tabs>);
```

<span id="d85c1057"></span>

## 工作原理

请参见文档[前缀缓存](/docs/82379/1398933#51929890)。
