// Mobile deep link parsing (pure + safe). Maps `learnpathtracker://` links (and
// the matching https app links) to in-app tab/route intents. Used for beta links
// and future push-notification action URLs.
//
// Safety: only a fixed allowlist of routes is accepted. Dangerous schemes
// (javascript:, data:, file:), tokens, and evidence/storage URLs are rejected.
// Anything unknown falls back to Today.

export const DEEP_LINK_SCHEME = 'learnpathtracker';

export const DEEP_LINK_TABS = ['today', 'paths', 'progress', 'notifications', 'profile'];

const PATH_ID_RE = /^[a-zA-Z0-9_-]{1,120}$/;

function fallback(reason = 'unknown') {
  return { tab: 'today', pathId: null, reason };
}

// Parse a deep link into a safe intent: { tab, pathId, reason }.
export function parseDeepLink(url) {
  if (typeof url !== 'string' || !url.trim()) return fallback('empty');
  const raw = url.trim();

  // Reject dangerous schemes outright — never execute arbitrary URLs.
  if (/^(javascript|data|file|blob|vbscript):/i.test(raw)) return fallback('unsafe_scheme');

  // Strip a known scheme prefix; accept our custom scheme or https app links.
  let rest = '';
  const lower = raw.toLowerCase();
  if (lower.startsWith(DEEP_LINK_SCHEME + '://')) {
    rest = raw.slice((DEEP_LINK_SCHEME + '://').length);
  } else if (/^https?:\/\//i.test(raw)) {
    // https://<host>/<path...> → take the path portion only.
    const afterHost = raw.replace(/^https?:\/\/[^/]+/i, '');
    rest = afterHost.replace(/^\/+/, '');
  } else if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) {
    // Some other scheme we do not handle.
    return fallback('unhandled_scheme');
  } else {
    rest = raw.replace(/^\/+/, '');
  }

  // Drop any query/hash — we never parse tokens or evidence URLs from links.
  rest = rest.split('?')[0].split('#')[0].replace(/\/+$/, '');
  if (!rest) return fallback('empty_path');

  const segments = rest.split('/').filter(Boolean).map(s => {
    try { return decodeURIComponent(s); } catch { return ''; }
  });
  const head = (segments[0] || '').toLowerCase();

  if (head === 'path') {
    const pathId = segments[1] || '';
    if (PATH_ID_RE.test(pathId)) return { tab: 'paths', pathId, reason: 'ok' };
    return fallback('invalid_path_id');
  }
  if (DEEP_LINK_TABS.includes(head)) {
    return { tab: head, pathId: null, reason: 'ok' };
  }
  return fallback('unknown_route');
}

// Convenience: just the destination tab.
export function deepLinkTab(url) {
  return parseDeepLink(url).tab;
}

export default { DEEP_LINK_SCHEME, DEEP_LINK_TABS, parseDeepLink, deepLinkTab };
