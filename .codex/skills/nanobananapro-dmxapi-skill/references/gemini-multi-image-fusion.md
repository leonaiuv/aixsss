Gemini 多图融合 API 文档
多图融合功能允许你将多张图像智能融合生成新图像，支持对象合成、场景混合等多种创意应用。通过简单的提示词即可实现复杂的图像合成效果。

接口地址
接口地址中的模型名称根据需要替换。

https://www.dmxapi.cn/v1beta/models/gemini-3-pro-image-preview:generateContent
注意：

需要升级谷歌sdk为最新版

支持的模型
模型名称 分辨率支持 特点 适用场景
gemini-3-pro-image-preview 1K/2K/4K 高质量图像融合，支持最多 14 张参考图片 专业级图像合成、高清创意设计
gemini-2.5-flash-image 1K 快速生成，处理速度快 快速原型设计、实时应用
python SDK 使用示例

"""
DMXAPI Gemini 多图融合示例
使用 Google Gemini API 将多张图像融合生成新图像，并保存到本地 output 文件夹
"""

from google import genai
from google.genai import types
from PIL import Image
import os
from datetime import datetime

# ============================================================================

# 配置部分

# ============================================================================

# DMXAPI 密钥和基础 URL

api_key = "sk-**********************\***********************" # 替换为你的 DMXAPI 密钥
BASE_URL = "https://www.dmxapi.cn"

    # ┌─────────────────────────────────────────────────────────────────────┐
    # │ Gemini 3 Pro 预览版图片使用限制                                       │
    # ├─────────────────────────────────────────────────────────────────────┤
    # │ • 最多可混合使用 14 张参考图片                                         │
    # │   - 最多 6 张高保真对象图片，用于包含在最终图片中                       │
    # │   - 最多 5 张人像照片，以保持角色一致性                                │
    # └─────────────────────────────────────────────────────────────────────┘

# 输入图像路径列表

INPUT_IMAGE_PATHS = [
"output/generated_image_20251121_170850.png", # 替换为你的图片路径
"test/example.jpg",
]

# 创建 Gemini 客户端

client = genai.Client(api_key=api_key, http_options={'base_url': BASE_URL})

# ============================================================================

# 多图融合提示词

# ============================================================================

# 读取所有要融合的图像

images = [Image.open(path) for path in INPUT_IMAGE_PATHS]

# 定义多图融合的提示词

prompt = (
"让第二张图的计算器在第一张图中吃饭"
)

# ============================================================================

# 调用 DMXAPI 融合图像

# ============================================================================

response = client.models.generate_content( # 模型名称
model="gemini-3-pro-image-preview", # 使用 Gemini 3 Pro Image 预览版

    contents=[prompt] + images,

    # 生成配置
    config=types.GenerateContentConfig(
        # response_modalities: 设置响应模态
        # - ['IMAGE']: 仅返回图片，不返回文本
        # - ['TEXT', 'IMAGE']: 同时返回文本和图片（默认值）
        # gemini-2.5-flash-image 不能使用该参数
        response_modalities=['IMAGE'],

        # image_config: 图像配置选项
        image_config=types.ImageConfig(
            # aspect_ratio: 设置输出图片的宽高比（注意：使用下划线命名）
            #
            # ┌─────────────────────────────────────────────────────────────────┐
            # │ Gemini 2.5 Flash                                                │
            # ├──────────┬─────────────┬────────┐                               │
            # │ 宽高比    │ 分辨率      │ 令牌    │                               │
            # ├──────────┼─────────────┼────────┤                               │
            # │ 1:1      │ 1024x1024   │ 1290   │                               │
            # │ 2:3      │ 832x1248    │ 1290   │                               │
            # │ 3:2      │ 1248x832    │ 1290   │                               │
            # │ 3:4      │ 864x1184    │ 1290   │                               │
            # │ 4:3      │ 1184x864    │ 1290   │                               │
            # │ 4:5      │ 896x1152    │ 1290   │                               │
            # │ 5:4      │ 1152x896    │ 1290   │                               │
            # │ 9:16     │ 768x1344    │ 1290   │                               │
            # │ 16:9     │ 1344x768    │ 1290   │                               │
            # └──────────┴─────────────┴────────┘                               │
            # └─────────────────────────────────────────────────────────────────┘
            #
            # ┌─────────────────────────────────────────────────────────────────┐
            # │ Gemini 3 Pro Image 预览版                                        │
            # ├──────────┬─────────────────────────────────────────────────────┐│
            # │ 宽高比    │ 1K 分辨率   │ 1K令牌  │ 2K 分辨率   │ 4K 分辨率      ││
            # ├──────────┼─────────────┼────────┼─────────────┼───────────────┤│
            # │ 1:1      │ 1024x1024   │ 1210   │ 2048x2048   │ 4096x4096     ││
            # │ 2:3      │ 848x1264    │ 1210   │ 1696x2528   │ 3392x5056     ││
            # │ 3:2      │ 1264x848    │ 1210   │ 2528x1696   │ 5056x3392     ││
            # │ 3:4      │ 896x1200    │ 1210   │ 1792x2400   │ 3584x4800     ││
            # │ 4:3      │ 1200x896    │ 1210   │ 2400x1792   │ 4800x3584     ││
            # │ 4:5      │ 928x1152    │ 1210   │ 1856x2304   │ 3712x4608     ││
            # │ 5:4      │ 1152x928    │ 1210   │ 2304x1856   │ 4608x3712     ││
            # │ 9:16     │ 768x1376    │ 1210   │ 1536x2752   │ 3072x5504     ││
            # │ 16:9     │ 1376x768    │ 1210   │ 2752x1536   │ 5504x3072     ││
            # │ 21:9     │ 1584x672    │ 1210   │ 3168x1344   │ 6336x2688     ││
            # └──────────┴─────────────┴────────┴─────────────┴───────────────┘│
            # │ 注: 2K/4K 分辨率令牌分别为 1210/2000                             │
            # └─────────────────────────────────────────────────────────────────┘
            #
            aspect_ratio="16:9",

            # image_size: 设置输出图片的分辨率
            # - "1K": 1K 分辨率（默认值，所有模型均支持）
            # - "2K": 2K 分辨率（仅 Gemini 3 Pro Image 预览版支持）
            # - "4K": 4K 分辨率（仅 Gemini 3 Pro Image 预览版支持）
            # gemini-2.5-flash-image 不能使用该参数
            # image_size="4K",
        ),

        # tools: Google 搜索工具（可选）
        # - 使用实时信息生成图像（如根据最新资讯添加元素等）
        # - 注意: 使用搜索工具时必须设置 response_modalities=['TEXT', 'IMAGE']
        # - 图片专用模式 ['IMAGE'] 与搜索工具不兼容
        # 示例: tools=[{"google_search": {}}]
        # gemini-2.5-flash-image 不能使用该参数
        # tools=[{"google_search": {}}]
    )

)

# ============================================================================

# 处理响应并保存融合后的图像

# ============================================================================

for part in response.parts: # 处理文本响应（如果有）
if part.text is not None:
print(part.text)

    # 处理图像响应
    elif part.inline_data is not None:
        # 确保 output 文件夹存在
        os.makedirs("output", exist_ok=True)

        # 生成带时间戳的文件名
        # 格式: fused_image_20250121_143052.png (年月日_时分秒)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"output/fused_image_{timestamp}.png"

        # 将响应数据转换为 PIL Image 对象
        image = part.as_image()

        # 保存图像到文件
        image.save(filename)

        # 输出保存成功的提示信息
        print(f"融合后的图片已保存到 {filename}")

运行结果
以下是运行示例代码后的控制台输出，展示了 AI 的推理过程和最终生成的图像保存路径：

融合后的图片已保存到 output/fused_image_20251210_111850.png
python request 使用示例

# """

# DMXAPI 多图融合示例

功能说明：
使用 Google Gemini API 的接口，将多张图片融合生成新图片。
支持最多 14 张参考图片混合使用。
================================================================
"""

import requests
import base64
import os
from datetime import datetime

# ========================================

# API 配置信息

# ========================================

# 你的 DMXAPI 密钥（请替换为真实密钥）

API_KEY = "sk-**************\*\*\*\***************"

# DMXAPI 请求地址

BASE_URL = "https://www.dmxapi.cn/v1beta"

# ========================================

# 图片配置

# ========================================

    # ┌─────────────────────────────────────────────────────────────────────┐
    # │ Gemini 3 Pro 预览版图片使用限制                                       │
    # ├─────────────────────────────────────────────────────────────────────┤
    # │ • 最多可混合使用 14 张参考图片                                         │
    # │   - 最多 6 张高保真对象图片，用于包含在最终图片中                       │
    # │   - 最多 5 张人像照片，以保持角色一致性                                │
    # └─────────────────────────────────────────────────────────────────────┘

# 输入图片路径列表（支持多张图片）

INPUT_IMAGE_PATHS = [
"Google/image/lc.png",
"Google/image/LC二维码.png",
]

# ========================================

# 图片编码函数

# ========================================

def encode_image_to_base64(image_path: str) -> tuple[str, str]:
"""读取图片文件并转换为 base64 编码"""
ext = os.path.splitext(image_path)[1].lower()
mime_types = {
'.jpg': 'image/jpeg',
'.jpeg': 'image/jpeg',
'.png': 'image/png',
'.gif': 'image/gif',
'.webp': 'image/webp',
}
mime_type = mime_types.get(ext, 'image/jpeg')

    with open(image_path, 'rb') as f:
        image_data = f.read()

    return base64.b64encode(image_data).decode('utf-8'), mime_type

# ========================================

# 构建请求头

# ========================================

headers = {
"Content-Type": "application/json",
"x-goog-api-key": API_KEY,
}

# ========================================

# 构建请求体

# ========================================

# 编码所有图片为 base64

image_parts = []
for path in INPUT_IMAGE_PATHS:
if os.path.exists(path):
img_base64, mime_type = encode_image_to_base64(path)
image_parts.append({
"inline_data": {
"mime_type": mime_type,
"data": img_base64
}
})

payload = {
"model": "gemini-3-pro-image-preview", # 指定使用的 AI 模型
"contents": [{
"parts": [
{"text": "将CL二维码.png中的二维码换到cl.png中."}, # 图片生成提示词
*image_parts # 展开所有图片数据
]
}],
"generationConfig": { # responseModalities: 设置响应模态 # - ['IMAGE']: 仅返回图片，不返回文本 # - ['TEXT', 'IMAGE']: 同时返回文本和图片（默认值）
"responseModalities": ["IMAGE"],

        # imageConfig: 图像配置选项
        "imageConfig": {
            # aspectRatio: 设置输出图片的宽高比
            #
            # ┌─────────────────────────────────────────────────────────────────┐
            # │ Gemini 2.5 Flash                                                │
            # ├──────────┬─────────────┬────────┐                               │
            # │ 宽高比    │ 分辨率      │ 令牌    │                               │
            # ├──────────┼─────────────┼────────┤                               │
            # │ 1:1      │ 1024x1024   │ 1290   │                               │
            # │ 2:3      │ 832x1248    │ 1290   │                               │
            # │ 3:2      │ 1248x832    │ 1290   │                               │
            # │ 3:4      │ 864x1184    │ 1290   │                               │
            # │ 4:3      │ 1184x864    │ 1290   │                               │
            # │ 4:5      │ 896x1152    │ 1290   │                               │
            # │ 5:4      │ 1152x896    │ 1290   │                               │
            # │ 9:16     │ 768x1344    │ 1290   │                               │
            # │ 16:9     │ 1344x768    │ 1290   │                               │
            # │ 21:9     │ 1536x672    │ 1290   │                               │
            # └──────────┴─────────────┴────────┘                               │
            # └─────────────────────────────────────────────────────────────────┘
            #
            # ┌─────────────────────────────────────────────────────────────────┐
            # │ Gemini 3 Pro Image 预览版                                        │
            # ├──────────┬─────────────────────────────────────────────────────┐│
            # │ 宽高比    │ 1K 分辨率   │ 1K令牌  │ 2K 分辨率   │ 4K 分辨率      ││
            # ├──────────┼─────────────┼────────┼─────────────┼───────────────┤│
            # │ 1:1      │ 1024x1024   │ 1210   │ 2048x2048   │ 4096x4096     ││
            # │ 2:3      │ 848x1264    │ 1210   │ 1696x2528   │ 3392x5056     ││
            # │ 3:2      │ 1264x848    │ 1210   │ 2528x1696   │ 5056x3392     ││
            # │ 3:4      │ 896x1200    │ 1210   │ 1792x2400   │ 3584x4800     ││
            # │ 4:3      │ 1200x896    │ 1210   │ 2400x1792   │ 4800x3584     ││
            # │ 4:5      │ 928x1152    │ 1210   │ 1856x2304   │ 3712x4608     ││
            # │ 5:4      │ 1152x928    │ 1210   │ 2304x1856   │ 4608x3712     ││
            # │ 9:16     │ 768x1376    │ 1210   │ 1536x2752   │ 3072x5504     ││
            # │ 16:9     │ 1376x768    │ 1210   │ 2752x1536   │ 5504x3072     ││
            # │ 21:9     │ 1584x672    │ 1210   │ 3168x1344   │ 6336x2688     ││
            # └──────────┴─────────────┴────────┴─────────────┴───────────────┘│
            # │ 注: 2K/4K 分辨率令牌分别为 1210/2000                             │
            # └─────────────────────────────────────────────────────────────────┘
            "aspectRatio": "1:1",

            # imageSize: 设置输出图片的分辨率
            # - "1K": 1K 分辨率（默认值，所有模型均支持）
            # - "2K": 2K 分辨率（仅 Gemini 3 Pro Image 预览版支持）
            # - "4K": 4K 分辨率（仅 Gemini 3 Pro Image 预览版支持）
            # 注意: gemini-2.5-flash-image 仅支持 1K，如需 2K/4K 请使用 gemini-3-pro-image-preview
            # "imageSize": "1K"
        }
    },

    # tools: Google 搜索工具（可选）
    # - 使用实时信息生成图像（如根据最新资讯添加元素等）
    # - 注意: 使用搜索工具时必须设置 responseModalities: ['TEXT', 'IMAGE']
    # - 图片专用模式 ['IMAGE'] 与搜索工具不兼容
    # "tools": [{"google_search": {}}]

}

# 完整的 API 端点

API_URL = f"{BASE_URL}/models/{payload['model']}:generateContent"

# ========================================

# 发送 API 请求并处理响应

# ========================================

try: # 发送 POST 请求到 API 服务器
response = requests.post(API_URL, headers=headers, json=payload, timeout=(30, 300))

    # 检查 HTTP 响应状态码
    response.raise_for_status()

    # ========================================
    # 输出成功结果
    # ========================================
    print("✅ 请求成功!")
    print("=" * 60)

    result = response.json()
    image_saved = False

    for candidate in result.get("candidates", []):
        for part in candidate.get("content", {}).get("parts", []):
            if "text" in part:
                print(f"文本响应: {part['text']}")
            elif "inlineData" in part:
                image_data = part["inlineData"].get("data", "")
                if image_data:
                    os.makedirs("output", exist_ok=True)
                    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                    filename = f"output/fused_image_{timestamp}.png"

                    with open(filename, 'wb') as f:
                        f.write(base64.b64decode(image_data))

                    print(f"图片已保存到: {filename}")
                    image_saved = True

    if not image_saved:
        print("⚠️ 响应中没有找到图片数据")

except requests.exceptions.RequestException as e:
print(f"❌ 请求失败: {e}")
except ValueError as e:
print(f"❌ 数据解析错误: {e}")
运行结果

# 请求成功!

图片已保存到: output/fused_image_20251208_154602.png
