#!/usr/bin/env python3
"""Build Flash Video Downloader Firefox.zip for addons.mozilla.org."""

from __future__ import annotations

import json
import shutil
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
STAGING = ROOT / "_firefox_build"
ZIP_NAME = ROOT / "Flash Video Downloader Firefox.zip"

INCLUDE_FILES = [
    "background.js",
    "background-page.html",
    "firefox-importscripts-shim.js",
    "blocked-hosts.js",
    "content.js",
    "page-hook.js",
    "license.js",
    "ads.js",
    "popup.html",
    "popup.js",
    "popup.css",
    "offscreen.html",
    "offscreen.js",
    "i18n.js",
    "storage-handles.js",
    "privacy.html",
    "welcome.html",
    "download-success.html",
    "LICENSE",
    "THIRD_PARTY_NOTICES.txt",
]

INCLUDE_DIRS = {
    "icons": ["*.png"],
    "lib": ["*.js"],
    "_locales/en": ["messages.json"],
    "_locales/sv": ["messages.json"],
    "_locales/es": ["messages.json"],
    "_locales/fr": ["messages.json"],
    "_locales/tr": ["messages.json"],
    "_locales/ar": ["messages.json"],
}


def chrome_manifest() -> dict:
    return json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))


def build_firefox_manifest() -> dict:
    m = chrome_manifest()
    version = m.get("version", "3.3.3")

    # Firefox MV3 uses an event page (scripts/page), not a service worker.
    # No chrome.offscreen permission — download engine runs in background-page iframe.
    perms = [p for p in m.get("permissions", []) if p != "offscreen"]

    m["permissions"] = perms
    m["background"] = {
        "page": "background-page.html"
    }
    m["browser_specific_settings"] = {
        "gecko": {
            "id": "flash-video-downloader@nrnworld.one",
            "strict_min_version": "142.0",
            "data_collection_permissions": {
                "required": ["none"]
            }
        }
    }
    m["version"] = version
    # Optional: keep chrome-compatible keys ignored by Firefox
    return m


def stage() -> None:
    if STAGING.exists():
        shutil.rmtree(STAGING)
    STAGING.mkdir(parents=True)

    for name in INCLUDE_FILES:
        src = ROOT / name
        if not src.exists():
            raise FileNotFoundError(f"Missing required file: {name}")
        shutil.copy2(src, STAGING / name)

    for folder, patterns in INCLUDE_DIRS.items():
        dest_dir = STAGING / folder
        dest_dir.mkdir(parents=True, exist_ok=True)
        base = ROOT / folder
        for pattern in patterns:
            for path in sorted(base.glob(pattern)):
                shutil.copy2(path, dest_dir / path.name)

    # Patch review link for Firefox (AMO listing slug may redirect after first publish)
    popup = (STAGING / "popup.js").read_text(encoding="utf-8")
    popup = popup.replace(
        "https://chromewebstore.google.com/detail/blbajmihakahbldejkginpccillhakdg/reviews",
        "https://addons.mozilla.org/firefox/addon/flash-video-downloader/",
    )
    (STAGING / "popup.js").write_text(popup, encoding="utf-8")

    # Strip Chrome-only offscreen API usage so AMO validator does not warn
    bg = (STAGING / "background.js").read_text(encoding="utf-8")
    chrome_offscreen_block = """    if (!chrome.offscreen || typeof chrome.offscreen.hasDocument !== 'function') {
      console.warn('[FVD] chrome.offscreen not available');
      return;
    }
    if (await chrome.offscreen.hasDocument()) return;
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['BLOBS'],
      justification: 'Download HLS segments, merge into full video, and save to disk via DOM Blob/ObjectURL'
    });
    await new Promise(r => setTimeout(r, 80));
"""
    firefox_offscreen_fallback = """    // Download document API is Chrome-only; Firefox uses the iframe path above.
    console.warn('[FVD] Offscreen iframe unavailable');
"""
    # Also neutralize comment that mentions chrome.offscreen for cleaner validation
    bg = bg.replace(
        "// Chrome: chrome.offscreen API. Firefox: hidden iframe in background-page.html (no offscreen API).",
        "// Chrome uses a separate download document API. Firefox uses a hidden iframe in background-page.html.",
    )
    if chrome_offscreen_block not in bg:
        raise RuntimeError("Could not locate Chrome offscreen block to strip for Firefox build")
    bg = bg.replace(chrome_offscreen_block, firefox_offscreen_fallback)
    (STAGING / "background.js").write_text(bg, encoding="utf-8")

    manifest = build_firefox_manifest()
    (STAGING / "manifest.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


def build_zip() -> None:
    if ZIP_NAME.exists():
        ZIP_NAME.unlink()
    with zipfile.ZipFile(ZIP_NAME, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        for path in sorted(STAGING.rglob("*")):
            if path.is_file():
                arc = path.relative_to(STAGING).as_posix()
                zf.write(path, arc)
                print(f"  + {arc}")
    print(f"ZIP ready: {ZIP_NAME.name} ({ZIP_NAME.stat().st_size / 1024:.1f} KB)")


def verify() -> None:
    with zipfile.ZipFile(ZIP_NAME, "r") as zf:
        names = set(zf.namelist())
        manifest = json.loads(zf.read("manifest.json"))
        bg = zf.read("background.js").decode("utf-8", errors="replace")
    required = {
        "manifest.json",
        "background-page.html",
        "background.js",
        "offscreen.html",
        "offscreen.js",
        "popup.js",
        "ads.js",
        "firefox-importscripts-shim.js",
    }
    missing = sorted(required - names)
    if missing:
        raise RuntimeError("Missing: " + ", ".join(missing))
    if "offscreen" in manifest.get("permissions", []):
        raise RuntimeError("Firefox zip must not include offscreen permission")
    if "chrome.offscreen.hasDocument" in bg or "chrome.offscreen.createDocument" in bg:
        raise RuntimeError("Firefox zip still references chrome.offscreen APIs")
    # Also catch property access without awaiting patterns
    if "chrome.offscreen" in bg and "typeof chrome.offscreen" not in bg:
        # Allow comments only: strip comments then re-check
        import re
        code_only = re.sub(r"//.*?$|/\*.*?\*/", "", bg, flags=re.M | re.S)
        if "chrome.offscreen" in code_only:
            raise RuntimeError("Firefox zip still references chrome.offscreen APIs in code")

    gecko = manifest.get("browser_specific_settings", {}).get("gecko", {})
    if not gecko.get("id"):
        raise RuntimeError("Missing gecko.id")
    if gecko.get("strict_min_version", "0") < "142.0":
        raise RuntimeError("strict_min_version must be >= 142.0 for data_collection_permissions")
    if "data_collection_permissions" not in gecko:
        raise RuntimeError("Missing gecko.data_collection_permissions")
    if manifest.get("background", {}).get("page") != "background-page.html":
        raise RuntimeError("Firefox background.page must be background-page.html")
    print(f"Firefox ZIP check OK ({len(names)} files), id={gecko.get('id')}, v={manifest.get('version')}, min={gecko.get('strict_min_version')}")


def main() -> None:
    print("Building Firefox AMO package...")
    stage()
    build_zip()
    verify()
    shutil.rmtree(STAGING, ignore_errors=True)
    print()
    print(f"Upload: {ZIP_NAME}")
    print("Note: Load temporarily in about:debugging before AMO submit if possible.")


if __name__ == "__main__":
    main()
