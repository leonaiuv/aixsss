#!/usr/bin/env python3
"""
DMXAPI Gemini/Nano Banana (nanobananapro) 图片调用小工具。

用途：
  - 以最少依赖（仅标准库）发送 generateContent 请求
  - 支持：文生图 / 单图编辑 / 多图融合（prompt + 0..N 张图片）
  - 兼容解析多种返回：inlineData / inline_data / data:image/*;base64,...
  - 将返回图片保存到本地，并可选保存 thoughtSignature/base64（用于多轮编辑）

注意：
  - 该脚本默认请求 DMXAPI 的 v1beta generateContent 端点：
      {base_url}/v1beta/models/{model}:generateContent
  - 认证头默认使用 x-goog-api-key；如遇鉴权问题可切换到 Authorization。
"""

from __future__ import annotations

import argparse
import base64
import datetime as _dt
import json
import os
import sys
import urllib.error
import urllib.request
from typing import Any, Dict, Iterable, List, Optional, Tuple


def _mask_secret(value: str, keep: int = 6) -> str:
    if not value:
        return ""
    if len(value) <= keep:
        return "*" * len(value)
    return value[:keep] + "*" * (len(value) - keep)


def _guess_mime_type(path: str) -> str:
    ext = os.path.splitext(path)[1].lower()
    return {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".gif": "image/gif",
        ".webp": "image/webp",
    }.get(ext, "image/jpeg")


def _mime_to_ext(mime_type: str) -> str:
    if not mime_type:
        return "png"
    ext = mime_type.split("/")[-1].lower()
    return {"jpeg": "jpg"}.get(ext, ext)


def _build_endpoint(base_url: str, model: str) -> str:
    base = base_url.rstrip("/")
    if base.endswith("/v1beta"):
        return f"{base}/models/{model}:generateContent"
    return f"{base}/v1beta/models/{model}:generateContent"


def _encode_image_part(path: str) -> Dict[str, Any]:
    with open(path, "rb") as f:
        raw = f.read()
    mime_type = _guess_mime_type(path)
    return {
        "inline_data": {
            "mime_type": mime_type,
            "data": base64.b64encode(raw).decode("utf-8"),
        }
    }


def _iter_parts(result: Dict[str, Any]) -> Iterable[Dict[str, Any]]:
    for candidate in result.get("candidates", []) or []:
        content = candidate.get("content") or {}
        parts = content.get("parts") or []
        for part in parts:
            if isinstance(part, dict):
                yield part


def _extract_inline_blob(part: Dict[str, Any]) -> Optional[Tuple[str, str, Optional[str]]]:
    inline = part.get("inlineData") or part.get("inline_data")
    if not isinstance(inline, dict):
        return None
    mime_type = inline.get("mimeType") or inline.get("mime_type") or "image/png"
    data = inline.get("data")
    if not isinstance(data, str) or not data:
        return None
    signature = part.get("thoughtSignature") or part.get("thought_signature")
    if signature is not None and not isinstance(signature, str):
        signature = None
    return mime_type, data, signature


def _extract_data_url_blob(text: str) -> Optional[Tuple[str, str]]:
    # 例：data:image/png;base64,AAAA...
    if not text.startswith("data:image/"):
        return None
    if "base64," not in text:
        return None
    meta, b64 = text.split("base64,", 1)
    mime_type = meta.split(";", 1)[0].split(":", 1)[-1] or "image/png"
    b64 = b64.strip()
    if not b64:
        return None
    return mime_type, b64


def _save_image_bytes(
    *,
    out_dir: str,
    prefix: str,
    mime_type: str,
    raw_bytes: bytes,
    index: int,
) -> str:
    os.makedirs(out_dir, exist_ok=True)
    ts = _dt.datetime.now().strftime("%Y%m%d_%H%M%S")
    ext = _mime_to_ext(mime_type)
    filename = f"{prefix}_{ts}_{index}.{ext}"
    path = os.path.join(out_dir, filename)
    with open(path, "wb") as f:
        f.write(raw_bytes)
    return path


def _save_text_file(*, out_dir: str, filename: str, text: str) -> str:
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, filename)
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)
    return path


def _http_post_json(url: str, headers: Dict[str, str], payload: Dict[str, Any], timeout_s: int) -> Dict[str, Any]:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(url=url, data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=timeout_s) as resp:
            raw = resp.read()
            try:
                return json.loads(raw.decode("utf-8"))
            except Exception:
                raise RuntimeError(f"响应不是合法 JSON，原始内容：\n{raw[:800].decode('utf-8', errors='replace')}")
    except urllib.error.HTTPError as e:
        raw = e.read()
        raise RuntimeError(
            "HTTP 请求失败："
            f"status={getattr(e, 'code', 'unknown')} url={url}\n"
            f"响应片段：\n{raw[:1200].decode('utf-8', errors='replace')}"
        ) from e
    except urllib.error.URLError as e:
        raise RuntimeError(f"网络错误：{e}") from e


def main(argv: List[str]) -> int:
    parser = argparse.ArgumentParser(description="调用 DMXAPI Gemini generateContent 并保存返回图片。")
    parser.add_argument("--api-key", default=os.environ.get("DMXAPI_API_KEY", ""), help="DMXAPI API Key（也可用环境变量 DMXAPI_API_KEY）")
    parser.add_argument("--base-url", default=os.environ.get("DMXAPI_BASE_URL", "https://www.dmxapi.cn"), help="DMXAPI 基础地址")
    parser.add_argument("--endpoint", default="", help="完整端点（优先级高于 base-url+model 组合）")
    parser.add_argument("--model", default="gemini-3-pro-image-preview", help="模型名（用于拼接端点）")
    parser.add_argument("--auth-header", choices=["x-goog-api-key", "authorization", "authorization-bearer"], default="x-goog-api-key")
    parser.add_argument("--prompt", required=True, help="提示词")
    parser.add_argument("--image", action="append", default=[], help="输入图片路径（可重复传多张，用于编辑/融合）")
    parser.add_argument("--response-modalities", default="IMAGE", help="如 IMAGE 或 TEXT,IMAGE（留空用 --no-response-modalities）")
    parser.add_argument("--no-response-modalities", action="store_true", help="不在 generationConfig 中发送 responseModalities")
    parser.add_argument("--aspect-ratio", default="1:1", help="如 1:1、16:9")
    parser.add_argument("--image-size", default="", help="如 1K、2K、4K（仅部分模型支持）")
    parser.add_argument("--timeout-s", type=int, default=300, help="请求超时（秒）")
    parser.add_argument("--out-dir", default="output", help="输出目录")
    parser.add_argument("--prefix", default="nanobanana", help="输出文件名前缀")
    parser.add_argument("--save-base64", action="store_true", help="同时保存返回的 base64 数据到 .b64.txt")
    parser.add_argument("--save-signature", action="store_true", help="同时保存 thoughtSignature 到 .signature.txt（若返回）")
    parser.add_argument("--dry-run", action="store_true", help="仅打印将发送的请求，不实际调用接口")
    args = parser.parse_args(argv)

    endpoint = args.endpoint or _build_endpoint(args.base_url, args.model)

    headers: Dict[str, str] = {"Content-Type": "application/json"}
    if args.api_key:
        if args.auth_header == "x-goog-api-key":
            headers["x-goog-api-key"] = args.api_key
        elif args.auth_header == "authorization":
            headers["Authorization"] = args.api_key
        elif args.auth_header == "authorization-bearer":
            headers["Authorization"] = f"Bearer {args.api_key}"

    parts: List[Dict[str, Any]] = [{"text": args.prompt}]
    for img_path in args.image:
        if not os.path.exists(img_path):
            raise SystemExit(f"找不到图片文件：{img_path}")
        parts.append(_encode_image_part(img_path))

    payload: Dict[str, Any] = {
        "model": args.model,
        "contents": [{"parts": parts}],
    }

    generation_config: Dict[str, Any] = {}
    if not args.no_response_modalities:
        modalities = [m.strip().upper() for m in args.response_modalities.split(",") if m.strip()]
        if modalities:
            generation_config["responseModalities"] = modalities
    image_config: Dict[str, Any] = {}
    if args.aspect_ratio:
        image_config["aspectRatio"] = args.aspect_ratio
    if args.image_size:
        image_config["imageSize"] = args.image_size
    if image_config:
        generation_config["imageConfig"] = image_config
    if generation_config:
        payload["generationConfig"] = generation_config

    if args.dry_run:
        safe_headers = dict(headers)
        if "x-goog-api-key" in safe_headers:
            safe_headers["x-goog-api-key"] = _mask_secret(safe_headers["x-goog-api-key"])
        if "Authorization" in safe_headers:
            safe_headers["Authorization"] = _mask_secret(safe_headers["Authorization"])
        print("== endpoint ==")
        print(endpoint)
        print("\n== headers ==")
        print(json.dumps(safe_headers, indent=2, ensure_ascii=False))
        print("\n== payload ==")
        print(json.dumps(payload, indent=2, ensure_ascii=False)[:4000])
        return 0

    if not args.api_key:
        raise SystemExit("缺少 API Key：请传 --api-key 或设置环境变量 DMXAPI_API_KEY")

    result = _http_post_json(endpoint, headers, payload, args.timeout_s)

    saved_any = False
    image_index = 0
    for part in _iter_parts(result):
        inline_blob = _extract_inline_blob(part)
        if inline_blob is not None:
            mime_type, b64, signature = inline_blob
            raw = base64.b64decode(b64)
            path = _save_image_bytes(
                out_dir=args.out_dir,
                prefix=args.prefix,
                mime_type=mime_type,
                raw_bytes=raw,
                index=image_index,
            )
            print(f"✅ 已保存图片：{path}")
            saved_any = True

            if args.save_base64:
                b64_path = _save_text_file(
                    out_dir=args.out_dir,
                    filename=f"{os.path.basename(path)}.b64.txt",
                    text=b64,
                )
                print(f"🧾 已保存 base64：{b64_path}")

            if args.save_signature and signature:
                sig_path = _save_text_file(
                    out_dir=args.out_dir,
                    filename=f"{os.path.basename(path)}.signature.txt",
                    text=signature,
                )
                print(f"🧾 已保存 thoughtSignature：{sig_path}")

            image_index += 1
            continue

        text = part.get("text")
        if isinstance(text, str):
            data_url_blob = _extract_data_url_blob(text.strip())
            if data_url_blob is not None:
                mime_type, b64 = data_url_blob
                raw = base64.b64decode(b64)
                path = _save_image_bytes(
                    out_dir=args.out_dir,
                    prefix=args.prefix,
                    mime_type=mime_type,
                    raw_bytes=raw,
                    index=image_index,
                )
                print(f"✅ 已保存图片（data URL）：{path}")
                saved_any = True
                image_index += 1
                continue

            # 普通文本：打印到 stdout，避免吞掉关键信息
            print(text)

        file_data = part.get("fileData")
        if isinstance(file_data, dict) and file_data.get("fileUri"):
            print(f"🔗 fileUri: {file_data.get('fileUri')}")

    if not saved_any:
        print("⚠️ 未在响应中解析到图片数据。")
        print(json.dumps(result, ensure_ascii=False)[:2000])
        return 2

    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main(sys.argv[1:]))
    except KeyboardInterrupt:
        raise SystemExit(130)
