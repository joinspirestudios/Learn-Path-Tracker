// ── web-push-permissions.js ─────────────────────────────────────────────────
// Browser push permission helpers. IMPORTANT: nothing here requests permission
// at import time. Permission is only ever requested from requestWebPushPermission(),
// which callers invoke after an explicit user action (never on signup/import).

export function browserSupportsPush(scope = globalThis) {
  return !!(scope
    && 'Notification' in scope
    && 'serviceWorker' in (scope.navigator || {})
    && 'PushManager' in scope);
}

// 'default' | 'granted' | 'denied' | 'unsupported'
export function currentPushPermission(scope = globalThis) {
  if (!browserSupportsPush(scope)) return 'unsupported';
  return scope.Notification.permission || 'default';
}

// Request notification permission. MUST be called from a user gesture handler.
// Resolves to the resulting permission string. Never auto-invoked.
export async function requestWebPushPermission(scope = globalThis) {
  if (!browserSupportsPush(scope)) return 'unsupported';
  if (scope.Notification.permission === 'granted') return 'granted';
  if (scope.Notification.permission === 'denied') return 'denied';
  try {
    const result = await scope.Notification.requestPermission();
    return result || 'default';
  } catch {
    return 'denied';
  }
}

// Human-safe explanation for the current permission state. Never leaks anything.
export function pushPermissionMessage(state) {
  switch (state) {
    case 'unsupported': return 'Your browser does not support notifications.';
    case 'denied': return 'Notifications are blocked in your browser settings.';
    case 'granted': return 'Browser notifications are on.';
    default: return 'Turn on browser notifications to get reminders.';
  }
}

export default {
  browserSupportsPush,
  currentPushPermission,
  requestWebPushPermission,
  pushPermissionMessage,
};
