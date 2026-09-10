// Flash Video Downloader - License & Pro Feature Manager (v3.3.0)
// Client-side license validation (no server calls by default)

const LICENSE_STORAGE_KEY = 'fvd_pro_license';
const PRO_STATUS_KEY = 'fvd_pro_status';

// Test license key for development/demo (always valid)
const DEV_LICENSE_KEY = 'FVD-PRO-TEST-0000';

// Simple client-side validation (format check only)
// For production: could call external API for server-side validation
function validateLicenseFormat(key) {
  if (!key || typeof key !== 'string') return false;
  
  // Test key is always valid
  if (key.trim().toUpperCase() === DEV_LICENSE_KEY) {
    return { valid: true, tier: 'pro', source: 'dev-test' };
  }
  
  // Expected format: FVD-PRO-XXXX-XXXX (16 chars + 3 hyphens = 19 total)
  const pattern = /^FVD-PRO-[A-Z0-9]{4}-[A-Z0-9]{4}$/i;
  if (!pattern.test(key.trim().toUpperCase())) {
    return { valid: false, error: 'Invalid format. Expected: FVD-PRO-XXXX-XXXX' };
  }
  
  // Basic checksum validation (simple example - in production use stronger validation)
  const parts = key.trim().toUpperCase().split('-');
  const segment1 = parts[2];
  const segment2 = parts[3];
  
  // Simple validation: segment2 should be alphanumeric
  if (!/^[A-Z0-9]{4}$/.test(segment2)) {
    return { valid: false, error: 'Invalid license key' };
  }
  
  // For this implementation, any well-formed key is valid
  // In production: call external validation API here
  return { valid: true, tier: 'pro', source: 'user-entered' };
}

// Activate Pro license
async function activateLicense(licenseKey) {
  const result = validateLicenseFormat(licenseKey);
  
  if (!result.valid) {
    return { success: false, error: result.error || 'Invalid license key' };
  }
  
  // Store license in chrome.storage.local
  const normalizedKey = licenseKey.trim().toUpperCase();
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

// Deactivate Pro license
async function deactivateLicense() {
  await chrome.storage.local.remove([LICENSE_STORAGE_KEY, PRO_STATUS_KEY]);
  return { success: true };
}

// Check if user has Pro
async function isProUser() {
  try {
    const data = await chrome.storage.local.get([LICENSE_STORAGE_KEY, PRO_STATUS_KEY]);
    
    // Check if license exists and is valid
    if (!data[LICENSE_STORAGE_KEY]) {
      return { isPro: false, tier: 'free' };
    }
    
    // Re-validate stored license
    const result = validateLicenseFormat(data[LICENSE_STORAGE_KEY]);
    
    if (!result.valid) {
      // Invalid stored license - clear it
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

// Get Pro feature limits
async function getFeatureLimits() {
  const proStatus = await isProUser();
  
  if (proStatus.isPro) {
    return {
      tier: 'pro',
      concurrentDownloads: 3,
      historyLimit: -1, // unlimited
      canExportHistory: true,
      canBatchDownload: true,
      canUseFilenameTemplates: true,
      canPickQuality: true
    };
  }
  
  // Free tier limits
  return {
    tier: 'free',
    concurrentDownloads: 1,
    historyLimit: 10, // last 10 downloads
    canExportHistory: false,
    canBatchDownload: false,
    canUseFilenameTemplates: false,
    canPickQuality: false
  };
}

// Check if feature is available
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

// Export functions for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    validateLicenseFormat,
    activateLicense,
    deactivateLicense,
    isProUser,
    getFeatureLimits,
    canUseFeature,
    DEV_LICENSE_KEY
  };
}
