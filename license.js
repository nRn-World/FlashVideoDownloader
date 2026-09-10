// Flash Video Downloader - License & Pro Feature Manager (v3.3.1)

const LICENSE_STORAGE_KEY = 'fvd_pro_license';
const PRO_STATUS_KEY = 'fvd_pro_status';
const DOWNLOAD_TIMESTAMPS_KEY = 'fvd_download_timestamps';

// Free tier: 1 download per rolling hour
const FREE_DOWNLOAD_LIMIT = 1;
const FREE_RATE_WINDOW_MS = 60 * 60 * 1000;

// Survives uninstall (Chrome wipes local storage). Paste your Worker URL after deploy.
// Example: 'https://fvd-rate-limit.YOURNAME.workers.dev/'
const FREE_RATE_LIMIT_API = '';

// Official lifetime key shown to Ko-fi buyers after payment
const OFFICIAL_LICENSE_KEY = 'FVD-PRO-K7M2-9QX4';

const VALID_LICENSE_KEYS = new Set([
  OFFICIAL_LICENSE_KEY
]);

function normalizeLicenseKey(key) {
  if (!key || typeof key !== 'string') return '';
  return key.trim().toUpperCase().replace(/\s+/g, '');
}

function validateLicenseFormat(key) {
  const normalized = normalizeLicenseKey(key);
  if (!normalized) {
    return { valid: false, error: 'Please enter a license key' };
  }

  if (!/^FVD-PRO-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(normalized)) {
    return { valid: false, error: 'Invalid format. Expected: FVD-PRO-XXXX-XXXX' };
  }

  if (!VALID_LICENSE_KEYS.has(normalized)) {
    return { valid: false, error: 'Invalid license key' };
  }

  return { valid: true, tier: 'pro', source: 'ko-fi' };
}

async function activateLicense(licenseKey) {
  const result = validateLicenseFormat(licenseKey);

  if (!result.valid) {
    return { success: false, error: result.error || 'Invalid license key' };
  }

  const normalizedKey = normalizeLicenseKey(licenseKey);
  await chrome.storage.local.set({
    [LICENSE_STORAGE_KEY]: normalizedKey,
    [PRO_STATUS_KEY]: {
      active: true,
      tier: result.tier,
      activatedAt: Date.now(),
      source: result.source
    }
  });

  return { success: true, tier: result.tier };
}

async function deactivateLicense() {
  await chrome.storage.local.remove([LICENSE_STORAGE_KEY, PRO_STATUS_KEY]);
  return { success: true };
}

async function isProUser() {
  try {
    const data = await chrome.storage.local.get([LICENSE_STORAGE_KEY, PRO_STATUS_KEY]);

    if (!data[LICENSE_STORAGE_KEY]) {
      return { isPro: false, tier: 'free' };
    }

    const result = validateLicenseFormat(data[LICENSE_STORAGE_KEY]);

    if (!result.valid) {
      await deactivateLicense();
      return { isPro: false, tier: 'free' };
    }

    return {
      isPro: true,
      tier: result.tier,
      license: data[LICENSE_STORAGE_KEY],
      status: data[PRO_STATUS_KEY]
    };
  } catch (e) {
    console.warn('[FVD License] Check failed:', e);
    return { isPro: false, tier: 'free' };
  }
}

async function getFeatureLimits() {
  const proStatus = await isProUser();

  if (proStatus.isPro) {
    return {
      tier: 'pro',
      concurrentDownloads: 3,
      historyLimit: -1,
      canExportHistory: false,
      canBatchDownload: false,
      canUseFilenameTemplates: false,
      canPickQuality: false,
      downloadsPerHour: -1
    };
  }

  return {
    tier: 'free',
    concurrentDownloads: 1,
    historyLimit: 10,
    canExportHistory: false,
    canBatchDownload: false,
    canUseFilenameTemplates: false,
    canPickQuality: false,
    downloadsPerHour: FREE_DOWNLOAD_LIMIT
  };
}

function remainingMinutes(nextAllowedAt, now) {
  return Math.max(1, Math.ceil((nextAllowedAt - now) / (60 * 1000)));
}

async function readActiveTimestamps() {
  const now = Date.now();
  const cutoff = now - FREE_RATE_WINDOW_MS;
  let localStamps = [];
  let syncStamps = [];
  try {
    const local = await chrome.storage.local.get([DOWNLOAD_TIMESTAMPS_KEY]);
    localStamps = local[DOWNLOAD_TIMESTAMPS_KEY] || [];
  } catch (e) {}
  try {
    if (chrome.storage.sync) {
      const sync = await chrome.storage.sync.get([DOWNLOAD_TIMESTAMPS_KEY]);
      syncStamps = sync[DOWNLOAD_TIMESTAMPS_KEY] || [];
    }
  } catch (e) {}
  const timestamps = [...new Set([...localStamps, ...syncStamps].filter((ts) => ts > cutoff))].sort();
  return { now, timestamps };
}

async function writeActiveTimestamps(timestamps) {
  await chrome.storage.local.set({ [DOWNLOAD_TIMESTAMPS_KEY]: timestamps });
  try {
    if (chrome.storage.sync) {
      await chrome.storage.sync.set({ [DOWNLOAD_TIMESTAMPS_KEY]: timestamps });
    }
  } catch (e) {}
}

function rateLimitDenied(now, timestamps) {
  const oldestTimestamp = Math.min(...timestamps);
  const nextAllowedAt = oldestTimestamp + FREE_RATE_WINDOW_MS;
  return {
    allowed: false,
    tier: 'free',
    reason: 'rate_limit',
    minutesRemaining: remainingMinutes(nextAllowedAt, now),
    nextAllowedAt
  };
}

async function consumeRemoteFreeSlot() {
  const url = (FREE_RATE_LIMIT_API || '').trim();
  if (!url) return { skipped: true };

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal
    });
    clearTimeout(timer);
    if (!res.ok) return { skipped: true };
    const data = await res.json();
    if (data && data.allowed === false) {
      return {
        skipped: false,
        allowed: false,
        minutesRemaining: data.minutesRemaining || 60
      };
    }
    return { skipped: false, allowed: true };
  } catch (e) {
    return { skipped: true };
  }
}

// UI-only check. Does not consume a slot.
async function canStartDownload() {
  try {
    const proStatus = await isProUser();
    if (proStatus.isPro) {
      return { allowed: true, tier: 'pro' };
    }

    const { now, timestamps } = await readActiveTimestamps();
    await writeActiveTimestamps(timestamps);

    if (timestamps.length >= FREE_DOWNLOAD_LIMIT) {
      return rateLimitDenied(now, timestamps);
    }

    return { allowed: true, tier: 'free' };
  } catch (e) {
    console.warn('[FVD License] Rate limit check failed:', e);
    return {
      allowed: false,
      tier: 'free',
      reason: 'rate_limit',
      minutesRemaining: 60
    };
  }
}

let consumeSlotChain = Promise.resolve();

async function consumeFreeDownloadSlotInner() {
  const proStatus = await isProUser();
  if (proStatus.isPro) {
    return { allowed: true, tier: 'pro' };
  }

  const { now, timestamps } = await readActiveTimestamps();

  if (timestamps.length >= FREE_DOWNLOAD_LIMIT) {
    await writeActiveTimestamps(timestamps);
    return rateLimitDenied(now, timestamps);
  }

  const remote = await consumeRemoteFreeSlot();
  if (!remote.skipped && remote.allowed === false) {
    const blockedAt = now - 1000;
    await writeActiveTimestamps([blockedAt]);
    return {
      allowed: false,
      tier: 'free',
      reason: 'rate_limit',
      minutesRemaining: remote.minutesRemaining || 60,
      nextAllowedAt: now + (remote.minutesRemaining || 60) * 60 * 1000
    };
  }

  timestamps.push(now);
  await writeActiveTimestamps(timestamps);
  return { allowed: true, tier: 'free' };
}

// Consume the Free hourly slot when a download actually starts.
async function consumeFreeDownloadSlot() {
  const run = consumeSlotChain.then(() => consumeFreeDownloadSlotInner(), () => consumeFreeDownloadSlotInner());
  consumeSlotChain = run.catch(() => {});
  return run;
}

async function canUseFeature(featureName) {
  const limits = await getFeatureLimits();

  switch (featureName) {
    case 'concurrent_downloads':
      return limits.concurrentDownloads > 1;
    case 'batch_download':
      return limits.canBatchDownload;
    case 'export_history':
      return limits.canExportHistory;
    case 'filename_templates':
      return limits.canUseFilenameTemplates;
    case 'quality_picker':
      return limits.canPickQuality;
    case 'unlimited_history':
      return limits.historyLimit === -1;
    default:
      return false;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    validateLicenseFormat,
    activateLicense,
    deactivateLicense,
    isProUser,
    getFeatureLimits,
    canUseFeature,
    canStartDownload,
    consumeFreeDownloadSlot,
    OFFICIAL_LICENSE_KEY
  };
}
