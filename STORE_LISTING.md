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

ADS
• The Free tier shows small, bundled promotional banners inside the popup
• No ad networks, no third-party code, no tracking
• Pro removes all ads

PRO (optional, EUR 10.99 one-time lifetime via Ko-fi)
• Unlimited downloads
• Up to 3 concurrent downloads
• Unlimited local history
Buy on Ko-fi, then enter your license key under Settings → Pro.

IMPORTANT
• Does NOT download from YouTube, Netflix, Disney+, Twitch or other DRM-protected platforms
• Does NOT bypass copyright protection
• Only save content you have the right to download
• Free to install — Pro is optional

TERMS, WARRANTY AND REFUNDS
• Provided "as is", without warranty. The developer is not liable for how you use the extension.
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
• Bannern kan vara en affiliate-länk (partnerskap) till ett tredjepartsprogram.
  Om du klickar och köper något kan utvecklaren få en provision — utan extra kostnad för dig.
• Klick öppnar partnerns webbplats i en ny flik; tillägget skickar inga uppgifter till partnern
• Inga annonsnätverk, ingen tredjepartskod, ingen spårning
• Alla banners är märkta "Annons · affiliate" och kan stängas med ✕
• Pro tar bort all reklam


PRO (valfritt, EUR 10.99 engångs via Ko-fi)
• Obegränsade nedladdningar
• Upp till 3 samtidiga nedladdningar
• Obegränsad lokal historik
Köp på Ko-fi och ange licensnyckel under Inställningar → Pro.

VIKTIGT
• Laddar INTE ner från YouTube, Netflix, Disney+, Twitch eller andra DRM-skyddade plattformar
• Kringgår INTE upphovsrättsskydd
• Spara bara innehåll du har rätt att ladda ner

VILLKOR, GARANTI OCH ÅTERBETALNING
• Tillhandahålls i befintligt skick, utan garanti. Utvecklaren ansvarar inte för hur du använder tillägget.
• Pro är en engångslicens för hela livstiden (EUR 10.99). Alla köp är slutgiltiga — inga återbetalningar och ingen
  ersättning om tillägget slutar fungera, begränsas eller läggs ner.
• Fullständiga villkor: https://nrn-world.github.io/FlashVideoDownloader/terms.html

Support: bynrnworld@gmail.com
Hemsida: https://nrn-world.github.io/FlashVideoDownloader/
```

**Kategori:** Verktyg

---

# addons.mozilla.org (Firefox) — v3.5.0

Listing: <https://addons.mozilla.org/en-US/firefox/addon/nrn-flash-video-downloader/>
GUID: `flash-video-downloader@nrnworld.one` · Förra publicerade version: 3.4.1

## Release Notes (fältet "Release Notes" på AMO)

```
What's new in v3.5.0:
- You now accept the Terms of Service before using the extension. On first install the welcome page shows the terms, and the popup stays locked behind a terms dialog until you accept. Nothing runs until you do.
- The full End User License Agreement and Terms of Service is bundled with the extension and readable offline: what the licence covers, the warranty disclaimer, the limit on liability, and the policy on refunds for the optional Pro licence.
- Clearer Pro pricing: the price is simply the price. The previous struck-through "was" price and the 50% off badge have been removed.
- The Pro licence is described accurately throughout: one-time payment, no subscription, valid for as long as the extension is available.
- Updated privacy policy with the data controller, legal basis, retention periods and your data protection rights.
```

## Notes to Reviewer (fältet "Notes to Reviewer" på AMO)

```
No new permissions: same set as 3.4.1 (activeTab, scripting, downloads, webRequest, storage, tabs, <all_urls>).

Data collection: none, matching the declared data_collection_permissions. Download history, settings, the terms acknowledgement and license state stay in browser storage. This build makes no requests to any rate-limit service (the optional endpoint URL is empty), and there is no analytics or telemetry.

What changed in this version: the extension now gates its own use behind an explicit acceptance of the Terms of Service (bundled as terms.html), and the popup's Pro pricing no longer shows a compare-at price or a discount badge. Copyright/DRM behaviour is unchanged, and the free-tier limit is unchanged at 1 download per 2 hours.

Build process / source code: the uploaded package is plain, human-readable source — no bundler, minifier or transpiler is used, so the submitted files are the files as authored. The only minified file is lib/mux.min.js, which is the unmodified official distribution of mux.js 7.0.3 (Apache-2.0, https://github.com/videojs/mux.js). Its sha256 is 79da5742f8985d9362b14a3ca4d705eea726cea6d513d0d019c359bf4eec856b, which matches https://unpkg.com/mux.js@7.0.3/dist/mux.min.js byte for byte. All other files are unminified.

If a source package is required, the exact build steps are: the Firefox package is produced by prepare_firefox_zip.py, which copies the same source files as the Chrome build and then (a) removes calls to the Chrome-only chrome.offscreen API, (b) switches the background to the event page background-page.html, and (c) points the "rate this extension" link at the AMO listing. No other code is modified.

Monetization disclosure: the extension is free to use; an optional Pro license (EUR 10.99, one-time, lifetime) is sold through Ko-fi and activated with a key. Free users see one clearly labelled sponsored/affiliate banner in the popup — it is bundled with the extension, loads no remote code, sends no data, and only opens the partner page in a new tab when the user clicks it. On the Free tier, starting a download shows a two-option dialog: "Fast", which opens a sponsor offer in a background tab, and "Normal", which downloads without opening it. Both download the same file, and the no-sponsor option is always available. Pro users never see this dialog — they go straight to a direct multi-threaded download with no sponsor tab and no banner.

Known limitation: video downloads do not work on DRM-protected services (YouTube, Netflix, Disney+, Twitch), by design.

Terms and refunds: the End User License Agreement & Terms of Service is bundled in the package as terms.html and is also
published at https://nrn-world.github.io/FlashVideoDownloader/terms.html. Installing or using the extension means accepting
it, and the acceptance is explicit rather than implicit: the welcome page shows the notice with an accept button on first
install, and the popup itself stays locked behind a Terms of Service overlay until the user accepts - no listener, timer or
media scan. The service worker enforces the same check in gateDownloadStart(), so every download type (HLS, DASH, chunked,
generic, blob) returns status "terms_required" and refuses to start until an accepted record with the current terms version
exists in chrome.storage.local. The optional Pro licence is a one-time
purchase and is non-refundable; the purchase button in the popup and the Pro landing page both carry the
"all sales are final" notice before payment, and the buyer expressly requests immediate access to the licence key, which
waives the statutory right of withdrawal. The developer gives no warranty that the extension keeps working and is not liable
if it stops working or is discontinued.
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

**Obs:** AMO-listan anger licensen **MIT**, medan `LICENSE` i paketet är **CC BY-NC 4.0**.
Byt till CC BY-NC 4.0 i AMO-formuläret (eller byt filen) så att de säger samma sak.
