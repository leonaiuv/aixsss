#!/usr/bin/env python3
"""
DMXAPI OpenAI-img 调用工具（最小依赖，标准库实现）。

支持：
- 文生图：/v1/images/generations
- 图片编辑：/v1/images/edits（multipart）
- dry-run 请求体预览
- b64_json 保存、url 打印/可选下载
"""

from __future__ import annotations

import argparse
import base64
import datetime as _dt
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple


def _mask_secret(value: str, keep: int = 6) -> str:
    if not value:
        return ""
    if len(value) <= keep:
        return "*" * len(value)
    return value[:keep] + "*" * (len(value) - keep)


def _build_endpoint(base_url: str, path_suffix: str) -> str:
    base = base_url.rstrip("/")
    if base.endswith("/v1"):
        return f"{base}{path_suffix}"
    return f"{base}/v1{path_suffix}"


def _mime_to_ext(mime_type: str) -> str:
    mt = (mime_type or "").lower().strip()
    if mt == "image/jpeg" or mt == "image/jpg":
        return "jpg"
    if mt == "image/png":
        return "png"
    if mt == "image/webp":
        return "webp"
    if mt == "image/gif":
        return "gif"
    return "bin"


def _guess_mime_type(path: str) -> str:
    ext = Path(path).suffix.lower()
    return {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
        ".gif": "image/gif",
    }.get(ext, "application/octet-stream")


def _guess_image_mime_by_bytes(raw: bytes, fallback: str = "image/png") -> str:
    if len(raw) >= 12:
        if raw[0:4] == b"\x89PNG":
            return "image/png"
        if raw[0:3] == b"\xff\xd8\xff":
            return "image/jpeg"
        if raw[0:4] == b"RIFF" and raw[8:12] == b"WEBP":
            return "image/webp"
        if raw[0:4] == b"GIF8":
            return "image/gif"
    return fallback


def _http_post_json(url: str, headers: Dict[str, str], payload: Dict[str, object], timeout_s: int) -> Dict[str, object]:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(url=url, data=body, headers=headers, method="POST")
    return _http_read_json(req, timeout_s)


def _encode_multipart(
    *,
    fields: Iterable[Tuple[str, str]],
    files: Iterable[Tuple[str, str, str, bytes]],
    boundary: str,
) -> bytes:
    chunks: List[bytes] = []
    b = boundary.encode("utf-8")

    for name, value in fields:
        chunks.extend(
            [
                b"--" + b + b"\r\n",
                f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode("utf-8"),
                value.encode("utf-8"),
                b"\r\n",
            ]
        )

    for field_name, filename, mime_type, data in files:
        chunks.extend(
            [
                b"--" + b + b"\r\n",
                (
                    f'Content-Disposition: form-data; name="{field_name}"; filename="{filename}"\r\n'
                    f"Content-Type: {mime_type}\r\n\r\n"
                ).encode("utf-8"),
                data,
                b"\r\n",
            ]
        )

    chunks.append(b"--" + b + b"--\r\n")
    return b"".join(chunks)


def _http_post_multipart(
    url: str,
    headers: Dict[str, str],
    fields: Iterable[Tuple[str, str]],
    files: Iterable[Tuple[str, str, str, bytes]],
    timeout_s: int,
) -> Dict[str, object]:
    boundary = f"----dmxapi-openai-img-{uuid.uuid4().hex}"
    body = _encode_multipart(fields=fields, files=files, boundary=boundary)
    req_headers = {
        **headers,
        "Content-Type": f"multipart/form-data; boundary={boundary}",
        "Content-Length": str(len(body)),
    }
    req = urllib.request.Request(url=url, data=body, headers=req_headers, method="POST")
    return _http_read_json(req, timeout_s)


def _http_read_json(req: urllib.request.Request, timeout_s: int) -> Dict[str, object]:
    try:
        with urllib.request.urlopen(req, timeout=timeout_s) as resp:
            raw = resp.read()
            return json.loads(raw.decode("utf-8"))
    except urllib.error.HTTPError as e:
        raw = e.read()
        raise RuntimeError(
            "HTTP 请求失败："
            f"status={getattr(e, 'code', 'unknown')} url={req.full_url}\n"
            f"响应片段：\n{raw[:1200].decode('utf-8', errors='replace')}"
        ) from e
    except urllib.error.URLError as e:
        raise RuntimeError(f"网络错误：{e}") from e


def _download_url(url: str, timeout_s: int) -> Tuple[bytes, str]:
    req = urllib.request.Request(url=url, method="GET")
    with urllib.request.urlopen(req, timeout=timeout_s) as resp:
        raw = resp.read()
        content_type = (resp.headers.get("Content-Type") or "").split(";", 1)[0].strip().lower()
        if not content_type.startswith("image/"):
            content_type = _guess_image_mime_by_bytes(raw)
        return raw, content_type


def _save_image_bytes(*, out_dir: str, prefix: str, index: int, mime_type: str, raw: bytes) -> str:
    os.makedirs(out_dir, exist_ok=True)
    ts = _dt.datetime.now().strftime("%Y%m%d_%H%M%S")
    ext = _mime_to_ext(mime_type)
    path = os.path.join(out_dir, f"{prefix}_{ts}_{index}.{ext}")
    with open(path, "wb") as f:
        f.write(raw)
    return path


def _build_auth_headers(api_key: str, auth_header: str) -> Dict[str, str]:
    if auth_header == "authorization":
        return {"Authorization": api_key}
    if auth_header == "authorization-bearer":
        return {"Authorization": f"Bearer {api_key}"}
    raise ValueError(f"unsupported auth_header: {auth_header}")


def _print_dry_run(endpoint: str, headers: Dict[str, str], body: object) -> None:
    safe_headers = dict(headers)
    if "Authorization" in safe_headers:
        safe_headers["Authorization"] = _mask_secret(safe_headers["Authorization"])

    print("== endpoint ==")
    print(endpoint)
    print("\n== headers ==")
    print(json.dumps(safe_headers, indent=2, ensure_ascii=False))
    print("\n== body ==")
    if isinstance(body, dict):
        print(json.dumps(body, indent=2, ensure_ascii=False)[:6000])
    else:
        print(str(body))


def _iter_data_items(resp: Dict[str, object]) -> Iterable[Dict[str, object]]:
    rows = resp.get("data")
    if not isinstance(rows, list):
        return []
    out: List[Dict[str, object]] = []
    for row in rows:
        if isinstance(row, dict):
            out.append(row)
    return out


def run_generate(args: argparse.Namespace, common_headers: Dict[str, str]) -> int:
    endpoint = _build_endpoint(args.base_url, "/images/generations")
    payload: Dict[str, object] = {
        "model": args.model,
        "prompt": args.prompt,
        "n": args.n,
    }

    if args.size:
        payload["size"] = args.size
    if args.background:
        payload["background"] = args.background
    if args.moderation:
        payload["moderation"] = args.moderation
    if args.output_format:
        payload["output_format"] = args.output_format
    if args.output_compression is not None:
        payload["output_compression"] = args.output_compression
    if args.quality:
        payload["quality"] = args.quality
    if args.response_format:
        payload["response_format"] = args.response_format
    if args.style:
        payload["style"] = args.style

    headers = {**common_headers, "Content-Type": "application/json"}
    if args.dry_run:
        _print_dry_run(endpoint, headers, payload)
        return 0

    result = _http_post_json(endpoint, headers, payload, args.timeout_s)
    return _handle_result(result, args)


def run_edit(args: argparse.Namespace, common_headers: Dict[str, str]) -> int:
    endpoint = _build_endpoint(args.base_url, "/images/edits")

    files: List[Tuple[str, str, str, bytes]] = []
    for path in args.image:
        p = Path(path)
        if not p.exists() or not p.is_file():
            raise SystemExit(f"找不到图片文件：{path}")
        raw = p.read_bytes()
        files.append(("image", p.name, _guess_mime_type(path), raw))

    fields: List[Tuple[str, str]] = [("model", args.model), ("prompt", args.prompt)]
    if args.size:
        fields.append(("size", args.size))
    if args.background:
        fields.append(("background", args.background))
    if args.input_fidelity:
        fields.append(("input_fidelity", args.input_fidelity))
    if args.output_format:
        fields.append(("output_format", args.output_format))
    if args.output_compression is not None:
        fields.append(("output_compression", str(args.output_compression)))
    if args.quality:
        fields.append(("quality", args.quality))

    if args.dry_run:
        dry_body = {
            "fields": dict(fields),
            "files": [
                {"field": f[0], "filename": f[1], "mime_type": f[2], "bytes": len(f[3])}
                for f in files
            ],
        }
        _print_dry_run(endpoint, common_headers, dry_body)
        return 0

    result = _http_post_multipart(endpoint, common_headers, fields, files, args.timeout_s)
    return _handle_result(result, args)


def _handle_result(result: Dict[str, object], args: argparse.Namespace) -> int:
    saved = 0
    for idx, item in enumerate(_iter_data_items(result), start=1):
        b64 = item.get("b64_json")
        if isinstance(b64, str) and b64:
            raw = base64.b64decode(b64)
            fallback = "image/png"
            if getattr(args, "output_format", None):
                fallback = {
                    "png": "image/png",
                    "jpeg": "image/jpeg",
                    "webp": "image/webp",
                }.get(args.output_format, "image/png")
            mime_type = _guess_image_mime_by_bytes(raw, fallback)
            path = _save_image_bytes(out_dir=args.out_dir, prefix=args.prefix, index=idx, mime_type=mime_type, raw=raw)
            print(f"✅ 已保存图片：{path}")
            saved += 1
            continue

        url = item.get("url")
        if isinstance(url, str) and url:
            if args.download_url:
                raw, mime_type = _download_url(url, args.timeout_s)
                path = _save_image_bytes(out_dir=args.out_dir, prefix=args.prefix, index=idx, mime_type=mime_type, raw=raw)
                print(f"✅ 已下载 URL 图片：{path}")
                saved += 1
            else:
                print(f"🔗 图片 URL[{idx}]：{url}")
            continue

    if saved == 0:
        print("⚠️ 未发现可保存图片，原始返回如下：")
        print(json.dumps(result, ensure_ascii=False, indent=2)[:6000])
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="DMXAPI OpenAI-img 调用工具")
    parser.add_argument("--api-key", default=os.environ.get("DMXAPI_API_KEY", ""), help="DMXAPI API Key")
    parser.add_argument("--base-url", default="https://www.dmxapi.cn", help="DMXAPI 基础地址")
    parser.add_argument("--auth-header", choices=["authorization", "authorization-bearer"], default="authorization")
    parser.add_argument("--timeout-s", type=int, default=300, help="请求超时（秒）")
    parser.add_argument("--out-dir", default="output", help="输出目录")
    parser.add_argument("--prefix", default="openai_img", help="输出文件名前缀")
    parser.add_argument("--download-url", action="store_true", help="若返回 URL，则尝试下载图片")
    parser.add_argument("--dry-run", action="store_true", help="仅打印请求，不实际调用")

    sub = parser.add_subparsers(dest="cmd", required=True)

    g = sub.add_parser("generate", help="文生图")
    g.add_argument("--model", default="gpt-image-1.5")
    g.add_argument("--prompt", required=True)
    g.add_argument("--n", type=int, default=1)
    g.add_argument("--size", default="")
    g.add_argument("--background", choices=["auto", "transparent", "opaque"], default="")
    g.add_argument("--moderation", choices=["auto", "low"], default="")
    g.add_argument("--output-format", choices=["png", "jpeg", "webp"], default="")
    g.add_argument("--output-compression", type=int, default=None)
    g.add_argument("--quality", choices=["auto", "high", "medium", "low", "hd", "standard"], default="")
    g.add_argument("--response-format", choices=["b64_json", "url"], default="")
    g.add_argument("--style", choices=["vivid", "natural"], default="")

    e = sub.add_parser("edit", help="图片编辑")
    e.add_argument("--model", default="gpt-image-1.5")
    e.add_argument("--prompt", required=True)
    e.add_argument("--image", action="append", required=True, help="输入图片路径，可重复传参")
    e.add_argument("--size", default="")
    e.add_argument("--background", choices=["auto", "transparent", "opaque"], default="")
    e.add_argument("--input-fidelity", choices=["high", "low"], default="")
    e.add_argument("--output-format", choices=["png", "jpeg", "webp"], default="")
    e.add_argument("--output-compression", type=int, default=None)
    e.add_argument("--quality", choices=["auto", "high", "medium", "low", "hd", "standard"], default="")

    return parser


def main(argv: Optional[List[str]] = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    if not args.api_key and not args.dry_run:
        raise SystemExit("缺少 API Key：请传 --api-key 或设置环境变量 DMXAPI_API_KEY")

    headers = _build_auth_headers(args.api_key, args.auth_header) if args.api_key else {}

    if args.cmd == "generate":
        return run_generate(args, headers)
    if args.cmd == "edit":
        return run_edit(args, headers)

    raise SystemExit(f"unsupported cmd: {args.cmd}")


if __name__ == "__main__":
    sys.exit(main())
