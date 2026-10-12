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

  // Top-level `const` does not become a property of the VM context, so the
  // packaged terms version/key are exported explicitly for assertions.
  if (filename === 'terms-gate.js') {
    code += '\n; this.FVD_TERMS_VERSION = FVD_TERMS_VERSION; this.FVD_TERMS_ACK_KEY = FVD_TERMS_ACK_KEY;';
  }

  // A caller may override individual chrome APIs; anything it does not mention
  // keeps the default stub, so a test only describes what it cares about.
  const { chrome: chromeOverrides, ...restGlobals } = mockGlobals;

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
    ...restGlobals
  };

  if (chromeOverrides) Object.assign(context.chrome, chromeOverrides);

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

// Loads terms-gate.js with a controllable storage backend.
function loadTermsGate({ get, set } = {}) {
  const writes = [];
  const ctx = loadScript('terms-gate.js', {
    chrome: {
      storage: {
        local: {
          get: get || (async () => ({})),
          set: set || (async (payload) => {
            writes.push(payload);
            return {};
          }),
          remove: async () => ({})
        }
      }
    }
  });
  ctx.__writes = writes;
  return ctx;
}

test('terms-gate.js - acceptance record must match the shipped terms version', () => {
  const ctx = loadTermsGate();
  const current = ctx.FVD_TERMS_VERSION;

  assert.ok(typeof current === 'string' && current.length > 0, 'terms version must be set');

  assert.equal(ctx.termsRecordSatisfies(null, current), false);
  assert.equal(ctx.termsRecordSatisfies(undefined, current), false);
  assert.equal(ctx.termsRecordSatisfies({}, current), false);
  assert.equal(ctx.termsRecordSatisfies({ accepted: true }, current), false);
  assert.equal(ctx.termsRecordSatisfies({ accepted: false, version: current }, current), false);
  assert.equal(ctx.termsRecordSatisfies({ accepted: true, version: '0.0-old' }, current), false);
  assert.equal(ctx.termsRecordSatisfies({ accepted: true, version: current }, current), true);
});

test('terms-gate.js - state, acceptance write and fail-open behaviour', async () => {
  // Nothing stored yet -> the user must accept.
  const empty = loadTermsGate();
  const emptyState = await empty.getTermsState();
  assert.equal(emptyState.accepted, false);
  assert.equal(emptyState.storageError, false);
  assert.equal(await empty.termsAcceptanceRequired(), true);

  // Accepting stores the CURRENT version plus a timestamp.
  const record = await empty.acceptTerms();
  assert.equal(record.accepted, true);
  assert.equal(record.version, empty.FVD_TERMS_VERSION);
  assert.equal(Number.isNaN(Date.parse(record.acceptedAt)), false, 'acceptedAt must be a date');
  assert.equal(empty.__writes.length, 1);
  assert.deepEqual(empty.__writes[0].fvd_terms_ack, record);

  // A stored record for the current version releases the gate.
  const accepted = loadTermsGate({ get: async () => ({ fvd_terms_ack: record }) });
  const acceptedState = await accepted.getTermsState();
  assert.equal(acceptedState.accepted, true);
  assert.equal(acceptedState.acceptedAt, record.acceptedAt);
  assert.equal(await accepted.termsAcceptanceRequired(), false);

  // A record from an older terms version must NOT release the gate.
  const stale = loadTermsGate({
    get: async () => ({ fvd_terms_ack: { accepted: true, version: '0.0-old' } })
  });
  assert.equal((await stale.getTermsState()).accepted, false);
  assert.equal(await stale.termsAcceptanceRequired(), true);

  // Storage failure fails OPEN: a broken backend must never lock a user out.
  const broken = loadTermsGate({ get: async () => { throw new Error('storage unavailable'); } });
  const brokenState = await broken.getTermsState();
  assert.equal(brokenState.accepted, true);
  assert.equal(brokenState.storageError, true);
  assert.equal(await broken.termsAcceptanceRequired(), false);
});

test('background.js - download gate refuses to start until the terms are accepted', async () => {
  // background.js reaches blocked-hosts.js and license.js through importScripts(),
  // which the VM mock turns into a no-op, so those globals are injected - the same
  // approach the existing background.js test uses for fvdIsBlockedUrl.
  const licenseGlobals = {
    FREE_RATE_WINDOW_MINUTES: 120,
    canStartNewDownload: async () => true,
    consumeFreeDownloadSlot: async () => ({ allowed: true, minutesRemaining: 0 })
  };

  const unaccepted = loadTermsGate();
  const bgBlocked = loadScript('background.js', {
    fvdIsBlockedUrl: () => false,
    termsAcceptanceRequired: unaccepted.termsAcceptanceRequired,
    ...licenseGlobals
  });

  const refused = await bgBlocked.gateDownloadStart();
  assert.equal(refused.ok, false, 'an unaccepted user must not be able to start a download');
  assert.equal(refused.status, 'terms_required');

  // Once accepted, the terms check must step aside and leave the normal
  // free-tier logic (rate limit / concurrency) in charge.
  const record = await unaccepted.acceptTerms();
  const accepted = loadTermsGate({ get: async () => ({ fvd_terms_ack: record }) });
  const bgAllowed = loadScript('background.js', {
    fvdIsBlockedUrl: () => false,
    termsAcceptanceRequired: accepted.termsAcceptanceRequired,
    ...licenseGlobals
  });

  // Compared field by field: the value comes from another VM realm, so a strict
  // deepEqual would fail on differing Object prototypes rather than on the values.
  const passed = await bgAllowed.gateDownloadStart();
  assert.equal(passed.ok, true);
  assert.equal(passed.status, 'started');
});

test('popup.js - every download start goes through the single terms gate', () => {
  const background = fs.readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8');
  const popup = fs.readFileSync(path.join(__dirname, '..', 'popup.js'), 'utf8');

  // gateDownloadStart() must be the chokepoint, and it must check the terms.
  assert.ok(
    background.includes('await termsAcceptanceRequired()'),
    'background.js must check termsAcceptanceRequired()'
  );
  const gateBodyStart = background.indexOf('async function gateDownloadStart()');
  assert.ok(gateBodyStart > 0, 'gateDownloadStart must exist');
  const termsCheckAt = background.indexOf('await termsAcceptanceRequired()', gateBodyStart);
  const concurrentCheckAt = background.indexOf('await canStartNewDownload()', gateBodyStart);
  assert.ok(termsCheckAt > 0 && concurrentCheckAt > 0, 'both checks must be present');
  assert.ok(
    termsCheckAt < concurrentCheckAt,
    'the terms check must run before the rate-limit check so a refused start never burns a free slot'
  );

  // Every download starter must call the gate.
  for (const starter of [
    'startHlsDownload',
    'startDashDownload',
    'startChunkedDownload',
    'startGenericDownload',
    'startBlobDownload'
  ]) {
    const decl = background.indexOf(`async function ${starter}(`);
    assert.ok(decl > 0, `${starter} must exist`);
    const bodyEnd = background.slice(decl).search(/\r?\n\}/);
    assert.ok(bodyEnd > 0, `${starter} body must be delimited`);
    const body = background.slice(decl, decl + bodyEnd);
    assert.ok(body.includes('gateDownloadStart()'), `${starter} must call gateDownloadStart()`);
  }

  // The popup must wait for acceptance before it initialises anything at all.
  const initAt = popup.indexOf("document.addEventListener('DOMContentLoaded'");
  assert.ok(initAt > 0, 'popup init handler must exist');
  const gateReadyAt = popup.indexOf('getElementById(\'terms-gate\')', initAt);
  const awaitedAt = popup.indexOf('await requireTermsAcceptance();', initAt);
  const firstListAt = popup.indexOf("getElementById('media-list')", initAt);
  assert.ok(gateReadyAt > 0 && awaitedAt > 0, 'popup must set up and await the gate');
  assert.ok(
    awaitedAt < firstListAt,
    'the gate must be awaited before the rest of the popup initialises'
  );
  assert.ok(popup.includes("res.status === 'terms_required'"), 'popup must handle a refused start');
});

test('pricing copy - no discount is advertised against a price that was never charged', () => {
  const popupHtml = fs.readFileSync(path.join(__dirname, '..', 'popup.html'), 'utf8');
  const popupJs = fs.readFileSync(path.join(__dirname, '..', 'popup.js'), 'utf8');

  // A hardcoded compare-at price or badge in the markup survives a JS error, so a
  // fictitious "was" price must not exist in the HTML at all.
  assert.equal(
    /\d+\s*%\s*OFF/i.test(popupHtml),
    false,
    'popup.html must not contain a hardcoded percentage-off badge'
  );
  assert.equal(
    /€\s*21[.,]98/.test(popupHtml),
    false,
    'popup.html must not contain a hardcoded compare-at price'
  );

  // The struck-through price may only ever be rendered from PRO_OFFER.compareAtPrice.
  assert.ok(
    /txtOfferWas\.textContent = offerActive \? PRO_OFFER\.compareAtPrice : ''/.test(popupJs),
    'the main-card compare-at price must come from PRO_OFFER.compareAtPrice'
  );
  assert.ok(
    /txtProPriceWas\.textContent = offerActive \? PRO_OFFER\.compareAtPrice : ''/.test(popupJs),
    'the settings compare-at price must come from PRO_OFFER.compareAtPrice'
  );

  // And it must ship empty, so no reduction is claimed out of the box.
  const block = popupJs.slice(popupJs.indexOf('const PRO_OFFER = {'), popupJs.indexOf('};', popupJs.indexOf('const PRO_OFFER = {')));
  assert.ok(block.length > 0, 'PRO_OFFER must be declared as an object literal');
  assert.ok(/compareAtPrice:\s*''/.test(block), 'PRO_OFFER.compareAtPrice must ship empty');
  assert.ok(/discountPercent:\s*0/.test(block), 'PRO_OFFER.discountPercent must ship as 0');
  assert.ok(/endsOn:\s*''/.test(block), 'PRO_OFFER.endsOn must ship empty');

  // The campaign can only activate when all three are genuinely configured.
  assert.ok(
    /if \(!PRO_OFFER\.compareAtPrice \|\| !PRO_OFFER\.discountPercent \|\| !PRO_OFFER\.endsOn\) return false;/.test(popupJs),
    'isProOfferActive must require a configured compare-at price, discount and end date'
  );

  // Both discount badges must stay empty while nothing is running, so a hidden
  // element can never render as "0% OFF" if it is unhidden by something else.
  assert.ok(
    /txtOfferBadge\.textContent = offerActive \? badgeText : ''/.test(popupJs),
    'the offer-card badge must be cleared when no reduction is running'
  );
  assert.ok(
    /txtProSaveBadge\.textContent = offerActive \? badgeText : ''/.test(popupJs),
    'the settings save badge must be cleared when no reduction is running'
  );
});

test('i18n.js - no locale promises a licence that lasts forever', () => {
  const ctx = loadScript('i18n.js');
  const forever = /forever|för alltid|para siempre|pour toujours|sonsuza|kadar senin|للأبد/i;

  for (const loc of Object.keys(ctx.i18n)) {
    const strings = ctx.i18n[loc];
    for (const [key, value] of Object.entries(strings)) {
      if (typeof value !== 'string') continue;
      assert.equal(
        forever.test(value),
        false,
        `${loc}.${key} still makes an unqualified "forever" promise: ${JSON.stringify(value)}`
      );
    }
    // "Lifetime" must be explained by the terms, not asserted as a headline claim.
    assert.equal(strings.proUpsellTitle, 'Pro', `${loc}.proUpsellTitle must not claim a lifetime product`);
    assert.match(
      strings.proPriceLifetime,
      /terms|villkoren|şartlara|términos|conditions|الشروط/i,
      `${loc}.proPriceLifetime must point at the terms that define "lifetime"`
    );
  }
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

test('background.js - no page is scanned before the terms are accepted', async () => {
  // Behavioural check rather than a source check: drive the real tabs.onUpdated
  // listener and watch what it asks chrome.scripting to do. Prose assertions on
  // the file text would not catch the injection moving behind a path the test
  // never reads.
  async function injectionsOnNavigation({ termsAccepted }) {
    const executed = [];
    const onUpdated = [];

    loadScript('background.js', {
      fvdIsBlockedUrl: () => false,
      termsAcceptanceRequired: async () => !termsAccepted,
      FREE_RATE_WINDOW_MINUTES: 120,
      canStartNewDownload: async () => true,
      consumeFreeDownloadSlot: async () => ({ allowed: true, minutesRemaining: 0 }),
      chrome: {
        tabs: {
          onUpdated: { addListener: (fn) => onUpdated.push(fn) },
          onRemoved: { addListener: () => {} }
        },
        scripting: {
          executeScript: async (arg) => { executed.push(arg); return []; }
        }
      }
    });

    assert.equal(onUpdated.length, 1, 'background.js must register exactly one tabs.onUpdated listener');
    onUpdated[0](7, { status: 'complete' }, { url: 'https://example.com/watch?v=1' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    return executed;
  }

  // A user who has never seen the terms must not have their browsing inspected:
  // no MAIN-world hook, no content script, no media capture.
  const beforeAcceptance = await injectionsOnNavigation({ termsAccepted: false });
  assert.equal(
    beforeAcceptance.length,
    0,
    'a page must not be scanned or hooked before the user accepts the terms'
  );

  // Once accepted, the MAIN-world hook and the isolated content script must both
  // be injected again, or HLS and player sources would stop being captured.
  const afterAcceptance = await injectionsOnNavigation({ termsAccepted: true });
  assert.equal(
    afterAcceptance.length,
    2,
    'once accepted, both the MAIN-world hook and the isolated content script must be injected'
  );
  const injectedFiles = afterAcceptance.flatMap((arg) => arg.files || []);
  assert.ok(injectedFiles.includes('page-hook.js'), 'the MAIN-world hook must be injected');
  assert.ok(injectedFiles.includes('content.js'), 'the isolated content script must be injected');
});
