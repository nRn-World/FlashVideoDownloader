const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

// Helper to load extension scripts into a VM context with mock globals
function loadScript(filename, mockGlobals = {}) {
  const filePath = path.join(__dirname, '..', filename);
  let code = fs.readFileSync(filePath, 'utf8');

  // If loading i18n.js, assign to this.i18n for extraction
  if (filename === 'i18n.js') {
    code += '\n; this.i18n = i18n;';
  }

  const context = {
    console,
    Math,
    Date,
    URL,
    RegExp,
    parseInt,
    parseFloat,
    isNaN,
    Array,
    Object,
    String,
    Number,
    Boolean,
    Set,
    Map,
    TextEncoder,
    Uint8Array,
    addEventListener: () => {},
    removeEventListener: () => {},
    importScripts: () => {},
    crypto: globalThis.crypto,
    chrome: {
      storage: {
        local: {
          get: async () => ({}),
          set: async () => ({}),
          remove: async () => ({})
        },
        sync: {
          get: async () => ({}),
          set: async () => ({})
        }
      },
      webRequest: { onHeadersReceived: { addListener: () => {} } },
      tabs: { onUpdated: { addListener: () => {} }, onRemoved: { addListener: () => {} } },
      runtime: { onInstalled: { addListener: () => {} }, onMessage: { addListener: () => {} }, sendMessage: async () => {} },
      action: { setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {} },
      downloads: { onChanged: { addListener: () => {} } }
    },
    ...mockGlobals
  };

  context.globalThis = context;
  context.window = context;
  context.self = context;

  vm.createContext(context);
  vm.runInContext(code, context);
  return context;
}

test('blocked-hosts.js - fvdIsBlockedHost & fvdIsBlockedUrl', () => {
  const ctx = loadScript('blocked-hosts.js');

  assert.equal(ctx.fvdIsBlockedHost('youtube.com'), true);
  assert.equal(ctx.fvdIsBlockedHost('www.youtube.com'), true);
  assert.equal(ctx.fvdIsBlockedHost('m.youtube.com'), true);
  assert.equal(ctx.fvdIsBlockedHost('netflix.com'), true);
  assert.equal(ctx.fvdIsBlockedHost('open.spotify.com'), true);
  assert.equal(ctx.fvdIsBlockedHost('example.com'), false);
  assert.equal(ctx.fvdIsBlockedHost('vimeo.com'), false);

  assert.equal(ctx.fvdIsBlockedUrl('https://www.youtube.com/watch?v=123'), true);
  assert.equal(ctx.fvdIsBlockedUrl('https://netflix.com/title/123'), true);
  assert.equal(ctx.fvdIsBlockedUrl('chrome://extensions'), true);
  assert.equal(ctx.fvdIsBlockedUrl('chrome-extension://abcdef/popup.html'), true);
  assert.equal(ctx.fvdIsBlockedUrl('https://vimeo.com/7654321'), false);
});

test('license.js - normalization and format validation', async () => {
  const ctx = loadScript('license.js');

  assert.equal(ctx.normalizeLicenseKey('  fvd-pro-1234-5678 '), 'FVD-PRO-1234-5678');
  assert.equal(ctx.looksLikeLicenseKey('FVD-PRO-1234-5678'), true);
  assert.equal(ctx.looksLikeLicenseKey('FVD-PRO-1234-5678-ABCD'), true);
  assert.equal(ctx.looksLikeLicenseKey('INVALID-KEY'), false);

  const invalidRes = await ctx.validateLicenseFormat('INVALID');
  assert.equal(invalidRes.valid, false);

  const fakeKeyRes = await ctx.validateLicenseFormat('FVD-PRO-0000-0000');
  assert.equal(fakeKeyRes.valid, false);
});

test('background.js - URL parsing and filename helpers', () => {
  const ctx = loadScript('blocked-hosts.js');
  const bgCtx = loadScript('background.js', { fvdIsBlockedUrl: ctx.fvdIsBlockedUrl });

  assert.equal(bgCtx.formatBytes(0), '');
  assert.equal(bgCtx.formatBytes(1024), '1.0 KB');
  assert.equal(bgCtx.formatBytes(1048576), '1.0 MB');
  assert.equal(bgCtx.formatBytes(1073741824), '1.0 GB');

  assert.equal(bgCtx.urlHasExt('https://example.com/video.mp4', 'mp4'), true);
  assert.equal(bgCtx.urlHasExt('https://example.com/video.mp4/', 'mp4'), true);
  assert.equal(bgCtx.urlHasExt('https://example.com/video.mp4?hd=1', 'mp4'), true);

  assert.equal(bgCtx.isTubeCmsVideoUrl('https://site.com/get_file/1/abc/video.mp4'), true);
  assert.equal(bgCtx.isTubeCmsVideoUrl('https://pvvstream.pro/videos/123.mp4'), true);
  assert.equal(bgCtx.isTubeCmsVideoUrl('https://example.com/normal.mp4'), false);

  assert.equal(bgCtx.isStreamingSegmentUrl('https://cdn.com/seg-1.ts'), true);
  assert.equal(bgCtx.isStreamingSegmentUrl('https://cdn.com/chunk_0.m4s'), true);
  assert.equal(bgCtx.isStreamingSegmentUrl('https://example.com/full_video.mp4'), false);

  assert.equal(bgCtx.isPreviewMediaUrl('https://cdn.com/preview_1080p.jpg'), true);
  assert.equal(bgCtx.isPreviewMediaUrl('https://cdn.com/tr_720p.mp4'), true);

  const fn1 = bgCtx.getCleanFilename('https://example.com/My%20Awesome%20Video.mp4', null, 'video/mp4');
  assert.equal(fn1.endsWith('.mp4'), true);
  assert.equal(fn1.includes('%20'), false);
});

test('i18n.js - verify all 6 locales have complete key coverage', () => {
  const ctx = loadScript('i18n.js');
  const translations = ctx.i18n;

  const locales = ['en', 'sv', 'tr', 'es', 'fr', 'ar'];
  assert.ok(translations.en, 'English translations missing');

  const masterKeys = new Set(Object.keys(translations.en));
  assert.ok(masterKeys.size > 100, `Expected > 100 i18n keys, found ${masterKeys.size}`);

  for (const loc of locales) {
    assert.ok(translations[loc], `Locale ${loc} missing in i18n.js`);
    const locKeys = new Set(Object.keys(translations[loc]));
    const missing = [];
    for (const key of masterKeys) {
      if (!locKeys.has(key)) missing.push(key);
    }
    assert.equal(missing.length, 0, `Locale ${loc} is missing keys: ${missing.join(', ')}`);
  }
});
