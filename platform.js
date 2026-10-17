// Flash Video Downloader - platform capabilities
//
// Firefox for Android ships no downloads API (Mozilla bug 1538348), so the
// extension cannot hand a finished file to the browser's download manager there.
// Every such difference is decided from the single capability check below, so
// Chrome and Firefox desktop keep the behaviour they ship today, and Android
// takes the only path it can finish: a visible anchor with [download].
//
// Loaded by background.js (importScripts), popup.html and offscreen.html.

var FVD_HAS_DOWNLOADS_API = (function () {
  try {
    return typeof chrome !== 'undefined' &&
      !!chrome.downloads &&
      typeof chrome.downloads.download === 'function';
  } catch (e) {
    return false;
  }
})();

// The download engine runs in the hidden iframe of the Firefox background page
// (desktop, where the downloads API exists) or in a real tab (Android, where the
// user has to be able to reach the file). Only one of them may answer engine
// messages, otherwise every download would run twice.
var FVD_ENGINE_IN_FRAME = (function () {
  try {
    if (typeof window === 'undefined') return false;
    // A real browser always exposes window.top, so a missing one means this is not a
    // frame at all.
    if (typeof window.top === 'undefined') return false;
    return window.top !== window;
  } catch (e) {
    return false;
  }
})();

var FVD_ENGINE_IS_ACTIVE = !(FVD_ENGINE_IN_FRAME && !FVD_HAS_DOWNLOADS_API);

// Without the downloads API a blob can only reach the browser through a real
// anchor. A programmatic click is best effort - a browser may insist on a user
// gesture - so the link stays on screen to be tapped by hand instead of being
// removed after the click.
function fvdShowSaveLink(doc, container, url, filename, label) {
  if (!doc || !container || !url) return null;
  while (container.firstChild) container.removeChild(container.firstChild);
  var anchor = doc.createElement('a');
  anchor.href = url;
  anchor.setAttribute('download', filename || 'video.mp4');
  anchor.rel = 'noopener';
  anchor.textContent = label || 'Save file';
  container.appendChild(anchor);
  try {
    anchor.click();
  } catch (e) {}
  return anchor;
}

// Exported for the unit tests, which load this file on its own in a VM context.
if (typeof globalThis !== 'undefined') {
  globalThis.FVD_HAS_DOWNLOADS_API = FVD_HAS_DOWNLOADS_API;
  globalThis.FVD_ENGINE_IN_FRAME = FVD_ENGINE_IN_FRAME;
  globalThis.FVD_ENGINE_IS_ACTIVE = FVD_ENGINE_IS_ACTIVE;
  globalThis.fvdShowSaveLink = fvdShowSaveLink;
}
