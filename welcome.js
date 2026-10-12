/**
 * welcome.html - first-run legal notice.
 *
 * Thin DOM wrapper around terms-gate.js, which owns the accepted terms version
 * and the storage record. The same record unlocks the popup, so accepting here
 * means the user is not asked again when they open the extension.
 */

function setStatus(text, tone) {
  const status = document.getElementById('terms-status');
  if (!status) return;
  status.textContent = text;
  status.className = tone ? `terms-status ${tone}` : 'terms-status';
  status.hidden = !text;
}

function markAccepted(ack) {
  const btn = document.getElementById('btn-accept-terms');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Terms accepted ✓';
  }
  const when = ack && ack.acceptedAt ? new Date(ack.acceptedAt).toLocaleDateString() : '';
  setStatus(when ? `You accepted the Terms of Service on ${when}.` : 'You have accepted the Terms of Service.', 'ok');
}

document.addEventListener('DOMContentLoaded', async () => {
  const btn = document.getElementById('btn-accept-terms');
  const state = await getTermsState();

  // Only claim acceptance when a real record exists. The gate itself fails open
  // so a storage error can never lock anyone out, but that must not be shown here
  // as consent the user never gave.
  if (state.accepted && !state.storageError) {
    markAccepted({ acceptedAt: state.acceptedAt });
  }

  if (!btn) return;

  btn.addEventListener('click', async () => {
    try {
      const record = await acceptTerms();
      markAccepted(record);
    } catch (e) {
      // Fail open, matching the gate itself: never block a user on storage errors.
      setStatus('Could not save your confirmation locally. You can still continue - using the extension means you accept the Terms.', 'warn');
    }
  });
});
