# Chrome Web Store – Publiceringsguide (v3.3.5)

GitHub ska **inte** pushas förrän du uttryckligen ber om det. ZIP:en räcker för uppladdning.

## 0. Ko-fi (gör detta före eller samtidigt som store-submit)

Produkt: https://ko-fi.com/s/72a48b875e  
Pris: **EUR 10.99** (lifetime)

Klistra in thank-you-texten från den **lokala** filen `kofi-thank-you.local.txt` (gitignorerad, finns bara på din dator).

Publicera **aldrig** licensnyckeln i git, README, issues, store-text eller skärmdumpar. Köpare ska bara se den på Ko-fi efter betalning.

## 1. ZIP att ladda upp

Kör `create_zip.bat` (eller `python prepare_store_assets.py`).

Fil: `Flash Video Downloader.zip`

ZIP:en ska **inte** innehålla: nyckelfiler, Screenshots, CURSOR-HANDOFF, TESTING, Python, `.git`.
ZIP:en **ska** innehålla `welcome.html` (öppnas vid första install).

## 2. URL:er

- Privacy: `https://nrn-world.github.io/FlashVideoDownloader/privacy.html`
- Homepage: `https://nrn-world.github.io/FlashVideoDownloader/`
- Support: bynrnworld@gmail.com

## 3. Store listing text (klistra in i Dashboard)

**Kort beskrivning (EN, max 132 tecken):**
```
Detect and save open videos (MP4, WEBM, M3U8) from the page you are viewing. Preview, pause, local history. No DRM bypass.
```

**Kort beskrivning (SV):**
```
Hitta och spara öppna videor (MP4, WEBM, M3U8) på sidan du tittar på. Förhandsgranska, pausa, lokal historik. Ingen DRM-kringgång.
```

**Detaljerad beskrivning (EN):**
```
Flash Video Downloader finds openly accessible videos on the page you are viewing and lets you save them locally.

HOW TO USE
1. Play the video on the webpage
2. Open the extension popup
3. Preview, then download (pause / resume / cancel supported)

FEATURES
• Detects MP4, WEBM, M3U8 and more from network traffic and page elements
• Preview before download
• Pause, resume and cancel
• Choose where files are saved
• Local download history only — no cloud, no tracking
• 6 languages (English, Svenska, Español, Français, Türkçe, العربية)

FREE TIER
• 1 download per rolling hour
• 1 download at a time
• Last 10 downloads in history

PRO (optional, EUR 10.99 one-time lifetime via Ko-fi)
• Unlimited hourly downloads
• Up to 3 concurrent downloads
• Unlimited local history
Buy on Ko-fi, then enter your license key under Settings → Pro.

IMPORTANT
• Does NOT download from YouTube, Netflix, Disney+, Twitch or other DRM-protected platforms
• Does NOT bypass copyright protection
• Only save content you have the right to download
• Free to install — Pro is optional

Support: bynrnworld@gmail.com
Homepage: https://nrn-world.github.io/FlashVideoDownloader/
```

**Detaljerad beskrivning (SV):**
```
Flash Video Downloader hittar öppet tillgängliga videor på sidan du tittar på och låter dig spara dem lokalt.

SÅ HÄR GÖR DU
1. Spela upp videon på webbsidan
2. Öppna tilläggets popup
3. Förhandsgranska och ladda ner (paus / återuppta / avbryt stöds)

FUNKTIONER
• Upptäcker MP4, WEBM, M3U8 med mera från nätverkstrafik och sidelement
• Förhandsgranska före nedladdning
• Paus, återuppta och avbryt
• Välj sparplats
• Endast lokal historik — ingen molnlagring, ingen spårning
• 6 språk

GRATIS
• 1 nedladdning per rullande timme
• 1 nedladdning i taget
• Senaste 10 i historiken

PRO (valfritt, EUR 10.99 engångs via Ko-fi)
• Obegränsade nedladdningar per timme
• Upp till 3 samtidiga nedladdningar
• Obegränsad lokal historik
Köp på Ko-fi och ange licensnyckel under Inställningar → Pro.

VIKTIGT
• Laddar INTE ner från YouTube, Netflix, Disney+, Twitch eller andra DRM-skyddade plattformar
• Kringgår INTE upphovsrättsskydd
• Spara bara innehåll du har rätt att ladda ner

Support: bynrnworld@gmail.com
Hemsida: https://nrn-world.github.io/FlashVideoDownloader/
```

**Kategori:** Verktyg
