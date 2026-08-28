# Chrome Web Store – Publiceringsguide

## 1. Ladda upp ZIP

Kör `create_zip.bat` eller packa manuellt (exkludera `server.py`, `test_player.html`, `temp_zip_check/`).

## 2. Integritetspolicy (OBLIGATORISKT)

Publicera `privacy.html` på en publik URL, t.ex.:

- GitHub Pages: `https://<username>.github.io/FlashVideoDownloader/privacy.html`
- Egen webbplats

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

Ladda upp minst 1 skärmdump (1280×800 eller 640×400):
1. Popup med detekterade videor
2. Nedladdning pågår (progress bar)
3. Inställningar/historik

## 7. Checklista före submit

- [ ] `privacy.html` publicerad med publik URL
- [ ] ZIP innehåller `lib/mux.min.js`, `blocked-hosts.js`, `i18n.js`
- [ ] Inga externa CDN-länkar i popup
- [ ] Testat "Load unpacked" utan fel
- [ ] Beskrivning matchar faktisk funktion (gratis, ingen betalversion, ingen YouTube-downloader)

## 8. Kontakt

bynrnworld@gmail.com
