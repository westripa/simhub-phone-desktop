#!/usr/bin/env python3
"""Generate Tauri v2 updater latest.json from signed release assets."""

from __future__ import annotations

import argparse
import datetime as dt
import json
from pathlib import Path
from typing import Iterable


def find_signature(directory: Path, suffixes: Iterable[str]) -> tuple[Path, Path] | None:
    for suffix in suffixes:
        for sig_path in sorted(directory.glob(f"*{suffix}.sig")):
            asset_path = directory / sig_path.name[: -len(".sig")]
            if asset_path.is_file():
                return asset_path, sig_path
    return None


def build_manifest(directory: Path, tag: str, repo: str, notes: str) -> dict[str, object]:
    version = tag.lstrip("v")
    base_url = f"https://github.com/{repo}/releases/download/{tag}"
    platforms: dict[str, dict[str, str]] = {}

    win_pair = find_signature(directory, ["-setup.exe", ".msi", ".exe"])
    if win_pair:
        asset, sig = win_pair
        platforms["windows-x86_64"] = {
            "signature": sig.read_text(encoding="utf-8").strip(),
            "url": f"{base_url}/{asset.name}",
        }

    linux_pair = find_signature(directory, [".AppImage"])
    if linux_pair:
        asset, sig = linux_pair
        platforms["linux-x86_64"] = {
            "signature": sig.read_text(encoding="utf-8").strip(),
            "url": f"{base_url}/{asset.name}",
        }

    mac_pair = find_signature(directory, [".app.tar.gz"])
    if mac_pair:
        asset, sig = mac_pair
        entry = {
            "signature": sig.read_text(encoding="utf-8").strip(),
            "url": f"{base_url}/{asset.name}",
        }
        platforms["darwin-aarch64"] = entry
        platforms["darwin-x86_64"] = entry

    if not platforms:
        raise SystemExit(f"No signed Tauri updater artifacts (.sig) found in {directory}")

    return {
        "version": version,
        "notes": notes,
        "pub_date": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "platforms": platforms,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dir", type=Path, required=True)
    parser.add_argument("--tag", required=True)
    parser.add_argument("--repo", required=True)
    parser.add_argument("--notes", default="")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    notes = args.notes.strip() or f"SimHub Phone Desktop {args.tag}"
    manifest = build_manifest(args.dir, args.tag, args.repo, notes)
    args.output.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Generated {args.output} for {args.tag} with platforms: {sorted(manifest['platforms'])}")


if __name__ == "__main__":
    main()
