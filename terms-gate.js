/**
 * Flash Video Downloader - Terms of Service acceptance gate.
 *
 * One source of truth for the accepted terms version. Loaded by:
 *   - background.js / background-page.html (enforces the download gate)
 *   - popup.html (blocks the whole UI until accepted)
 *   - welcome.html (first-run notice)
 *
 * Enforcement model: installing or using the Software already means accepting
 * the Agreement (section 1 of terms.html), so this gate exists to make the
 * acceptance explicit and recorded. It is not a cryptographic control - the
 * code ships to the user's machine - so it deliberately fails OPEN when storage
 * is unavailable rather than locking a paying user out of their browser.
 */

// Bump this together with the "Version:" line in terms.html. Every user then has
// to accept again, which is what section 17 (Changes to this Agreement) promises.
const FVD_TERMS_VERSION = '1.0';
const FVD_TERMS_ACK_KEY = 'fvd_terms_ack';

/**
 * Pure helper: does a stored record satisfy the terms version we ship?
 * @param {object|null|undefined} record
 * @param {string} version
 * @returns {boolean}
 */
function termsRecordSatisfies(record, version) {
  if (!record || typeof record !== 'object') return false;
  if (record.accepted !== true) return false;
  if (typeof record.version !== 'string' || record.version !== version) return false;
  return true;
}

/**
 * Read the current acceptance state.
 * @returns {Promise<{accepted: boolean, version: string, acceptedVersion: string|null,
 *                    acceptedAt: string|null, storageError: boolean}>}
 */
async function getTermsState() {
  const fallback = {
    accepted: false,
    version: FVD_TERMS_VERSION,
    acceptedVersion: null,
    acceptedAt: null,
    storageError: false
  };

  try {
    const data = await chrome.storage.local.get([FVD_TERMS_ACK_KEY]);
    const record = data ? data[FVD_TERMS_ACK_KEY] : null;
    return {
      accepted: termsRecordSatisfies(record, FVD_TERMS_VERSION),
      version: FVD_TERMS_VERSION,
      acceptedVersion: record && typeof record.version === 'string' ? record.version : null,
      acceptedAt: record && typeof record.acceptedAt === 'string' ? record.acceptedAt : null,
      storageError: false
    };
  } catch (e) {
    console.warn('[FVD] Could not read the terms acknowledgement:', e);
    // Fail open: never lock a user out because storage misbehaved.
    return { ...fallback, accepted: true, storageError: true };
  }
}

/**
 * Record that the user accepted the current terms version.
 * @returns {Promise<{accepted: boolean, version: string, acceptedAt: string}>}
 */
async function acceptTerms() {
  const record = {
    accepted: true,
    version: FVD_TERMS_VERSION,
    acceptedAt: new Date().toISOString()
  };
  await chrome.storage.local.set({ [FVD_TERMS_ACK_KEY]: record });
  return record;
}

/**
 * Convenience wrapper for callers that only need the yes/no answer.
 * @returns {Promise<boolean>} true when the user still has to accept
 */
async function termsAcceptanceRequired() {
  const state = await getTermsState();
  return !state.accepted;
}
