// Flash Video Downloader - License Management (v3.3.0)
// Client-side license validation and Pro feature unlock

const LICENSE_STORAGE_KEY = 'fvd_pro_license';
const LICENSE_STATUS_KEY = 'fvd_pro_status';

// Test/dev license key for demo purposes (remove or change before production)
const DEV_LICENSE_KEY = 'FVD-PRO-TEST-0000';

/**
 * License format: FVD-PRO-XXXX-YYYY
 * Where XXXX-YYYY is a validation checksum
 * In production, this would validate against a public endpoint
 */

function validateLicenseFormat(key) {
  if (!key || typeof key !== 'string') return false;
  const normalized = key.trim().toUpperCase();
  
  // Dev/test key
  if (normalized === DEV_LICENSE_KEY) return true;
  
  // Production format: FVD-PRO-XXXX-YYYY (4 segments, 4 chars each after PRO)
  const pattern = /^FVD-PRO-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
  if (!pattern.test(normalized)) return false;
  
  // Basic checksum validation (simple XOR for demo - replace with real signature verification)
  const parts = normalized.split('-');
  const segment1 = parts[2]; // XXXX
  const segment2 = parts[3]; // YYYY
  
  // Simple validation: last char of segment2 should be XOR of first chars of both segments
  // This is just a placeholder - in production, verify via backend API
  const checkChar = segment2.charAt(3);
  const expected = String.fromCharCode(
    segment1.charCodeAt(0) ^ segment2.charCodeAt(0)
  );
  
  // For now, accept any properly formatted key
  // TODO: Replace with API call to verify endpoint
  return true;
}

async function generateSimpleLicenseKey(email) {
  // Placeholder for license generation (server-side in production)
  // This is just for demonstration
  const hash = await simpleHash(email);
  const seg1 = hash.substring(0, 4).toUpperCase();
  const seg2 = hash.substring(4, 8).toUpperCase();
  return `FVD-PRO-${seg1}-${seg2}`;
}

async function simpleHash(str) {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 8);
}

async function activateLicense(licenseKey) {
  const normalized = licenseKey.trim().toUpperCase();
  
  if (!validateLicenseFormat(normalized)) {
    return {
      success: false,
      error: 'Invalid license key format'
    };
  }
  
  // In production: verify with backend API
  // For now: accept valid format + dev key
  const isValid = normalized === DEV_LICENSE_KEY || validateLicenseFormat(normalized);
  
  if (isValid) {
    await chrome.storage.local.set({
      [LICENSE_STORAGE_KEY]: normalized,
      [LICENSE_STATUS_KEY]: {
        active: true,
        activatedAt: Date.now(),
        key: normalized
      }
    });
    
    // Also store in sync storage for cross-device (if user wants)
    try {
      await chrome.storage.sync.set({
        [LICENSE_STORAGE_KEY]: normalized
      });
    } catch (e) {
      // Sync storage might be disabled, that's okay
    }
    
    return {
      success: true,
      message: 'Pro license activated successfully!'
    };
  }
  
  return {
    success: false,
    error: 'License key could not be verified. Please check and try again.'
  };
}

async function deactivateLicense() {
  await chrome.storage.local.remove([LICENSE_STORAGE_KEY, LICENSE_STATUS_KEY]);
  try {
    await chrome.storage.sync.remove([LICENSE_STORAGE_KEY]);
  } catch (e) {}
  
  return { success: true };
}

async function checkLicenseStatus() {
  try {
    // Check local first
    let data = await chrome.storage.local.get([LICENSE_STATUS_KEY, LICENSE_STORAGE_KEY]);
    
    // If not in local, check sync
    if (!data[LICENSE_STATUS_KEY] && !data[LICENSE_STORAGE_KEY]) {
      try {
        const syncData = await chrome.storage.sync.get([LICENSE_STORAGE_KEY]);
        if (syncData[LICENSE_STORAGE_KEY]) {
          // Found in sync, validate and store locally
          const result = await activateLicense(syncData[LICENSE_STORAGE_KEY]);
          if (result.success) {
            data = await chrome.storage.local.get([LICENSE_STATUS_KEY]);
          }
        }
      } catch (e) {}
    }
    
    if (data[LICENSE_STATUS_KEY] && data[LICENSE_STATUS_KEY].active) {
      return {
        isPro: true,
        status: data[LICENSE_STATUS_KEY]
      };
    }
    
    return {
      isPro: false,
      status: null
    };
  } catch (e) {
    return {
      isPro: false,
      status: null
    };
  }
}

async function isProUser() {
  const status = await checkLicenseStatus();
  return status.isPro;
}

// Listen for storage changes to update Pro status across contexts
if (typeof chrome !== 'undefined' && chrome.storage) {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (changes[LICENSE_STATUS_KEY] || changes[LICENSE_STORAGE_KEY]) {
      // Notify all contexts that license status changed
      chrome.runtime.sendMessage({
        type: 'LICENSE_STATUS_CHANGED'
      }).catch(() => {});
    }
  });
}
