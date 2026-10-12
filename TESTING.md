# Flash Video Downloader 3.3.0 – Freemium Testing Guide

## Pre-deployment Testing Checklist

This document outlines the testing steps for the new freemium features in v3.3.0.

---

## 1. Extension Loading

### Test: Load unpacked extension
- Open `chrome://extensions/`
- Enable **Developer mode**
- Click **Load unpacked**
- Select `/workspace` or `D:\APPS By nRn World\Chrome Tillägg\Flash Video Downloader` (Robin's local copy)
- **Expected:** Extension loads without errors
- **Verify:** No red error messages in extension card

---

## 2. Free Tier Features (Default)

### Test: Single download works
1. Navigate to a test video page (e.g., a site with `.mp4` files)
2. Open the extension popup
3. Click a detected video's **Download** button
4. **Expected:** Download starts successfully
5. **Expected:** Free users can download 1 video at a time

### Test: Free rate limit (1 download per 2 hours)
1. Download one video successfully (wait for completion)
2. Immediately try to download a second video
3. **Expected:** Rate limit modal appears
4. **Expected:** Message: "Free users can download 1 video every 2 hours. You can download again in X h Y min."
5. **Expected:** "Upgrade to Pro" button visible
6. **After 2 hours:** Second download should work

### Test: Concurrent download limit (Free)
1. Start downloading one video
2. While first is active, try to download a second video
3. **Expected:** Second download is blocked (Free tier = 1 concurrent)
4. **Expected:** No error shown, download just queues or waits

### Test: History limited to last 10 (Free)
1. Open Settings → Download History
2. Download 12+ videos (or manually populate history)
3. **Expected:** Only the last 10 downloads are shown
4. **Expected:** Subtle upgrade prompt: "⚡ Upgrade to Pro - unlimited history & export"

---

## 3. Pro Upgrade UI

### Test: Pro section visible in Settings
1. Open extension → Settings ⚙️
2. Scroll to **Pro Upgrade Section**
3. **Expected:** 
   - Pro header with ⚡ badge
   - Free vs Pro comparison table
   - Price: "One-time payment: $5.99"
   - "Buy Pro License" button → opens `https://nrn-world.github.io/FlashVideoDownloader/pages/pro.html`
   - License entry field: `FVD-PRO-XXXX-XXXX`
   - "Activate" button

---

## 4. Pro Activation

Pro keys are **never** stored in this repo. Use the key from the local file `kofi-thank-you.local.txt` (gitignored).

### Test: Activate with the Ko-fi key
1. Open Settings → Pro section
2. Paste the key from `kofi-thank-you.local.txt`
3. Click **Activate**
4. **Expected:**
   - Success message: Pro activated
   - Pro status badge appears
   - Comparison table hides
   - Purchase box hides
   - "Deactivate License" button appears

### Test: Invalid license key
1. Enter a fake key: `FVD-PRO-FAKE-1234`
2. Click Activate
3. **Expected:** Error message: "Invalid license key"

### Test: Pro features unlocked
After activating Pro:
1. **Rate limit:** Download multiple videos in a row → all should proceed (no rate limit)
2. **Concurrent downloads:** Start 3 downloads at once → all should proceed
3. **History:** Unlimited history (no 10-item cap)

---

## 5. Pro Deactivation

### Test: Deactivate license
1. Activate Pro (local Ko-fi key only)
2. Click **Deactivate License** in Pro section
3. Confirm deactivation
4. **Expected:**
   - Pro status badge disappears
   - Free vs Pro table reappears
   - Concurrent limit reverts to 1
   - History caps at last 10

---

## 6. Language Strings

### Test: All locales have Pro strings
1. Open Settings → Language
2. Switch to each language: `English`, `Svenska`, `Türkçe`, `Español`, `Français`, `العربية`
3. **Expected:** Pro section translates correctly (at minimum, English strings show)

---

## 7. Documentation Accuracy

### Test: README.md
- Open `README.md`
- **Expected:** Version badge shows `3.3.0`
- **Expected:** "Free vs Pro" section explains tiers
- **Expected:** Changelog includes v3.3.0

### Test: STORE_LISTING.md
- Open `STORE_LISTING.md`
- **Expected:** Short description mentions "Free with core features. Optional Pro upgrade"
- **Expected:** Detailed description lists Free vs Pro features

### Test: privacy.html
- Open `privacy.html`
- **Expected:** Pro license disclosure section present
- **Expected:** States "no payment info collected by extension"

### Test: terms.html (End User License Agreement)
- Open `terms.html`
- **Expected:** Sections present for licence grant (Free and Pro), restrictions, no warranty, no compensation
  (section 9), limitation of liability (section 10), no refunds (section 11), indemnification, governing law
- **Expected:** Section 11 states that all sales are final and that the buyer loses the statutory right of withdrawal
- **Expected:** Anchor `terms.html#refunds` scrolls to the no-refund section
- **Expected:** Section 19 explains the relation to the CC BY-NC 4.0 source-code licence
- **Expected:** No plaintext license key anywhere on the page

### Test: pro.html
- Open `pages/pro.html` (GitHub Pages URL)
- **Expected:** Full Pro landing page with pricing, comparison, activation steps
- **Expected:** Activation steps; no plaintext license key on the page
- **Expected:** “All sales are final — the Pro licence is non-refundable” notice is visible beside the buy button, above the fold
- **Expected:** FAQ includes refund and “what if it stops working” entries, both linking to `../terms.html`

---

## 7b. In-extension legal disclosure

### Test: first-run welcome page
1. Remove and reinstall the extension (or clear `chrome.storage.local`)
2. **Expected:** `welcome.html` opens and shows the “Important — please read before you start” box
3. **Expected:** Box states: as-is, no developer responsibility, no refunds, no compensation if it stops working
4. **Expected:** “I have read and accept the Terms” button stores `fvd_terms_ack` and shows the acceptance date
5. Reopen `welcome.html` → **Expected:** button already shows “Terms accepted ✓”

### Test: the popup cannot be used without accepting (hard gate)
1. Clear `chrome.storage.local` (`fvd_terms_ack` must be gone), then open the popup
2. **Expected:** the Terms of Service overlay covers the whole popup: fixed position, full height, on top of everything
3. **Expected:** behind it nothing has initialised — no video list, no spinner result, no active downloads
4. **Expected:** the popup sends no messages to the background while the gate is up (check the service worker console)
5. **Expected:** the “I accept the Terms of Service” button is enabled and “Read the full Terms of Service” opens `terms.html`
6. Click **I accept the Terms of Service**
7. **Expected:** overlay disappears, the popup initialises normally (videos appear) with no reload needed
8. **Expected:** `chrome.storage.local.fvd_terms_ack` = `{ accepted: true, version: "1.0", acceptedAt: "..." }`
9. Close and reopen the popup → **Expected:** no gate, it goes straight to the video list

### Test: the download path is gated even if the UI is bypassed
1. With `fvd_terms_ack` removed, open the popup on a page with a video
2. In the service worker console run:
   `chrome.storage.local.remove('fvd_terms_ack')`
3. Trigger a download in the popup
4. **Expected:** the download does not start, the gate re-appears, and the background returns `status: "terms_required"`
5. Accept in the gate, then download again → **Expected:** it downloads normally

### Test: a new terms version forces re-acceptance
1. Bump `FVD_TERMS_VERSION` in `terms-gate.js` (and the `Version:` line in `terms.html`)
2. Reload the extension and open the popup
3. **Expected:** the gate reappears even though an older acceptance is stored
4. Restore the version afterwards

### Test: popup legal disclosures
1. Open the popup as a Free user with the offer card visible
2. **Expected:** The Pro offer card shows the non-refundable notice and a link to `terms.html`
3. Open **Settings** → **Terms & liability** section
4. **Expected:** Short liability summary plus “Open the full Terms of Service” button that opens `terms.html`
5. **Expected:** The footer shows “Terms of Service · No refunds” and opens `terms.html`
6. Open **Settings → Pro** → **Expected:** the same notice sits directly under the buy button, before payment
7. Switch language and repeat → **Expected:** all 6 locales show translated Terms strings (no raw keys)

---

## 8. CWS Compliance

### Test: DRM blocklist unchanged
- **Expected:** YouTube, Netflix, Disney+, Twitch, Spotify remain blocked
- **Expected:** Free tier does NOT gut core functionality (single download still works perfectly)

---

## Configuration Before Store Publish

Robin must configure before publishing:

1. **Checkout URL** in `popup.js` (line ~43):
   ```javascript
   const CHECKOUT_URL = 'https://nrn-world.github.io/FlashVideoDownloader/pro.html';
   ```
   Replace with Lemon Squeezy or Stripe Payment Link URL.

2. **GitHub Pages:** Ensure `pages/pro.html` is published at:
   `https://nrn-world.github.io/FlashVideoDownloader/pages/pro.html`

3. **Privacy Policy URL:** Verify accessible at:
   `https://nrn-world.github.io/FlashVideoDownloader/privacy.html`

4. **Terms of Service URL:** Verify accessible at:
   `https://nrn-world.github.io/FlashVideoDownloader/terms.html`
   Paste the same URL into the Chrome Web Store and AMO listings, and into the Ko-fi product page, **before** taking payments.

5. **Ko-fi product page:** the shop description must state that all sales are final and link the no-refund policy,
   and the thank-you page should repeat it. Without that, the withdrawal waiver in section 11 is harder to rely on.

---

## Summary

- ✅ Free tier: Core download functionality intact (1 download per 2 hours, 1 concurrent)
- ✅ Pro tier: Unrestricted downloads, 3+ concurrent, batch, unlimited history, export
- ✅ License: plaintext key is not in git; only Ko-fi buyers see it
- ✅ UI: Pro section polished, comparison table clear, rate limit modal
- ✅ Docs: README, STORE_LISTING, privacy.html, terms.html updated
- ✅ i18n: All 6 locales have Pro strings and Terms strings
- ✅ Legal: EULA bundled in both ZIPs, shown in the welcome page, the popup offer card, Settings and the purchase box
- ✅ Gate: the popup and every download start require an accepted terms record (`terms-gate.js`, 4 unit tests)
- ✅ Fail-open: a storage error never locks a user out, and never displays a false acceptance
- ✅ Refunds: “all sales are final” shown before payment in the extension and on the Pro landing page
- ✅ Compliance: DRM blocklist unchanged

**Ready for Robin to:**
1. Load unpacked and test locally
2. Test rate limit: download 1, wait, try 2nd immediately (should block)
3. Activate Pro with the local Ko-fi key → unlimited
4. Configure `CHECKOUT_URL` to real payment link
5. Submit v3.3.1 to Chrome Web Store

---

**Contact:** bynrnworld@gmail.com
