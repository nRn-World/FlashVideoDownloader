# Chrome Web Store – Publiceringsguide

## 1. Ladda upp ZIP

Kör `create_zip.bat` eller packa manuellt (exkludera `server.py`, `test_player.html`, `temp_zip_check/`).

## 2. Integritetspolicy (OBLIGATORISKT)

Integritetspolicyn publiceras automatiskt via **GitHub Actions** (`.github/workflows/deploy-pages.yml`) till:

`https://nrn-world.github.io/FlashVideoDownloader/privacy.html`

Efter push till `main`: öppna **Actions** → vänta tills *Deploy GitHub Pages* är grön. Under **Settings → Pages** ska källan vara **GitHub Actions**.

Klistra in URL:en i Developer Dashboard → **Privacy practices → Privacy policy**.

## 3. Data usage – Developer Dashboard

Markera följande under **Privacy practices**:

| Datatyp | Samlas in? | Delas? | Syfte |
|---------|------------|--------|-------|
| Webbhistorik (URLs) | Ja, lokalt | Nej | Videodetektion på aktiv flik |
| Användaraktivitet | Ja, lokalt | Nej | Nedladdningshistorik |
| Personlig kommunikation | Nej | – | – |
| Plats | Nej | – | – |

**Certify:** Data is not sold to third parties. Data is not used for unrelated purposes.

## 4. Permission justification (klistra in vid granskning)

```
Single purpose: Help users detect and download openly accessible video files from the current browser tab.

• webRequest + host_permissions: Read Content-Type and Content-Length response headers to identify video streams. No request/response body is read or stored.

• activeTab + scripting: Inject a content script only when the user opens the popup, to scan <video> elements on the active tab.

• storage: Save language preference and local download history on device only.

• offscreen: Merge HLS segments into a downloadable file using Blob APIs.

• downloads: Save user-selected files to disk.

• tabs: Show badge count and communicate with the active tab.

Does NOT: bypass DRM, download from YouTube/Netflix/Disney+/Twitch, collect analytics, or transmit data to external servers.
```

## 5. Store listing text

**Kort beskrivning (EN):**
Free video downloader — detect and save open video files (MP4, WEBM, M3U8) from the current tab. No ads, no subscription.

**Detaljerad beskrivning (EN):**
Flash Video Downloader is a free Chrome extension that helps you find and save openly accessible videos on the page you're viewing.

Features:
• Detect MP4, WEBM, M3U8 and more from network traffic and page elements
• Preview before download
• Pause, resume and cancel HLS downloads
• Download history (local, auto-delete after 24h)
• 6 languages
• 100% free — all features included, no payment required

Important:
• Does NOT download from YouTube, Netflix, Disney+, Twitch or other DRM-protected platforms
• Does NOT bypass copyright protection
• Only downloads content you have the right to save

**Kategori:** Productivity

## 6. Skärmdumpar (krävs)

Kör `create_zip.bat` – skapar även butiks-skärmdumpar i `Screenshots/store/`.

**Chrome Web Store storlekar:**
- **1280×800** (rekommenderas) – `*-1280x800.png`
- **640×400** (alternativ) – `*-640x400.png`

Ladda upp minst 1 skärmdump (helst alla tre 1280×800):
1. `01-main-popup-1280x800.png` – detekterade videor
2. `02-download-progress-1280x800.png` – nedladdning pågår
3. `03-settings-1280x800.png` – inställningar

**Integritetspolicy-URL (efter GitHub Pages):**
`https://nrn-world.github.io/FlashVideoDownloader/privacy.html`

## 7. Checklista före submit

- [ ] `privacy.html` publicerad med publik URL
- [ ] ZIP innehåller `lib/mux.min.js`, `blocked-hosts.js`, `i18n.js`
- [ ] Inga externa CDN-länkar i popup
- [ ] Testat "Load unpacked" utan fel
- [ ] Beskrivning matchar faktisk funktion (gratis, ingen betalversion, ingen YouTube-downloader)

## 8. Kontakt

bynrnworld@gmail.com
