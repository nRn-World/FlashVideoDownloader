# Chrome Web Store – Publiceringsguide (v3.5.0)

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
- **Villkor (EULA): `https://nrn-world.github.io/FlashVideoDownloader/terms.html`**
- Återbetalningspolicy (ankare): `https://nrn-world.github.io/FlashVideoDownloader/terms.html#refunds`
- Homepage: `https://nrn-world.github.io/FlashVideoDownloader/`
- Support: bynrnworld@gmail.com

> `terms.html` ligger i repots rot och publiceras automatiskt av `deploy-pages.yml` tillsammans med `privacy.html`.
> Samma fil paketeras i både Chrome- och Firefox-ZIP:en, så tillägget kan alltid visa villkoren offline.

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
• 1 download every 2 hours
• 1 download at a time
• Last 10 downloads in history

ADS AND AFFILIATE LINKS
• The Free tier shows a small, bundled promotional banner inside the popup
• The banner is an affiliate link (a partner programme). If you click it and buy something, the developer may
  earn a commission — at no extra cost to you.
• Starting a Free download offers two choices: a faster download that opens one sponsor offer in a background
  tab, or a normal download that opens nothing. Both save the same file, and the no-sponsor option is always
  available.
• Clicking opens the partner's website in a new tab. The extension sends no data to the partner, runs no
  ad-network code and loads no remote script; impressions and clicks are counted locally.
• Every banner is labelled "Sponsored" or "Ad · affiliate" and can be dismissed with ✕
• Pro removes all ads and never opens a sponsor tab

PRO (optional, EUR 10.99 one-time lifetime via Ko-fi)
• Unlimited downloads
• Up to 3 concurrent downloads
• Unlimited local history
Buy on Ko-fi, then enter your license key under Settings → Pro.

IMPORTANT
• Does NOT download from YouTube, Netflix, Disney+, Twitch or other DRM-protected platforms
• Does NOT bypass copyright protection
• Also blocks TikTok, Instagram, Facebook, X, Hulu, Paramount+, Peacock and Crunchyroll, whose terms forbid downloading
• Rights holders: copyright notices to bynrnworld@gmail.com (subject "Copyright notice")
• Only save content you have the right to download
• Free to install — Pro is optional

TERMS, WARRANTY AND REFUNDS
• Provided "as is", without warranty. The developer is not liable for how you use the extension.
• You are buying from the independent developer, not from Google. Payment for Pro is processed by Ko-fi
  (https://ko-fi.com/s/72a48b875e), and the Pro licence is 18+.
• Pro is a one-time, lifetime licence (EUR 10.99). All sales are final — no refunds, and no compensation if the extension
  stops working, is restricted or is discontinued.
• Full terms: https://nrn-world.github.io/FlashVideoDownloader/terms.html

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
• 1 nedladdning varannan timme (rullande 2-timmarsfönster)
• 1 nedladdning i taget
• Senaste 10 i historiken

ANNONSER & AFFILIATE-LÄNKAR
• Gratisnivån visar en liten, inbyggd reklambanner i popupen
• Bannern är en affiliate-länk (partnerskap). Om du klickar och köper något kan utvecklaren få en
  provision — utan extra kostnad för dig.
• När du startar en gratisnedladdning får du två val: snabb nedladdning som öppnar ett sponsorerbjudande
  i en bakgrundsflik, eller vanlig nedladdning som inte öppnar något. Båda sparar samma fil, och valet utan
  sponsor finns alltid.
• Klick öppnar partnerns webbplats i en ny flik. Tillägget skickar inga uppgifter till partnern, kör ingen
  annonsnätverkskod och laddar ingen fjärrkod; visningar och klick räknas lokalt.
• Alla banners är märkta "Annons · affiliate" och kan stängas med ✕
• Pro tar bort all reklam och öppnar aldrig någon sponsorflik


PRO (valfritt, EUR 10.99 engångs via Ko-fi)
• Obegränsade nedladdningar
• Upp till 3 samtidiga nedladdningar
• Obegränsad lokal historik
Köp på Ko-fi och ange licensnyckel under Inställningar → Pro.

VIKTIGT
• Laddar INTE ner från YouTube, Netflix, Disney+, Twitch eller andra DRM-skyddade plattformar
• Kringgår INTE upphovsrättsskydd
• Blockerar även TikTok, Instagram, Facebook, X, Hulu, Paramount+, Peacock och Crunchyroll, vars villkor förbjuder nedladdning
• Rättighetsinnehavare: upphovsrättsanmälningar till bynrnworld@gmail.com (ämne "Copyright notice")
• Spara bara innehåll du har rätt att ladda ner

VILLKOR, GARANTI OCH ÅTERBETALNING
• Tillhandahålls i befintligt skick, utan garanti. Utvecklaren ansvarar inte för hur du använder tillägget.
• Du köper av den fristående utvecklaren, inte av Google. Betalningen för Pro hanteras av Ko-fi
  (https://ko-fi.com/s/72a48b875e), och Pro-licensen är 18+.
• Pro är en engångslicens för hela livstiden (EUR 10.99). Alla köp är slutgiltiga — inga återbetalningar och ingen
  ersättning om tillägget slutar fungera, begränsas eller läggs ner.
• Fullständiga villkor: https://nrn-world.github.io/FlashVideoDownloader/terms.html

Support: bynrnworld@gmail.com
Hemsida: https://nrn-world.github.io/FlashVideoDownloader/
```

**Kategori:** Verktyg

---

# addons.mozilla.org (Firefox) — v3.5.1

Listing: <https://addons.mozilla.org/en-US/firefox/addon/nrn-flash-video-downloader/>
GUID: `flash-video-downloader@nrnworld.one`

**Endast Firefox.** Versionen sätts av bygget (`FIREFOX_VERSION` i `prepare_firefox_zip.py`)
och skrivs in i paketets manifest — `manifest.json` i källan och Chrome-paketet ligger kvar på
3.5.0. AMO kräver bara att numret är högre än den publicerade versionen.

Förra publicerade version: **3.4.1**. 3.5.0 skickades aldrig in, så 3.5.1 är den första
Firefox-versionen med ändringarna nedan — därför beskriver release notes hela listan och inte
bara Android.

## Release Notes (fältet "Release Notes" på AMO)

```
What's new in v3.5.1:
- Firefox for Android is now supported. That browser has no downloads API, so a finished download opens in a tab where you tap the file link to save it, instead of being handed to a download manager. The folder settings do not apply there and are replaced by a line that says so.
- You now accept the Terms of Service before using the extension. On first install the welcome page shows the terms, and the popup stays locked behind a terms dialog until you accept. Nothing runs until you do.
- The full End User License Agreement and Terms of Service is bundled with the extension and readable offline: what the licence covers, the warranty disclaimer, the limit on liability, and the policy on refunds for the optional Pro licence.
- Clearer Pro pricing: the price is simply the price. The previous struck-through "was" price and the 50% off badge have been removed.
- The Pro licence is described accurately throughout: one-time payment, no subscription, valid for as long as the extension is available.
- Updated privacy policy with the data controller, legal basis, retention periods and your data protection rights.
```

## Notes to Reviewer (fältet "Notes to Reviewer" på AMO)

```
No new permissions and no data collection: the same permission set as 3.4.1 (activeTab, scripting, downloads, webRequest, storage, tabs, <all_urls>), matching data_collection_permissions: none. History, settings, the terms acknowledgement and licence state stay in browser storage. No analytics, no telemetry, and no request to any rate-limit service (that endpoint URL is empty).

Firefox for Android is the reason for this upload, and the part worth reviewing closely: the manifest opts in through browser_specific_settings.gecko_android. Firefox for Android has no downloads API (bug 1538348), so there is no download manager to hand a file to - platform.js detects that at runtime, background.js runs the download engine (offscreen.html) in a normal background tab instead of the desktop hidden iframe, and the finished file is offered as an anchor with [download] for the user to tap. That tab is reused, comes forward only once a file is ready, and needs no new permission (it uses the existing "tabs" permission). Desktop is untouched and still saves through the downloads API.

Also since 3.4.1, which is the published version (3.5.0 was never submitted): the extension now requires accepting the Terms of Service before use - bundled as terms.html and enforced in gateDownloadStart() for every download type - and the Pro pricing no longer shows a compare-at price or a discount badge.

Build: plain, human-readable source, no bundler, minifier or transpiler, so the submitted files are the files as authored. The only minified file is lib/mux.min.js, the unmodified mux.js 7.0.3 distribution (Apache-2.0); its sha256 is 79da5742f8985d9362b14a3ca4d705eea726cea6d513d0d019c359bf4eec856b, matching https://unpkg.com/mux.js@7.0.3/dist/mux.min.js byte for byte. prepare_firefox_zip.py builds this package from the same sources as the Chrome build: it removes the Chrome-only chrome.offscreen calls, switches the background to the event page, adds the gecko_android key, stamps the Firefox version number into the package (FIREFOX_VERSION; the Chrome build keeps 3.5.0) and points the review link at AMO.

Monetization: a labelled affiliate banner in the popup (bundled, no remote code, opens the partner page only when clicked) and a Free-tier dialog offering a sponsor tab or a normal download of the same file. Pro (EUR 10.99, one-time, non-refundable) is sold by the developer through Ko-fi. Terms, warranty and refunds are in the bundled terms.html.

Known limitation: DRM-protected services (YouTube, Netflix, Disney+, Twitch) are not supported, by design.
```

## Beskrivningstexten behöver också uppdateras

AMO-beskrivningen (detail page) säger fortfarande "1 download per rolling hour" och
"Unlimited hourly downloads". Byt de två raderna mot:

```
FREE TIER
• 1 download every 2 hours
• 1 download at a time
• Last 10 downloads in history

PRO (optional, EUR 10.99 one-time lifetime via Ko-fi)
• Unlimited downloads
• Up to 3 concurrent downloads
• Unlimited local history
```

Lägg också till ett kort Android-block i beskrivningen, eftersom listningen nu nås även
från Firefox för Android:

```
FIREFOX FOR ANDROID
• A finished download opens in a tab - tap the file link to save it
• Folder settings do not apply: the browser decides where files are saved
```

**Obs:** AMO-listan anger licensen **MIT**, medan `LICENSE` i paketet är **CC BY-NC 4.0**.
Byt till CC BY-NC 4.0 i AMO-formuläret (eller byt filen) så att de säger samma sak.
