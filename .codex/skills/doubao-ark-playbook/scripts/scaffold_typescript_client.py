#!/usr/bin/env python3
"""
Scaffold TypeScript templates for Doubao/ARK (Responses API).

Copies this skill's `assets/typescript/` into a target directory, without
overwriting existing files unless `--force` is provided.

Usage:
  python scaffold_typescript_client.py --out <dir>
  python scaffold_typescript_client.py --out <dir> --target doubao-ark --force
"""

from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path


def copy_tree(src_dir: Path, dst_dir: Path, *, force: bool) -> None:
    if not src_dir.exists() or not src_dir.is_dir():
        raise FileNotFoundError(f"Source directory not found: {src_dir}")

    conflicts: list[Path] = []
    for src_path in src_dir.rglob("*"):
        if not src_path.is_file():
            continue
        rel = src_path.relative_to(src_dir)
        dst_path = dst_dir / rel
        if dst_path.exists() and not force:
            conflicts.append(dst_path)

    if conflicts and not force:
        print("[ERROR] Target has existing files. Re-run with --force to overwrite:")
        for p in conflicts[:20]:
            print(f"  - {p}")
        if len(conflicts) > 20:
            print(f"  ... and {len(conflicts) - 20} more")
        raise SystemExit(1)

    for src_path in src_dir.rglob("*"):
        if not src_path.is_file():
            continue
        rel = src_path.relative_to(src_dir)
        dst_path = dst_dir / rel
        dst_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src_path, dst_path)
        print(f"[OK] {dst_path}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Scaffold Doubao/ARK TypeScript templates.")
    parser.add_argument("--out", required=True, help="Output directory to write templates into.")
    parser.add_argument(
        "--target",
        default="doubao-ark",
        help="Subdirectory name under --out (default: doubao-ark).",
    )
    parser.add_argument("--force", action="store_true", help="Overwrite existing files.")
    args = parser.parse_args()

    skill_root = Path(__file__).resolve().parents[1]
    src_dir = skill_root / "assets" / "typescript"
    dst_dir = Path(args.out).expanduser().resolve() / args.target

    dst_dir.mkdir(parents=True, exist_ok=True)
    copy_tree(src_dir, dst_dir, force=args.force)
    return 0


if __name__ == "__main__":
    sys.exit(main())

