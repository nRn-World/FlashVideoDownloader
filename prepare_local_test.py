#!/usr/bin/env python3
"""Stage a clean unpacked build for chrome://extensions -> Load unpacked.

Creates ./local-test/ containing exactly the files that ship in the Chrome Web
Store build, so what you see locally matches the released extension. Re-run this
after changing source files to refresh the staged copy.

Usage:
    python prepare_local_test.py

Then:
    chrome://extensions -> enable Developer mode -> Load unpacked -> select ./local-test
"""
from __future__ import annotations

import shutil

from prepare_store_assets import INCLUDE_DIRS, INCLUDE_FILES, ROOT

OUT_DIR = ROOT / "local-test"


def stage() -> None:
    if OUT_DIR.exists():
        shutil.rmtree(OUT_DIR)
    OUT_DIR.mkdir(parents=True)

    for name in INCLUDE_FILES:
        src = ROOT / name
        if not src.exists():
            raise FileNotFoundError(f"Missing file: {name}")
        dst = OUT_DIR / name
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)

    for folder, patterns in INCLUDE_DIRS.items():
        base = ROOT / folder
        if not base.exists():
            raise FileNotFoundError(f"Missing folder: {folder}")
        for pattern in patterns:
            for src in sorted(base.glob(pattern)):
                dst = OUT_DIR / folder / src.name
                dst.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(src, dst)


def main() -> None:
    stage()
    count = sum(1 for p in OUT_DIR.rglob("*") if p.is_file())
    print(f"Unpacked build ready: {OUT_DIR} ({count} files)")
    print()
    print("Next steps:")
    print("  1. Open chrome://extensions")
    print("  2. Turn on Developer mode (top right)")
    print("  3. Click 'Load unpacked' and select the local-test folder")
    print("  4. Open a normal website, click the extension icon")
    print("     -> the Free tier shows the ad banner; Pro (activated license) hides it")


if __name__ == "__main__":
    main()
