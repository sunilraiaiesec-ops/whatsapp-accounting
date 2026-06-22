#!/usr/bin/env python3
"""Organize WhatsApp Desktop group photos/videos into named folders (hardlinks, no extra disk)."""

from __future__ import annotations

import argparse
import os
import re
import sqlite3
import sys
from pathlib import Path

WA_ROOT = Path.home() / "Library/Group Containers/group.net.whatsapp.WhatsApp.shared"
MEDIA_ROOT = WA_ROOT / "Message/Media"
CHAT_DB = WA_ROOT / "ChatStorage.sqlite"
DEFAULT_OUT = Path.home() / "WhatsApp-Group-Media-Backup"

PHOTO_VIDEO_SUFFIXES = {
    ".jpg", ".jpeg", ".png", ".webp", ".gif", ".heic", ".heif",
    ".mp4", ".mov", ".3gp", ".mkv", ".avi", ".m4v",
}


def safe_folder_name(name: str) -> str:
    cleaned = re.sub(r'[\\/:*?"<>|]', "_", name).strip()
    return cleaned or "Unknown Group"


def load_group_names() -> dict[str, str]:
    if not CHAT_DB.exists():
        return {}
    conn = sqlite3.connect(f"file:{CHAT_DB}?mode=ro", uri=True)
    rows = conn.execute(
        "SELECT ZCONTACTJID, ZPARTNERNAME FROM ZWACHATSESSION WHERE ZCONTACTJID LIKE '%@g.us'"
    ).fetchall()
    conn.close()
    return {jid: (name or jid) for jid, name in rows}


def is_photo_or_video(path: Path) -> bool:
    if path.name.endswith(".thumb"):
        return False
    return path.suffix.lower() in PHOTO_VIDEO_SUFFIXES


def link_file(src: Path, dest: Path, copy: bool) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists():
        return
    if copy:
        dest.write_bytes(src.read_bytes())
    else:
        os.link(src, dest)


def organize(out_dir: Path, copy: bool = False, dry_run: bool = False) -> dict:
    names = load_group_names()
    stats = {"groups": 0, "files": 0, "skipped": 0, "errors": 0}

    group_dirs = sorted(MEDIA_ROOT.glob("*@g.us"))
    if not group_dirs:
        print(f"No group media folders found under {MEDIA_ROOT}", file=sys.stderr)
        sys.exit(1)

    for group_dir in group_dirs:
        jid = group_dir.name
        label = safe_folder_name(names.get(jid, jid))
        dest_root = out_dir / label
        group_files = 0

        for src in group_dir.rglob("*"):
            if not src.is_file() or not is_photo_or_video(src):
                stats["skipped"] += 1
                continue

            dest = dest_root / src.name
            if dry_run:
                group_files += 1
                continue

            try:
                link_file(src, dest, copy=copy)
                group_files += 1
            except OSError as exc:
                stats["errors"] += 1
                print(f"  skip {src.name}: {exc}", file=sys.stderr)

        if group_files:
            stats["groups"] += 1
            stats["files"] += group_files
            action = "would link" if dry_run else "linked"
            print(f"{action} {group_files:4d} files -> {label}")

    return stats


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--out",
        type=Path,
        default=DEFAULT_OUT,
        help=f"Output folder (default: {DEFAULT_OUT})",
    )
    parser.add_argument(
        "--copy",
        action="store_true",
        help="Copy files instead of hardlinking (uses extra disk space)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be organized without creating files",
    )
    args = parser.parse_args()

    if not MEDIA_ROOT.exists():
        print(f"WhatsApp media not found at {MEDIA_ROOT}", file=sys.stderr)
        sys.exit(1)

    mode = "copy" if args.copy else "hardlink"
    print(f"Source: {MEDIA_ROOT}")
    print(f"Output: {args.out}")
    print(f"Mode:   {mode}\n")

    stats = organize(args.out, copy=args.copy, dry_run=args.dry_run)

    print(
        f"\nDone: {stats['groups']} groups, {stats['files']} photos/videos"
        + (f", {stats['errors']} errors" if stats["errors"] else "")
    )
    if not args.dry_run:
        print(f"\nUpload folder to Google Drive:\n  {args.out}")


if __name__ == "__main__":
    main()
