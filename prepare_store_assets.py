#!/usr/bin/env python3
"""Prepare Chrome Web Store screenshots (1280x800) and upload ZIP."""

from __future__ import annotations

import sys

sys.dont_write_bytecode = True  # avoid __pycache__ in extension folder (Chrome blocks _* dirs)

import os
import re
import shutil
import zipfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
SRC_DIR = ROOT / "Screenshots"
STORE_DIR = SRC_DIR / "store"
ZIP_NAME = ROOT / "Flash Video Downloader.zip"

BG = (11, 15, 25)  # matches popup.css --bg-main
ACCENT = (37, 99, 235)
CYAN = (6, 182, 212)

STORE_SOURCES = [
    ("SC1.png", "01-main-popup.png", "Detect videos on any page"),
    ("SC2.png", "02-download-progress.png", "Pause, resume, and track progress"),
    ("SC3.png", "03-settings.png", "Settings, folder picker, and history"),
]

INCLUDE_FILES = [
    "manifest.json",
    "background.js",
    "blocked-hosts.js",
    "content.js",
    "license.js",
    "popup.html",
    "popup.js",
    "popup.css",
    "offscreen.html",
    "offscreen.js",
    "i18n.js",
    "storage-handles.js",
    "privacy.html",
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


def fit_on_canvas(src: Path, dst: Path, width: int, height: int, caption: str | None = None) -> None:
    img = Image.open(src).convert("RGBA")
    canvas = Image.new("RGB", (width, height), BG)
    draw = ImageDraw.Draw(canvas)

    top_pad = 56 if caption else 40
    bottom_pad = 40
    side_pad = 64
    max_w = width - side_pad * 2
    max_h = height - top_pad - bottom_pad

    scale = min(max_w / img.width, max_h / img.height)
    new_w = max(1, int(img.width * scale))
    new_h = max(1, int(img.height * scale))
    resized = img.resize((new_w, new_h), Image.Resampling.LANCZOS)

    x = (width - new_w) // 2
    y = top_pad + (max_h - new_h) // 2
    canvas.paste(resized, (x, y), resized)

    if caption:
        try:
            font = ImageFont.truetype("segoeui.ttf", 28)
        except OSError:
            font = ImageFont.load_default()
        draw.text((width // 2, 28), caption, fill=(148, 163, 184), anchor="mm", font=font)

    # subtle accent line under header
    draw.line([(side_pad, 50), (width - side_pad, 50)], fill=ACCENT, width=1)

    dst.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(dst, format="PNG", optimize=True)
    print(f"  {dst.name}: {width}x{height}")


def load_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    names = ("segoeuib.ttf", "arialbd.ttf") if bold else ("segoeui.ttf", "arial.ttf")
    for name in names:
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def build_promo_tile() -> None:
    """Chrome Web Store small promotional tile: 440x280, RGB PNG (no alpha)."""
    width, height = 440, 280
    canvas = Image.new("RGB", (width, height), BG)
    draw = ImageDraw.Draw(canvas)

    # subtle vertical gradient
    for y in range(height):
        t = y / height
        draw.line(
            [(0, y), (width, y)],
            fill=(int(11 + t * 10), int(15 + t * 12), int(25 + t * 28)),
        )

    # soft accent glow (top-right)
    glow = Image.new("RGB", (width, height), BG)
    glow_draw = ImageDraw.Draw(glow)
    glow_draw.ellipse([260, -80, 520, 180], fill=(20, 55, 130))
    canvas = Image.blend(canvas, glow, 0.35)
    draw = ImageDraw.Draw(canvas)

    icon_path = ROOT / "icons" / "icon128.png"
    icon_size = 108
    icon = Image.open(icon_path).convert("RGBA").resize((icon_size, icon_size), Image.Resampling.LANCZOS)
    icon_x, icon_y = 32, (height - icon_size) // 2
    draw.rounded_rectangle(
        [icon_x - 10, icon_y - 10, icon_x + icon_size + 10, icon_y + icon_size + 10],
        radius=22,
        fill=(22, 30, 49),
        outline=(37, 99, 235),
        width=2,
    )
    canvas.paste(icon, (icon_x, icon_y), icon)

    text_x = icon_x + icon_size + 28
    title_font = load_font(27, bold=True)
    sub_font = load_font(14)
    badge_font = load_font(11, bold=True)

    draw.text((text_x, 72), "Flash Video", fill=(248, 250, 252), font=title_font)
    draw.text((text_x, 104), "Downloader", fill=(248, 250, 252), font=title_font)
    draw.line([(text_x, 142), (text_x + 118, 142)], fill=CYAN, width=3)
    draw.text((text_x, 154), "MP4 · WEBM · M3U8", fill=(148, 163, 184), font=sub_font)
    draw.text((text_x, 178), "Free core · Optional Pro", fill=(100, 116, 139), font=sub_font)

    badge_w, badge_h = 64, 24
    badge_x, badge_y = text_x, 210
    draw.rounded_rectangle(
        [badge_x, badge_y, badge_x + badge_w, badge_y + badge_h],
        radius=12,
        fill=ACCENT,
    )
    draw.text((badge_x + badge_w // 2, badge_y + badge_h // 2), "FREE", fill=(255, 255, 255), anchor="mm", font=badge_font)

    draw.line([(32, 252), (408, 252)], fill=(37, 99, 235), width=2)

    STORE_DIR.mkdir(parents=True, exist_ok=True)
    out_png = STORE_DIR / "promo-tile-440x280.png"
    out_jpg = STORE_DIR / "promo-tile-440x280.jpg"
    canvas.save(out_png, format="PNG", optimize=True)
    canvas.save(out_jpg, format="JPEG", quality=95, subsampling=0)
    print(f"  {out_png.name}: {width}x{height} (24-bit RGB PNG)")
    print(f"  {out_jpg.name}: {width}x{height} (JPEG)")


def _draw_promo_background(width: int, height: int) -> Image.Image:
    canvas = Image.new("RGB", (width, height), BG)
    draw = ImageDraw.Draw(canvas)
    for y in range(height):
        t = y / height
        draw.line(
            [(0, y), (width, y)],
            fill=(int(11 + t * 10), int(15 + t * 12), int(25 + t * 28)),
        )
    glow = Image.new("RGB", (width, height), BG)
    glow_draw = ImageDraw.Draw(glow)
    glow_draw.ellipse([width * 0.45, -height * 0.35, width * 1.05, height * 0.75], fill=(20, 55, 130))
    glow_draw.ellipse([-width * 0.15, height * 0.35, width * 0.35, height * 1.1], fill=(12, 40, 95))
    return Image.blend(canvas, glow, 0.32)


def build_featured_promo_tile() -> None:
    """Chrome Web Store marquee promotional tile: 1400x560, RGB PNG (no alpha)."""
    width, height = 1400, 560
    canvas = _draw_promo_background(width, height)
    draw = ImageDraw.Draw(canvas)

    icon_path = ROOT / "icons" / "icon128.png"
    icon_size = 128
    icon = Image.open(icon_path).convert("RGBA").resize((icon_size, icon_size), Image.Resampling.LANCZOS)
    icon_x, icon_y = 72, 96
    draw.rounded_rectangle(
        [icon_x - 14, icon_y - 14, icon_x + icon_size + 14, icon_y + icon_size + 14],
        radius=28,
        fill=(22, 30, 49),
        outline=(37, 99, 235),
        width=3,
    )
    canvas.paste(icon, (icon_x, icon_y), icon)

    text_x = 72
    title_font = load_font(58, bold=True)
    sub_font = load_font(24)
    bullet_font = load_font(22)
    badge_font = load_font(18, bold=True)

    draw.text((text_x, 250), "Flash Video Downloader", fill=(248, 250, 252), font=title_font)
    draw.line([(text_x, 322), (text_x + 250, 322)], fill=CYAN, width=4)
    draw.text((text_x, 342), "Find and save open videos from any page", fill=(148, 163, 184), font=sub_font)

    bullets = [
        "MP4 · WEBM · M3U8 support",
        "Preview, pause and cancel downloads",
        "Free to install — optional Pro upgrade",
    ]
    bullet_y = 396
    for line in bullets:
        draw.ellipse([text_x, bullet_y + 8, text_x + 10, bullet_y + 18], fill=ACCENT)
        draw.text((text_x + 22, bullet_y), line, fill=(203, 213, 225), font=bullet_font)
        bullet_y += 38

    badge_w, badge_h = 108, 40
    badge_x, badge_y = text_x, 510
    draw.rounded_rectangle(
        [badge_x, badge_y, badge_x + badge_w, badge_y + badge_h],
        radius=20,
        fill=ACCENT,
    )
    draw.text(
        (badge_x + badge_w // 2, badge_y + badge_h // 2),
        "FREE",
        fill=(255, 255, 255),
        anchor="mm",
        font=badge_font,
    )

    preview_src = SRC_DIR / "SC1.png"
    if preview_src.exists():
        preview = Image.open(preview_src).convert("RGBA")
        frame_h = 430
        scale = frame_h / preview.height
        frame_w = int(preview.width * scale)
        preview = preview.resize((frame_w, frame_h), Image.Resampling.LANCZOS)
        frame_x = width - frame_w - 96
        frame_y = (height - frame_h) // 2
        pad = 14
        draw.rounded_rectangle(
            [frame_x - pad, frame_y - pad, frame_x + frame_w + pad, frame_y + frame_h + pad],
            radius=24,
            fill=(22, 30, 49),
            outline=(37, 99, 235),
            width=3,
        )
        canvas.paste(preview, (frame_x, frame_y), preview)

    draw.line([(72, 548), (1328, 548)], fill=(37, 99, 235), width=3)

    STORE_DIR.mkdir(parents=True, exist_ok=True)
    out_png = STORE_DIR / "promo-featured-1400x560.png"
    out_jpg = STORE_DIR / "promo-featured-1400x560.jpg"
    canvas.save(out_png, format="PNG", optimize=True)
    canvas.save(out_jpg, format="JPEG", quality=95, subsampling=0)
    print(f"  {out_png.name}: {width}x{height} (24-bit RGB PNG)")
    print(f"  {out_jpg.name}: {width}x{height} (JPEG)")


def build_screenshots() -> None:
    print("Preparing Chrome Web Store screenshots...")
    STORE_DIR.mkdir(parents=True, exist_ok=True)

    for src_name, out_name, caption in STORE_SOURCES:
        src = SRC_DIR / src_name
        if not src.exists():
            print(f"  SKIP missing {src_name}")
            continue
        out_1280 = STORE_DIR / out_name.replace(".png", "-1280x800.png")
        out_640 = STORE_DIR / out_name.replace(".png", "-640x400.png")
        fit_on_canvas(src, out_1280, 1280, 800, caption)
        # downscale from 1280 version for crisp 640
        large = Image.open(out_1280)
        small = large.resize((640, 400), Image.Resampling.LANCZOS)
        small.save(out_640, format="PNG", optimize=True)
        print(f"  {out_640.name}: 640x400")


def collect_zip_files() -> list[tuple[str, Path]]:
    entries: list[tuple[str, Path]] = []

    for name in INCLUDE_FILES:
        path = ROOT / name
        if not path.exists():
            raise FileNotFoundError(f"Required file missing for ZIP: {name}")
        entries.append((name, path))

    for folder, patterns in INCLUDE_DIRS.items():
        base = ROOT / folder
        if not base.exists():
            raise FileNotFoundError(f"Required folder missing for ZIP: {folder}")
        for pattern in patterns:
            for path in sorted(base.glob(pattern)):
                arc = f"{folder}/{path.name}".replace("\\", "/")
                entries.append((arc, path))

    return entries


def build_zip() -> None:
    print("Building Chrome Web Store ZIP...")
    if ZIP_NAME.exists():
        ZIP_NAME.unlink()

    entries = collect_zip_files()
    with zipfile.ZipFile(ZIP_NAME, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        for arcname, path in entries:
            zf.write(path, arcname)
            print(f"  + {arcname}")

    size_kb = ZIP_NAME.stat().st_size / 1024
    print(f"ZIP ready: {ZIP_NAME.name} ({size_kb:.1f} KB)")


FORBIDDEN_ZIP_PARTS = (
    "pro-license-keys",
    "CURSOR-HANDOFF",
    "TESTING.md",
    ".git",
    "Screenshots",
    "prepare_store_assets",
    "create_zip.bat",
    "workers/",
    "kofi-thank-you",
    ".local.txt",
)


def verify_zip() -> None:
    required = {"license.js", "manifest.json", "background.js", "popup.js", "i18n.js"}
    with zipfile.ZipFile(ZIP_NAME, "r") as zf:
        names = zf.namelist()
    missing = [name for name in required if name not in names]
    if missing:
        raise RuntimeError("ZIP missing required files: " + ", ".join(missing))
    leaked = [name for name in names if any(part in name for part in FORBIDDEN_ZIP_PARTS)]
    if leaked:
        raise RuntimeError("ZIP contains files that must not be uploaded: " + ", ".join(leaked))

    placeholder = re.compile(r"^FVD-PRO(?:-X{4}){2,4}$")
    key_re = re.compile(rb"FVD-PRO(?:-[A-Z0-9]{4}){2,4}")
    plaintext = []
    with zipfile.ZipFile(ZIP_NAME, "r") as zf:
        for name in zf.namelist():
            for match in key_re.finditer(zf.read(name)):
                token = match.group().decode("ascii")
                if not placeholder.fullmatch(token):
                    plaintext.append(name)
    if plaintext:
        raise RuntimeError(
            "ZIP contains a plaintext license key in: " + ", ".join(sorted(set(plaintext)))
        )
    print(f"ZIP check OK ({len(names)} files)")


def main() -> None:
    build_screenshots()
    build_promo_tile()
    build_featured_promo_tile()
    build_zip()
    verify_zip()
    print("\nDone.")
    print("Upload screenshots from: Screenshots/store/*-1280x800.png")
    print("Upload promo tile from: Screenshots/store/promo-tile-440x280.png")
    print("Upload featured promo from: Screenshots/store/promo-featured-1400x560.png")
    print("Privacy policy URL (host privacy.html): https://nrn-world.github.io/FlashVideoDownloader/privacy.html")


if __name__ == "__main__":
    main()
