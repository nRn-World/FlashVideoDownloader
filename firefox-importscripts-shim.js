// background.js uses importScripts() for Chrome service workers.
// Firefox loads this page as an event page (DOM), so provide a no-op shim.
if (typeof importScripts !== 'function') {
  globalThis.importScripts = function importScriptsShim() {};
}
