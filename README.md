# ⚡ Flash Video Downloader (FVD) — Chrome Extension

<p align="center">
  <img src="icons/icon128.png" alt="FVD Logo" width="128" height="128" />
</p>

<p align="center">
  <a href="https://github.com/nRn-World/FlashVideoDownloader"><img src="https://img.shields.io/badge/version-3.2-blue?style=for-the-badge" alt="version" /></a>
  <a href="#"><img src="https://img.shields.io/badge/Manifest-V3-4285F4?style=for-the-badge" alt="manifest v3" /></a>
  <a href="#"><img src="https://img.shields.io/badge/license-Educational%20Non--Commercial-orange?style=for-the-badge" alt="license" /></a>
  <img src="https://img.shields.io/badge/PRs-welcome-10b981?style=for-the-badge" alt="prs" />
</p>

<p align="center">
  <b>Snabb, modern och pålitlig videonedladdare för Chrome.</b><br/>
  Fångar <code>MP4 · WEBM · FLV · MKV · MOV · AVI · M3U8 · MPD · TS · MP3</code> + 20 fler format — sparar allt som spelbar video med <b>paus / återuppta / avbryt</b>, <b>1-100% smooth progress</b> och global bakgrundsnedladdning.
</p>

---

## ✨ Vad är nytt i v3.2

| Feature | Före | Nu |
|---|---|---|
| **Pausa / Återuppta** | — | `⏸ Pausa` / `▶ Fortsätt` på både kort och Active Downloads-banner, badge `⏸` |
| **Avbryt med varning** | — | `✕` → modal <i>"Är du säker att du vill stoppa nedladdningen?"</i> → tar bort från listan |
| **Smooth 1-100%** | hoppade 5-10% | Offscreen rapporterar varje heltals-procent direkt, popup tickar `1%` i taget, bar `0.35s linear` |
| **Alla tillåtna källor som video** | HLS + enstaka MP4 | Generisk pipeline för **alla** tillåtna filer inkl. `.avi/.mkv/.mov/.webm/.flv/.ts/.m4s/.mpd` + `blob:` — sparas med korrekt MIME (`video/x-msvideo` för .avi etc.) |

> **.avi?** Ja — detekteras via `webRequest` + DOM-scan, visas med `AVI`-badge och laddas ner som `.avi` (behåller AVI-container) via samma pausbara pipeline.

---

## 🚀 Features

- **🌐 Deep Sniffing** — `webRequest.onHeadersReceived` + `content.js` MutationObserver fångar nätverk + `<video>`, `<source>`, `<a href>`, `data-*`, `script`-inbäddade URL:er och `blob:`-källor.
- **🎞️ Universal Video** — 25+ tillägg stöds, streaming-manifest (`m3u8/mpd/m3u/ts/m4s/fmp4`) konverteras till `.mp4`, vanliga videoformat behåller sin ändelse (`.avi` förblir `.avi`, `.mkv` förblir `.mkv`).
- **⚡ Turbo HLS** — 20 parallella workers, `EXTINF`-duration summeras, `Blob` → `ObjectURL` → `a.download` utan storleksgräns (Offscreen Document).
- **📊 Live Tracking** — total / nedladdad duration (`38m 12s → 12m 04s / 38m 12s`), bytes, segment `124/340`.
- **⏯️ Full Kontroll** — Pausa/återuppta när som helst, avbryt med bekräftelse, badge visar `⚡ / 47% / ⏸ / ✅`.
- **▶️ Preview** — Inbyggd spelare med OSD-seek (`←/→ 5s, Shift 10s, Ctrl 30s, J/L`) och volym.
- **🌍 6 Språk** — EN/SV/TR/ES/FR/AR via `i18n.js` + `chrome.storage`.
- **📜 Historik** — 50 senaste, auto-rens 24h (valbart), tid + storlek + duration.
- **🔒 Respekt för skydd** — DRM/YouTube och andra skyddade tjänster kringgås inte (se Terms).

---

## 📦 Installation

```bash
git clone https://github.com/nRn-World/FlashVideoDownloader.git
```

1. Öppna `chrome://extensions/` → **Utvecklarläge** på.
2. **Läs in okomprimerad** → välj mappen `Flash Video Downloader`.
3. Fäst tillägget i verktygsfältet.

Uppdatera: `git pull` → klicka 🔄 **Uppdatera** på `chrome://extensions/`.

---

## 🎮 Användning

1. Spela upp videon på hemsidan (tillåten källa) — den dyker upp i popupen under `All / Video / Streams`.
2. **Förhandsgranska** med `▶ Spela`, kopiera länk med `📋 Länk`.
3. Klicka `⬇ Ladda ner` — kortet och bannern `⚡ Aktiva Nedladdningar` visar `12%`, `124/340`, `2m 03s / 38m 12s`.
4. `⏸ Pausa` / `▶ Fortsätt` när du vill, `✕` för att avbryta (med varning).
5. Vid `merging → ✅` sparas filen (t.ex. `myvideo.avi` eller `video_4821.mp4`) — syns i historiken under ⚙️.

<details>
<summary><b>Format som stöds</b></summary>

`mp4, m4v, m4s, fmp4, webm, flv, f4v, m3u8, m3u, mpd, ts, m2ts, mts, mov, avi, mkv, ogv, 3gp, 3g2, wmv, av1, hevc, vob, mpg/mpeg, mp3, m4a, aac, wav, ogg, opus, flac, wma` — plus `blob:`-videor från `<video>`-element.

</details>

---

## 🛠️ Teknik

```
manifest v3 | background (service worker) | offscreen (BLOBS) | content script | popup
webRequest + DOM-scan  →  tabMedia Map  →  popup render
HLS:        offscreen 20 workers + EXTINF → Blob → ObjectURL
Generic:    offscreen ReadableStream + Range-paus + fake 1-95% för okänd längd
Progress:   varje heltals-% puschas direkt, popup animerar 1% tick (18-50ms/step), bar 0.35s linear
```

| Fil | Roll |
|---|---|
| `background.js` | sniff, badge, `activeDownloads` Map, `START_HLS/GENERIC_DOWNLOAD` |
| `offscreen.js` | HLS + generisk fetch/stream med paus/cancel |
| `content.js` | DOM-scan, `blob:`-stöd, smooth seek OSD |
| `popup.js/.html/.css` | UI, paus/stopp-modal, smooth 1-100, filter, historik |
| `i18n.js` | 6 språk |

---

## 📄 Licens

**Educational & Non-Commercial Use License** — personligt/utbildning ok, kommersiell användning kräver tillstånd.

Kontakt: **bynrnworld@gmail.com**

---

## 🔄 Changelog

- **v3.2** — Paus/återuppta + avbryt med varning, smooth 1-100% (ingen hopp), universell video-pipeline (alla tillåtna format inkl. `.avi` + `blob:`), bevarad originaländelse, MPD/DASH-detektering.
- **v3.1** — Offscreen HLS-pipeline (fix tom fil), global Active Downloads-banner.
- **v3.0 PRO** — Duration tracking, i18n, historik, preview.

<p align="center">Skapad med ❤️ av <b>nRn World</b></p>
