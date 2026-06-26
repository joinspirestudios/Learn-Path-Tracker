// ── views/notification-center.js ────────────────────────────────────────────
// Pure HTML render helpers for the signed-in notification center + bell. These
// take already-public-safe notification views and never render uid, tokens,
// entity ids, Storage paths, or private proof. String-HTML to match the web
// skin's rendering model.

import { esc } from '../helpers.js';
import { notificationPublicSafeView } from '../notification-model.js';

const TYPE_TONE = {
  streak_risk: 'warn',
  missed_day: 'warn',
  proof_upload_failed: 'warn',
  moderation_update: 'muted',
  public_progress_reaction: 'progress',
  public_progress_comment: 'progress',
  public_progress_published: 'progress',
  path_milestone: 'progress',
  day_synced: 'progress',
};

function relativeTime(createdAt, now = Date.now()) {
  const diff = Math.max(0, now - Number(createdAt || 0));
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return mins + 'm ago';
  const hours = Math.floor(mins / 60);
  if (hours < 24) return hours + 'h ago';
  const days = Math.floor(hours / 24);
  return days + 'd ago';
}

// The bell shown in the signed-in shell. Badge appears only when unreadCount>0.
export function renderNotificationBell({ unreadCount = 0 } = {}) {
  const count = Math.max(0, Math.floor(Number(unreadCount) || 0));
  const badge = count > 0
    ? '<span class="aurora-bell-badge" data-notification-count>' + esc(count > 99 ? '99+' : String(count)) + '</span>'
    : '';
  return '<button type="button" class="aurora-bell" data-action="open-notifications"'
    + ' aria-label="Notifications' + (count > 0 ? ', ' + esc(String(count)) + ' unread' : '') + '">'
    + '<span class="aurora-bell-icon" aria-hidden="true">\u{1F514}</span>'
    + badge
    + '</button>';
}

function renderRow(input, now) {
  const n = notificationPublicSafeView(input);
  const tone = TYPE_TONE[n.type] || 'neutral';
  const unread = !n.read && !n.archived;
  const action = n.actionUrl
    ? '<a class="aurora-notification-action" href="' + esc(n.actionUrl) + '" data-notification-id="' + esc(n.id) + '">'
      + esc(n.actionLabel || 'Open') + '</a>'
    : '';
  return '<li class="aurora-notification-row' + (unread ? ' is-unread' : '') + '" data-notification-id="' + esc(n.id) + '" data-tone="' + esc(tone) + '">'
    + '<div class="aurora-notification-main">'
    + '<p class="aurora-notification-title">' + esc(n.title) + '</p>'
    + (n.body ? '<p class="aurora-notification-body">' + esc(n.body) + '</p>' : '')
    + '<p class="aurora-notification-meta">' + esc(relativeTime(n.createdAt, now)) + '</p>'
    + action
    + '</div>'
    + '<div class="aurora-notification-controls">'
    + (unread ? '<button type="button" class="aurora-notification-mark" data-action="mark-read" data-notification-id="' + esc(n.id) + '">Mark read</button>' : '')
    + '<button type="button" class="aurora-notification-archive" data-action="archive-notification" data-notification-id="' + esc(n.id) + '" aria-label="Clear notification">Clear</button>'
    + '</div>'
    + '</li>';
}

// The full notification center panel. `notifications` is an array of public-safe
// notification views (or raw — they are re-projected defensively).
export function renderNotificationCenter({ notifications = [], unreadCount = 0, now = Date.now() } = {}) {
  const items = Array.isArray(notifications) ? notifications : [];
  const count = Math.max(0, Math.floor(Number(unreadCount) || 0));
  const header = '<header class="aurora-notification-header">'
    + '<h2>Notifications</h2>'
    + (count > 0 ? '<button type="button" class="aurora-notification-markall" data-action="mark-all-read">Mark all read</button>' : '')
    + '</header>';
  if (!items.length) {
    return '<section class="aurora-notification-center" aria-label="Notifications">'
      + header
      + '<div class="aurora-notification-empty">'
      + '<p class="aurora-notification-empty-title">You’re all caught up</p>'
      + '<p class="aurora-notification-empty-body">Reminders, streak alerts and progress updates will appear here.</p>'
      + '</div>'
      + '</section>';
  }
  return '<section class="aurora-notification-center" aria-label="Notifications">'
    + header
    + '<ul class="aurora-notification-list">'
    + items.map(item => renderRow(item, now)).join('')
    + '</ul>'
    + '</section>';
}

export default { renderNotificationBell, renderNotificationCenter };
