// Flash Video Downloader - Popup Script (v3.4.0)

document.addEventListener('DOMContentLoaded', async () => {
  const mediaListContainer = document.getElementById('media-list');
  const emptyState = document.getElementById('empty-state');
  const loadingState = document.getElementById('loading-state');
  const searchInput = document.getElementById('search-input');
  const countAll = document.getElementById('count-all');
  const btnRefresh = document.getElementById('btn-refresh');
  const btnClear = document.getElementById('btn-clear');
  const tabButtons = document.querySelectorAll('.tab-btn');

  // Views & Settings
  const viewMain = document.getElementById('view-main');
  const viewSettings = document.getElementById('view-settings');
  const btnSettingsToggle = document.getElementById('btn-settings-toggle');
  const btnBackMain = document.getElementById('btn-back-main');
  const selectLanguage = document.getElementById('select-language');
  const chkAutoDelete = document.getElementById('chk-auto-delete');
  const btnClearHistory = document.getElementById('btn-clear-history');
  const historyListContainer = document.getElementById('history-list');
  const chkAskEachTime = document.getElementById('chk-ask-each-time');
  const fixedLocationOptions = document.getElementById('fixed-location-options');
  const btnPickFolder = document.getElementById('btn-pick-folder');
  const txtSelectedFolder = document.getElementById('txt-selected-folder');

  // Pro elements
  const proSection = document.getElementById('pro-section');
  const proActiveStatus = document.getElementById('pro-active-status');
  const proComparisonTable = document.getElementById('pro-comparison-table');
  const proPurchaseBox = document.getElementById('pro-purchase-box');
  const proSalesBlock = document.getElementById('pro-sales-block');
  const proLicenseEntry = document.getElementById('pro-license-entry');
  const btnBuyPro = document.getElementById('btn-buy-pro');
  const inputLicenseKey = document.getElementById('input-license-key');
  const btnActivateLicense = document.getElementById('btn-activate-license');
  const btnDeactivateLicense = document.getElementById('btn-deactivate-license');
  const licenseResultMessage = document.getElementById('license-result-message');

  // Pro upsell banner (main view)
  const proUpsellBanner = document.getElementById('pro-upsell-banner');
  const txtProUpsellTitle = document.getElementById('txt-pro-upsell-title');
  const txtProUpsellCountdown = document.getElementById('txt-pro-upsell-countdown');
  const txtOfferBadge = document.getElementById('txt-offer-badge');
  const txtOfferWas = document.getElementById('txt-offer-was');
  const txtOfferNow = document.getElementById('txt-offer-now');
  const txtOfferLifetime = document.getElementById('txt-offer-lifetime');
  const txtOfferUrgency = document.getElementById('txt-offer-urgency');
  const btnUpsellBuy = document.getElementById('btn-upsell-buy');
  // License entry inside the front-page offer card (same code, no Settings detour)
  const offerLicenseToggle = document.getElementById('btn-offer-license-toggle');
  const offerLicensePanel = document.getElementById('offer-license-panel');
  const offerLicenseMessage = document.getElementById('offer-license-message');
  const inputLicenseKeyOffer = document.getElementById('input-license-key-offer');
  const btnActivateLicenseOffer = document.getElementById('btn-activate-license-offer');
  // Same campaign, shown in Settings and in the "limit reached" modal
  const txtProPrice = document.getElementById('txt-pro-price');
  const txtProPriceWas = document.getElementById('txt-pro-price-was');
  const txtProSaveBadge = document.getElementById('txt-pro-save-badge');
  const txtRateLimitOffer = document.getElementById('txt-rate-limit-offer');

  let currentLang = 'en'; // Default English
  let allMedia = [];
  let currentFilter = 'all';
  let currentSearch = '';
  let activeTabId = null;
  let activeTabUrl = null;
  let currentlyPlayingCard = null;
  let pollInterval = null;
  let pendingCancel = null; // { id, url }
  const confirmModal = document.getElementById('confirm-stop-modal');
  const appFooter = document.getElementById('app-footer');
  const txtConfirmTitle = document.getElementById('txt-confirm-title');
  const txtConfirmDesc = document.getElementById('txt-confirm-desc');
  const btnConfirmYes = document.getElementById('btn-confirm-yes');
  const btnConfirmNo = document.getElementById('btn-confirm-no');

  // Pro status
  let isProActive = false;
  let featureLimits = {};
  let rateLimitStatusInterval = null;
  // Free-tier upsell: shown in the main view while the next free download is pending
  let upsellNextAllowedAt = 0;
  let upsellTickInterval = null;

  // ---------------------------------------------------------------------------
  // Pro price campaign — the single place to change what the popup advertises.
  //
  // Keep this in sync with the Ko-fi product: `promoPrice` must be the price the
  // buyer actually pays today and `regularPrice` the price charged from `endsOn`
  // onwards. Once the date has passed the popup automatically drops the discount
  // badge and shows the regular price, so the card never promises a stale deal.
  // Set `enabled: false` to switch the whole campaign off.
  // ---------------------------------------------------------------------------
  const PRO_OFFER = {
    enabled: true,
    discountPercent: 50,
    regularPrice: '€21.98',
    promoPrice: '€10.99',
    endsOn: '2026-12-31T23:59:59'
  };

  // false = the affiliate banner keeps running next to the offer card, so no ad
  // clicks are lost. The card then shows a compact version (no feature list) to
  // leave room for the video list. Set to true to give the card the whole screen.
  const HIDE_ADS_WHILE_OFFER_SHOWN = false;

  const CHECKOUT_URL = 'https://ko-fi.com/s/72a48b875e';
  const STORE_REVIEWS_URL = 'https://chromewebstore.google.com/detail/blbajmihakahbldejkginpccillhakdg/reviews';
  const REVIEW_MILESTONES = [1, 5, 10];
  let reviewPromptShowing = false;
  let currentReviewMilestone = null;

  // Initialize Pro status
  async function initializeProStatus() {
    try {
      if (typeof isProUser === 'function') {
        const proStatus = await isProUser();
        isProActive = proStatus.isPro;
        
        if (typeof getFeatureLimits === 'function') {
          featureLimits = await getFeatureLimits();
        }

        updateProUI();
        updateRateLimitStatus();
        
        // Start rate limit status update interval (only for Free users)
        if (!isProActive) {
          if (rateLimitStatusInterval) clearInterval(rateLimitStatusInterval);
          rateLimitStatusInterval = setInterval(updateRateLimitStatus, 5000); // Update every 5 seconds
        }
      }
    } catch (e) {
      console.warn('[FVD] Pro init failed:', e);
    }
  }

  async function updateRateLimitStatus() {
    const rateLimitStatusEl = document.getElementById('rate-limit-status');
    const rateLimitStatusText = document.getElementById('rate-limit-status-text');
    
    if (!rateLimitStatusEl || !rateLimitStatusText) return;
    
    // Hide for Pro users
    if (isProActive) {
      rateLimitStatusEl.classList.add('hidden');
      hideProUpsell();
      return;
    }
    
    try {
      if (typeof canStartDownload === 'function') {
        const check = await canStartDownload();
        updateProUpsell(check);
        
        if (check.allowed) {
          // Ready to download
          rateLimitStatusEl.classList.remove('hidden');
          rateLimitStatusEl.classList.add('ready');
          rateLimitStatusText.textContent = '✅ ' + t('rateLimitReady');
        } else if (check.reason === 'rate_limit' && check.minutesRemaining) {
          // Rate limited
          rateLimitStatusEl.classList.remove('hidden');
          rateLimitStatusEl.classList.remove('ready');
          
          rateLimitStatusText.textContent =
            t('rateLimitWaitPlural').replace('{time}', formatDuration(check.minutesRemaining));
        } else {
          // Unknown state, hide
          rateLimitStatusEl.classList.add('hidden');
        }

        // The offer card counts the same timer down, so never stack two of them.
        if (proUpsellBanner && !proUpsellBanner.classList.contains('hidden')) {
          rateLimitStatusEl.classList.add('hidden');
        }
      }
    } catch (e) {
      console.warn('[FVD] Rate limit status check failed:', e);
      rateLimitStatusEl.classList.add('hidden');
      hideProUpsell();
    }
  }

  // --- Pro upsell banner in the main view -----------------------------------
  // Free users see a direct Ko-fi purchase link on the front page once they have
  // downloaded their first video, while the Free download window counts down. The button
  // is a one-click shortcut so nobody has to dig into Settings to buy Pro.

  function formatUpsellTime(ms) {
    const totalSec = Math.max(0, Math.ceil(ms / 1000));
    const hours = Math.floor(totalSec / 3600);
    const minutes = Math.floor((totalSec % 3600) / 60);
    const seconds = totalSec % 60;
    const pad = (n) => String(n).padStart(2, '0');
    // A 2-hour wait has to read as "1:59:58", not "119:58".
    if (hours > 0) return hours + ':' + pad(minutes) + ':' + pad(seconds);
    if (minutes > 0) return minutes + ':' + pad(seconds);
    return seconds + 's';
  }

  // "1 h 59 min" / "45 min" / "2 h" — short units come from i18n.
  function formatDuration(totalMinutes) {
    const minutes = Math.max(1, Math.round(Number(totalMinutes) || 0));
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    const hourUnit = t('durationHourShort');
    const minuteUnit = t('durationMinuteShort');
    if (hours <= 0) return rest + ' ' + minuteUnit;
    if (rest === 0) return hours + ' ' + hourUnit;
    return hours + ' ' + hourUnit + ' ' + rest + ' ' + minuteUnit;
  }

  function isProOfferActive() {
    if (!PRO_OFFER.enabled) return false;
    const end = Date.parse(PRO_OFFER.endsOn);
    return !Number.isNaN(end) && Date.now() <= end;
  }

  function currentProPrice() {
    return isProOfferActive() ? PRO_OFFER.promoPrice : PRO_OFFER.regularPrice;
  }

  function formatOfferDate() {
    const end = new Date(PRO_OFFER.endsOn);
    if (Number.isNaN(end.getTime())) return '';
    try {
      return end.toLocaleDateString(currentLang, { day: 'numeric', month: 'short', year: 'numeric' });
    } catch (e) {
      return end.toISOString().slice(0, 10);
    }
  }

  // Single source of truth for every price the popup shows.
  function applyProOfferPricing() {
    const offerActive = isProOfferActive();
    const price = currentProPrice();
    const badgeText = t('proDiscountBadge').replace('{percent}', String(PRO_OFFER.discountPercent));

    // Main-view offer card
    if (txtOfferNow) txtOfferNow.textContent = price;
    if (txtOfferWas) {
      txtOfferWas.textContent = PRO_OFFER.regularPrice;
      txtOfferWas.title = t('proOfferRegularHint').replace('{price}', PRO_OFFER.regularPrice);
      txtOfferWas.classList.toggle('hidden', !offerActive);
    }
    if (txtOfferBadge) {
      txtOfferBadge.textContent = badgeText;
      txtOfferBadge.classList.toggle('hidden', !offerActive);
    }
    if (txtOfferLifetime) txtOfferLifetime.textContent = t('proPriceLifetime');
    if (txtOfferUrgency) {
      txtOfferUrgency.textContent = offerActive
        ? t('proOfferUrgency').replace('{date}', formatOfferDate())
        : '';
      txtOfferUrgency.classList.toggle('hidden', !offerActive);
    }
    if (btnUpsellBuy) btnUpsellBuy.textContent = t('proOfferCta') + ' \u00b7 ' + price;

    // Settings → Pro box
    if (txtProPrice) txtProPrice.textContent = price;
    if (txtProPriceWas) {
      txtProPriceWas.textContent = PRO_OFFER.regularPrice;
      txtProPriceWas.classList.toggle('hidden', !offerActive);
    }
    if (txtProSaveBadge) {
      txtProSaveBadge.textContent = badgeText;
      txtProSaveBadge.classList.toggle('hidden', !offerActive);
    }

    // "Download limit reached" modal
    if (txtRateLimitOffer) {
      txtRateLimitOffer.textContent = offerActive
        ? badgeText + ' \u00b7 ' + t('proPriceLifetime') + ' \u00b7 ' + price
        : '';
      txtRateLimitOffer.classList.toggle('hidden', !offerActive);
    }
  }

  function applyProUpsellText() {
    if (txtProUpsellTitle) txtProUpsellTitle.textContent = t('proUpsellTitle');
    applyProOfferPricing();
  }

  function updateUpsellCountdownText() {
    if (!txtProUpsellCountdown) return;
    if (!upsellNextAllowedAt) {
      txtProUpsellCountdown.textContent = '';
      return;
    }
    const remaining = upsellNextAllowedAt - Date.now();
    if (remaining <= 0) {
      txtProUpsellCountdown.textContent = t('proUpsellReady');
      if (proUpsellBanner) proUpsellBanner.classList.add('ready');
      return;
    }
    txtProUpsellCountdown.textContent = t('proUpsellCountdown').replace('{time}', formatUpsellTime(remaining));
  }

  function startUpsellTick() {
    if (upsellTickInterval) return;
    upsellTickInterval = setInterval(updateUpsellCountdownText, 1000);
  }

  function stopUpsellTick() {
    if (upsellTickInterval) {
      clearInterval(upsellTickInterval);
      upsellTickInterval = null;
    }
  }

  // Only re-render the ad slot when the card actually appears or disappears,
  // otherwise the rotating banner would re-count an impression every tick.
  function setProUpsellVisible(visible) {
    if (!proUpsellBanner) return;
    const wasVisible = !proUpsellBanner.classList.contains('hidden');
    proUpsellBanner.classList.toggle('hidden', !visible);
    if (!visible) collapseOfferLicense();
    if (wasVisible !== visible) updateAdSlot();
  }

  // Reset the front-page license field whenever the card goes away, so a stale
  // key or error message never reappears on the next rate-limit window.
  function collapseOfferLicense() {
    if (offerLicensePanel) offerLicensePanel.classList.add('hidden');
    if (offerLicenseToggle) offerLicenseToggle.setAttribute('aria-expanded', 'false');
    if (inputLicenseKeyOffer) inputLicenseKeyOffer.value = '';
    setLicenseMessage(offerLicenseMessage, '', '');
  }

  function hideProUpsell() {
    setProUpsellVisible(false);
    upsellNextAllowedAt = 0;
    stopUpsellTick();
  }

  function updateProUpsell(check) {
    if (!proUpsellBanner) return;

    const waiting = check && check.allowed === false && check.reason === 'rate_limit';

    // Free users only. The waiting window IS the moment that matters — it is the
    // Free download slot having been used — so the card follows the rate limit
    // itself rather than a download counter that can lag behind.
    if (isProActive || !waiting) {
      hideProUpsell();
      return;
    }

    if (check.nextAllowedAt) {
      upsellNextAllowedAt = check.nextAllowedAt;
    } else if (check.minutesRemaining) {
      upsellNextAllowedAt = Date.now() + check.minutesRemaining * 60 * 1000;
    } else {
      upsellNextAllowedAt = 0;
    }

    if (proUpsellBanner.classList.contains('hidden')) {
      proUpsellBanner.classList.remove('ready');
    }
    applyProUpsellText();
    updateUpsellCountdownText();
    setProUpsellVisible(true);
    startUpsellTick();
  }

  // One-click purchase straight from the front page
  if (btnUpsellBuy) {
    btnUpsellBuy.addEventListener('click', () => {
      try { chrome.tabs.create({ url: CHECKOUT_URL }); } catch (e) {}
      try { window.close(); } catch (e) {}
    });
  }

  // "Already have a license key?" on the front page — expand, paste, activate.
  // Sits below the buy button so a returning buyer never has to open Settings.
  if (offerLicenseToggle) {
    offerLicenseToggle.addEventListener('click', () => {
      const expanding = !!offerLicensePanel && offerLicensePanel.classList.contains('hidden');
      if (offerLicensePanel) offerLicensePanel.classList.toggle('hidden', !expanding);
      offerLicenseToggle.setAttribute('aria-expanded', expanding ? 'true' : 'false');
      if (expanding && inputLicenseKeyOffer) inputLicenseKeyOffer.focus();
    });
  }

  if (btnActivateLicenseOffer) {
    btnActivateLicenseOffer.addEventListener('click', () => {
      activateLicenseKey(inputLicenseKeyOffer, btnActivateLicenseOffer, offerLicenseMessage);
    });
  }

  if (inputLicenseKeyOffer) {
    inputLicenseKeyOffer.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        activateLicenseKey(inputLicenseKeyOffer, btnActivateLicenseOffer, offerLicenseMessage);
      }
    });
  }

  function updateProUI() {
    if (!proSection) return;

    if (isProActive) {
      if (proActiveStatus) proActiveStatus.classList.remove('hidden');
      if (proSalesBlock) proSalesBlock.classList.add('hidden');
      if (proLicenseEntry) proLicenseEntry.classList.add('hidden');
      if (proComparisonTable) proComparisonTable.classList.add('hidden');
      if (proPurchaseBox) proPurchaseBox.classList.add('hidden');
      if (inputLicenseKey) {
        inputLicenseKey.disabled = true;
        inputLicenseKey.value = '';
      }
      if (btnActivateLicense) btnActivateLicense.disabled = true;
    } else {
      if (proActiveStatus) proActiveStatus.classList.add('hidden');
      if (proSalesBlock) proSalesBlock.classList.remove('hidden');
      if (proLicenseEntry) proLicenseEntry.classList.remove('hidden');
      if (proComparisonTable) proComparisonTable.classList.remove('hidden');
      if (proPurchaseBox) proPurchaseBox.classList.remove('hidden');
      if (inputLicenseKey) inputLicenseKey.disabled = false;
      if (btnActivateLicense) btnActivateLicense.disabled = false;
    }

    updateAdSlot();
  }

  // Ad slot — bundled house ads for Free users, never shown to Pro
  function updateAdSlot() {
    const container = document.getElementById('ad-slot-container');
    if (!container || !window.FVDAds) return;

    const offerVisible = !!proUpsellBanner && !proUpsellBanner.classList.contains('hidden');
    const sharesScreen = offerVisible && !HIDE_ADS_WHILE_OFFER_SHOWN;
    // Sharing the screen with the ad: drop the feature list that the Settings
    // comparison table already covers, so the video list keeps its space.
    if (proUpsellBanner) {
      proUpsellBanner.classList.toggle('compact', sharesScreen);
    }
    container.classList.toggle('share-with-offer', sharesScreen);

    if (HIDE_ADS_WHILE_OFFER_SHOWN && offerVisible) {
      window.FVDAds.hide(container);
      return;
    }
    window.FVDAds.render(container, { isPro: isProActive, t });
  }

  // License activation (Settings → Pro) — the same helper the front-page
  // offer card uses, so both entry points behave identically.
  if (btnActivateLicense) {
    btnActivateLicense.addEventListener('click', () => {
      activateLicenseKey(inputLicenseKey, btnActivateLicense, licenseResultMessage);
    });
  }

  // License deactivation
  if (btnDeactivateLicense) {
    btnDeactivateLicense.addEventListener('click', async () => {
      if (!confirm('Are you sure you want to deactivate your Pro license?')) {
        return;
      }

      try {
        if (typeof deactivateLicense === 'function') {
          await deactivateLicense();
          isProActive = false;
          
          if (typeof getFeatureLimits === 'function') {
            featureLimits = await getFeatureLimits();
          }
          
          updateProUI();
          
          // Restart rate limit status updates for Free users
          if (rateLimitStatusInterval) clearInterval(rateLimitStatusInterval);
          rateLimitStatusInterval = setInterval(updateRateLimitStatus, 5000);
          updateRateLimitStatus();
          
          showLicenseMessage('License deactivated', 'success');
          setTimeout(() => showLicenseMessage('', ''), 2000);
        }
      } catch (e) {
        console.warn('[FVD] Deactivate failed:', e);
      }          });
  }

  function showLicenseMessage(message, type) {
    setLicenseMessage(licenseResultMessage, message, type);
  }

  // Shared license activation — Settings → Pro and the front-page offer card call
  // this, so both paths validate, store and refresh Pro state identically.
  async function activateLicenseKey(inputEl, btn, messageEl) {
    if (!inputEl || !btn) return false;

    const key = inputEl.value.trim();
    if (!key) {
      setLicenseMessage(messageEl, 'Please enter a license key', 'error');
      return false;
    }

    btn.disabled = true;
    btn.textContent = '...';

    try {
      if (typeof activateLicense === 'function') {
        const result = await activateLicense(key);

        if (result.success) {
          setLicenseMessage(messageEl, t('licenseActivated'), 'success');
          isProActive = true;

          if (typeof getFeatureLimits === 'function') {
            featureLimits = await getFeatureLimits();
          }

          updateProUI();
          inputEl.value = '';

          // Refreshing the Free-tier state right away would hide the offer card
          // instantly and wipe the confirmation, so let the message be readable first.
          setTimeout(updateRateLimitStatus, 1800);
          setTimeout(() => setLicenseMessage(messageEl, '', ''), 3000);
          return true;
        }

        setLicenseMessage(messageEl, result.error || t('licenseInvalid'), 'error');
      }
    } catch (e) {
      setLicenseMessage(messageEl, t('licenseInvalid'), 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = t('activateLicense');
    }

    return false;
  }

  function setLicenseMessage(messageEl, message, type) {
    if (!messageEl) return;
    messageEl.textContent = message;
    messageEl.className = 'license-hint';
    if (type) messageEl.classList.add(type);
    messageEl.classList.toggle('hidden', !message);
  }

  // Set checkout URL
  if (btnBuyPro) {
    btnBuyPro.href = CHECKOUT_URL;
  }

  // Initialize Pro status on load
  await initializeProStatus();

  // Initialize Pro status on load
  await initializeProStatus();

  // Instant push update — listen to OFFSCREEN_PROGRESS via background echo
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'OFFSCREEN_PROGRESS' && msg.state) {
      const dl = msg.state;
      // update card immediately if visible
      const card = document.querySelector(`.media-card[data-url="${CSS.escape(dl.url)}"]`);
      if (card) updateCardDownloadState(card, dl);
      // Update active-downloads banner percent instantly (no poll round-trip)
      applyActiveDownloadProgress(dl);
      if (dl.status === 'completed') {
        maybeShowReviewPrompt();
      }
    } else if (msg.type === 'RATE_LIMIT_REACHED') {
      // Free user hit the download window limit — show the offer card right away
      showRateLimitModal(msg.minutesRemaining);
      updateRateLimitStatus();
    } else if (msg.type === 'DOWNLOAD_LIMIT_REACHED') {
      // Free user hit concurrent download limit (kept for backwards compatibility)
      if (msg.message) {
        alert(msg.message);
      }
    }
  });

  // Hämta sparade inställningar (engelska + fråga varje gång tills användaren ändrar själv)
  const stored = await chrome.storage.local.get(['appLanguage', 'autoDelete24h', 'useDefaultDownloadFolder', 'useCustomDirectory', 'customDirectoryName', 'askSaveEachTime']);
  currentLang = (stored.appLanguage && i18n[stored.appLanguage]) ? stored.appLanguage : 'en';
  if (selectLanguage) selectLanguage.value = currentLang;
  if (chkAutoDelete) chkAutoDelete.checked = stored.autoDelete24h !== false;
  const hasSavedFolder = stored.useDefaultDownloadFolder === true && stored.useCustomDirectory === true;
  if (chkAskEachTime) chkAskEachTime.checked = stored.askSaveEachTime === true && !hasSavedFolder;
  updateSelectedFolderLabel(hasSavedFolder ? (stored.customDirectoryName || '') : '');
  updateRateLimitStatus();

  function updateSelectedFolderLabel(name) {
    if (!txtSelectedFolder) return;
    txtSelectedFolder.textContent = name ? t('selectedFolder').replace('{name}', name) : t('noFolderSelected');
  }

  function updateFolderOptionsVisibility() {
    if (!fixedLocationOptions || !chkAskEachTime) return;
    fixedLocationOptions.classList.toggle('hidden', chkAskEachTime.checked);
  }
  updateFolderOptionsVisibility();

  function t(key) {
    const raw = (i18n[currentLang] && i18n[currentLang][key]) || i18n['en'][key] || key;
    // {hours} always reflects the real free-tier window (FREE_RATE_WINDOW_HOURS in
    // license.js), so the copy can never drift away from what the code enforces.
    return String(raw).replace('{hours}', String(FREE_RATE_WINDOW_HOURS));
  }

  function isRestrictedTabUrl(url) {
    if (!url || typeof url !== 'string') return true;
    return url.startsWith('chrome://') ||
      url.startsWith('chrome-extension://') ||
      url.startsWith('edge://') ||
      url.startsWith('about:');
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Avoid innerHTML (AMO rejects unsafe assignment)
  function clearChildren(node) {
    if (!node) return;
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function el(tag, props, children) {
    const node = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach((key) => {
        const val = props[key];
        if (val == null || val === false) return;
        if (key === 'className') node.className = val;
        else if (key === 'text') node.textContent = val;
        else if (key === 'htmlFor') node.htmlFor = val;
        else if (key.startsWith('on') && typeof val === 'function') node.addEventListener(key.slice(2).toLowerCase(), val);
        else if (key === 'dataset' && typeof val === 'object') {
          Object.keys(val).forEach((dk) => { node.dataset[dk] = val[dk]; });
        } else if (key in node && key !== 'style') {
          try { node[key] = val; } catch (e) { node.setAttribute(key, val); }
        } else {
          node.setAttribute(key, val);
        }
      });
    }
    if (children != null) {
      const list = Array.isArray(children) ? children : [children];
      list.forEach((child) => {
        if (child == null || child === false) return;
        node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
      });
    }
    return node;
  }

  // Hjälpare för sortering: störst först
  function formatBytesPopup(bytes) {
    if (!bytes || isNaN(bytes) || bytes <= 0) return '';
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
  }
  function parseSizeToBytes(sizeStr) {
    if (!sizeStr || typeof sizeStr !== 'string') return 0;
    const s = sizeStr.trim().toLowerCase();
    if (s === 'web source' || s === 'direct' || s === 'n/a' || s === '' || s === 'stream') return 0;
    const m = s.match(/([\d.,]+)\s*(bytes|kb|mb|gb|tb)?/);
    if (!m) return 0;
    const val = parseFloat(m[1].replace(',', '.'));
    if (isNaN(val)) return 0;
    const unit = (m[2] || 'bytes').toLowerCase();
    const mult = { bytes: 1, kb: 1024, mb: 1024*1024, gb: 1024*1024*1024, tb: 1024*1024*1024*1024 }[unit] || 1;
    return Math.round(val * mult);
  }
  function parseDurationToSec(durStr) {
    if (!durStr || typeof durStr !== 'string') return 0;
    const s = durStr.trim().toLowerCase();
    // format: "1h 2m 3s" eller "2m 30s" eller "1:23" eller "01:02:03"
    if (s.includes('h') || s.includes('m')) {
      let sec = 0;
      const h = s.match(/(\d+)\s*h/);
      const m = s.match(/(\d+)\s*m/);
      const secM = s.match(/(\d+)\s*s/);
      if (h) sec += parseInt(h[1],10)*3600;
      if (m) sec += parseInt(m[1],10)*60;
      if (secM) sec += parseInt(secM[1],10);
      return sec;
    }
    if (s.includes(':')) {
      const parts = s.split(':').map(p=>parseInt(p,10)||0);
      if (parts.length===3) return parts[0]*3600+parts[1]*60+parts[2];
      if (parts.length===2) return parts[0]*60+parts[1];
    }
    const num = parseInt(s,10);
    return isNaN(num)?0:num;
  }
  function getDisplaySize(item) {
    // Never show size for streaming manifests - playlist size (e.g. 6.5KB) is not video size
    const streamFmts = new Set(['M3U8','M3U','MPD','M4S','FMP4','TS','M2TS']);
    if (item.format && streamFmts.has(item.format.toUpperCase())) return '';
    // Validate: 21min video cannot be 6.5KB - hide implausible small sizes
    let raw = 0;
    if (item.rawSize && item.rawSize > 0) raw = item.rawSize;
    else if (item.size && !['Web source','Direct','N/A','Stream',''].includes(item.size)) raw = parseSizeToBytes(item.size);
    else if (item.totalBytes && item.totalBytes > 0) raw = item.totalBytes;
    if (raw > 0) {
      const durSec = parseDurationToSec(item.duration || '');
      // If video is >2min but claimed size <100KB -> false (manifest/segment), hide
      if (durSec > 120 && raw < 100 * 1024) return '';
      // If size <15KB generally unreliable for video
      if (raw < 15 * 1024) return '';
      if (item.rawSize && item.rawSize > 0) return formatBytesPopup(item.rawSize);
      if (item.size && !['Web source','Direct','N/A','Stream',''].includes(item.size)) return item.size;
      if (item.totalBytes && item.totalBytes > 0) return formatBytesPopup(item.totalBytes);
    }
    return '';
  }

  function updateVersionLabels() {
    const version = chrome.runtime.getManifest().version;
    const label = 'v' + version;
    const headerVersion = document.getElementById('txt-app-version');
    const footerVersion = document.getElementById('txt-footer-version');
    const settingsVersion = document.getElementById('txt-settings-version');
    if (headerVersion) headerVersion.textContent = label;
    if (footerVersion) footerVersion.textContent = label;
    if (settingsVersion) settingsVersion.textContent = label;
  }

  function applyLanguage() {
    document.getElementById('txt-app-title').textContent = t('title');
    updateVersionLabels();
    searchInput.placeholder = t('searchPlaceholder');
    document.getElementById('tab-all-text').textContent = t('all');
    document.getElementById('tab-video-text').textContent = t('video');
    document.getElementById('tab-stream-text').textContent = t('stream');
    document.getElementById('txt-empty-title').textContent = t('noVideosTitle');
    document.getElementById('txt-empty-desc').textContent = t('noVideosDesc');
    document.getElementById('txt-loading').textContent = t('loading');
    document.getElementById('txt-footer').textContent = t('footerText');
    document.getElementById('txt-lang-title').textContent = t('language');
    document.getElementById('txt-download-title').textContent = t('downloadLocation');
    document.getElementById('txt-ask-each-time').textContent = t('askEachTime');
    if (btnPickFolder) btnPickFolder.textContent = t('pickFolderBtn');
    chrome.storage.local.get(['customDirectoryName']).then(data => {
      updateSelectedFolderLabel(data.customDirectoryName || '');
    });
    document.getElementById('txt-history-title').textContent = t('downloadHistory');
    document.getElementById('txt-auto-delete').textContent = t('autoDelete24h');
    document.getElementById('txt-active-downloads').textContent = t('activeDownloads');
    btnClearHistory.textContent = t('clearHistory');
    btnBackMain.textContent = t('back');
    const txtSupportTitle = document.getElementById('txt-support-title');
    const txtSupportDesc = document.getElementById('txt-support-desc');
    const txtSupportBtn = document.getElementById('txt-support-btn');
    if (txtSupportTitle) txtSupportTitle.textContent = t('supportTitle');
    if (txtSupportDesc) txtSupportDesc.textContent = t('supportDesc');
    if (txtSupportBtn) txtSupportBtn.textContent = t('supportBtn');
    const txtCreditsCreated = document.getElementById('txt-credits-created');
    const btnCopyEmail = document.getElementById('btn-copy-email');
    if (txtCreditsCreated) txtCreditsCreated.textContent = t('creditsCreated');
    if (btnCopyEmail) btnCopyEmail.title = t('copyEmail');
    if (btnCopyEmail) btnCopyEmail.setAttribute('aria-label', t('copyEmail'));
    if (txtConfirmTitle) txtConfirmTitle.textContent = t('confirmStopTitle');
    if (txtConfirmDesc) txtConfirmDesc.textContent = t('confirmStopDesc');
    if (btnConfirmYes) btnConfirmYes.textContent = t('confirmYes');
    if (btnConfirmNo) btnConfirmNo.textContent = t('confirmNo');

    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n');
      if (key) el.textContent = t(key);
    });
    // Re-apply review modal texts for current milestone (10 uses a different body string)
    if (reviewPromptShowing && currentReviewMilestone) {
      applyReviewPromptTexts(currentReviewMilestone);
    }
    const proTitleEl = document.getElementById('txt-pro-title');
    const proDescEl = document.getElementById('txt-pro-description');
    const freeVsProEl = document.getElementById('txt-free-vs-pro');
    const proLifetimeEl = document.getElementById('txt-pro-lifetime');
    const proActiveEl = document.getElementById('txt-pro-active');
    const licenseHintEl = document.getElementById('txt-license-after-purchase');
    if (proTitleEl) proTitleEl.textContent = t('proTitle');
    if (proDescEl) proDescEl.textContent = t('proDescription');
    const proHookEl = document.getElementById('txt-pro-hook');
    if (proHookEl) proHookEl.textContent = t('proHook');
    if (freeVsProEl) freeVsProEl.textContent = t('freeVsPro');
    if (proLifetimeEl) proLifetimeEl.textContent = t('proPriceLifetime');
    if (proActiveEl) proActiveEl.textContent = t('proActive');
    if (licenseHintEl) licenseHintEl.textContent = t('licenseAfterPurchase');
    if (inputLicenseKey) inputLicenseKey.placeholder = t('licenseKeyPlaceholder');
    if (inputLicenseKeyOffer) inputLicenseKeyOffer.placeholder = t('licenseKeyPlaceholder');

    if (viewSettings.classList.contains('hidden')) {
      renderList();
    }
    renderHistory();
    updateAdSlot();
    applyProUpsellText();
    updateUpsellCountdownText();
  }

  function openSettingsView() {
    viewMain.classList.add('hidden');
    viewSettings.classList.remove('hidden');
    btnSettingsToggle.classList.add('active');
    if (appFooter) appFooter.classList.add('hidden');
    renderHistory();
  }

  function openMainView() {
    viewSettings.classList.add('hidden');
    viewMain.classList.remove('hidden');
    btnSettingsToggle.classList.remove('active');
    if (appFooter) appFooter.classList.remove('hidden');
  }

  function openConfirmModal(downloadId, url) {
    pendingCancel = { id: downloadId, url: url || '' };
    if (txtConfirmTitle) txtConfirmTitle.textContent = t('confirmStopTitle');
    if (txtConfirmDesc) txtConfirmDesc.textContent = t('confirmStopDesc');
    confirmModal.classList.remove('hidden');
  }

  function closeConfirmModal() {
    confirmModal.classList.add('hidden');
    pendingCancel = null;
  }
  if (btnConfirmNo) btnConfirmNo.addEventListener('click', closeConfirmModal);
  if (confirmModal) confirmModal.addEventListener('click', (e) => { if (e.target === confirmModal) closeConfirmModal(); });

  // Rate limit modal
  function showRateLimitModal(minutesRemaining) {
    const modal = document.getElementById('rate-limit-modal');
    if (!modal) return;
    
    const txtRateMessage = document.getElementById('txt-rate-limit-message');

    if (txtRateMessage) {
      txtRateMessage.textContent = t('rateLimitMessagePlural')
        .replace('{time}', formatDuration(minutesRemaining || FREE_RATE_WINDOW_MINUTES));
    }

    modal.classList.remove('hidden');
  }
  
  function closeRateLimitModal() {
    const modal = document.getElementById('rate-limit-modal');
    if (modal) modal.classList.add('hidden');
  }
  
  const btnRateLimitClose = document.getElementById('btn-rate-limit-close');
  const btnRateLimitUpgrade = document.getElementById('btn-rate-limit-upgrade');
  const rateLimitModal = document.getElementById('rate-limit-modal');
  
  if (btnRateLimitClose) btnRateLimitClose.addEventListener('click', closeRateLimitModal);
  if (btnRateLimitUpgrade) {
    btnRateLimitUpgrade.addEventListener('click', () => {
      closeRateLimitModal();
      openSettingsView();
      // Scroll to Pro section
      setTimeout(() => {
        const proSection = document.getElementById('pro-section');
        if (proSection) proSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    });
  }
  if (rateLimitModal) rateLimitModal.addEventListener('click', (e) => { if (e.target === rateLimitModal) closeRateLimitModal(); });

  // Review prompts at milestones 1, 5, 10 downloads (3rd has no "Not now")
  const reviewPromptModal = document.getElementById('review-prompt-modal');
  const btnReviewLater = document.getElementById('btn-review-later');
  const btnReviewRate = document.getElementById('btn-review-rate');
  const txtReviewPromptTitle = document.getElementById('txt-review-prompt-title');
  const txtReviewPromptDesc = document.getElementById('txt-review-prompt-desc');

  function closeReviewPromptModal() {
    if (reviewPromptModal) reviewPromptModal.classList.add('hidden');
    reviewPromptShowing = false;
    currentReviewMilestone = null;
  }

  async function markReviewMilestoneShown(milestone) {
    try {
      const data = await chrome.storage.local.get(['reviewPromptsShown']);
      const shown = Array.isArray(data.reviewPromptsShown) ? data.reviewPromptsShown.slice() : [];
      if (milestone && !shown.includes(milestone)) shown.push(milestone);
      await chrome.storage.local.set({
        reviewPromptsShown: shown,
        pendingReviewMilestone: null,
        // Clear legacy one-shot keys if present
        reviewPromptDone: true,
        pendingReviewPrompt: false
      });
    } catch (e) {}
    closeReviewPromptModal();
  }

  function openStoreReviews() {
    try { chrome.tabs.create({ url: STORE_REVIEWS_URL }); } catch (e) {}
  }

  function applyReviewPromptTexts(milestone) {
    const m = milestone || currentReviewMilestone || 1;
    if (txtReviewPromptTitle) txtReviewPromptTitle.textContent = t('reviewPromptTitle');
    if (txtReviewPromptDesc) {
      txtReviewPromptDesc.textContent =
        m === 10 ? t('reviewPromptForcedDesc') : t('reviewPromptDesc');
    }
    if (btnReviewLater) {
      btnReviewLater.classList.remove('hidden');
      btnReviewLater.textContent = t('reviewPromptLater');
    }
    if (btnReviewRate) {
      btnReviewRate.textContent = t('reviewPromptRate');
      btnReviewRate.style.flex = '';
    }
  }

  function showReviewPromptModal(milestone) {
    if (!reviewPromptModal || reviewPromptShowing) return;
    const rateLimitEl = document.getElementById('rate-limit-modal');
    if (rateLimitEl && !rateLimitEl.classList.contains('hidden')) return;

    currentReviewMilestone = milestone;
    reviewPromptShowing = true;
    applyReviewPromptTexts(milestone);
    reviewPromptModal.classList.remove('hidden');
  }

  async function maybeShowReviewPrompt() {
    try {
      const data = await chrome.storage.local.get([
        'successfulDownloadCount',
        'reviewPromptsShown',
        'pendingReviewMilestone'
      ]);
      const count = Number(data.successfulDownloadCount) || 0;
      const shown = Array.isArray(data.reviewPromptsShown) ? data.reviewPromptsShown : [];
      let milestone = data.pendingReviewMilestone || null;

      if (!milestone) {
        for (const m of REVIEW_MILESTONES) {
          if (count >= m && !shown.includes(m)) {
            milestone = m;
            await chrome.storage.local.set({ pendingReviewMilestone: m });
            break;
          }
        }
      }

      if (!milestone || shown.includes(milestone)) return;
      showReviewPromptModal(milestone);
    } catch (e) {}
  }

  if (btnReviewLater) {
    btnReviewLater.addEventListener('click', () => {
      markReviewMilestoneShown(currentReviewMilestone);
    });
  }
  if (btnReviewRate) {
    btnReviewRate.addEventListener('click', () => {
      openStoreReviews();
      markReviewMilestoneShown(currentReviewMilestone);
    });
  }
  if (reviewPromptModal) {
    reviewPromptModal.addEventListener('click', (e) => {
      if (e.target !== reviewPromptModal) return;
      markReviewMilestoneShown(currentReviewMilestone);
    });
  }

  // Show pending review prompt when popup opens (after language is applied below)
  // maybeShowReviewPrompt() is called after applyLanguage()

  const activeDownloadsList = document.getElementById('active-downloads-list');
  if (activeDownloadsList && !activeDownloadsList.dataset.controlsBound) {
    activeDownloadsList.dataset.controlsBound = '1';
    activeDownloadsList.addEventListener('click', async (e) => {
      const btn = e.target.closest('.btn-adl-pause, .btn-adl-resume, .btn-adl-close');
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      const card = btn.closest('.active-dl-card');
      if (!card || !card.dataset.dlId) return;
      try {
        if (btn.classList.contains('btn-adl-pause')) {
          await chrome.runtime.sendMessage({ type: 'PAUSE_DOWNLOAD', downloadId: card.dataset.dlId });
        } else if (btn.classList.contains('btn-adl-resume')) {
          await chrome.runtime.sendMessage({ type: 'RESUME_DOWNLOAD', downloadId: card.dataset.dlId });
        } else if (btn.classList.contains('btn-adl-close')) {
          openConfirmModal(card.dataset.dlId, card.dataset.dlUrl || '');
        }
      } catch (err) {}
      setTimeout(checkOngoingDownloads, 80);
    });
  }

  if (mediaListContainer && !mediaListContainer.dataset.progressBound) {
    mediaListContainer.dataset.progressBound = '1';
    mediaListContainer.addEventListener('click', async (e) => {
      const btn = e.target.closest('.btn-pause, .btn-resume, .btn-stop');
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      const card = btn.closest('.media-card');
      if (!card || !card.dataset.dlId) return;
      try {
        if (btn.classList.contains('btn-pause')) {
          await chrome.runtime.sendMessage({ type: 'PAUSE_DOWNLOAD', downloadId: card.dataset.dlId });
        } else if (btn.classList.contains('btn-resume')) {
          await chrome.runtime.sendMessage({ type: 'RESUME_DOWNLOAD', downloadId: card.dataset.dlId });
        } else if (btn.classList.contains('btn-stop')) {
          openConfirmModal(card.dataset.dlId, card.dataset.url || '');
        }
      } catch (err) {}
      setTimeout(checkOngoingDownloads, 80);
    });
  }

  function renderActiveDownloadControls(ctrlBox, dl) {
    const statusKey = (dl.status === 'downloading' || dl.status === 'paused') ? dl.status : 'idle';
    if (ctrlBox.dataset.dlStatus === statusKey && ctrlBox.childElementCount > 0) return;
    ctrlBox.dataset.dlStatus = statusKey;
    clearChildren(ctrlBox);
    if (dl.status === 'downloading') {
      const pauseBtn = document.createElement('button');
      pauseBtn.className = 'btn-adl btn-adl-pause';
      pauseBtn.title = t('pause');
      pauseBtn.textContent = '⏸';
      ctrlBox.appendChild(pauseBtn);
    } else if (dl.status === 'paused') {
      const resumeBtn = document.createElement('button');
      resumeBtn.className = 'btn-adl btn-adl-resume';
      resumeBtn.title = t('resume');
      resumeBtn.textContent = '▶';
      ctrlBox.appendChild(resumeBtn);
    }
    if (dl.status === 'downloading' || dl.status === 'paused' || dl.status === 'merging') {
      const closeBtn = document.createElement('button');
      closeBtn.className = 'btn-adl btn-adl-close';
      closeBtn.title = t('cancel');
      closeBtn.textContent = '✕';
      ctrlBox.appendChild(closeBtn);
    }
  }

  if (btnConfirmYes) btnConfirmYes.addEventListener('click', async () => {
    if (!pendingCancel) return;
    const { id, url } = pendingCancel;
    closeConfirmModal();
    try {
      const dlRes = await chrome.runtime.sendMessage({ type: 'GET_ALL_DOWNLOADS' });
      const dl = dlRes && dlRes.downloads ? dlRes.downloads.find(d => d.id === id) : null;
      const isActive = dl && (dl.status === 'downloading' || dl.status === 'paused' || dl.status === 'merging');
      if (isActive) {
        await chrome.runtime.sendMessage({ type: 'CANCEL_DOWNLOAD', downloadId: id });
      } else {
        await chrome.runtime.sendMessage({ type: 'REMOVE_DOWNLOAD_ENTRY', downloadId: id });
      }
      // hide progress on matching card
      if (url) {
        const card = document.querySelector(`.media-card[data-url="${CSS.escape(url)}"]`);
        if (card) {
          const pb = card.querySelector('.progress-box');
          if (pb) pb.classList.add('hidden');
          const db = card.querySelector('.btn-download');
          if (db) { db.disabled = false; db.textContent = t('download'); }
        }
      }
      checkOngoingDownloads();
    } catch (e) {}
  });

  applyLanguage();
  maybeShowReviewPrompt();

  let canLoadMedia = false;

  // Hämta aktiv flik
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) {
    showEmptyState(t('errorOccurred'));
  } else {
    activeTabId = tab.id;
    activeTabUrl = tab.url || null;
    if (isRestrictedTabUrl(tab.url)) {
      showEmptyState(t('internalPageBlocked'));
    } else {
      try {
        const blockCheck = await chrome.runtime.sendMessage({ type: 'IS_URL_BLOCKED', url: tab.url });
        if (blockCheck && blockCheck.blocked) {
          showEmptyState(t('blockedSite'));
        } else {
          canLoadMedia = true;
        }
      } catch (e) {
        canLoadMedia = true;
      }
    }
  }

  async function ensureContentScript(tabId) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        world: 'MAIN',
        files: ['page-hook.js']
      });
    } catch (e) {
      console.warn('[FVD] page-hook injection:', e);
    }
    try {
      await chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        files: ['blocked-hosts.js', 'content.js']
      });
    } catch (e) {
      console.warn('[FVD] Content script injection:', e);
    }
  }

  async function collectMainWorldMedia(tabId) {
    try {
      const viaBg = await chrome.runtime.sendMessage({ type: 'COLLECT_MAIN_WORLD', tabId });
      if (viaBg && viaBg.data) return viaBg.data;
    } catch (e) {}
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        func: () => {
          try {
            if (typeof globalThis.__FVD_COLLECT_PAGE_MEDIA__ === 'function') {
              return globalThis.__FVD_COLLECT_PAGE_MEDIA__();
            }
          } catch (err) {}
          return { hls: [], standard: [], model: [], perf: [] };
        }
      });
      return (results && results[0] && results[0].result) || null;
    } catch (e) {
      console.warn('[FVD] Main world collect:', e);
      return null;
    }
  }

  function getSafeVideoFilename(originalFilename, url, format, contentType) {
    // Alla tillåtna källor sparas som video (.mp4) för universell uppspelning, utom ren audio
    let name = (originalFilename || '').split('?')[0].split('#')[0].trim();
    name = name.replace(/[/\\?%*:|"<>]/g, '_').replace(/\s+/g, ' ').trim();
    name = name.replace(/\.(php|aspx|asp|jsp|html|htm|bin|do|cgi|axd|mpd|m3u|m3u8|ts|m4s|fmp4|m2ts)$/i, '');
    name = name.replace(/^[._]+|[._]+$/g, '').trim();
    if (name.length > 180) name = name.substring(0, 180).trim();

    const urlLower = (url || '').toLowerCase();
    const formatLower = (format || '').toLowerCase();
    const mimeLower = (contentType || '').toLowerCase();
    const isBlob = urlLower.startsWith('blob:');

    // Audio-only behålls som mp3, allt annat blir mp4-video
    const isAudioOnly = (formatLower === 'mp3' || formatLower === 'm4a' || formatLower === 'wav' || formatLower === 'ogg' || formatLower === 'opus' || formatLower === 'flac')
      || urlLower.includes('.mp3') || urlLower.endsWith('.m4a') || urlLower.endsWith('.wav')
      || (mimeLower.startsWith('audio/') && !mimeLower.startsWith('video/'));
    let targetExt = isAudioOnly ? 'mp3' : 'mp4';

    if (!name || name === 'videoplayback' || name.startsWith('video_') || name.startsWith('master') || name.startsWith('playlist') || name.startsWith('index') || name.startsWith('chunk') || name.startsWith('frag')) {
      name = `video_${Date.now().toString().slice(-4)}`;
    }

    // Ta bort manifest/segment-endelser så det blir .mp4
    if (/\.(ts|m3u8|m3u|mpd|m4s|fmp4|m2ts)$/i.test(name)) {
      name = name.replace(/\.[^.]+$/, '');
    }

    // blob: har ingen filända – ge alltid .mp4 (video)
    if (isBlob && !name.toLowerCase().endsWith('.mp4') && !isAudioOnly) {
      name = name.replace(/\.[^.]+$/, '') + '.mp4';
      if (!name.includes('.')) name += '.mp4';
    }

    const knownVideoExts = ['.mp4','.m4v','.webm','.flv','.f4v','.mov','.avi','.mkv','.ogv','.3gp','.3g2','.wmv','.av1','.hevc','.vob','.mpg','.mpeg'];
    const knownMedia = [...knownVideoExts, '.mp3', '.m4a', '.wav', '.ogg', '.opus', '.flac', '.aac', '.wma'];
    const hasValidExt = knownMedia.some(ext => name.toLowerCase().endsWith(ext));

    if (!hasValidExt) {
      const lastDot = name.lastIndexOf('.');
      if (lastDot > 0 && name.length - lastDot <= 6) {
        name = name.substring(0, lastDot);
      }
      name = `${name}.${targetExt}`;
    } else {
      // Behåll original videoformat (.avi/.mkv/.mov etc) – konvertera bara streaming-manifest till .mp4
      if (/\.(m3u8|m3u|mpd|ts|m4s|fmp4|m2ts)$/i.test(name)) {
        name = name.replace(/\.[^.]+$/, '.mp4');
      }
    }

    return name;
  }

  function isSegmentLikeItem(item) {
    const u = (item.url || '').toLowerCase();
    return /\.(ts|m4s|fmp4|cmfv|cmfa)(\?|#|$)/i.test(u);
  }

  function isBlobItem(item) {
    return (item.url || '').startsWith('blob:');
  }

  function isStreamItem(item) {
    return /\.(m3u8|m3u|mpd)(?:\?|#|$|\/)/i.test(item.url || '');
  }

  function itemByteSize(item) {
    if (typeof item.rawSize === 'number' && item.rawSize > 0) return item.rawSize;
    return parseSizeToBytes(item.size);
  }

  // Alla video-behållare som kan laddas ner direkt – .avi/.mkv/.flv m.m. ska inte
  // sorteras bort till "övrigt" bara för att de inte är mp4/webm.
  const VIDEO_FILE_EXT_RE = /\.(mp4|m4v|webm|mov|mkv|avi|flv|f4v|ogv|ogm|3gp|3g2|wmv|asf|vob|m2v|divx|mts|m2ts|mpg|mpeg|av1|hevc)(\?|#|$|\/)/i;

  function isProgressiveFileItem(item) {
    const u = item.url || '';
    return !u.startsWith('blob:') && VIDEO_FILE_EXT_RE.test(u);
  }

  function qualityRank(item) {
    const q = String(item.quality || item.filename || item.url || '');
    const m = q.match(/(\d{3,4})p/i) || q.match(/x(\d{3,4})(?:\D|$)/i) || q.match(/[_\-](\d{3,4})(?:\D|$)/);
    return m ? parseInt(m[1], 10) : 0;
  }

  function pickBestMediaCandidates(items, maxCount) {
    const sorted = [...items].sort((a, b) => {
      const qDiff = qualityRank(b) - qualityRank(a);
      if (qDiff) return qDiff;
      return itemByteSize(b) - itemByteSize(a);
    });
    const stream = sorted.find(i => isStreamItem(i));
    const blob = sorted.find(i => isBlobItem(i));
    const file = sorted.find(i => isProgressiveFileItem(i));
    const picked = [];
    // Prefer real CDN/file URLs over blob (blob is often incomplete MSE buffer)
    if (file) picked.push(file);
    else if (stream) picked.push(stream);
    else if (blob) picked.push(blob);
    else if (sorted[0]) picked.push(sorted[0]);
    for (const item of sorted) {
      if (picked.length >= maxCount) break;
      if (!picked.some(p => p.url === item.url)) picked.push(item);
    }
    return picked.slice(0, maxCount);
  }

  // Visa alla unika media som DOM-skanningen faktiskt hittade (t.ex. en sida med
  // 18 nedladdningslänkar), men håll en rimlig övre gräns. Enstaka videor visas
  // oförändrat med den gamla topp-3-logiken eftersom budgeten då blir 3.
  const MAX_MEDIA_ROWS = 60;

  function mediaRowBudget(domResponse) {
    const domItems = (domResponse && Array.isArray(domResponse.items)) ? domResponse.items : [];
    const distinct = new Set(domItems.map(i => i && i.url).filter(Boolean));
    return Math.min(MAX_MEDIA_ROWS, Math.max(10, distinct.size));
  }

  function filterToVisiblePageMedia(items, domResponse) {
    let filtered = items.filter(i => !isSegmentLikeItem(i));
    const budget = mediaRowBudget(domResponse);
    if (!domResponse) return pickBestMediaCandidates(filtered, budget);

    const visibleCount = domResponse.visibleVideoCount || 0;
    const visibleUrls = new Set(domResponse.visibleUrls || []);
    const playlistItems = filtered.filter(i => i.fromPlaylist || (domResponse.items || []).some(d => d.url === i.url && d.fromPlaylist));

    // Embedded playlist / xplayer / videojs sources first – these are the real download targets
    const playlistInAll = filtered.filter(i =>
      i.fromPlaylist || playlistItems.some(p => p.url === i.url) || /\/vid_\d+p\.mp4/i.test(i.url || '') || /\/vid\d*\//i.test(i.url || '')
    );
    if (playlistInAll.length > 0) {
      return pickBestMediaCandidates(playlistInAll, Math.min(budget, playlistInAll.length));
    }

    if (visibleCount === 0 && visibleUrls.size === 0) {
      return pickBestMediaCandidates(filtered, budget);
    }

    const realMedia = filtered.filter(i =>
      !isBlobItem(i) && (isProgressiveFileItem(i) || isStreamItem(i))
    );

    if (visibleUrls.size > 0) {
      const direct = filtered.filter(item => visibleUrls.has(item.url));
      const directReal = direct.filter(i => !isBlobItem(i));
      if (directReal.length > 0) {
        const otherReal = realMedia.filter(i => !directReal.some(d => d.url === i.url));
        filtered = [...directReal, ...otherReal];
      } else if (realMedia.length > 0) {
        // DOM only exposed MSE blob: – keep sniffed HLS/MP4 instead of incomplete blob
        filtered = realMedia;
      } else if (direct.length > 0) {
        filtered = direct;
      }
    }

    const files = filtered.filter(i => isProgressiveFileItem(i));
    if (files.length) return pickBestMediaCandidates(files, Math.min(budget, files.length));
    const streams = filtered.filter(i => isStreamItem(i));
    if (streams.length) return pickBestMediaCandidates(streams, Math.min(budget, streams.length));

    const nonBlob = filtered.filter(i => !isBlobItem(i));
    if (nonBlob.length) return pickBestMediaCandidates(nonBlob, Math.min(budget, nonBlob.length));

    if (visibleCount === 1) {
      const blobItem = filtered.find(i => isBlobItem(i));
      if (blobItem) return [blobItem];
      return pickBestMediaCandidates(filtered, 1);
    }

    if (filtered.length > Math.max(visibleCount, 1) * 2) {
      return pickBestMediaCandidates(filtered, Math.max(visibleCount, 1));
    }

    return filtered;
  }

  async function resolveActiveTab() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.id) return null;
      activeTabId = tab.id;
      activeTabUrl = tab.url || null;
      return tab;
    } catch (e) {
      return null;
    }
  }

  async function isTabBlocked(tab) {
    if (!tab || !tab.url) return true;
    if (isRestrictedTabUrl(tab.url)) return true;
    try {
      const blockCheck = await chrome.runtime.sendMessage({ type: 'IS_URL_BLOCKED', url: tab.url });
      return !!(blockCheck && blockCheck.blocked);
    } catch (e) {
      return false;
    }
  }

  function mergeDomItems(items, domItems) {
    const byUrl = new Map(items.map(i => [i.url, i]));
    domItems.forEach(domItem => {
      const existing = byUrl.get(domItem.url);
      if (existing) {
        if (domItem.duration) existing.duration = domItem.duration;
        if (domItem.filename) existing.filename = domItem.filename;
        if (domItem.fromPlaylist) existing.fromPlaylist = true;
        if (domItem.quality) existing.quality = domItem.quality;
        existing.fromVisibleDom = true;
      } else {
        const added = {
          url: domItem.url,
          filename: domItem.filename,
          format: domItem.format,
          duration: domItem.duration || '',
          size: 'Web source',
          rawSize: 0,
          discoveredAt: Date.now(),
          fromVisibleDom: true,
          fromPlaylist: !!domItem.fromPlaylist,
          quality: domItem.quality || ''
        };
        items.push(added);
        byUrl.set(domItem.url, added);
      }
    });
    return items;
  }

  async function fetchMediaForTab({ refresh = false } = {}) {
    const tab = await resolveActiveTab();
    if (!tab || !tab.id) {
      loadingState.classList.add('hidden');
      showEmptyState(t('errorOccurred'));
      return;
    }

    if (await isTabBlocked(tab)) {
      loadingState.classList.add('hidden');
      const blockedMsg = isRestrictedTabUrl(tab.url) ? t('internalPageBlocked') : t('blockedSite');
      showEmptyState(blockedMsg);
      allMedia = [];
      countAll.textContent = '0';
      return;
    }

    loadingState.classList.remove('hidden');
    emptyState.classList.add('hidden');
    clearChildren(mediaListContainer);
    stopCurrentPreview();

    if (refresh) {
      btnRefresh.disabled = true;
      btnRefresh.classList.add('spinning');
    }

    try {
      const msgType = refresh ? 'REFRESH_MEDIA' : 'GET_MEDIA';
      const bgResponse = await chrome.runtime.sendMessage({
        type: msgType,
        tabId: activeTabId
      });

      let items = (bgResponse && bgResponse.media) ? bgResponse.media : [];
      let domResponse = null;

      try {
        await ensureContentScript(activeTabId);
        const mainWorld = await collectMainWorldMedia(activeTabId);
        domResponse = await chrome.tabs.sendMessage(activeTabId, {
          type: 'SCAN_PAGE',
          mainWorld: mainWorld || null
        });
        if (domResponse && Array.isArray(domResponse.items)) {
          items = mergeDomItems(items, domResponse.items);
        }
      } catch (domErr) {
        console.warn('[FVD] DOM scan failed:', domErr);
      }

      items = filterToVisiblePageMedia(items, domResponse);
      allMedia = items;
      renderList();
      if (activeTabId) {
        chrome.runtime.sendMessage({
          type: 'SET_TAB_BADGE_COUNT',
          tabId: activeTabId,
          count: allMedia.length
        }).catch(() => {});
      }
      checkOngoingDownloads();
    } catch (err) {
      console.error('Error fetching media:', err);
      showEmptyState(t('errorOccurred'));
    } finally {
      loadingState.classList.add('hidden');
      if (refresh) {
        btnRefresh.disabled = false;
        btnRefresh.classList.remove('spinning');
      }
    }
  }

  // Ladda videor från nätverket och sidan
  async function loadMedia() {
    await fetchMediaForTab({ refresh: false });
  }

  function getBadgeClass(format) {
    switch (format.toUpperCase()) {
      case 'MP4': return 'badge-mp4';
      case 'WEBM': return 'badge-webm';
      case 'M3U8': return 'badge-m3u8';
      case 'FLV': return 'badge-flv';
      default: return 'badge-default';
    }
  }

  function stopCurrentPreview() {
    if (currentlyPlayingCard) {
      const prevContainer = currentlyPlayingCard.querySelector('.preview-container');
      const prevPlayBtn = currentlyPlayingCard.querySelector('.btn-play');
      if (prevContainer) {
        prevContainer && clearChildren(prevContainer);
        prevContainer.classList.add('hidden');
      }
      if (prevPlayBtn) {
        prevPlayBtn.textContent = t('play');
        prevPlayBtn.classList.remove('playing');
      }
      currentlyPlayingCard = null;
    }
  }

  function applyActiveDownloadProgress(dl) {
    if (!dl || !dl.id) return;
    const activeSection = document.getElementById('active-downloads-section');
    const activeList = document.getElementById('active-downloads-list');
    if (!activeSection || !activeList) return;

    const cardId = `adl-${CSS.escape(dl.id)}`;
    let card = activeList.querySelector(`#${cardId}`);

    // Card may not exist yet (first progress tick) — fall back to full refresh
    if (!card) {
      checkOngoingDownloads();
      return;
    }

    activeSection.classList.remove('hidden');
    const adlBar = card.querySelector('.adl-progress-bar-fill');
    const adlPercentEl = card.querySelector('.adl-percent');
    const adlSegEl = card.querySelector('.adl-segments');
    const adlDurEl = card.querySelector('.adl-duration');
    const pct = Math.max(0, Math.min(100, Math.round(dl.percent || 0)));

    if (adlBar) adlBar.style.width = `${pct}%`;

    if (dl.status === 'downloading') {
      let durationStr = '';
      if (dl.totalDurationFormatted) {
        durationStr = `${dl.downloadedDurationFormatted || '0s'} / ${dl.totalDurationFormatted}`;
      }
      const sz = dl.totalBytes ? formatBytesPopup(dl.totalBytes) : '';
      if (adlSegEl) adlSegEl.textContent = `${dl.completed || 0}/${dl.total || '?'}`;
      if (adlDurEl) adlDurEl.textContent = sz ? `📦 ${sz} • ${durationStr}` : durationStr;
      if (adlPercentEl) adlPercentEl.textContent = `${t('downloading')} ${pct}%`;
    } else if (dl.status === 'paused') {
      let durationStr = '';
      if (dl.totalDurationFormatted) {
        durationStr = `${dl.downloadedDurationFormatted || '0s'} / ${dl.totalDurationFormatted}`;
      }
      const sz = dl.totalBytes ? formatBytesPopup(dl.totalBytes) : '';
      if (adlSegEl) adlSegEl.textContent = `${dl.completed || 0}/${dl.total || '?'}`;
      if (adlDurEl) adlDurEl.textContent = sz ? `📦 ${sz} • ${durationStr}` : durationStr;
      if (adlPercentEl) adlPercentEl.textContent = `${t('paused')} ${pct}%`;
    } else if (dl.status === 'merging' || dl.status === 'completed' || dl.status === 'error') {
      // Status change — rebuild controls/labels via full refresh
      checkOngoingDownloads();
    }
  }

  async function checkOngoingDownloads() {
    const activeSection = document.getElementById('active-downloads-section');
    const activeList = document.getElementById('active-downloads-list');

    try {
      const res = await chrome.runtime.sendMessage({ type: 'GET_ALL_DOWNLOADS' });
      if (res && res.downloads) {
        // Update any matching media cards (same tab)
        res.downloads.forEach(dl => {
          const card = document.querySelector(`.media-card[data-url="${CSS.escape(dl.url)}"]`);
          if (card) {
            updateCardDownloadState(card, dl);
          }
        });

        // Render global Active Downloads banner (visible from ANY window)
        const activeDls = res.downloads.filter(dl => dl.status === 'downloading' || dl.status === 'merging' || dl.status === 'paused');
        const completedRecent = res.downloads.filter(dl => dl.status === 'completed' || dl.status === 'error');

        const showList = [...activeDls, ...completedRecent];

        if (showList.length === 0) {
          activeSection.classList.add('hidden');
          clearChildren(activeList);
          return;
        }

        activeSection.classList.remove('hidden');
        document.getElementById('txt-active-downloads').textContent = t('activeDownloads');

        // Update or create cards for each active download
        showList.forEach(dl => {
          const cardId = `adl-${CSS.escape(dl.id)}`;
          let card = activeList.querySelector(`#${cardId}`);

          if (!card) {
            card = document.createElement('div');
            card.className = 'active-dl-card';
            card.id = cardId;
            card.appendChild(
              el('div', { className: 'adl-top-row' }, [
                el('div', { className: 'adl-title' }),
                el('div', { className: 'adl-controls' })
              ])
            );
            card.appendChild(
              el('div', { className: 'adl-progress-bar-bg' }, [
                el('div', { className: 'adl-progress-bar-fill' })
              ])
            );
            card.appendChild(
              el('div', { className: 'adl-info' }, [
                el('span', { className: 'adl-percent' }),
                el('span', { className: 'adl-segments' })
              ])
            );
            card.appendChild(el('div', { className: 'adl-duration' }));
            activeList.appendChild(card);
          }

          card.querySelector('.adl-title').textContent = dl.filename || 'Video';
          card.dataset.dlId = dl.id;
          card.dataset.dlUrl = dl.url || '';
          const adlBar = card.querySelector('.adl-progress-bar-fill');
          const adlPercentEl = card.querySelector('.adl-percent');
          const adlSegEl = card.querySelector('.adl-segments');
          const adlDurEl = card.querySelector('.adl-duration');
          adlBar.style.width = `${dl.percent || 0}%`;

          const ctrlBox = card.querySelector('.adl-controls');
          renderActiveDownloadControls(ctrlBox, dl);

          if (dl.status === 'downloading') {
            let durationStr = '';
            if (dl.totalDurationFormatted) {
              durationStr = `${dl.downloadedDurationFormatted || '0s'} / ${dl.totalDurationFormatted}`;
            }
            const sz = dl.totalBytes ? formatBytesPopup(dl.totalBytes) : '';
            adlSegEl.textContent = `${dl.completed || 0}/${dl.total || '?'}`;
            adlDurEl.textContent = sz ? `📦 ${sz} • ${durationStr}` : durationStr;
            adlPercentEl.textContent = `${t('downloading')} ${dl.percent || 0}%`;
          } else if (dl.status === 'paused') {
            let durationStr = '';
            if (dl.totalDurationFormatted) {
              durationStr = `${dl.downloadedDurationFormatted || '0s'} / ${dl.totalDurationFormatted}`;
            }
            const sz = dl.totalBytes ? formatBytesPopup(dl.totalBytes) : '';
            adlSegEl.textContent = `${dl.completed || 0}/${dl.total || '?'}`;
            adlDurEl.textContent = sz ? `📦 ${sz} • ${durationStr}` : durationStr;
            adlPercentEl.textContent = `${t('paused')} ${dl.percent || 0}%`;
          } else if (dl.status === 'merging') {
            adlPercentEl.textContent = t('saving');
            adlSegEl.textContent = '100%';
            adlDurEl.textContent = t('mergingVideo');
            adlBar.style.width = '100%';
          } else if (dl.status === 'completed') {
            adlPercentEl.textContent = t('downloaded');
            adlSegEl.textContent = '✅';
            adlDurEl.textContent = dl.totalDurationFormatted || t('savedToComputer');
            adlBar.style.width = '100%';
          } else if (dl.status === 'error') {
            adlPercentEl.textContent = t('errorOccurred');
            adlSegEl.textContent = '❌';
            adlDurEl.textContent = dl.error || '';
          }
        });

        // Remove cards for downloads that are no longer active
        const activeIds = new Set(showList.map(dl => `adl-${CSS.escape(dl.id)}`));
        activeList.querySelectorAll('.active-dl-card').forEach(card => {
          if (!activeIds.has(card.id)) {
            card.remove();
          }
        });
      }
    } catch (e) {}
  }

  function updateCardDownloadState(card, dlState) {
    const progressBox = card.querySelector('.progress-box');
    const progressBarFill = card.querySelector('.progress-bar-fill');
    const progressHeader = card.querySelector('.progress-header');
    const progressInfo = card.querySelector('.progress-info');
    const downloadBtn = card.querySelector('.btn-download');

    if (!progressBox) return;

    function ensureCardControls(dl) {
      let ctr = progressBox.querySelector('.progress-controls');
      if (!ctr) {
        ctr = document.createElement('div');
        ctr.className = 'progress-controls';
        progressBox.appendChild(ctr);
      }
      const statusKey = dl.status || 'idle';
      if (ctr.dataset.dlStatus === statusKey && ctr.childElementCount > 0) return;
      ctr.dataset.dlStatus = statusKey;
      const showPause = dl.status === 'downloading' || dl.status === 'paused' || dl.status === 'merging';
      clearChildren(ctr);
      if (showPause) {
        if (dl.status === 'paused') {
          const b = document.createElement('button');
          b.className = 'btn-progress btn-resume';
          b.textContent = t('resume');
          ctr.appendChild(b);
        } else if (dl.status === 'downloading') {
          const b = document.createElement('button');
          b.className = 'btn-progress btn-pause';
          b.textContent = t('pause');
          ctr.appendChild(b);
        } else if (dl.status === 'merging') {
          const s = document.createElement('span');
          s.style.cssText = 'font-size:0.7rem;color:#93c5fd;';
          s.textContent = t('saving');
          ctr.appendChild(s);
        }
      }
      const spacer = document.createElement('span');
      spacer.className = 'spacer';
      ctr.appendChild(spacer);
      if (showPause || dl.status === 'downloading' || dl.status === 'paused' || dl.status === 'merging') {
        const x = document.createElement('button');
        x.className = 'btn-progress btn-stop';
        x.title = t('cancel');
        x.textContent = '✕';
        ctr.appendChild(x);
      }
    }

    if (dlState.id) card.dataset.dlId = dlState.id;

    // Progress lives only in "Active Downloads" while running — hide per-card bar
    if (dlState.status === 'downloading' || dlState.status === 'paused' || dlState.status === 'merging') {
      progressBox.classList.add('hidden');
      downloadBtn.disabled = true;
      if (dlState.status === 'downloading') downloadBtn.textContent = t('downloading');
      else if (dlState.status === 'paused') downloadBtn.textContent = t('paused');
      else downloadBtn.textContent = t('saving');
      return;
    }

    if (dlState.status === 'completed') {
      progressBox.classList.remove('hidden');
      downloadBtn.disabled = false;
      downloadBtn.textContent = t('downloaded');
      progressBarFill.style.width = `100%`;
      clearChildren(progressHeader);
      progressHeader.appendChild(el('span', { text: t('downloaded') }));
      progressHeader.appendChild(el('span', { text: '100%' }));
      progressInfo.textContent = t('savedToComputer');
      // allow closing completed entry
      ensureCardControls({ ...dlState, status: 'completed' });
    } else if (dlState.status === 'error') {
      progressBox.classList.remove('hidden');
      downloadBtn.disabled = false;
      downloadBtn.textContent = t('tryAgain');
      clearChildren(progressHeader);
      const errSpan = el('span', { text: t('errorOccurred') });
      errSpan.style.color = '#ef4444';
      progressHeader.appendChild(errSpan);
      progressInfo.textContent = dlState.error || t('errorOccurred');
      ensureCardControls(dlState);
    }
  }

  function renderList() {
    clearChildren(mediaListContainer);
    stopCurrentPreview();

    let filtered = allMedia.filter(item => {
      const STREAM_SET = new Set(['M3U8','M3U','MPD','TS','M2TS','M4S','FMP4']);
      if (currentFilter === 'video' && STREAM_SET.has(item.format)) return false;
      if (currentFilter === 'stream' && !STREAM_SET.has(item.format)) return false;

      if (currentSearch) {
        const matchTitle = item.filename.toLowerCase().includes(currentSearch);
        const matchUrl = item.url.toLowerCase().includes(currentSearch);
        return matchTitle || matchUrl;
      }
      return true;
    });

    countAll.textContent = allMedia.length;

    if (filtered.length === 0) {
      showEmptyState();
      return;
    }

    // Störst fil först – fallande sort på faktisk storlek
    filtered.sort((a, b) => {
      const sizeA = (typeof a.rawSize === 'number' && a.rawSize > 0) ? a.rawSize : parseSizeToBytes(a.size);
      const sizeB = (typeof b.rawSize === 'number' && b.rawSize > 0) ? b.rawSize : parseSizeToBytes(b.size);
      // HLS/streams utan bytes hamnar efter direkta filer, men sortera dem på duration om det finns
      if (sizeA !== sizeB) return sizeB - sizeA;
      const durA = parseDurationToSec(a.duration);
      const durB = parseDurationToSec(b.duration);
      if (durA !== durB) return durB - durA;
      return (b.discoveredAt || 0) - (a.discoveredAt || 0);
    });

    emptyState.classList.add('hidden');

    filtered.forEach((item) => {
      const card = document.createElement('div');
      card.className = 'media-card';
      card.dataset.url = item.url;

      const safeDownloadName = getSafeVideoFilename(item.filename, item.url, item.format, item.contentType);
      const urlLower = item.url.toLowerCase();
      const isDash = item.format === 'MPD' || urlLower.includes('.mpd');
      const isHls = !isDash && (item.format === 'M3U8' || item.format === 'M3U' || urlLower.includes('.m3u8') || urlLower.includes('.m3u'));
      const isStream = isHls || isDash || ['TS','M4S','FMP4','M2TS'].includes(item.format);
      const displayFormat = isDash ? 'MPD' : (isHls ? 'M3U8' : (item.format || 'MP4'));
      const badgeClass = isHls ? 'badge-m3u8' : isStream ? 'badge-m3u8' : getBadgeClass(item.format);

      const sizeStr = getDisplaySize(item);
      let bottomInfo = '';
      if (sizeStr && item.duration) bottomInfo = `📦 ${sizeStr} • ⏱️ ${item.duration}`;
      else if (sizeStr) bottomInfo = `📦 ${sizeStr}`;
      else if (item.duration) bottomInfo = `⏱️ ${item.duration}`;
      else if (isHls) bottomInfo = t('fullStream');
      else bottomInfo = t('readyToDownload');
      const progressInfoText = sizeStr
        ? `${t('size')}: ${sizeStr} • ${t('duration')}: ${item.duration || t('unknownDuration')}`
        : `${t('duration')}: ${item.duration || t('unknownDuration')}`;

      const metaRow = el('div', { className: 'media-meta-row' });
      if (item.duration) metaRow.appendChild(el('span', { className: 'media-duration-tag', text: `⏱️ ${item.duration}` }));
      if (sizeStr) metaRow.appendChild(el('span', { className: 'media-size-tag', text: `📦 ${sizeStr}` }));
      metaRow.appendChild(el('span', { className: 'media-url', title: item.url, text: item.url }));

      const progressHeader = el('div', { className: 'progress-header' }, [
        el('span', { text: t('downloading') }),
        el('span', { text: '0%' })
      ]);

      card.appendChild(
        el('div', { className: 'card-top' }, [
          el('div', { className: 'title-container' }, [
            el('span', { className: 'media-title', title: safeDownloadName, text: safeDownloadName }),
            metaRow
          ]),
          el('span', { className: `badge ${badgeClass}`, text: displayFormat })
        ])
      );
      card.appendChild(el('div', { className: 'preview-container hidden' }));
      card.appendChild(
        el('div', { className: 'progress-box hidden' }, [
          progressHeader,
          el('div', { className: 'progress-bar-bg' }, [el('div', { className: 'progress-bar-fill' })]),
          el('div', { className: 'progress-info', text: progressInfoText })
        ])
      );
      card.appendChild(
        el('div', { className: 'card-bottom' }, [
          el('span', { className: 'media-size', title: bottomInfo, text: bottomInfo }),
          el('div', { className: 'card-actions' }, [
            el('button', { className: 'btn-action btn-play', title: 'Preview', text: t('play') }),
            el('button', { className: 'btn-action btn-copy', title: 'Copy URL', text: t('copy'), dataset: { url: item.url } }),
            el('button', { className: 'btn-action btn-download', title: 'Download', text: t('download') })
          ])
        ])
      );

      const playBtn = card.querySelector('.btn-play');
      const previewContainer = card.querySelector('.preview-container');

      playBtn.addEventListener('click', () => {
        const isCurrentlyThisCard = (currentlyPlayingCard === card);
        stopCurrentPreview();

        if (isCurrentlyThisCard) return;

        previewContainer.classList.remove('hidden');
        clearChildren(previewContainer);
        const sourceEl = el('source');
        sourceEl.src = item.url;
        const videoEl = el('video', {
          className: 'preview-video',
          controls: true,
          autoplay: true,
          playsInline: true,
          preload: 'auto',
          tabIndex: 0
        }, [sourceEl, document.createTextNode(t('formatNotSupportedPreview'))]);
        const osdEl = el('div', { className: 'preview-osd hidden' });
        const wrapper = el('div', { className: 'preview-wrapper' });
        wrapper.style.position = 'relative';
        wrapper.style.width = '100%';
        wrapper.appendChild(videoEl);
        wrapper.appendChild(osdEl);
        previewContainer.appendChild(wrapper);

        let seekState = { delta: 0, timer: null, baseTime: 0 };

        function showPreviewOsd(icon, text, subtext) {
          if (!osdEl) return;
          clearChildren(osdEl);
          osdEl.appendChild(el('span', { text: `${icon} ${text}` }));
          if (subtext) osdEl.appendChild(el('small', { text: subtext }));
          osdEl.classList.remove('hidden');
          osdEl.style.opacity = '1';
          if (osdEl._timer) clearTimeout(osdEl._timer);
          osdEl._timer = setTimeout(() => {
            osdEl.style.opacity = '0';
            setTimeout(() => osdEl.classList.add('hidden'), 200);
          }, 700);
        }

        function smoothSeekPreview(deltaSec) {
          if (!videoEl || !isFinite(videoEl.duration)) {
            try { videoEl.currentTime += deltaSec; } catch(e) {}
            return;
          }

          if (seekState.timer) {
            clearTimeout(seekState.timer);
            seekState.delta += deltaSec;
          } else {
            seekState.delta = deltaSec;
            seekState.baseTime = videoEl.currentTime;
          }

          const target = Math.max(0, Math.min(videoEl.duration, seekState.baseTime + seekState.delta));
          const isFwd = seekState.delta > 0;
          showPreviewOsd(isFwd ? '⏩' : '⏪', `${isFwd ? '+' : ''}${Math.round(seekState.delta)}s`, `${Math.floor(target/60)}:${Math.floor(target%60).toString().padStart(2,'0')}`);

          seekState.timer = setTimeout(() => {
            seekState.timer = null;
            const finalTime = Math.max(0, Math.min(videoEl.duration, seekState.baseTime + seekState.delta));
            seekState.delta = 0;
            if (typeof videoEl.fastSeek === 'function') {
              try { videoEl.fastSeek(finalTime); return; } catch(e) {}
            }
            try { videoEl.currentTime = finalTime; } catch(e) {}
          }, 75);
        }

        videoEl.addEventListener('keydown', (e) => {
          if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            e.preventDefault();
            e.stopPropagation();
            const step = e.shiftKey ? 10 : (e.ctrlKey ? 30 : 5);
            smoothSeekPreview(e.key === 'ArrowLeft' ? -step : step);
          } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const newVol = e.key === 'ArrowUp' ? Math.min(1, videoEl.volume + 0.05) : Math.max(0, videoEl.volume - 0.05);
            videoEl.volume = newVol;
            showPreviewOsd(newVol > 0 ? '🔊' : '🔇', `${Math.round(newVol * 100)}%`);
          } else if (e.key === ' ') {
            e.preventDefault();
            if (videoEl.paused) videoEl.play(); else videoEl.pause();
          }
        });

        videoEl.onerror = () => {
          clearChildren(previewContainer);
          previewContainer.appendChild(el('div', { className: 'preview-error', text: t('formatNotSupportedPreview') }));
        };

        playBtn.textContent = t('stop');
        playBtn.classList.add('playing');
        currentlyPlayingCard = card;
        setTimeout(() => videoEl.focus(), 100);
      });

      const copyBtn = card.querySelector('.btn-copy');
      copyBtn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(item.url);
          const originalText = copyBtn.textContent;
          setTimeout(() => {
            copyBtn.textContent = originalText;
          }, 1500);
        } catch (e) {}
      });


      const downloadBtn = card.querySelector('.btn-download');

      // Core download function — threads controls parallel chunk count:
      //   threads=1 → Normal/Free (single stream)
      //   threads=4 → Fast (Free + sponsor click)
      //   threads=8 → Pro (max speed, no modal)
      async function startActualDownload(threads) {
        const numThreads = threads || 1;
        const urlLowerDl = item.url.toLowerCase();
        const isDashOnly = item.format === 'MPD' || urlLowerDl.includes('.mpd');

        const downloadId = btoa(item.url).replace(/[^a-zA-Z0-9]/g, '').slice(0, 24);
        const progressBox = card.querySelector('.progress-box');
        if (progressBox) progressBox.classList.add('hidden');
        downloadBtn.disabled = true;
        downloadBtn.textContent = t('downloading');

        const resetDownloadBtn = () => {
          downloadBtn.disabled = false;
          downloadBtn.textContent = t('download');
        };

        const pageReferer = item.initiator || activeTabUrl || null;
        const common = {
          downloadId,
          url: item.url,
          filename: safeDownloadName,
          pageUrl: activeTabUrl || null,
          pageReferer,
          tabId: activeTabId,
          threads: numThreads
        };

        let startMessage;
        if (isDashOnly) {
          startMessage = { type: 'START_DASH_DOWNLOAD', ...common };
        } else if (isHls) {
          startMessage = { type: 'START_HLS_DOWNLOAD', ...common };
        } else if (item.url.startsWith('blob:')) {
          startMessage = {
            type: 'START_BLOB_DOWNLOAD',
            downloadId: downloadId,
            tabId: activeTabId,
            url: item.url,
            filename: safeDownloadName
          };
        } else {
          // Use chunked downloader for all direct video files (MP4, WEBM, etc.)
          startMessage = { type: 'START_CHUNKED_DOWNLOAD', ...common };
        }

        try {
          const res = await chrome.runtime.sendMessage(startMessage);
          if (!res || res.status === 'blocked') { resetDownloadBtn(); return; }
          if (res.status === 'rate_limited') {
            resetDownloadBtn();
            showRateLimitModal(res.minutesRemaining);
            updateRateLimitStatus();
            return;
          }
          if (res.status === 'concurrent_limit' || res.ok === false) { resetDownloadBtn(); return; }
        } catch (e) {
          resetDownloadBtn();
          return;
        }

        if (!pollInterval) {
          pollInterval = setInterval(checkOngoingDownloads, 120);
        }
      }

      downloadBtn.addEventListener('click', async () => {
        // Pro users: skip modal, max speed (8 threads)
        if (isProActive) {
          await startActualDownload(8);
          return;
        }

        // Free users: show sponsor choice modal
        const modal = document.getElementById('sponsor-dl-modal');
        const btnFast = document.getElementById('btn-sponsor-fast');
        const btnNormal = document.getElementById('btn-sponsor-normal');
        if (!modal) { await startActualDownload(1); return; }

        modal.classList.remove('hidden');

        const cleanup = () => {
          modal.classList.add('hidden');
          btnFast.replaceWith(btnFast.cloneNode(true));
          btnNormal.replaceWith(btnNormal.cloneNode(true));
        };

        // Re-fetch fresh references after cloneNode
        const getFast = () => document.getElementById('btn-sponsor-fast');
        const getNormal = () => document.getElementById('btn-sponsor-normal');

        getFast().addEventListener('click', async () => {
          cleanup();
          // Open sponsor link in background tab (user doesn't lose focus)
          chrome.tabs.create({ url: 'https://asiafilm.org/4/9714681b46a69fbd0e4eae6c7542b0c9', active: false });
          await startActualDownload(4); // 4 parallel chunks = Fast
        }, { once: true });

        getNormal().addEventListener('click', async () => {
          cleanup();
          await startActualDownload(1); // 1 thread = Normal (slower)
        }, { once: true });
      });

      mediaListContainer.appendChild(card);
    });
  }

  // Render download history in settings
  async function renderHistory() {
    const data = await chrome.storage.local.get(['downloadHistory', 'autoDelete24h']);
    let history = data.downloadHistory || [];
    const autoDelete = data.autoDelete24h !== false;

    if (autoDelete) {
      const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
      history = history.filter(h => h.timestamp > oneDayAgo);
    }

    // Apply Free tier history limit (last 10)
    if (!isProActive && featureLimits.historyLimit > 0) {
      history = history.slice(0, featureLimits.historyLimit);
    }

    clearChildren(historyListContainer);

    if (history.length === 0) {
      historyListContainer.appendChild(el('div', {
        text: t('noHistory')
      }, null));
      const empty = historyListContainer.firstChild;
      empty.style.textAlign = 'center';
      empty.style.padding = '15px';
      empty.style.color = '#64748b';
      empty.style.fontSize = '0.75rem';
      return;
    }

    history.forEach(h => {
      const dateStr = new Date(h.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' ' + new Date(h.timestamp).toLocaleDateString();
      const div = document.createElement('div');
      div.className = 'history-item';
      const metaLeft = h.duration && h.duration !== 'N/A' ? `${h.size || ''} • ⏱️ ${h.duration}` : (h.size || '');
      div.appendChild(el('div', { className: 'history-title', title: h.filename || '', text: h.filename || '' }));
      div.appendChild(el('div', { className: 'history-meta' }, [
        el('span', { text: metaLeft }),
        el('span', { text: dateStr })
      ]));
      historyListContainer.appendChild(div);
    });

    // Show Pro upgrade prompt if history is limited
    if (!isProActive && history.length >= 10) {
      const upgradePrompt = document.createElement('div');
      upgradePrompt.className = 'history-upgrade-prompt';
      const p = el('p', { text: `⚡ ${t('upgradeUnlockFeature')}` });
      p.style.fontSize = '0.72rem';
      p.style.color = '#94a3b8';
      p.style.textAlign = 'center';
      p.style.margin = '8px 0';
      upgradePrompt.appendChild(p);
      historyListContainer.appendChild(upgradePrompt);
    }
  }

  function showEmptyState(customMessage) {
    clearChildren(mediaListContainer);
    emptyState.classList.remove('hidden');
    loadingState.classList.add('hidden');
    if (customMessage) {
      emptyState.querySelector('h3').textContent = customMessage;
      emptyState.querySelector('p').textContent = t('noVideosDesc');
    } else {
      emptyState.querySelector('h3').textContent = t('noVideosTitle');
      emptyState.querySelector('p').textContent = t('noVideosDesc');
    }
  }

  // Event Listeners
  searchInput.addEventListener('input', (e) => {
    currentSearch = e.target.value.toLowerCase().trim();
    renderList();
  });

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      tabButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
      renderList();
    });
  });

  btnRefresh.addEventListener('click', async () => {
    if (viewMain.classList.contains('hidden')) {
      openMainView();
    }
    await fetchMediaForTab({ refresh: true });
  });

  btnClear.addEventListener('click', async () => {
    await chrome.runtime.sendMessage({
      type: 'CLEAR_MEDIA',
      tabId: activeTabId
    });
    allMedia = [];
    renderList();
    if (activeTabId) {
      chrome.runtime.sendMessage({
        type: 'SET_TAB_BADGE_COUNT',
        tabId: activeTabId,
        count: 0
      }).catch(() => {});
    }
  });

  // Settings view toggle
  btnSettingsToggle.addEventListener('click', () => {
    openSettingsView();
  });

  btnBackMain.addEventListener('click', () => {
    openMainView();
  });

  const btnCopyEmail = document.getElementById('btn-copy-email');
  const CREDITS_EMAIL = 'bynrnworld@gmail.com';
  if (btnCopyEmail) {
    btnCopyEmail.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(CREDITS_EMAIL);
        btnCopyEmail.classList.add('copied');
        btnCopyEmail.title = t('emailCopied');
        setTimeout(() => {
          btnCopyEmail.classList.remove('copied');
          btnCopyEmail.title = t('copyEmail');
          btnCopyEmail.setAttribute('aria-label', t('copyEmail'));
        }, 1600);
      } catch (e) {
        const ta = document.createElement('textarea');
        ta.value = CREDITS_EMAIL;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        try {
          document.execCommand('copy');
          btnCopyEmail.classList.add('copied');
        } catch (err) {}
        document.body.removeChild(ta);
      }
    });
  }

  // Language switch
  selectLanguage.addEventListener('change', async (e) => {
    currentLang = e.target.value;
    await chrome.storage.local.set({ appLanguage: currentLang });
    applyLanguage();
  });

  // Auto-delete toggle
  chkAutoDelete.addEventListener('change', async (e) => {
    await chrome.storage.local.set({ autoDelete24h: e.target.checked });
    if (e.target.checked) {
      try {
        await chrome.runtime.sendMessage({ type: 'PURGE_HISTORY' });
      } catch (err) {}
    }
    renderHistory();
  });

  chkAskEachTime.addEventListener('change', async (e) => {
    const askEachTime = e.target.checked;
    if (askEachTime) {
      await chrome.storage.local.set({
        askSaveEachTime: true,
        useDefaultDownloadFolder: false,
        useCustomDirectory: false,
        customDirectoryName: ''
      });
      updateSelectedFolderLabel('');
    } else {
      await chrome.storage.local.set({ askSaveEachTime: false });
    }
    updateFolderOptionsVisibility();
  });

  if (btnPickFolder) {
    btnPickFolder.addEventListener('click', async () => {
      if (typeof window.showDirectoryPicker !== 'function') {
        alert(t('folderPickerUnsupported'));
        return;
      }
      try {
        const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
        await fvdSaveDirectoryHandle(handle);
        await chrome.storage.local.set({
          askSaveEachTime: false,
          useDefaultDownloadFolder: true,
          useCustomDirectory: true,
          customDirectoryName: handle.name
        });
        chkAskEachTime.checked = false;
        updateFolderOptionsVisibility();
        updateSelectedFolderLabel(handle.name);
      } catch (err) {
        if (err && err.name === 'AbortError') {
          const data = await chrome.storage.local.get(['useCustomDirectory']);
          if (data.useCustomDirectory !== true) {
            chkAskEachTime.checked = true;
            updateFolderOptionsVisibility();
          }
        } else {
          console.warn('[FVD] Folder picker:', err);
        }
      }
    });
  }

  // Clear history
  btnClearHistory.addEventListener('click', async () => {
    await chrome.storage.local.set({ downloadHistory: [] });
    renderHistory();
  });

  pollInterval = setInterval(checkOngoingDownloads, 120);

  if (canLoadMedia) {
    loadMedia();
  } else {
    loadingState.classList.add('hidden');
  }
});
