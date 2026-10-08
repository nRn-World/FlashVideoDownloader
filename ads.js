// Flash Video Downloader - In-extension ad slots (v2)
// Free users see a small "Sponsored" banner in the popup. Pro users never see it.
//
// Revenue comes from YOUR affiliate links (see AFFILIATE_OFFERS below).
// No third-party ad network, no remote code, no network request from the
// extension itself: the banner is rendered locally and a click simply opens
// the affiliate page in a new tab. Impressions and clicks are counted locally.
//
// Chrome Web Store rules we follow:
//  - ads are labelled "Sponsored" and never impersonate system messages
//  - no forced clicks
//  - ads can be removed by uninstalling, or instantly by going Pro

(function () {
  'use strict';

  const AD_ROTATION_KEY = 'fvd_ad_rotation';
  const AD_STATS_KEY = 'fvd_ad_stats';

  // =====================================================================
  // AFFILIATE PARTNERS — paste your own affiliate links here.
  //
  // An offer is shown only when `enabled` is true AND `url` starts with
  // "https://". Leave `url: ''` to hide that offer until you have a link.
  // Sign up for a program, copy your personal tracking link, and paste it.
  // =====================================================================
  const AFFILIATE_OFFERS = [
    {
      id: 'vpn',
      enabled: true,
      affiliate: true,
      icon: '🔒',
      titleKey: 'affVpnTitle',
      textKey: 'affVpnText',
      ctaKey: 'affVpnCta',
      url: 'https://asiafilm.org/4/9714681b46a69fbd0e4eae6c7542b0c9' // Adsterra Smartlink (Pay-Per-Click)
    },
    {
      id: 'cloud',
      enabled: true,
      affiliate: true,
      icon: '☁️',
      titleKey: 'affCloudTitle',
      textKey: 'affCloudText',
      ctaKey: 'affCloudCta',
      url: 'https://asiafilm.org/4/9714681b46a69fbd0e4eae6c7542b0c9' // Adsterra Smartlink (Pay-Per-Click)
    },
    {
      id: 'tools',
      enabled: true,
      affiliate: true,
      icon: '🎬',
      titleKey: 'affToolsTitle',
      textKey: 'affToolsText',
      ctaKey: 'affToolsCta',
      url: 'https://asiafilm.org/4/9714681b46a69fbd0e4eae6c7542b0c9' // Adsterra Smartlink (Pay-Per-Click)
    }
  ];

  // Built-in fallback banners, used only while no affiliate link is configured
  // (so the slot never looks broken). They promote our own product, which is
  // always allowed under the Chrome Web Store ads policy.
  const HOUSE_ADS = [
    {
      id: 'pro',
      icon: '⚡',
      titleKey: 'adProTitle',
      textKey: 'adProText',
      ctaKey: 'buyPro',
      url: 'https://ko-fi.com/s/72a48b875e'
    },
    {
      id: 'tip',
      icon: '☕',
      titleKey: 'adTipTitle',
      textKey: 'adTipText',
      ctaKey: 'adTipCta',
      url: 'https://ko-fi.com/nrnworld'
    },
    {
      id: 'review',
      icon: '⭐',
      titleKey: 'adReviewTitle',
      textKey: 'adReviewText',
      ctaKey: 'reviewPromptRate',
      url: 'https://chromewebstore.google.com/detail/blbajmihakahbldejkginpccillhakdg/reviews'
    }
  ];

  function configuredAffiliates() {
    return AFFILIATE_OFFERS.filter(
      (offer) => offer.enabled && typeof offer.url === 'string' && /^https:\/\//i.test(offer.url)
    );
  }

  // The rotating set: configured affiliate offers, or the house ads as fallback.
  function catalog() {
    const affiliates = configuredAffiliates();
    return affiliates.length ? affiliates : HOUSE_ADS;
  }

  // Rotation + dismissal are per popup session so the banner does not flicker while open.
  let sessionAd = null;
  let dismissed = false;

  function storageLocal() {
    try {
      return (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) || null;
    } catch (e) {
      return null;
    }
  }

  async function readRotation() {
    const store = storageLocal();
    if (!store) return 0;
    try {
      const data = await store.get([AD_ROTATION_KEY]);
      const value = data && data[AD_ROTATION_KEY];
      return Number.isFinite(value) ? value : 0;
    } catch (e) {
      return 0;
    }
  }

  async function bumpRotation(index, length) {
    const store = storageLocal();
    if (!store || !length) return;
    try {
      await store.set({ [AD_ROTATION_KEY]: (index + 1) % length });
    } catch (e) {}
  }

  async function recordStat(kind, id) {
    const store = storageLocal();
    if (!store || !id) return;
    try {
      const data = await store.get([AD_STATS_KEY]);
      const stats = (data && data[AD_STATS_KEY]) || { impressions: {}, clicks: {}, lastShownAt: 0, lastClickAt: 0 };
      stats.impressions = stats.impressions || {};
      stats.clicks = stats.clicks || {};
      if (kind === 'impression') {
        stats.impressions[id] = (stats.impressions[id] || 0) + 1;
        stats.lastShownAt = Date.now();
      } else if (kind === 'click') {
        stats.clicks[id] = (stats.clicks[id] || 0) + 1;
        stats.lastClickAt = Date.now();
      }
      await store.set({ [AD_STATS_KEY]: stats });
    } catch (e) {}
  }

  async function getStats() {
    const store = storageLocal();
    const empty = { impressions: {}, clicks: {}, lastShownAt: 0, lastClickAt: 0 };
    if (!store) return empty;
    try {
      const data = await store.get([AD_STATS_KEY]);
      return (data && data[AD_STATS_KEY]) || empty;
    } catch (e) {
      return empty;
    }
  }

  async function pickAd() {
    if (sessionAd) return sessionAd;
    const offers = catalog();
    const index = await readRotation();
    sessionAd = offers[index % offers.length];
    bumpRotation(index, offers.length); // next popup open rotates to the next offer
    return sessionAd;
  }

  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text != null) element.textContent = text;
    return element;
  }

  function clear(container) {
    if (!container) return;
    while (container.firstChild) container.removeChild(container.firstChild);
  }

  function hide(container) {
    if (!container) return;
    container.classList.add('hidden');
    clear(container);
  }

  function buildCard(ad, t) {
    const card = node('div', 'ad-card');

    const icon = node('div', 'ad-icon', ad.icon);
    icon.setAttribute('aria-hidden', 'true');
    card.appendChild(icon);

    const body = node('div', 'ad-body');
    // Affiliate banners get an explicit, non-misleading label.
    body.appendChild(node('span', 'ad-label', t(ad.affiliate ? 'adAffiliateLabel' : 'adLabel')));
    body.appendChild(node('h4', 'ad-title', t(ad.titleKey)));
    body.appendChild(node('p', 'ad-text', t(ad.textKey)));

    const cta = node('a', 'ad-cta', t(ad.ctaKey));
    cta.href = ad.url;
    cta.target = '_blank';
    cta.rel = 'noopener noreferrer';
    cta.addEventListener('click', () => recordStat('click', ad.id));
    body.appendChild(cta);

    card.appendChild(body);
    return card;
  }

  // render(container, { isPro, t }) — builds the ad for Free users, hides it for Pro.
  async function render(container, options) {
    const opts = options || {};

    if (opts.isPro) {
      hide(container);
      return;
    }
    if (!container || dismissed) {
      hide(container);
      return;
    }

    const t = typeof opts.t === 'function' ? opts.t : (key) => key;
    const ad = await pickAd();

    // State may have changed while awaiting storage (e.g. license activated).
    if (!ad || dismissed || opts.isPro) {
      hide(container);
      return;
    }

    clear(container);

    const card = buildCard(ad, t);

    container.appendChild(card);
    container.appendChild(node('p', 'ad-note', t('adRemoveWithPro')));
    container.classList.remove('hidden');

    recordStat('impression', ad.id);
  }

  const api = {
    render,
    hide,
    getStats,
    catalog,
    affiliates: AFFILIATE_OFFERS,
    houseAds: HOUSE_ADS
  };

  if (typeof window !== 'undefined') window.FVDAds = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
