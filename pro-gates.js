// Flash Video Downloader - Pro Feature Gates (v3.3.0)
// Enforces Free vs Pro tier limits and shows upgrade prompts

const PRO_FEATURES = {
  // Free tier: 1 active download, Pro: 3+ concurrent
  MAX_CONCURRENT_DOWNLOADS_FREE: 1,
  MAX_CONCURRENT_DOWNLOADS_PRO: 3,
  
  // Free tier: last 10 history items, Pro: unlimited (capped at 200 for storage)
  MAX_HISTORY_ITEMS_FREE: 10,
  MAX_HISTORY_ITEMS_PRO: 200,
  
  // Pro-only features
  BATCH_DOWNLOAD_ALL: 'batch_download',
  DOWNLOAD_QUEUE: 'download_queue',
  HISTORY_EXPORT: 'history_export',
  FILENAME_TEMPLATE: 'filename_template',
  QUALITY_PICKER: 'quality_picker',
  FOLDER_MEMORY: 'folder_memory'
};

let cachedProStatus = null;

async function refreshProStatus() {
  if (typeof checkLicenseStatus === 'function') {
    const status = await checkLicenseStatus();
    cachedProStatus = status.isPro;
    return status.isPro;
  }
  return false;
}

async function isUserPro() {
  if (cachedProStatus !== null) return cachedProStatus;
  return await refreshProStatus();
}

async function canStartNewDownload(activeDownloadCount) {
  const isPro = await isUserPro();
  const limit = isPro ? PRO_FEATURES.MAX_CONCURRENT_DOWNLOADS_PRO : PRO_FEATURES.MAX_CONCURRENT_DOWNLOADS_FREE;
  
  if (activeDownloadCount >= limit) {
    return {
      allowed: false,
      limit: limit,
      isPro: isPro,
      reason: isPro 
        ? `You have reached the Pro limit of ${limit} concurrent downloads.`
        : `Free users can download 1 video at a time. Upgrade to Pro for ${PRO_FEATURES.MAX_CONCURRENT_DOWNLOADS_PRO} concurrent downloads!`
    };
  }
  
  return { allowed: true, limit: limit, isPro: isPro };
}

async function canAccessFeature(featureName) {
  const isPro = await isUserPro();
  
  // All Pro features require Pro license
  const proOnlyFeatures = [
    PRO_FEATURES.BATCH_DOWNLOAD_ALL,
    PRO_FEATURES.DOWNLOAD_QUEUE,
    PRO_FEATURES.HISTORY_EXPORT,
    PRO_FEATURES.FILENAME_TEMPLATE,
    PRO_FEATURES.QUALITY_PICKER,
    PRO_FEATURES.FOLDER_MEMORY
  ];
  
  if (proOnlyFeatures.includes(featureName) && !isPro) {
    return {
      allowed: false,
      isPro: false,
      featureName: featureName,
      reason: 'This is a Pro feature. Upgrade to unlock!'
    };
  }
  
  return { allowed: true, isPro: isPro };
}

async function getHistoryLimit() {
  const isPro = await isUserPro();
  return isPro ? PRO_FEATURES.MAX_HISTORY_ITEMS_PRO : PRO_FEATURES.MAX_HISTORY_ITEMS_FREE;
}

async function enforceHistoryLimit(historyArray) {
  const limit = await getHistoryLimit();
  if (historyArray.length > limit) {
    return historyArray.slice(0, limit);
  }
  return historyArray;
}

function showUpgradeModal(reason, featureName) {
  // Create and show upgrade modal
  const existingModal = document.getElementById('upgrade-modal');
  if (existingModal) {
    existingModal.remove();
  }
  
  const modal = document.createElement('div');
  modal.id = 'upgrade-modal';
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-box upgrade-modal-box">
      <div class="upgrade-icon">⭐</div>
      <h3 class="upgrade-title" id="upgrade-modal-title">Upgrade to Pro</h3>
      <p class="upgrade-reason" id="upgrade-modal-reason">${escapeHtml(reason || 'Unlock all Pro features')}</p>
      
      <div class="upgrade-features-list">
        <div class="upgrade-feature-item">✓ 3+ concurrent downloads</div>
        <div class="upgrade-feature-item">✓ Download all detected videos</div>
        <div class="upgrade-feature-item">✓ Unlimited history + export</div>
        <div class="upgrade-feature-item">✓ Custom filename templates</div>
        <div class="upgrade-feature-item">✓ HLS quality picker</div>
      </div>
      
      <div class="upgrade-price">
        <span class="price-amount">$5.99</span>
        <span class="price-label">One-time payment</span>
      </div>
      
      <div class="modal-actions">
        <button id="btn-upgrade-close" class="btn-modal btn-modal-cancel">Maybe later</button>
        <button id="btn-upgrade-pro" class="btn-modal btn-modal-primary">Upgrade to Pro</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  const btnClose = document.getElementById('btn-upgrade-close');
  const btnUpgrade = document.getElementById('btn-upgrade-pro');
  
  const closeModal = () => {
    modal.remove();
  };
  
  btnClose.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });
  
  btnUpgrade.addEventListener('click', () => {
    closeModal();
    // Open settings to Pro tab
    const event = new CustomEvent('fvd-open-pro-settings');
    document.dispatchEvent(event);
  });
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

// Listen for license changes
if (typeof chrome !== 'undefined' && chrome.runtime) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'LICENSE_STATUS_CHANGED') {
      refreshProStatus().then(() => {
        // Emit event for UI to update
        if (typeof document !== 'undefined') {
          const event = new CustomEvent('fvd-license-changed');
          document.dispatchEvent(event);
        }
      });
    }
  });
}
