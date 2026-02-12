gemini-3-pro-image-preview 返回格式变化的说明
gemini-3-pro-image-preview 是 Google 最新推出的图像生成与处理模型，支持图像输入和多模态推理。在实际使用中，部分用户反馈该模型的返回格式存在不确定性：同一提示词可能返回标准的 inlineData 结构，也可能返回文本形式的 base64 字符串。本文档记录了这一现象，并提供可复现的测试代码。

常规的返回格式

{
"candidates": [
{
"content": {
"parts": [
{
"inlineData": {
"mimeType": "image/jpeg",
"data": "/9j/4AAQSkZJRgABAQEBLAEsAAD/6xdmSlAAAQAAAAEAABdcanVtYgAAAB5q"
},
"thoughtSignature": ""
}
],
"role": "model"
},
"finishReason": "STOP",
"index": 0
}
],
"usageMetadata": {
"promptTokenCount": 32,
"candidatesTokenCount": 1772,
"totalTokenCount": 2552,
"promptTokensDetails": [
{
"modality": "TEXT",
"tokenCount": 32
}
],
"candidatesTokensDetails": [
{
"modality": "IMAGE",
"tokenCount": 1120
}
],
"thoughtsTokenCount": 748
},
"modelVersion": "gemini-3-pro-image-preview",
"responseId": "DOd6afWPNZfjjrEPpZ3c0AM"
}
非常规的返回格式
在某些情况下，模型可能不会按预期返回 inlineData 格式的图片数据，而是将 base64 字符串直接作为文本输出。

产生原因
提示词过于简单：当用户输入的提示词过于简短或模糊时，模型可能会"偷懒"，直接返回文本形式的 base64 数据而非结构化的 inlineData 对象
模型遵循指令不严格：即使提示词中明确要求使用 inline_data 格式，模型仍可能忽略该要求
两种返回格式对比
格式类型 结构 说明
常规格式 {"inlineData": {"mimeType": "...", "data": "..."}} 标准结构化输出，便于程序解析
非常规格式 {"text": "data:image/png;base64,..."} 需要手动解析文本提取 base64 数据
非常规测试代码(可复现)

import requests
import json

# API 配置

url = "https://www.dmxapi.cn/v1beta/models/gemini-3-pro-image-preview:generateContent"
headers = {
"Content-Type": "application/json",
"Authorization": "sk-**************\*\***************" #请填写您的密钥
}

data = {
"contents": [
{
"parts": [
{
"text": "请分析该图片的中心颜色，并直接以原生 inline_data 格式返回一张 1x1 像素的相同颜色采样图。要求：严禁返回 Markdown 或文字描述。"
},
{
"inline_data": {
"mime_type": "image/png",
"data": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
}
}
]
}
],
}

try:
response = requests.post(url, headers=headers, json=data, timeout=30)
response.raise_for_status()
print(response.json())
except requests.exceptions.RequestException as e:
print(f"请求失败：{e}")
except (json.JSONDecodeError, ValueError) as e:
print(f"JSON 解析失败：{e}")
print("原始返回：", response.text)
非常规格式示例

{
"candidates": [
{
"content": {
"parts": [
{
"text": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jpmgAAAABJRU5ErkJggg==",
"thoughtSignature": ""
}
],
"role": "model"
},
"finishReason": "STOP",
"index": 0
}
],
"usageMetadata": {
"promptTokenCount": 299,
"candidatesTokenCount": 65,
"totalTokenCount": 1323,
"promptTokensDetails": [
{
"modality": "TEXT",
"tokenCount": 41
},
{
"modality": "IMAGE",
"tokenCount": 258
}
],
"thoughtsTokenCount": 959
},
"modelVersion": "gemini-3-pro-image-preview",
"responseId": "s-h6aY_uI4jQ-8YP8ZmUuAE"
}
