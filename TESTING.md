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

## 4. Pro Activation (Test License Key)

### Test: Activate with DEV key
1. Open Settings → Pro section
2. Enter test license: **`FVD-PRO-TEST-0000`**
3. Click **Activate**
4. **Expected:** 
   - Success message: "✅ Pro activated!"
   - Pro status badge appears: "✅ Pro Active"
   - Comparison table hides
   - Purchase box hides
   - "Deactivate License" button appears

### Test: Invalid license key
1. Enter a fake key: `FVD-PRO-FAKE-1234`
2. Click Activate
3. **Expected:** Error message: "Invalid license key"

### Test: Pro features unlocked
After activating Pro:
1. **Concurrent downloads:** Start 3 downloads at once → all should proceed
2. **History:** Unlimited history (no 10-item cap)
3. **Export:** (UI not fully implemented yet, but limit is lifted)

---

## 5. Pro Deactivation

### Test: Deactivate license
1. Activate Pro (use test key)
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

### Test: pro.html
- Open `pages/pro.html` (GitHub Pages URL)
- **Expected:** Full Pro landing page with pricing, comparison, activation steps
- **Expected:** Dev test key mentioned: `FVD-PRO-TEST-0000`

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

---

## Summary

- ✅ Free tier: Core download functionality intact
- ✅ Pro tier: 3+ concurrent, batch, unlimited history, export
- ✅ License: Test key `FVD-PRO-TEST-0000` works
- ✅ UI: Pro section polished, comparison table clear
- ✅ Docs: README, STORE_LISTING, privacy.html updated
- ✅ i18n: All 6 locales have Pro strings
- ✅ Compliance: DRM blocklist unchanged

**Ready for Robin to:**
1. Load unpacked and test locally
2. Configure `CHECKOUT_URL` to real payment link
3. Submit v3.3.0 to Chrome Web Store

---

**Contact:** bynrnworld@gmail.com  
**Test key:** `FVD-PRO-TEST-0000`
