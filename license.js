// Flash Video Downloader - License & Pro Feature Manager (v3.5.0)

const LICENSE_STORAGE_KEY = 'fvd_pro_license';
const PRO_STATUS_KEY = 'fvd_pro_status';
const DOWNLOAD_TIMESTAMPS_KEY = 'fvd_download_timestamps';

// Free tier: 1 download per rolling window. Change FREE_RATE_WINDOW_HOURS and the
// whole product follows: the UI copy reads {hours} from this value, and both the
// popup and background.js use the derived constants below.
const FREE_DOWNLOAD_LIMIT = 1;
const FREE_RATE_WINDOW_HOURS = 2;
const FREE_RATE_WINDOW_MINUTES = FREE_RATE_WINDOW_HOURS * 60;
const FREE_RATE_WINDOW_MS = FREE_RATE_WINDOW_HOURS * 60 * 60 * 1000;

// Survives uninstall (Chrome wipes local storage). Paste your Worker URL after deploy.
// Example: 'https://fvd-rate-limit.YOURNAME.workers.dev/'
const FREE_RATE_LIMIT_API = '';

// Server-side license check (workers/fvd-license.js). Paste the Worker URL after deploy.
// While empty, licenses are checked locally exactly as before (no behaviour change).
const LICENSE_API = 'https://fvd-license.bynrnworld.workers.dev/';
const PRO_VERIFIED_AT_KEY = 'fvd_pro_verified_at';
const PRO_RECHECK_MS = 24 * 60 * 60 * 1000;
// A paid user whose server check cannot complete (offline, Worker down) keeps Pro this long.
const PRO_OFFLINE_GRACE_MS = 60 * 24 * 60 * 60 * 1000;

// Asks the server whether a key digest is valid.
// Returns true/false only on a definite answer; null if the server could not be reached.
async function verifyDigestRemote(digest) {
  const url = (LICENSE_API || '').trim();
  if (!url) return null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ digest }),
      signal: controller.signal
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json();
    return data && typeof data.valid === 'boolean' ? data.valid : null;
  } catch (e) {
    return null;
  }
}

// SHA-256 hashes of valid keys (plaintext exists only on Ko-fi after payment).
// Legacy fallback: once LICENSE_API is live and users have migrated, empty this set in a later release.
const LICENSE_KEY_HASHES = new Set([
  '2292da59ca854fd61bb321141d8cbe2092a514d48fafad21e936a70ac7394dec'
]);

function normalizeLicenseKey(key) {
  if (!key || typeof key !== 'string') return '';
  return key.trim().toUpperCase().replace(/\s+/g, '');
}

function looksLikeLicenseKey(key) {
  return /^FVD-PRO(?:-[A-Z0-9]{4}){2,4}$/.test(key);
}

async function hashLicenseKey(normalizedKey) {
  const payload = 'FVD-LICENSE-v1|' + normalizedKey;
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function validateLicenseFormat(key) {
  const normalized = normalizeLicenseKey(key);
  if (!normalized) {
    return { valid: false, error: 'Please enter a license key' };
  }

  if (!looksLikeLicenseKey(normalized)) {
    return { valid: false, error: 'Invalid format. Expected: FVD-PRO-XXXX-XXXX-XXXX-XXXX' };
  }

  const digest = await hashLicenseKey(normalized);
  if ((LICENSE_API || '').trim()) {
    const remote = await verifyDigestRemote(digest);
    if (remote === null) {
      return { valid: false, error: 'Could not reach the license server. Check your connection and try again.' };
    }
    if (!remote) return { valid: false, error: 'Invalid license key' };
  } else if (!LICENSE_KEY_HASHES.has(digest)) {
    return { valid: false, error: 'Invalid license key' };
  }

  return { valid: true, tier: 'pro', source: 'ko-fi', digest };
}

async function activateLicense(licenseKey) {
  const result = await validateLicenseFormat(licenseKey);

  if (!result.valid) {
    return { success: false, error: result.error || 'Invalid license key' };
  }

  await chrome.storage.local.set({
    [LICENSE_STORAGE_KEY]: result.digest,
    [PRO_VERIFIED_AT_KEY]: (LICENSE_API || '').trim() ? Date.now() : 0,
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
  await chrome.storage.local.remove([LICENSE_STORAGE_KEY, PRO_STATUS_KEY, PRO_VERIFIED_AT_KEY]);
  return { success: true };
}

async function isProUser() {
  try {
    const data = await chrome.storage.local.get([LICENSE_STORAGE_KEY, PRO_STATUS_KEY, PRO_VERIFIED_AT_KEY]);

    const stored = data[LICENSE_STORAGE_KEY];
    if (!stored) {
      return { isPro: false, tier: 'free' };
    }

    const digest = looksLikeLicenseKey(stored) && !LICENSE_KEY_HASHES.has(stored)
      ? await hashLicenseKey(normalizeLicenseKey(stored))
      : stored;
    const proResult = { isPro: true, tier: 'pro', status: data[PRO_STATUS_KEY] };

    if ((LICENSE_API || '').trim()) {
      const now = Date.now();
      const verifiedAt = Number(data[PRO_VERIFIED_AT_KEY]) || 0;
      if (verifiedAt && now - verifiedAt < PRO_RECHECK_MS) return proResult;

      const remote = await verifyDigestRemote(digest);
      if (remote === true) {
        await chrome.storage.local.set({ [LICENSE_STORAGE_KEY]: digest, [PRO_VERIFIED_AT_KEY]: now });
        return proResult;
      }
      if (remote === false) {
        await deactivateLicense();
        return { isPro: false, tier: 'free' };
      }
      // Server unreachable: never take Pro away from someone who may have paid.
      // Verified users get a long grace period; users from before the server existed
      // are trusted while their key is in the bundled legacy list.
      if (verifiedAt ? now - verifiedAt < PRO_OFFLINE_GRACE_MS : LICENSE_KEY_HASHES.has(digest)) {
        return proResult;
      }
      return { isPro: false, tier: 'free' };
    }

    if (!LICENSE_KEY_HASHES.has(digest)) {
      await deactivateLicense();
      return { isPro: false, tier: 'free' };
    }

    return proResult;
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
        minutesRemaining: data.minutesRemaining || FREE_RATE_WINDOW_MINUTES
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
      minutesRemaining: FREE_RATE_WINDOW_MINUTES
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
      minutesRemaining: remote.minutesRemaining || FREE_RATE_WINDOW_MINUTES,
      nextAllowedAt: now + (remote.minutesRemaining || FREE_RATE_WINDOW_MINUTES) * 60 * 1000
    };
  }

  timestamps.push(now);
  await writeActiveTimestamps(timestamps);
  return { allowed: true, tier: 'free' };
}

// Consume the Free window slot when a download actually starts.
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
    consumeFreeDownloadSlot
  };
}
