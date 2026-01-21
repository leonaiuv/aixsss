在使用或调用大模型时，如果希望控制和引导模型的输出，可以通过预填（Prefill）部分`assistant` 角色的内容，来引导和控制模型的输出。输出的控制可以应用在多个方面：强制按照 JSON 或 XML 等特定格式输出；绕过模型最大输出限制，输出超长的回答；控制大模型在角色扮演场景中保持同一角色。
<span id="6352dc5c"></span>

## 模型及API

支持的模型如下：

- 文本生成模型中无深度思考能力的模型：具体模型可在[工具调用能力](/docs/82379/1330310#15a31773)筛选。
- 具有深度思考能力的部分模型：doubao\-seed\-code\-preview\-251028、doubao\-seed\-1\-6\-lite\-251015 和 doubao\-seed\-1\-6\-251015。

:::warning
其他深度思考模型不可使用续写模式（Prefill Response），即请求时 message 以 assistant role 消息结尾时，**thinking** 字段会失效，模型保持默认是否深度思考的行为。
:::
API支持：

- [Chat API](https://www.volcengine.com/docs/82379/1494384)：支持续写模式。
- [Responses API](https://www.volcengine.com/docs/82379/1569618)：不支持续写模式。

<span id="6eb2f599"></span>

## 核心配置

设置`messages`最后一个`role` 为`Assistant` ，模型会对`Assistant`已有的内容按照现有格式和内容进行续写。

```Python
messages = [
    {"role": "user", "content": "You are a calculator, please calculate: 1 + 1"},
    # 最后消息为模型消息，role 为 assistant
    {"role": "assistant", "content": "="}
]
```

<span id="aec36e50"></span>

## 模式对比

<span aceTableMode="list" aceTableWidth="1,1"></span>
|普通模式 |续写模式 |
|---|---|
|请求示例|请求示例|\
|`Python|`Python|\
|import os|import os|\
|# Install SDK: pip install 'volcengine-python-sdk[ark]' .|# Install SDK: pip install 'volcengine-python-sdk[ark]' .|\
|from volcenginesdkarkruntime import Ark|from volcenginesdkarkruntime import Ark|\
|||\
|client = Ark(|client = Ark(|\
| # The base URL for model invocation .| # The base URL for model invocation .|\
| base_url="https://ark.cn-beijing.volces.com/api/v3",| base_url="https://ark.cn-beijing.volces.com/api/v3",|\
| # Get API Key：https://console.volcengine.com/ark/region:ark+cn-beijing/apikey| # Get API Key：https://console.volcengine.com/ark/region:ark+cn-beijing/apikey|\
| api_key=os.getenv('ARK_API_KEY'),| api_key=os.getenv('ARK_API_KEY'),|\
|)|)|\
|||\
|completion = client.chat.completions.create(|completion = client.chat.completions.create(|\
| # Replace with Model ID .| # Replace with Model ID .|\
| model = "deepseek-v3-250324",| model = "deepseek-v3-250324",|\
| messages=[| messages=[|\
| {"role": "user", "content": "You are a calculator, please calculate: 1 + 1 "},| {"role": "user", "content": "You are a calculator, please calculate: 1 + 1"},|\
| ]| # 额外传入模型信息,模型据此续写|\
|)| {"role": "assistant", "content": "="}|\
|print(completion.choices[0].message.content)| ]|\
|`|)|\
| |print(completion.choices[0].message.content)|\
| |`|\
| | |
|返回示例|返回示例|\
|`Shell|`Shell|\
|1+1等于2。|2|\
|`|`|\
|||\
|输出会按照模型根据问题的完整自然语言回复。 |模型根据信息“=”续写，保持对应的格式和行文风格。 |

接下来，对于几种典型使用场景进行举例说明。
<span id="326707ce"></span>

## 场景：改善输出格式

由于模型自身会基于自己的理解去响应用户的请求，会导致输出无法直接被其他程序解析。可以通过预填充 `{` 符号，引导模型跳过一些场景回复，直接输出 JSON 对象，会让回答更加简洁和工整，可以被其他程序更好地解析。

<span aceTableMode="list" aceTableWidth="1,1"></span>
|普通模式 |续写模式 |
|---|---|
|请求示例|请求示例|\
|`Python|`Python|\
|import os|import os|\
|# Install SDK: pip install 'volcengine-python-sdk[ark]' .|# Install SDK: pip install 'volcengine-python-sdk[ark]' .|\
|from volcenginesdkarkruntime import Ark|from volcenginesdkarkruntime import Ark|\
|||\
|client = Ark(|client = Ark(|\
| # The base URL for model invocation .| # The base URL for model invocation .|\
| base_url="https://ark.cn-beijing.volces.com/api/v3",| base_url="https://ark.cn-beijing.volces.com/api/v3",|\
| # Get API Key：https://console.volcengine.com/ark/region:ark+cn-beijing/apikey| # Get API Key：https://console.volcengine.com/ark/region:ark+cn-beijing/apikey|\
| api_key=os.getenv('ARK_API_KEY'),| api_key=os.getenv('ARK_API_KEY'),|\
|)|)|\
|||\
|completion = client.chat.completions.create(|completion = client.chat.completions.create(|\
| # Replace with Model ID .| # Replace with Model ID .|\
| model = "deepseek-v3-250324",| model = "deepseek-v3-250324",|\
| messages=[| messages=[|\
| {"role": "user", "content": "Use JSON to describe the name and function of the Doubao model"}| {"role": "user", "content": "Use JSON to describe the name and function of the Doubao model"},|\
| ]| # 额外传入一个 { 的模型信息,模型据此续写|\
|)| {"role": "assistant", "content": "{"},|\
|print(completion.choices[0].message.content)| ]|\
|`|)|\
| |print(completion.choices[0].message.content)|\
| |`|\
| | |
|返回示例|返回示例|\
|返回一些说明性语言，无法直接按照 JSON 解析。|和前置`assistant`信息组合成 JSON 返回。|\
|`Shell|`Shell|\
|Here's a JSON description of the Doubao model, including its name and function:|"model_name": "Doubao",|\
|| "functions": [|\
|`json|    {|\
|{|      "name": "text_generation",|\
|  "model": {|      "description": "Generates human-like text based on input prompts, supporting creative writing, summarization, and more."|\
|    "name": "Doubao",|    },|\
|    "alternative_names": ["doubao"],|    {|\
|    "type": "large_language_model",|      "name": "language_translation",|\
|    "developer": "ByteDance",|      "description": "Translates text between multiple languages with high accuracy and contextual understanding."|\
|    "primary_function": {|    },|\
|      "description": "Doubao is an AI assistant designed to understand and generate human-like text responses",|    {|\
|      "capabilities": [|      "name": "sentiment_analysis",|\
|        "natural language understanding",|      "description": "Analyzes the sentiment of input text, determining whether it is positive, negative, or neutral."|\
|        "text generation",|    },|\
|        "question answering",|    {|\
|        "translation between languages",|      "name": "question_answering",|\
|        "text summarization",|      "description": "Provides accurate answers to questions based on the input context or general knowledge."|\
|        "creative writing",|    },|\
|        "code generation and explanation",|    {|\
|        "general knowledge provision"|      "name": "code_generation",|\
|      ]|      "description": "Generates code snippets in various programming languages based on natural language descriptions."|\
|    },|    },|\
|    "languages_supported": ["Chinese", "English"],|    {|\
|    "access_method": "API and web/mobile interfaces",|      "name": "conversational_ai",|\
|    "version": "1.0",|      "description": "Engages in natural, context-aware conversations with users, simulating human-like interactions."|\
|    "release_date": "2023"|    }|\
|  }|  ]|\
|}|}|\
|`|`|\
|| |\
|Note: Some details about Doubao might not be publicly available, as it's a relatively new model from ByteDance. The information here represents common capabilities of similar large language models.| |\
|`| |\
| | |

<span id="86e2746a"></span>

### 注意事项

- 方舟已提供结构化输出能力，可以让模型输出严格的 JSON 格式的回答，请参见[结构化输出(beta)](/docs/82379/1568221)。
- 由于模型具有一定的随机性，无法 100% 保证回复为标准JSON对象。建议您对模型的回复进行校验，下面示例使用[json_repair](https://github.com/mangiucugna/json_repair) 库校验返回的是否为合法的 JSON 对象。

  ```Python
  import json
  # Install json-repair: pip install json-repair
  import json_repair
  import os
  # Install SDK:  pip install 'volcengine-python-sdk[ark]' .
  from volcenginesdkarkruntime import Ark

  PREFILL_PREFIX = "{"
  client = Ark(
      # The base URL for model invocation .
      base_url="https://ark.cn-beijing.volces.com/api/v3",
      # Get API Key：https://console.volcengine.com/ark/region:ark+cn-beijing/apikey
      api_key=os.getenv('ARK_API_KEY'),
  )
  completion = client.chat.completions.create(
      # Replace with Model ID .
      model = "deepseek-v3-250324",
      messages=[
          {"role": "user", "content": "Use JSON to describe the name and function of the Doubao model"},
          {"role": "assistant", "content": PREFILL_PREFIX},
      ]
  )
  # 拼接 PREFILL_PREFIX 和模型输出
  json_string = PREFILL_PREFIX + completion.choices[0].message.content
  # 解析 JSON Object
  obj = {}
  try:
      obj = json.loads(json_string)
  except json.JSONDecodeError as e:
      obj = json_repair.loads(json_string)

  print(obj)
  ```

<span id="061ea91c"></span>

## 场景：输出超过模型输出上限的内容

使用续写模式让大模型根据前轮请求续写内容，并拼接多次输出的内容，组合成超长输出。可以避免因为 **max_tokens** （最大输出长度）限制，导致无法获取完整内容。

> 这种方式会将模型输出多次返回给模型，会有更多 token 用量。
> 注意增加循环次数限制等兜底，防止死循环输出等特殊情况，导致意外花费。

```Python
import os
# Install SDK:  pip install 'volcengine-python-sdk[ark]' .
from volcenginesdkarkruntime import Ark

messages = [
    {"role": "user", "content": '''Please translate the following text into English: ************ '''},
    {"role": "assistant", "content": ""}
]

# Replace with Model ID .
ark_model="deepseek-v3-250324"

client = Ark(
    # The base URL for model invocation .
    base_url="https://ark.cn-beijing.volces.com/api/v3",
    # Get API Key：https://console.volcengine.com/ark/region:ark+cn-beijing/apikey
    api_key=os.getenv('ARK_API_KEY'),
)

completion = client.chat.completions.create(
    model=ark_model,
    messages=messages
)

loop_count = 0 # 初始化循环计数器
max_loops = 20  # 设置最大循环次数为20

# 触发因为输出长度限制，循环生成 assistant 回复
while completion.choices[0].finish_reason == "length":
    messages[-1]["content"] += completion.choices[0].message.content
    completion = client.chat.completions.create(
        model=ark_model,
        messages=messages
    )
    # 增加计数器
    loop_count += 1
    # 检查是否超过最大循环次数
    if loop_count >= max_loops:
        print(f"Warning: Reached maximum loop count {max_loops}, stopping content generation.")
        break

# 返回最后一条回复
messages[-1]["content"] += completion.choices[0].message.content
print(messages[-1]["content"])
```

<span id="67a91ed5"></span>

## 场景：增强角色扮演一致性

我们通常使用 系统消息 来设置角色的一些信息，但是随着对话轮次的增多，模型可能会跳脱出角色的约束，通过续写模式，提醒模型本次输出扮演的角色，保证对话符合预期。

```Python
import os
# Install SDK:  pip install 'volcengine-python-sdk[ark]'
from volcenginesdkarkruntime import Ark

client = Ark(
    # The base URL for model invocation
    base_url="https://ark.cn-beijing.volces.com/api/v3",
    # Get API Key：https://console.volcengine.com/ark/region:ark+cn-beijing/apikey
    api_key=os.getenv('ARK_API_KEY'),
)
# Replace with Model ID
ark_model="deepseek-v3-250324"

messages = [
    {"role": "system", "content": "The following is a scene from Journey to the West. Please converse according to the specified role. For each round of dialogue, only reply with the content of the current role; do not add any additional content.\n\nAfter leaving Wuzhuang Guan, Tang Seng and his disciples traveled for more than a month and arrived at the foot of a great mountain. Wukong looked around and saw lofty mountains, steep ridges, overgrown weeds, and extremely dangerous terrain."},
    {"role": "assistant", "content": "Wukong said:"}
]

completion = client.chat.completions.create(
    model=ark_model,
    messages=messages
)
print(messages[-1]['content']+completion.choices[0].message.content)
```

模型输出示例：

```Shell
Wukong said, "Master, this mountain looks very dangerous. I will go explore the way first. You wait here."
```

您也可以通过变更`messages`最后消息，实现角色切换。

```Python
...
messages[-1] = {"role": "assistant", "content": "Tang Seng said:"}
completion = client.chat.completions.create(
    model=ark_model,
    messages=messages
)
print(messages[-1]['content']+completion.choices[0].message.content)
```

模型输出示例：

```Shell
Tang Seng said: "Wukong, this mountain looks very dangerous, you must be careful to check it out, don't fall into the trap of the monster."
```
