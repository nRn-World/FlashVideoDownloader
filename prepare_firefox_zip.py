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
STORE_DOC = ROOT / "STORE_LISTING.md"

# The Firefox package is versioned on its own: it carries the Firefox for Android support
# that the Chrome build does not have yet, and Chrome keeps the version in manifest.json.
# Raise this for every AMO upload; AMO rejects a version that is not higher than the
# published one.
FIREFOX_VERSION = "3.5.4"

# The review prompt inside the popup is rewritten to the AMO listing at build time.
# Kept here so the packaged link and STORE_LISTING.md cannot drift apart again.
CHROME_LISTING_URL = "https://chromewebstore.google.com/detail/blbajmihakahbldejkginpccillhakdg/reviews"
AMO_LISTING_URL = "https://addons.mozilla.org/firefox/addon/nrn-flash-video-downloader/"

INCLUDE_FILES = [
    "background.js",
    "platform.js",
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
    "terms.html",
    "terms-gate.js",
    "welcome.html",
    "welcome.js",
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

    # Firefox MV3 uses an event page (scripts/page), not a service worker.
    # No chrome.offscreen permission — download engine runs in background-page iframe.
    perms = [p for p in m.get("permissions", []) if p != "offscreen"]

    m["permissions"] = perms
    m["background"] = {
        "page": "background-page.html"
    }
    # AMO only offers an add-on to Firefox for Android when the manifest opts in through
    # gecko_android. Without it the very same package stays desktop-only, Android users
    # never see a listing, and nothing else about the build changes.
    m["browser_specific_settings"] = {
        "gecko": {
            "id": "flash-video-downloader@nrnworld.one",
            "strict_min_version": "142.0",
            "data_collection_permissions": {
                "required": ["none"]
            }
        },
        # Same floor as desktop: an older Firefox for Android has not been tested either.
        "gecko_android": {
            "strict_min_version": "142.0"
        }
    }
    m["version"] = FIREFOX_VERSION
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

    # Patch review link for Firefox. verify() fails the build if this stops matching.
    popup = (STAGING / "popup.js").read_text(encoding="utf-8")
    popup = popup.replace(CHROME_LISTING_URL, AMO_LISTING_URL)
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

    stamp_version()

    manifest = build_firefox_manifest()
    (STAGING / "manifest.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


def stamp_version() -> int:
    """Write FIREFOX_VERSION into every staged file that spells a version out.

    The popup reads its version from the manifest at runtime, so this only reaches the
    fallback text in the markup, the localisation tables and the file headers. It still
    has to happen: a package whose manifest says 3.5.1 while five other files say 3.5.0 is
    the same drift that once put a dead listing slug in here.
    """
    chrome_version = chrome_manifest().get("version", "")
    if chrome_version == FIREFOX_VERSION:
        return 0

    old, new = "v" + chrome_version, "v" + FIREFOX_VERSION
    stamped = 0
    for path in sorted(STAGING.rglob("*")):
        if not path.is_file() or path.name == "manifest.json":
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue  # binary asset (icons)
        if old not in text:
            continue
        path.write_text(text.replace(old, new), encoding="utf-8")
        stamped += 1

    if stamped == 0:
        raise RuntimeError(
            f"Not one staged file still said {old}, so the Firefox version stamp did not "
            f"apply. FIREFOX_VERSION is {FIREFOX_VERSION}, manifest.json says "
            f"{chrome_version} - fix whichever of the two is wrong."
        )
    return stamped


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


def check_store_doc_agrees() -> None:
    """The doc and the packaged link must name the same listing.

    This is the drift that shipped a dead slug once: STORE_LISTING.md named one
    listing while the build wrote another into the package. A slug is a plain
    token, so a simple membership test is enough to keep them aligned.
    """
    slug = AMO_LISTING_URL.rstrip("/").rsplit("/", 1)[-1]
    if not STORE_DOC.exists():
        raise RuntimeError(
            f"{STORE_DOC.name} is missing, so the documented listing slug cannot be "
            f"checked against the packaged review link ({slug})"
        )
    if slug not in STORE_DOC.read_text(encoding="utf-8"):
        raise RuntimeError(
            f"STORE_LISTING.md never mentions the listing slug '{slug}' that the packaged "
            f"review link points at. One of the two is wrong - fix the wrong one."
        )


TEXT_SUFFIXES = {"js", "html", "json", "txt", "css"}


def verify() -> None:
    with zipfile.ZipFile(ZIP_NAME, "r") as zf:
        names = set(zf.namelist())
        manifest = json.loads(zf.read("manifest.json"))
        bg = zf.read("background.js").decode("utf-8", errors="replace")
        popup = zf.read("popup.js").decode("utf-8", errors="replace")
        # The archive is closed when this block ends, so every text file the checks
        # below need is read here rather than where it is used.
        texts = {
            name: zf.read(name).decode("utf-8", errors="replace")
            for name in names
            if name.rsplit(".", 1)[-1].lower() in TEXT_SUFFIXES
        }
    required = {
        "manifest.json",
        "background-page.html",
        "background.js",
        "platform.js",
        "offscreen.html",
        "offscreen.js",
        "popup.js",
        "ads.js",
        "firefox-importscripts-shim.js",
    }
    missing = sorted(required - names)
    if missing:
        raise RuntimeError("Missing: " + ", ".join(missing))

    # The review link is rewritten above. If the Chrome URL ever changes in
    # popup.js the replace silently stops matching, and Firefox would ship a link
    # pointing at the Chrome Web Store, so both directions are checked.
    if AMO_LISTING_URL not in popup:
        raise RuntimeError("popup.js does not link to the AMO listing: " + AMO_LISTING_URL)
    if "chromewebstore.google.com" in popup:
        raise RuntimeError("Firefox package still links to the Chrome Web Store: " + CHROME_LISTING_URL)
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
    gecko_android = manifest.get("browser_specific_settings", {}).get("gecko_android") or {}
    if not gecko_android.get("strict_min_version"):
        raise RuntimeError(
            "Missing gecko_android.strict_min_version: AMO would keep this package "
            "desktop-only and Firefox for Android would never be offered it"
        )

    # This package carries its own version, and nothing in it may still advertise the
    # Chrome one - not the markup, not the localisation tables, not the file headers.
    if manifest.get("version") != FIREFOX_VERSION:
        raise RuntimeError(
            f"Packaged version is {manifest.get('version')}, expected {FIREFOX_VERSION}"
        )
    # Checked on the bare version, not on the "v" spelling the stamp writes: a file that
    # spells the Chrome version some other way is precisely the drift this has to catch.
    chrome_version = chrome_manifest().get("version", "")
    if chrome_version != FIREFOX_VERSION:
        stale = sorted(
            name for name, text in texts.items() if chrome_version in text
        )
        if stale:
            raise RuntimeError(
                f"The package still mentions the Chrome version {chrome_version} in: "
                + ", ".join(stale)
                + f" - stamp_version() only rewrites the '{'v' + chrome_version}' spelling"
            )
    if manifest.get("background", {}).get("page") != "background-page.html":
        raise RuntimeError("Firefox background.page must be background-page.html")
    print(f"Firefox ZIP check OK ({len(names)} files), id={gecko.get('id')}, v={manifest.get('version')}, min={gecko.get('strict_min_version')}")


def main() -> None:
    print("Building Firefox AMO package...")
    try:
        stage()
        build_zip()
        verify()
        check_store_doc_agrees()
    finally:
        # Never leave the staging tree behind, including when a check fails:
        # it is not gitignored, so a failed build would leave committable clutter.
        shutil.rmtree(STAGING, ignore_errors=True)
    print()
    print(f"Upload: {ZIP_NAME}")
    print("Note: Load temporarily in about:debugging before AMO submit if possible.")


if __name__ == "__main__":
    main()
