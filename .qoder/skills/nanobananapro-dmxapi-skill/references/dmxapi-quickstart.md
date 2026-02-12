🚀 快速接入 DMXAPI
📋 基础信息
配置项 值
Base URL https://www.dmxapi.cn
认证方式 Token (API Key)
💬 文本对话接口
Python SDK 示例
安装 SDK：

pip install openai
WARNING

部分环境 Python 版本过高可能导致安装失败。

from openai import OpenAI

client = OpenAI(
api_key="sk-****************\*\*\*\*****************",
base_url="https://www.dmxapi.cn/v1"
)

response = client.chat.completions.create(
model="gpt-5-mini",
messages=[{"role": "user", "content": "你好"}]
)

print(response.choices[0].message.content)
返回实例

你好！我可以帮你做什么？（例如：查资料、写作、翻译、编程、学习建议、日常问题等）
安全提醒

请妥善保管你的 API 密钥，不要泄露给他人。

🐍 Python request 示例

# 导入必要的库

import requests # 用于发送HTTP请求
import json # 用于处理JSON数据

# API配置

url = "https://www.dmxapi.cn/v1/chat/completions"
headers = {
'Accept': 'application/json',
'Authorization': 'sk-****************\*\*\*\*****************', # 替换为您的API密钥
'Content-Type': 'application/json'
}

# 构建请求数据

payload = json.dumps({
"model": "gpt-5-mini", # 使用的AI模型
"messages": [
{
"role": "system",
"content": "You are a helpful assistant."
},
{
"role": "user",
"content": "周树人和鲁迅是兄弟吗？"
}
]
})

# 发送POST请求到API

response = requests.post(url, headers=headers, data=payload)

# 打印格式化的JSON响应结果

response_json = response.json()
print(json.dumps(response_json, indent=2, ensure_ascii=False))
📤 返回实例
API将返回JSON格式的对话结果：

{
"id": "chatcmpl-CZEACVniTZpH0a9dc1aqPYhNR3c1l",
"object": "chat.completion",
"created": 1762511960,
"model": "gpt-5-mini-2025-08-07",
"choices": [
{
"index": 0,
"message": {
"role": "assistant",
"content": "不是。周树人就是鲁迅的本名，鲁迅是他的笔名。鲁迅（原名周树人，1881–1936）是中国现代著名作家。他的弟弟是周作人，也是作家。",
"refusal": null,
"annotations": []
},
"logprobs": null,
"finish_reason": "stop"
}
],
"usage": {
"prompt_tokens": 27,
"completion_tokens": 511,
"total_tokens": 538,
"prompt_tokens_details": {
"cached_tokens": 0,
"audio_tokens": 0
},
"completion_tokens_details": {
"reasoning_tokens": 448,
"audio_tokens": 0,
"accepted_prediction_tokens": 0,
"rejected_prediction_tokens": 0
}
},
"system_fingerprint": null
}
提示

将示例中的 sk-**\*\*** 替换为你实际的 API Key 即可使用
