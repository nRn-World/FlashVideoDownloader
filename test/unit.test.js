const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

// Helper to load extension scripts into a VM context with mock globals.
// Accepts several files so a test can load a script together with a dependency
// (platform.js before offscreen.js), the same way a page loads them.
function loadScript(filename, mockGlobals = {}) {
  const filenames = Array.isArray(filename) ? filename : [filename];
  let code = filenames.map((name) => {
    let text = fs.readFileSync(path.join(__dirname, '..', name), 'utf8');

    // If loading i18n.js, assign to this.i18n for extraction
    if (name === 'i18n.js') {
      text += '\n; this.i18n = i18n;';
    }

    // Top-level `const` does not become a property of the VM context, so the
    // packaged terms version/key are exported explicitly for assertions.
    if (name === 'terms-gate.js') {
      text += '\n; this.FVD_TERMS_VERSION = FVD_TERMS_VERSION; this.FVD_TERMS_ACK_KEY = FVD_TERMS_ACK_KEY;';
    }
    return text;
  }).join('\n;\n');

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
      runtime: {
        onInstalled: { addListener: () => {} },
        onMessage: { addListener: () => {} },
        sendMessage: async () => {},
        getURL: (page) => `moz-extension://fvd-test/${page}`
      },
      action: { setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {} },
      // Desktop default: a full downloads API. A test that wants Firefox for Android
      // passes `chrome: { downloads: undefined }` instead.
      downloads: {
        onChanged: { addListener: () => {} },
        download: async () => 1,
        search: async () => []
      }
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
  assert.equal(ctx.fvdIsBlockedHost('www.tiktok.com'), true);
  assert.equal(ctx.fvdIsBlockedHost('instagram.com'), true);
  assert.equal(ctx.fvdIsBlockedHost('x.com'), true);
  assert.equal(ctx.fvdIsBlockedHost('box.com'), false);
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

// === Firefox for Android ===
// The downloads API does not exist there (Mozilla bug 1538348), so the extension cannot
// hand a finished file to a download manager. These tests pin both sides of that split:
// desktop keeps the download manager, and Android finishes the download in an engine tab
// where the file is saved through a link the user taps.

// A DOM stand-in for the engine page: elements record what was done to them, which is
// what the Android save path is judged on.
function fakeEngineDocument() {
  const created = [];
  function makeElement(tagName) {
    return {
      tagName,
      textContent: '',
      href: '',
      hidden: false,
      className: '',
      attrs: {},
      children: [],
      clicked: false,
      setAttribute(key, value) { this.attrs[key] = value; },
      appendChild(child) { this.children.push(child); return child; },
      removeChild(child) {
        const at = this.children.indexOf(child);
        if (at >= 0) this.children.splice(at, 1);
      },
      click() { this.clicked = true; },
      get firstChild() { return this.children[0] || null; }
    };
  }
  const byId = {};
  return {
    title: '',
    created,
    createElement(tagName) {
      const el = makeElement(tagName);
      created.push(el);
      return el;
    },
    getElementById(id) {
      if (!byId[id]) byId[id] = makeElement('div');
      return byId[id];
    }
  };
}

test('platform.js - the downloads API is the single switch for the save path', () => {
  const desktop = loadScript('platform.js');
  assert.equal(desktop.FVD_HAS_DOWNLOADS_API, true);
  assert.equal(desktop.FVD_ENGINE_IS_ACTIVE, true);

  // Firefox for Android: chrome.downloads does not exist at all.
  const android = loadScript('platform.js', { chrome: { downloads: undefined } });
  assert.equal(android.FVD_HAS_DOWNLOADS_API, false);
  assert.equal(android.FVD_ENGINE_IS_ACTIVE, true, 'there the engine tab has to do the work');

  // The iframe inside the Firefox background page can neither save anything nor be
  // tapped, so on Android it must stand down or every download would run twice.
  const framed = loadScript('platform.js', {
    chrome: { downloads: undefined },
    top: { parent: 'background page' }
  });
  assert.equal(framed.FVD_ENGINE_IN_FRAME, true);
  assert.equal(framed.FVD_ENGINE_IS_ACTIVE, false, 'an iframe engine must not run on Android');

  // The same frame stays the active engine on desktop, where it has a download manager.
  const framedDesktop = loadScript('platform.js', { top: { parent: 'background page' } });
  assert.equal(framedDesktop.FVD_ENGINE_IS_ACTIVE, true);
});

test('platform.js - the Android save link is a real anchor, left in place to be tapped', () => {
  const ctx = loadScript('platform.js', { chrome: { downloads: undefined } });
  const doc = fakeEngineDocument();
  const container = doc.createElement('div');

  const anchor = ctx.fvdShowSaveLink(doc, container, 'blob:moz-extension://fvd-test/1', 'my clip.mp4', 'Tap here');
  assert.equal(anchor.tagName, 'a');
  assert.equal(anchor.href, 'blob:moz-extension://fvd-test/1');
  assert.equal(anchor.attrs.download, 'my clip.mp4', 'the filename must be on the anchor');
  assert.equal(anchor.rel, 'noopener');
  assert.equal(anchor.textContent, 'Tap here');
  assert.equal(anchor.clicked, true, 'the click is attempted for the browsers that allow it');
  assert.equal(container.children.length, 1, 'the link stays on the page for a manual tap');

  // A link without a source can only ever produce a dead tap.
  assert.equal(ctx.fvdShowSaveLink(doc, container, '', 'my clip.mp4'), null);
  assert.equal(ctx.fvdShowSaveLink(doc, null, 'blob:x/1', 'my clip.mp4'), null);
});

test('offscreen.js - Android finishes a download as a tap-to-save link, not a download job', async () => {
  const doc = fakeEngineDocument();
  const sent = [];
  const ctx = loadScript(['platform.js', 'offscreen.js'], {
    document: doc,
    chrome: {
      downloads: undefined,
      storage: {
        local: { get: async () => ({}), set: async () => ({}), remove: async () => ({}) },
        session: { get: async () => ({}), remove: async () => ({}) }
      },
      runtime: {
        onMessage: { addListener: () => {} },
        sendMessage: async (msg) => { sent.push(msg); return { status: 'ok' }; }
      }
    }
  });

  // Read from platform.js, which declares it with var; the engine's own alias of it is
  // a const and therefore not reachable from the sandbox.
  assert.equal(ctx.FVD_HAS_DOWNLOADS_API, false);
  await ctx.deliverDownload('blob:moz-extension://fvd-test/1', 'my clip.mp4');

  const anchors = doc.created.filter((el) => el.tagName === 'a');
  assert.equal(anchors.length, 1, 'the finished file must end up on a real anchor');
  assert.equal(anchors[0].attrs.download, 'my clip.mp4');
  assert.equal(anchors[0].clicked, true);
  assert.equal(anchors[0].children.length, 0, 'nothing is removed after the click');

  // Without a download manager the save is a tap by hand, so the tab has to come forward.
  assert.deepEqual(sent.map((m) => m.type), ['ACTIVATE_ENGINE_TAB']);
});

test('offscreen.js - desktop still hands the finished file to the download manager', async () => {
  const calls = [];
  const ctx = loadScript(['platform.js', 'offscreen.js'], {
    chrome: {
      downloads: {
        download: async (opts) => { calls.push(opts); return 7; },
        onChanged: { addListener: () => {} },
        search: async () => []
      },
      storage: {
        local: { get: async () => ({}), set: async () => ({}), remove: async () => ({}) },
        session: { get: async () => ({}), remove: async () => ({}) }
      },
      runtime: { onMessage: { addListener: () => {} }, sendMessage: async () => {} }
    }
  });

  assert.equal(ctx.FVD_HAS_DOWNLOADS_API, true);
  await ctx.deliverDownload('blob:moz-extension://fvd-test/1', 'my clip.mp4');

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'blob:moz-extension://fvd-test/1');
  assert.equal(calls[0].filename, 'my clip.mp4');
});

// Shared dependencencies for the background.js routing tests below.
function backgroundStubs(overrides) {
  return {
    fvdIsBlockedUrl: () => false,
    termsAcceptanceRequired: async () => false,
    FREE_RATE_WINDOW_MINUTES: 120,
    canStartNewDownload: async () => true,
    consumeFreeDownloadSlot: async () => ({ allowed: true, minutesRemaining: 0 }),
    setTimeout: () => 0,
    setInterval: () => 0,
    clearInterval: () => {},
    ...overrides
  };
}

test('background.js - loads without a downloads API instead of dying on it', () => {
  const added = [];
  const pageStubs = {
    tabs: { onUpdated: { addListener: () => {} }, onRemoved: { addListener: () => {} } },
    runtime: {
      onInstalled: { addListener: () => {} },
      onMessage: { addListener: () => {} },
      sendMessage: async () => {},
      getURL: (page) => page
    }
  };

  // Firefox for Android: chrome.downloads does not exist. Attaching to onChanged at top
  // level used to throw while the background loaded, which took the whole extension down
  // with it - not just the download feature.
  const android = loadScript(['platform.js', 'background.js'], backgroundStubs({
    chrome: { ...pageStubs, downloads: undefined }
  }));
  assert.equal(android.FVD_HAS_DOWNLOADS_API, false);
  assert.equal(typeof android.startGenericDownload, 'function', 'the background has to survive the load');

  // ...and where the API does exist it must still be watched, or progress would stop.
  const desktop = loadScript(['platform.js', 'background.js'], backgroundStubs({
    chrome: {
      ...pageStubs,
      downloads: {
        onChanged: { addListener: (fn) => added.push(fn) },
        download: async () => 1,
        search: async () => []
      }
    }
  }));
  assert.equal(desktop.FVD_HAS_DOWNLOADS_API, true);
  assert.equal(added.length, 1, 'the download-manager listener must still be attached');
});

test('background.js - Android sends the download to the engine tab instead of a download manager', async () => {
  const createdTabs = [];
  const sent = [];
  const ctx = loadScript(['platform.js', 'background.js'], backgroundStubs({
    chrome: {
      downloads: undefined,
      tabs: {
        onUpdated: { addListener: () => {} },
        onRemoved: { addListener: () => {} },
        query: async () => [],
        create: async (opts) => { createdTabs.push(opts); return { id: 5 }; },
        get: async () => ({ id: 5, status: 'complete' })
      },
      runtime: {
        onInstalled: { addListener: () => {} },
        onMessage: { addListener: () => {} },
        sendMessage: async (msg) => { sent.push(msg); return { status: 'started' }; },
        getURL: (page) => `moz-extension://fvd-test/${page}`
      }
    }
  }));

  assert.equal(ctx.FVD_HAS_DOWNLOADS_API, false, 'this browser has no downloads API');
  const result = await ctx.startGenericDownload('dl-1', 'https://cdn.example.com/clip.mp4', 'clip.mp4', null);

  assert.equal(result.ok, true);
  assert.equal(createdTabs.length, 1, 'the engine has to run in a real tab on Android');
  assert.ok(createdTabs[0].url.endsWith('offscreen.html'), 'the tab must be the engine page');
  assert.equal(createdTabs[0].active, false, 'opening the engine must not steal the screen');

  const started = sent.filter((m) => m.type !== 'OFFSCREEN_PROGRESS');
  assert.deepEqual(started.map((m) => m.type), ['START_OFFSCREEN_GENERIC']);
  assert.equal(started[0].url, 'https://cdn.example.com/clip.mp4');
  assert.equal(started[0].downloadId, 'dl-1');
});

test('background.js - Android reads a page blob through the engine instead of failing on it', async () => {
  const sent = [];
  const createdTabs = [];
  const ctx = loadScript(['platform.js', 'background.js'], backgroundStubs({
    chrome: {
      downloads: undefined,
      tabs: {
        onUpdated: { addListener: () => {} },
        onRemoved: { addListener: () => {} },
        query: async () => [],
        create: async (opts) => { createdTabs.push(opts); return { id: 9 }; },
        get: async () => ({ id: 9, status: 'complete' }),
        sendMessage: async () => ({ buffer: new ArrayBuffer(4) })
      },
      runtime: {
        onInstalled: { addListener: () => {} },
        onMessage: { addListener: () => {} },
        sendMessage: async (msg) => { sent.push(msg); return { status: 'started' }; },
        getURL: (page) => `moz-extension://fvd-test/${page}`
      }
    }
  }));

  // A blob: video only exists inside the page, so the bytes have to be read there by the
  // content script - a click made on the user's behalf may just be ignored on Android.
  const result = await ctx.startBlobDownload('dl-3', 42, 'blob:https://site.example/9f2', 'clip.mp4');

  assert.equal(result.ok, true);
  assert.equal(createdTabs.length, 1, 'the file still has to land in the engine tab');
  const started = sent.filter((m) => m.type !== 'OFFSCREEN_PROGRESS');
  assert.deepEqual(started.map((m) => m.type), ['START_OFFSCREEN_BUFFER']);
  assert.equal(started[0].downloadId, 'dl-3');
  assert.equal(started[0].filename, 'clip.mp4');
  assert.ok(started[0].buffer, 'the bytes read from the page must reach the engine');
});

test('background.js - desktop still downloads through the browser download manager', async () => {
  const calls = [];
  const sent = [];
  const ctx = loadScript(['platform.js', 'background.js'], backgroundStubs({
    chrome: {
      downloads: {
        download: async (opts) => { calls.push(opts); return 77; },
        onChanged: { addListener: () => {} },
        search: async () => []
      },
      tabs: { onUpdated: { addListener: () => {} }, onRemoved: { addListener: () => {} } },
      runtime: {
        onInstalled: { addListener: () => {} },
        onMessage: { addListener: () => {} },
        sendMessage: async (msg) => { sent.push(msg); return { status: 'ok' }; },
        getURL: (page) => `moz-extension://fvd-test/${page}`
      }
    }
  }));

  assert.equal(ctx.FVD_HAS_DOWNLOADS_API, true);
  const result = await ctx.startGenericDownload('dl-2', 'https://cdn.example.com/clip.mp4', 'clip.mp4', 'https://example.com/watch');

  assert.equal(result.ok, true);
  assert.equal(calls.length, 1, 'the download manager is used wherever it exists');
  assert.equal(calls[0].url, 'https://cdn.example.com/clip.mp4');
  assert.equal(calls[0].filename, 'clip.mp4');
  assert.ok(
    calls[0].headers.some((h) => h.name === 'Referer' && h.value === 'https://example.com/watch'),
    'the page referer must still be forwarded'
  );
  assert.equal(
    sent.some((m) => String(m.type).startsWith('START_OFFSCREEN')),
    false,
    'desktop must not detour through the engine'
  );
});

// --- Server-side Pro license check -------------------------------------------------
// Loads license.js with LICENSE_API pointed at a fake server and an in-memory storage.
function loadLicenseWithServer({ stored = {}, serverReply }) {
  const store = { ...stored };
  const calls = [];
  const code = fs.readFileSync(path.join(__dirname, '..', 'license.js'), 'utf8')
    .replace(/const LICENSE_API = '[^']*';/, "const LICENSE_API = 'https://license.test/';");
  const context = {
    console, Date, Math, Set, Array, Object, String, Number, JSON, Promise, RegExp, Uint8Array, TextEncoder,
    setTimeout, clearTimeout, AbortController,
    crypto: globalThis.crypto,
    fetch: async (url, opts) => {
      calls.push(JSON.parse(opts.body).digest);
      return serverReply();
    },
    chrome: {
      storage: {
        local: {
          get: async (keys) => Object.fromEntries(keys.filter((k) => k in store).map((k) => [k, store[k]])),
          set: async (obj) => { Object.assign(store, obj); },
          remove: async (keys) => { keys.forEach((k) => delete store[k]); }
        }
      }
    }
  };
  vm.createContext(context);
  vm.runInContext(code, context);
  return { ctx: context, store, calls };
}

const LEGACY_DIGEST = '2292da59ca854fd61bb321141d8cbe2092a514d48fafad21e936a70ac7394dec';
const ok = (valid) => async () => ({ ok: true, json: async () => ({ valid }) });
const down = async () => { throw new Error('offline'); };

test('license server - legacy paid user is migrated and stays Pro', async () => {
  const { ctx, store } = loadLicenseWithServer({
    stored: { fvd_pro_license: LEGACY_DIGEST },
    serverReply: ok(true)
  });
  assert.equal((await ctx.isProUser()).isPro, true);
  assert.ok(store.fvd_pro_verified_at > 0, 'verification time is recorded');
});

test('license server - injected unknown digest is rejected and cleared', async () => {
  const { ctx, store } = loadLicenseWithServer({
    stored: { fvd_pro_license: 'a'.repeat(64), fvd_pro_status: { active: true } },
    serverReply: ok(false)
  });
  assert.equal((await ctx.isProUser()).isPro, false);
  assert.equal('fvd_pro_license' in store, false);
});

test('license server - paid user keeps Pro when the server is down or misconfigured', async () => {
  const offline = loadLicenseWithServer({ stored: { fvd_pro_license: LEGACY_DIGEST }, serverReply: down });
  assert.equal((await offline.ctx.isProUser()).isPro, true, 'legacy user, offline');

  const err500 = loadLicenseWithServer({
    stored: { fvd_pro_license: LEGACY_DIGEST },
    serverReply: async () => ({ ok: false, json: async () => ({}) })
  });
  assert.equal((await err500.ctx.isProUser()).isPro, true, 'legacy user, server 500');

  const verified = loadLicenseWithServer({
    stored: { fvd_pro_license: 'b'.repeat(64), fvd_pro_verified_at: Date.now() - 3 * 24 * 3600 * 1000 },
    serverReply: down
  });
  assert.equal((await verified.ctx.isProUser()).isPro, true, 'verified user, offline within grace');
});

test('license server - offline cannot unlock Pro for an unknown digest', async () => {
  const { ctx } = loadLicenseWithServer({ stored: { fvd_pro_license: 'c'.repeat(64) }, serverReply: down });
  assert.equal((await ctx.isProUser()).isPro, false);
});

test('license server - fresh verification is cached (no request per call)', async () => {
  const { ctx, calls } = loadLicenseWithServer({
    stored: { fvd_pro_license: LEGACY_DIGEST, fvd_pro_verified_at: Date.now() },
    serverReply: ok(true)
  });
  await ctx.isProUser();
  await ctx.isProUser();
  assert.equal(calls.length, 0);
});

test('license server - activation requires a server yes', async () => {
  const rejected = loadLicenseWithServer({ serverReply: ok(false) });
  assert.equal((await rejected.ctx.activateLicense('FVD-PRO-AAAA-BBBB-CCCC-DDDD')).success, false);
  assert.equal('fvd_pro_license' in rejected.store, false);

  const accepted = loadLicenseWithServer({ serverReply: ok(true) });
  assert.equal((await accepted.ctx.activateLicense('FVD-PRO-AAAA-BBBB-CCCC-DDDD')).success, true);
  assert.equal((await accepted.ctx.isProUser()).isPro, true);
});
