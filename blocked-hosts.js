// Shared blocklist – DRM-protected / policy-restricted platforms (Chrome Web Store compliance)
var FVD_BLOCKED_HOSTS = [
  'youtube.com', 'youtu.be', 'googlevideo.com', 'ytimg.com',
  'netflix.com', 'nflxvideo.net', 'nflxext.com', 'nflximg.com',
  'disneyplus.com', 'disney-plus.net',
  'hbomax.com', 'max.com', 'hbo.com',
  'primevideo.com',
  'tv.apple.com', 'music.apple.com',
  'open.spotify.com', 'spotify.com',
  'twitch.tv', 'ttvnw.net'
];

function fvdIsBlockedHost(hostname) {
  if (!hostname) return false;
  const host = hostname.replace(/^www\./, '').toLowerCase();
  return FVD_BLOCKED_HOSTS.some(function (b) {
    return host === b || host.endsWith('.' + b);
  });
}

function fvdIsBlockedUrl(url) {
  if (!url || typeof url !== 'string') return false;
  if (url.startsWith('chrome://') || url.startsWith('chrome-extension://') || url.startsWith('edge://')) {
    return true;
  }
  try {
    return fvdIsBlockedHost(new URL(url).hostname);
  } catch (e) {
    return false;
  }
}
