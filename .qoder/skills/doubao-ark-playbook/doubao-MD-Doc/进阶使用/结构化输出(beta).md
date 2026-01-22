当您需要模型像程序一样输出标准格式（这里主要指 JSON 格式）而不是自然语言，方便工具进行标准化处理或展示时，可以使用格式化输出能力。
要启用该能力，需在请求时配置 **response_format** 对象，来指定模型输出 JSON 格式，甚至通过定义 JSON 结构，进一步定义模型输出哪些字段信息。
与通过提示词控制模型输出 JSON 格式的方法（不推荐）相比，使用结构化输出能力有以下好处：

- 输出更可靠：输出结构始终符合预期数据类型，包括结构中字段层级、名称、类型、顺序等，不必担心丢失必要的字段或生成幻觉的枚举值等，
- 使用更加简单：使用 API 字段来定义，提示词可更加简单，无需在提示词中反复强调或使用强烈措辞。

:::tip
该能力尚在 beta 阶段，请谨慎在生产环境使用。
:::

<span id="3aae5325"></span>

# 支持的模型

请参见[结构化输出能力](/docs/82379/1330310#25b394c2)。
<span id="79cfa745"></span>

# 使用限制

使用[TPM保障包](/docs/82379/1510762)或通过[模型单元](/docs/82379/1568332)部署模型进行在线推理时，不支持使用结构化输出能力。
<span id="bbefb0e1"></span>

# API 文档

结构化输出 API 字段说明见[对话(Chat) API](https://www.volcengine.com/docs/82379/1494384)。
<span id="87d19412"></span>

# 快速开始

<span id="7b9d4fd7"></span>

## json_schema 模式

```mixin-react
return (<Tabs>
<Tabs.TabPane title="Curl" key="A1xjig7UhR"><RenderMd content={`\`\`\`Bash
curl --location "https://ark.cn-beijing.volces.com/api/v3/chat/completions" \\
--header "Authorization: Bearer $ARK_API_KEY" \\
--header "Content-Type: application/json" \\
--data '{
  "model": "doubao-seed-1-6-250615",
  "messages": [
    {
      "role": "system",
      "content": "你是一位数学辅导老师。"
    },
    {
      "role": "user",
      "content": [
        {
          "type": "text",
          "text": "使用中文解题: 8x + 9 = 32 and x + y = 1"
        }
      ]
    }
  ],
  "response_format": {
    "type": "json_schema",
    "json_schema": {
      "name": "math_reasoning",
      "schema": {
        "type": "object",
        "properties": {
          "steps": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "explanation": {
                  "type": "string"
                },
                "output": {
                  "type": "string"
                }
              },
              "required": [
                "explanation",
                "output"
              ],
              "additionalProperties": false
            }
          },
          "final_answer": {
            "type": "string"
          }
        },
        "required": [
          "steps",
          "final_answer"
        ],
        "additionalProperties": false
      },
      "strict": true
    }
  },
  "thinking": {
    "type": "disabled"
  }
}'
\`\`\`

  可以通过 **thinking** 字段控制模型是否启用深度思考能力。

   * \`"disabled"\`：不使用深度思考能力。
   * \`"enabled"\`：强制使用深度思考能力。
`}></RenderMd></Tabs.TabPane>
<Tabs.TabPane title="Python SDK" key="OIPiD93i6W"><RenderMd content={`\`\`\`Python
from volcenginesdkarkruntime import Ark
import os
from pydantic import BaseModel  # 用于定义响应解析模型

# 初始化方舟SDK客户端
client = Ark(
    # 从环境变量获取方舟API Key（需提前设置环境变量）
    api_key=os.environ.get("ARK_API_KEY"),
)

# 定义分步解析模型（对应业务场景的结构化响应）
class Step(BaseModel):
    explanation: str  # 步骤说明
    output: str       # 步骤计算结果

# 定义最终响应模型（包含分步过程和最终答案）
class MathResponse(BaseModel):
    steps: list[Step]       # 解题步骤列表
    final_answer: str       # 最终答案

# 调用方舟模型生成响应（自动解析为指定模型）
completion = client.beta.chat.completions.parse(
    model="doubao-seed-1-6-250615",  # 具体模型需替换为实际可用模型
    messages=[
        {"role": "system", "content": "你是一位数学辅导老师，需详细展示解题步骤"},
        {"role": "user", "content": "用中文解方程组：8x + 9 = 32 和 x + y = 1"}
    ],
    response_format=MathResponse,  # 指定响应解析模型
    extra_body={
         "thinking": {
             "type": "disabled" # 不使用深度思考能力
             # "type": "enabled" # 使用深度思考能力
         }
     }
)

# 提取解析后的结构化响应
resp = completion.choices[0].message.parsed

# 打印格式化的JSON结果
print(resp.model_dump_json(indent=2))
\`\`\`

`}></RenderMd></Tabs.TabPane>
<Tabs.TabPane title="OpenAI Python SDK" key="R1EGFVh9WN"><RenderMd content={`\`\`\`Python
from openai import OpenAI
import os
from pydantic import BaseModel

client = OpenAI(
    # 从环境变量中获取方舟 API Key
    api_key=os.environ.get("ARK_API_KEY"),
    base_url = "https://ark.cn-beijing.volces.com/api/v3",
)

class Step(BaseModel):
    explanation: str
    output: str
class MathResponse(BaseModel):
    steps: list[Step]
    final_answer: str

completion = client.beta.chat.completions.parse(
    model = "doubao-seed-1-6-250615",  # 替换为您需要使用的模型
    messages = [
        {"role": "system", "content": "你是一位数学辅导老师。"},
        {"role": "user", "content": "使用中文解题: 8x + 9 = 32 and x + y = 1"},
    ],
    response_format=MathResponse,
    extra_body={
         "thinking": {
             "type": "disabled" # 不使用深度思考能力
             # "type": "enabled" # 使用深度思考能力
         }
     }
)
resp = completion.choices[0].message.parsed
# 打印 JSON 格式结果
print(resp.model_dump_json(indent=2))
\`\`\`

`}></RenderMd></Tabs.TabPane>
<Tabs.TabPane title="Go SDK" key="ngPPGgHcrR"><RenderMd content={`\`\`\`Go
package main

import (
    "context"
    "encoding/json"
    "fmt"
    "os"
    "github.com/invopop/jsonschema" // required go1.18+
    "github.com/volcengine/volcengine-go-sdk/service/arkruntime"
    "github.com/volcengine/volcengine-go-sdk/service/arkruntime/model"
    "github.com/volcengine/volcengine-go-sdk/volcengine"
)

// 定义分步解析模型（对应业务场景的结构化响应）
type Step struct {
    Explanation string \`json:"explanation" jsonschema_description:"步骤说明"\`
    Output      string \`json:"output" jsonschema_description:"步骤计算结果"\`
}

// 定义最终响应模型（包含分步过程和最终答案）
type MathResponse struct {
    Steps       []Step \`json:"steps" jsonschema_description:"解题步骤列表"\`
    FinalAnswer string \`json:"final_answer" jsonschema_description:"最终答案"\`
}

// 复用原有 Schema 生成函数（已优化返回类型）
func GenerateSchema[T any]() *jsonschema.Schema { // <-- 优化返回类型为具体 Schema 类型
    reflector := jsonschema.Reflector{
        AllowAdditionalProperties: false,
        DoNotReference:            true,
    }
    return reflector.Reflect(new(T)) // 使用 new(T) 避免空值问题
}

// 生成数学响应的 JSON Schema
var MathResponseSchema = GenerateSchema[MathResponse]()

func main() {
    client := arkruntime.NewClientWithApiKey(
        os.Getenv("ARK_API_KEY"),
        )
    ctx := context.Background()

    // 构造请求消息（包含 system 和 user 角色）
    messages := []*model.ChatCompletionMessage{
        {
            Role: model.ChatMessageRoleSystem,
            Content: &model.ChatCompletionMessageContent{
                StringValue: volcengine.String("你是一位数学辅导老师，需详细展示解题步骤"),
            },
        },
        {
            Role: model.ChatMessageRoleUser,
            Content: &model.ChatCompletionMessageContent{
                StringValue: volcengine.String("用中文解方程组：8x + 9 = 32 和 x + y = 1"),
            },
        },
    }

    // 配置响应格式（使用 MathResponse 的 Schema）
    schemaParam := model.ResponseFormatJSONSchemaJSONSchemaParam{
        Name:        "math_response", // 对应 Python 中的响应名称
        Description: "数学题解答的结构化响应",
        Schema:      MathResponseSchema,
        Strict:      true,
    }

    // 构造请求（包含 thinking 配置）
    req := model.CreateChatCompletionRequest{
        Model:    "doubao-seed-1-6-250615", // 需替换为实际可用模型
        Messages: messages,
        ResponseFormat: &model.ResponseFormat{
            Type:       model.ResponseFormatJSONSchema,
            JSONSchema: &schemaParam,
        },
        Thinking: &model.Thinking{
            // Type: model.ThinkingTypeDisabled, // 关闭深度思考能力
            Type: model.ThinkingTypeEnabled, //开启深度思考能力
        },
    }


    // 调用 API
    resp, err := client.CreateChatCompletion(ctx, req)
    if err != nil {
        fmt.Printf("structured output chat error: %v\\n", err)
        return
    }


    // 解析结构化响应（关键差异：Go 需要手动反序列化）
    var mathResp MathResponse
    err = json.Unmarshal([]byte(*resp.Choices[0].Message.Content.StringValue), &mathResp)
    if err != nil {
        panic(err.Error())
    }


    // 打印格式化结果（使用 json.MarshalIndent 实现缩进）
    prettyJSON, _ := json.MarshalIndent(mathResp, "", "  ")
    fmt.Println(string(prettyJSON))
}
\`\`\`

`}></RenderMd></Tabs.TabPane>
<Tabs.TabPane title="Java SDK" key="TC8M6tHjib"><RenderMd content={`\`\`\`Java
package com.example;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.volcengine.ark.runtime.model.completion.chat.ChatCompletionRequest;
import com.volcengine.ark.runtime.model.completion.chat.ChatCompletionRequest.ChatCompletionRequestResponseFormat;
import com.volcengine.ark.runtime.model.completion.chat.ChatMessage;
import com.volcengine.ark.runtime.model.completion.chat.ChatMessageRole;
import com.volcengine.ark.runtime.model.completion.chat.ResponseFormatJSONSchemaJSONSchemaParam;
import com.volcengine.ark.runtime.service.ArkService;
import okhttp3.ConnectionPool;
import okhttp3.Dispatcher;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;

public class ChatCompletionsStructuredOutputsExamplev4 {
    static String apiKey = System.getenv("ARK_API_KEY");
    static ArkService service = ArkService.builder()
            .connectionPool(new ConnectionPool(5, 1, TimeUnit.SECONDS))
            .dispatcher(new Dispatcher())
            .apiKey(apiKey)
            .build();

    public static void main(String[] args) throws JsonProcessingException {
        ObjectMapper mapper = new ObjectMapper();

        // 构造消息列表（包含 system 和 user 角色）
        List<ChatMessage> messages = new ArrayList<>();
        messages.add(ChatMessage.builder()
                .role(ChatMessageRole.SYSTEM)
                .content("你是一位数学辅导老师，需详细展示解题步骤")
                .build());
        messages.add(ChatMessage.builder()
                .role(ChatMessageRole.USER)
                .content("用中文解方程组：8x + 9 = 32 和 x + y = 1")
                .build());

        // 生成 JSON Schema
        String schemaJson = "{\\n" +
                "  \\"type\\": \\"object\\",\\n" +
                "  \\"properties\\": {\\n" +
                "    \\"steps\\": {\\n" +
                "      \\"type\\": \\"array\\",\\n" +
                "      \\"items\\": {\\n" +
                "        \\"$ref\\": \\"#/definitions/Step\\"\\n" +
                "      }\\n" +
                "    },\\n" +
                "    \\"finalAnswer\\": {\\n" +
                "      \\"type\\": \\"string\\"\\n" +
                "    }\\n" +
                "  },\\n" +
                "  \\"definitions\\": {\\n" +
                "    \\"Step\\": {\\n" +
                "      \\"type\\": \\"object\\",\\n" +
                "      \\"properties\\": {\\n" +
                "        \\"explanation\\": {\\n" +
                "          \\"type\\": \\"string\\"\\n" +
                "        },\\n" +
                "        \\"output\\": {\\n" +
                "          \\"type\\": \\"string\\"\\n" +
                "        }\\n" +
                "      }\\n" +
                "    }\\n" +
                "  }\\n" +
                "}";
        JsonNode schemaNode = mapper.readTree(schemaJson);

        // 配置响应格式
        ChatCompletionRequestResponseFormat responseFormat = new ChatCompletionRequestResponseFormat(
                "json_schema",
                new ResponseFormatJSONSchemaJSONSchemaParam(
                        "math_response",
                        "数学题解答的结构化响应",
                        schemaNode,
                        true
                )
        );

        // 构造请求（包含 thinking 配置）
        ChatCompletionRequest request = ChatCompletionRequest.builder()
                .model("doubao-seed-1-6-250615") // 替换为实际使用模型
                .messages(messages)
                .responseFormat(responseFormat)
                .thinking(new ChatCompletionRequest.ChatCompletionRequestThinking("disabled")) // 关闭模型深度思考能力
                .build();

        // 调用 API 并解析响应
        var response = service.createChatCompletion(request);
        if (!response.getChoices().isEmpty()) {
            String content = String.valueOf(response.getChoices().get(0).getMessage().getContent());
            JsonNode jsonNode = mapper.readTree(content);
            // 打印格式化结果
            System.out.println(mapper.writerWithDefaultPrettyPrinter().writeValueAsString(jsonNode));
        }

        service.shutdownExecutor();
    }
}
\`\`\`

`}></RenderMd></Tabs.TabPane></Tabs>);
```

返回预览

```JSON
{
  "steps": [
    {
      "explanation": "解第一个方程8x + 9 = 32，先将等式两边同时减去9，得到8x = 32 - 9",
      "output": "8x = 23"
    },
    {
      "explanation": "然后等式两边同时除以8，求出x的值",
      "output": "x = 23/8"
    },
    {
      "explanation": "将x = 23/8代入第二个方程x + y = 1，求解y，即y = 1 - x",
      "output": "y = 1 - 23/8"
    },
    {
      "explanation": "计算1 - 23/8，通分后得到(8 - 23)/8",
      "output": "y = -15/8"
    }
  ],
  "final_answer": "x = 23/8，y = -15/8"
}
```

<span id="47db26a6"></span>

## json_object 模式

> 需要在输入信息中包含字符串 json，并配置`"response_format":{"type": "json_object"}`。

```mixin-react
return (<Tabs>
<Tabs.TabPane title="Curl" key="ijdSjbB3RK"><RenderMd content={`\`\`\`Bash
curl https://ark.cn-beijing.volces.com/api/v3/chat/completions \\
-H "Authorization: Bearer $ARK_API_KEY" \\
-H "Content-Type: application/json" \\
-d '{
  "model": "doubao-seed-1-6-251015",
  "messages": [
    {"role": "user", "content": "常见的十字花科植物有哪些？json输出"}
  ],
  "thinking": {
    "type": "disabled"
  },
  "response_format":{
    "type": "json_object"
  }
}'
\`\`\`

  可以通过 **thinking** 字段控制模型是否启用深度思考能力。

   * \`"disabled"\`：不使用深度思考能力。
   * \`"enabled"\`：强制使用深度思考能力。
`}></RenderMd></Tabs.TabPane>
<Tabs.TabPane title="Python SDK" key="akeSqPg1TE"><RenderMd content={`\`\`\`Python
from volcenginesdkarkruntime import Ark
import os

# 初始化方舟SDK客户端
client = Ark(
    # 从环境变量获取方舟API Key（需提前设置环境变量）
    api_key=os.environ.get("ARK_API_KEY"),
    base_url="https://ark.cn-beijing.volces.com/api/v3"
)

# 调用方舟模型生成响应
completion = client.chat.completions.create(
    model="doubao-seed-1-6-251015",  # Replace with Model ID
    messages=[
        {"role": "user", "content": "常见的十字花科植物有哪些？json输出"}
    ],
    response_format={"type":"json_object"},
    thinking={"type": "disabled"},# 不使用深度思考能力
)

# 打印原始响应内容
print(completion.choices[0].message.content)
\`\`\`

`}></RenderMd></Tabs.TabPane>
<Tabs.TabPane title="OpenAI Python SDK" key="zglHpg2WnB"><RenderMd content={`\`\`\`Python
from openai import OpenAI
import os

# 初始化客户端
client = OpenAI(
    # 从环境变量获取方舟API Key（需提前设置环境变量）
    api_key=os.environ.get("ARK_API_KEY"),
    base_url="https://ark.cn-beijing.volces.com/api/v3"
)

# 调用方舟模型生成响应
completion = client.chat.completions.create(
    model="doubao-seed-1-6-251015",  # Replace with Model ID
    messages=[
        {"role": "user", "content": "常见的十字花科植物有哪些？json输出"}
    ],
    response_format={"type":"json_object"},
    extra_body={
         "thinking": {
             "type": "disabled" # 不使用深度思考能力
             # "type": "enabled" # 使用深度思考能力
         }
     },
)

# 打印原始响应内容
print(completion.choices[0].message.content)
\`\`\`

`}></RenderMd></Tabs.TabPane>
<Tabs.TabPane title="Go SDK" key="CCWZZmBxia"><RenderMd content={`\`\`\`Go
package main

import (
    "context"
    "fmt"
    "os"
    "github.com/volcengine/volcengine-go-sdk/service/arkruntime"
    "github.com/volcengine/volcengine-go-sdk/service/arkruntime/model"
    "github.com/volcengine/volcengine-go-sdk/volcengine"
)

func main() {
    client := arkruntime.NewClientWithApiKey(
        os.Getenv("ARK_API_KEY"),
        arkruntime.WithBaseUrl("https://ark.cn-beijing.volces.com/api/v3"),
        )
    ctx := context.Background()

    // 构造请求消息
    messages := []*model.ChatCompletionMessage{
        {
            Role: model.ChatMessageRoleUser,
            Content: &model.ChatCompletionMessageContent{
                StringValue: volcengine.String("常见的十字花科植物有哪些？json输出"),
            },
        },
    }

    // 构造请求（包含 thinking 配置）
    req := model.CreateChatCompletionRequest{
        Model:    "doubao-seed-1-6-251015", //Replace with Model ID
        Messages: messages,
        ResponseFormat: &model.ResponseFormat{
            Type:       model.ResponseFormatJsonObject,
        },
        Thinking: &model.Thinking{
            Type: model.ThinkingTypeDisabled, // 关闭深度思考能力
            // Type: model.ThinkingTypeEnabled, //开启深度思考能力
        },
    }

    // 调用 API
    resp, err := client.CreateChatCompletion(ctx, req)
    if err != nil {
        fmt.Printf("chat error: %v\\n", err)
        return
    }

    fmt.Println(*resp.Choices[0].Message.Content.StringValue)
}
\`\`\`

`}></RenderMd></Tabs.TabPane>
<Tabs.TabPane title="Java SDK" key="Yo7QaK8kpR"><RenderMd content={`\`\`\`Java
package com.example;

import com.volcengine.ark.runtime.model.completion.chat.ChatCompletionRequest;
import com.volcengine.ark.runtime.model.completion.chat.ChatMessage;
import com.volcengine.ark.runtime.model.completion.chat.ChatMessageRole;
import com.volcengine.ark.runtime.service.ArkService;

import java.util.ArrayList;
import java.util.List;

/**
 * 这是一个示例类，展示了如何使用ArkService来完成聊天功能。
 */
public class ChatCompletionsExample {
  public static void main(String[] args) {
    // 从环境变量中获取API密钥
    String apiKey = System.getenv("ARK_API_KEY");

    // 创建ArkService实例
    ArkService arkService = ArkService.builder().apiKey(apiKey).baseUrl("https://ark.cn-beijing.volces.com/api/v3").build();

    // 初始化消息列表
    List<ChatMessage> chatMessages = new ArrayList<>();

    // 创建用户消息
    ChatMessage userMessage = ChatMessage.builder()
        .role(ChatMessageRole.USER) // 设置消息角色为用户
        .content("常见的十字花科植物有哪些？json输出") // 设置消息内容
        .build();

    // 将用户消息添加到消息列表
    chatMessages.add(userMessage);

    // 创建聊天完成请求
    ChatCompletionRequest chatCompletionRequest = ChatCompletionRequest.builder()
        .model("doubao-seed-1-6-251015")// Replace with Model ID
        .messages(chatMessages) // 设置消息列表
        .responseFormat(new ChatCompletionRequest.ChatCompletionRequestResponseFormat("json_object"))
        .thinking(new ChatCompletionRequest.ChatCompletionRequestThinking("disabled"))
        .build();

    // 发送聊天完成请求并打印响应
    try {
      // 获取响应并打印每个选择的消息内容
      arkService.createChatCompletion(chatCompletionRequest)
          .getChoices()
          .forEach(choice -> System.out.println(choice.getMessage().getContent()));
    } catch (Exception e) {
      System.out.println("请求失败: " + e.getMessage());
    } finally {
      // 关闭服务执行器
      arkService.shutdownExecutor();
    }
  }
}
\`\`\`

`}></RenderMd></Tabs.TabPane></Tabs>);
```

返回预览

```Shell
{
  "common_cruciferous_plants": [
    "白菜",
    "萝卜",
    "油菜",
    "甘蓝（卷心菜）",
    "花椰菜（菜花）",
    "西兰花",
    "芥菜",
    "榨菜",
    "雪里蕻",
    "大头菜（芜菁）",
    "羽衣甘蓝",
    "荠菜",
    "诸葛菜（二月兰）",
    "独行菜",
    "紫罗兰"
  ]
}
```

<span id="3e3c187a"></span>

# 模式对比：**`json_schema`** 与 `json_object`

格式化输出可以选择不同类型（**type**），包括`json_schema`、`json_object` 、`text`。除 `text` 是让模型使用自然语言进行回复，`json_schema` 和 `json_object` 均是控制生成 JSON 格式回答，同时 `json_schema` 是 `json_object` 的演进版本，以下是他们的异同点。

> 当前 `json_schema` 功能还在beta 测试中，请谨慎评估后再在生产环境使用。

| | | | \
|结构化输出 |`json_schema` |`json_object` |
|---|---|---|
| | | | \
|生成 JSON 回复 |是 |是 |
| | | | \
|可定义 JSON 结构 |是 |否 |\
| | |仅保障回复是合法 JSON |
| | | | \
|是否推荐 |是 |否 |
| | | | \
|支持的模型 |见[结构化输出能力](/docs/82379/1330310#25b394c2) |见[结构化输出能力](/docs/82379/1330310#25b394c2) |
| | | | \
|严格模式 |\
|> 严格按照定义的结构生成回复。 |支持 |\
| |通过设置 **strict** 为 `true` 生效。 |\
| | |\
| |\* 遵循语法[附1. JSON Schema 语法支持说明](/docs/82379/1568221#07ec5656)，若有不支持的结构会显示报错。 |不涉及 |
| | | | \
|配置方式 |..., |\
| |"response_format": { |\
| | "type": "json_schema", |\
| | "json_schema":{ |\
| | "name":"my_schema", |\
| | "strict": true, |\
| | "schema": {...} |\
| | } |\
| |}, |\
| |... | ..., |\
| | |"response_format": { |\
| | | "type": "json_object" |\
| | |}, |\
| | |... |

<span id="7683a597"></span>

# 推荐使用步骤

<span id="8d92bc51"></span>

## 1.定义结构

您需要在 **schema** 字段中定义好模型生成的回复的 JSON 结构，可以参考[快速开始](/docs/82379/1568221#87d19412)的示例。

- 当您需要模型严格按照结构输出时，需配置 **strict** 字段为 `true`。方舟支持的关键字可见[附1. JSON Schema 语法支持说明](/docs/82379/1568221#07ec5656)，如果有明显不支持的定义，方舟会显示报错。
- 当您配置 **strict** 字段为 `false` 或者未配置 **strict** 字段，方舟会生成合法 JSON 结构的内容，同时尽可能参考您的定义的结构，不会对语法校验及报错。
- 请注意同级字段的先后顺序，模型输出将根据 **schema** 字段定义的字段顺序数据。

:::tip
为了帮助您获得更好的生成质量，JSON Schema 和提示词设计强烈建议阅读 [附2. JSON Schema 定义建议 ](/docs/82379/1568221#3267c790)、[附3. Prompt 建议](/docs/82379/1568221#05849c36)。
:::
<span id="9915283f"></span>

## 2.API 中进行配置JSON Schema

在 API 中指定结构化输出的模式

```JSON
...,
"response_format": {
  "type": "json_schema",
  "json_schema": {
    "name":"my_schema",
    "strict": true,
    "schema": {...}
  }
},
...
```

完整示例代码见 [快速开始](/docs/82379/1568221#87d19412)。
:::tip
请勿与 **frequency_penalty**，**presence_penalty** 等采样参数共同使用，可能会导致模型输出异常。
:::
<span id="adf6252e"></span>

## 3. 处理错误案例

模型输出结构仍然可能包含错误，可能因为输出长度限制、任务复杂度、格式不清晰等。可以尝试调整指令，或将任务进行拆分为更简单子任务。您可以使用方舟的提示词优化工具来帮您优化模型提示词，详细见 [PromptPilot 概述](/docs/82379/1399495)。
<span id="07ec5656"></span>

# 附1. JSON Schema 语法支持说明

:::tip

- 按关键字的作用域分类，JSON Schema 有效关键字全集 https://json-schema.org/understanding-json-schema/keywords
- 下面支持的关键字代表方舟已支持关键字对应的输出格式约束语义。
- 方舟会忽略 JSON Schema 规范中没有格式约束语义的关键字。
- 使用明确不支持的关键字，方舟会显式报错。
- 请勿与 **frequency_penalty**，**presence_penalty** 等采样参数共同使用，可能会导致模型输出异常。
  :::
  <span id="cdc803ee"></span>

## Schema 层面公共关键字

- [type](https://www.learnjsonschema.com/2020-12/validation/type/)
  - integer
  - number
  - string
  - boolean
  - null
  - array
  - object
- [$ref](https://www.learnjsonschema.com/2020-12/core/ref/)
  - 只支持 `#` 开头的本地相对引用
- [$defs](https://www.learnjsonschema.com/2020-12/core/defs/)
- [const](https://www.learnjsonschema.com/2020-12/validation/const/)
- [enum](https://www.learnjsonschema.com/2020-12/validation/enum/)
- [anyOf](https://www.learnjsonschema.com/2020-12/applicator/anyof/)
- [oneOf](https://www.learnjsonschema.com/2020-12/applicator/oneof/)
  - 不严格保证 exactly one 语义
- [allOf](https://www.learnjsonschema.com/2020-12/applicator/allof/)
  - 不严格保证 all 语义

<span id="d2f98d7f"></span>

## type 相关的关键字

- "type": "array"
  - [prefixItems](https://www.learnjsonschema.com/2020-12/applicator/prefixitems/)
  - [items](https://www.learnjsonschema.com/2020-12/applicator/items/)
  - [unevaluatedItems](https://www.learnjsonschema.com/2020-12/unevaluated/unevaluateditems/)
- "type": "object"
  - [properties](https://www.learnjsonschema.com/2020-12/applicator/properties/)
  - [required](https://www.learnjsonschema.com/2020-12/validation/required/)
  - [additionalProperties](https://www.learnjsonschema.com/2020-12/applicator/additionalproperties/)
  - [unevaluatedProperties](https://www.learnjsonschema.com/2020-12/unevaluated/unevaluatedproperties/)

<span id="3267c790"></span>

# 附2. JSON Schema 定义建议

<span id="4eb8bb6c"></span>

### 字段命名与描述

字段命名含糊/无描述，导致模型难以判断含义。使用清晰有意义的英文名（如 user_name），并配合 `description` 详细说明字段用途。
错误示例

```JSON
{
  "type": "object",
  "properties": {
    "v1": {
      "type": "string"
    }
  }
}
```

改进后示例

```JSON
{
  "type": "object",
  "properties": {
    "user_name": {
      "type": "string",
      "description": "用户的姓名"
    }
  }
}
```

<span id="b5dffb5a"></span>

### 字段类型与结构设计

<span id="0a305a7e"></span>

#### 避免冗余嵌套与不必要复杂化

不过度使用 $ref，结构尽可能一次性展开。无意义的嵌套会增加模型生成难度，提高出错概率。
错误示例

```JSON
{
  "type": "object",
  "properties": {
    "date": {
      "type": "object",
      "properties": {
        "value": {
          "type": "string",
          "description": "日期"
        }
      }
    }
  }
}
```

改进后示例

```JSON
{
  "type": "object",
  "properties": {
    "date": {
      "type": "string",
      "description": "日期，格式为 YYYY-MM-DD"
    }
  }
}
```

<span id="28d8a165"></span>

#### 字段类型要明确、例子需补充

错误示例

```JSON
{
  "score": {
    "type": "string"
  }
}
```

改进后示例

```JSON
{
  "score": {
    "type": "integer",
    "description": "成绩，0到100的整数"
  }
}
```

> 说明：类型应尽量贴合实际业务。对于数字、布尔值等不能简单用 string 替代。

<span id="7da8f5ac"></span>

### 字段取值与约束设计

明确枚举值与格式
错误示例

```JSON
{
  "status": {
    "type": "string"
  }
}
```

改进后示例

```JSON
{
  "status": {
    "type": "string",
    "description": "处理状态，可为：pending、success 或 failed",
    "enum": ["pending", "success", "failed"]
  }
}
```

<span id="064bc324"></span>

### 结构层级与必填项

所有需要的结构明确 required，这样模型会始终输出所有必需字段，格式更规范。
推荐使用 required 时，始终加上`"additionalProperties": false`。
错误示例

```JSON
{
  "type": "object",
  "properties": {
    "steps": { "type": "array", "items": { "type": "string" } },
    "final_answer": { "type": "string" }
  }
  // 没有 required
}
```

改进后示例

```JSON
{
  "type": "object",
  "properties": {
    "steps": { "type": "array", "items": { "type": "string" } },
    "final_answer": { "type": "string" }
  },
  "required": ["steps", "final_answer"],
  "additionalProperties": false
}
```

<span id="04cb2281"></span>

### 业务语义简明清楚，避免歧义

错误示例

```JSON
{
  "type": "object",
  "properties": {
    "id": { "type": "string", "description": "用户或订单编号" }
  }
}
```

改进后示例

```JSON
{
  "type": "object",
  "properties": {
    "user_id": { "type": "string", "description": "用户编号" },
    "order_id": { "type": "string", "description": "订单编号" }
  }
}
```

<span id="7d13f9fd"></span>

## 使用工具评估和优化

- 为防止 JSON 模式与编程语言类型定义不一致，推荐使用语言原生的工具支持，如 Python 可使用 [Pydantic](https://docs.pydantic.dev/latest/)，TypeScript 可使用 [Zod](https://zod.dev/)。
- 可使用方舟工具来优化/评估模型提示词，详细见 [PromptPilot 概述](/docs/82379/1399495)。

<span id="05849c36"></span>

# 附3. Prompt 建议

<span id="0ca58701"></span>

### 指明任务目标，简洁表达意图

- 只需直接描述实际希望模型完成的任务即可，无须再过多强调“请用 JSON 输出”、“请用如下格式输出”等。
- 不必在 prompt 中重复 schema 结构的信息，避免造成矛盾或冗余。

错误示例

```Plain Text
请用如下 JSON 格式输出，并包含字段 steps、final_answer：8x + 9 = 32，x+y=1。
```

改进后示例

```Plain Text
请求解：8x + 9 = 32，x + y = 1。
```

<span id="92eb1341"></span>

### 结合结构化信息写业务内容，而不是格式引导

- 关注“内容本身”，而非“输出形式”。
- 业务描述越具体，LLM 更易给出符合 schema 的内容。

错误示例

```Plain Text
请输出一个包含 steps 和 final_answer 字段的 JSON。
```

改进后示例

```Plain Text
请一步步推理解答：8x + 9 = 32, x+y=1，并写出最终答案。
```
