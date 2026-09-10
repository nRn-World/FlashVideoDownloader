# Chrome Web Store – Publiceringsguide (v3.3.2)

GitHub ska **inte** pushas förrän du uttryckligen ber om det. ZIP:en räcker för uppladdning.

## 0. Ko-fi (gör detta före eller samtidigt som store-submit)

Produkt: https://ko-fi.com/s/72a48b875e  
Pris: **EUR 10.99** (lifetime)

Klistra in thank-you-texten från den **lokala** filen `kofi-thank-you.local.txt` (gitignorerad, finns bara på din dator).

Publicera **aldrig** licensnyckeln i git, README, issues, store-text eller skärmdumpar. Köpare ska bara se den på Ko-fi efter betalning.

Utan thank-you-meddelandet i Ko-fi får köpare ingen nyckel. Tillägget visar inte nyckeln i UI och lagrar bara en hash lokalt.

## 0b. Stoppa ominstallationsfusk (Cloudflare Worker, gratis)

Chrome rensar tilläggets lagring vid avinstallering. För att Free-gränsen ska hålla: skapa en Worker och klistra in URL:en i `license.js` som `FREE_RATE_LIMIT_API`.

1. https://dash.cloudflare.com → Workers & Pages → Create → Worker
2. Klistra in koden från `workers/fvd-rate-limit.js` → Deploy
3. Kopiera `https://….workers.dev/` till `FREE_RATE_LIMIT_API` i `license.js`
4. Kör `create_zip.bat` igen
5. Publicera den uppdaterade `privacy.html` (nämner rate-limit-tjänsten)

Worker-filen ska **inte** ligga i Chrome-ZIP:en.

## 1. ZIP att ladda upp

Kör `create_zip.bat` (eller `python prepare_store_assets.py`).

Fil: `Flash Video Downloader.zip`

ZIP:en ska **inte** innehålla: nyckelfiler, Screenshots, CURSOR-HANDOFF, TESTING, Python, `.git`.

## 2. Integritetspolicy (obligatoriskt)

Dashboard → Privacy practices → Privacy policy URL:

`https://nrn-world.github.io/FlashVideoDownloader/privacy.html`

**Viktigt:** den publika sidan måste matcha den uppdaterade `privacy.html` (Pro / Ko-fi / 1 nedladdning per timme). Om GitHub Pages fortfarande visar den gamla texten: publicera den nya `privacy.html` innan du skickar in tillagget (det kräver en push till `main`, eller annan publik host).

## 3. Data usage – Developer Dashboard

| Datatyp | Samlas in? | Delas? | Syfte |
|---------|------------|--------|-------|
| Webbhistorik (URLs) | Ja, lokalt | Nej | Videodetektion på aktiv flik |
| Användaraktivitet | Ja, lokalt | Nej | Nedladdningshistorik |
| Personlig kommunikation | Nej | – | – |
| Plats | Nej | – | – |
| Finansiell / betaldata | Nej | – | Betalning sker på Ko-fi, inte i tillägget |

**Certify:** Data is not sold to third parties. Data is not used for unrelated purposes.

**Paid features:** Optional Pro upgrade. Payment is handled on Ko-fi. The extension stores a hashed license token locally.

## 4. EU / trader (DSA)

Om du säljer Pro i EU: i Chrome Web Store Developer Dashboard, deklarera **trader status** och fyll i de uppgifter Google kräver. Utelämnad trader-deklaration är en vanlig avvisningsorsak för betalda tillägg.

## 5. Permission justification (klistra in vid granskning)

```
Single purpose: Help users detect and download openly accessible video files from the current browser tab.

• webRequest + host_permissions: Read Content-Type and Content-Length response headers to identify video streams. No request/response body is read or stored.

• activeTab + scripting: Inject a content script only when the user opens the popup, to scan <video> elements on the active tab.

• storage: Save language preference, local download history, Free-tier hourly download timestamps, and optional Pro license key on device only.

• offscreen: Merge HLS segments into a downloadable file using Blob APIs.

• downloads: Save user-selected files to disk.

• tabs: Show badge count and communicate with the active tab.

Does NOT: bypass DRM, download from YouTube/Netflix/Disney+/Twitch, collect analytics, or transmit browsing data to our servers.

Paid feature: Free tier is limited to 1 download per rolling hour. Optional lifetime Pro license (EUR 10.99) is purchased on Ko-fi. The extension does not process payments.
```

## 6. Store listing text (klistra in i Dashboard)

**Kort beskrivning (EN, max 132 tecken):**
Detect and save open videos from the page you are viewing. Free: 1 download/hour. Optional Pro. No DRM bypass.

**Detaljerad beskrivning (EN):**
Flash Video Downloader helps you find and save openly accessible videos on the page you are viewing.

FREE
• Detect MP4, WEBM, M3U8 and more from network traffic and page elements
• Preview before download
• Pause, resume and cancel downloads
• 1 download per rolling hour
• 1 download at a time
• Download history (last 10)
• 6 languages
• Choose where files are saved

PRO (optional, EUR 10.99 one-time, lifetime)
Buy on Ko-fi. After payment you receive a license key. Enter it in Settings → Pro.
• Unlimited hourly downloads
• 3 concurrent downloads
• Unlimited local download history

IMPORTANT
• Does NOT download from YouTube, Netflix, Disney+, Twitch or other DRM-protected platforms
• Does NOT bypass copyright protection
• Only download content you have the right to save
• Free to install. Pro is optional and is not required to use core detection

Pricing: Free tier works for basic use (1 download per hour). Pro is a one-time EUR 10.99 lifetime license via Ko-fi — no subscription, no in-extension checkout form.

Support: bynrnworld@gmail.com

**Kategori:** Productivity

## 7. Skärmdumpar

Ladda upp minst 1 (helst tre) i **1280×800**:

1. `Screenshots/store/01-main-popup-1280x800.png`
2. `Screenshots/store/02-download-progress-1280x800.png`
3. `Screenshots/store/03-settings-1280x800.png`

Promo (valfritt):
- Small tile: `Screenshots/store/promo-tile-440x280.png`
- Marquee: `Screenshots/store/promo-featured-1400x560.png`

## 8. Checklista före submit

- [ ] Ko-fi thank-you-meddelandet är live (text från `kofi-thank-you.local.txt`, nyckeln syns inte i git)
- [ ] Publik privacy-URL visar den nya texten (Pro + Ko-fi + 1/timme)
- [ ] ZIP skapad med `create_zip.bat` och innehåller `license.js` + `_locales`
- [ ] Testat Load unpacked: Free = 1 nedladdning/timme, Pro-nyckeln aktiverar obegränsat
- [ ] Store-texten nämner 1/timme, EUR 10.99, Ko-fi, ingen YouTube/DRM
- [ ] Inga påståenden om batch, filnamnsmallar eller kvalitetsväljare (de är inte med i denna version)
- [ ] EU trader-deklaration ifylld om du säljer i EU
- [ ] Version 3.3.2 i manifest

## 9. Kontakt

bynrnworld@gmail.com  
Ko-fi shop: https://ko-fi.com/s/72a48b875e
