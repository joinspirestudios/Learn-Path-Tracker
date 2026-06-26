// Mobile notification repository (read/write the signed-in user's OWN
// notifications + preferences). Owner-only space:
//   users/{uid}/notifications/{id}
//   users/{uid}/notificationPreferences/main
//
// Dependency-injected (`gateway`) so tests never call live Firebase. Clients
// only mark their own notifications read/archived; event notifications are
// created server-side. Notifications never carry tokens or private proof.

import {
  normalizeMobileNotificationPreferences, defaultMobileNotificationPreferences,
} from '../core/mobileNotificationPreferences.js';

const NOTIFICATIONS = 'notifications';
const PREFERENCES = 'notificationPreferences';

function publicSafe(record) {
  const d = record && record.data ? record.data : {};
  return {
    id: record.id,
    type: String(d.type || 'system'),
    title: String(d.title || ''),
    body: String(d.body || ''),
    actionLabel: String(d.actionLabel || ''),
    actionUrl: String(d.actionUrl || ''),
    read: !!d.read,
    archived: !!d.archived,
    createdAt: Number(d.createdAt || 0),
  };
}

export function createMobileNotificationRepository({ gateway } = {}) {
  if (!gateway) throw new Error('createMobileNotificationRepository requires a gateway');

  return {
    async listNotifications({ uid, limit = 50 } = {}) {
      if (!uid) return [];
      const records = await gateway.listUserDocs(uid, NOTIFICATIONS, limit);
      return records
        .map(publicSafe)
        .filter(n => !n.archived)
        .sort((a, b) => b.createdAt - a.createdAt);
    },

    async unreadCount({ uid } = {}) {
      const items = await this.listNotifications({ uid, limit: 200 });
      return items.filter(n => !n.read).length;
    },

    async markRead({ uid, notificationId, read = true } = {}) {
      if (!uid || !notificationId) return false;
      await gateway.setUserDoc(uid, NOTIFICATIONS, notificationId, { read: !!read, updatedAt: Date.now() });
      return true;
    },

    async archive({ uid, notificationId } = {}) {
      if (!uid || !notificationId) return false;
      await gateway.setUserDoc(uid, NOTIFICATIONS, notificationId, { archived: true, read: true, updatedAt: Date.now() });
      return true;
    },

    async loadPreferences({ uid } = {}) {
      if (!uid) return defaultMobileNotificationPreferences(uid);
      const record = await gateway.getUserDoc(uid, PREFERENCES, 'main');
      return record && record.data
        ? normalizeMobileNotificationPreferences({ ...record.data, uid }, uid)
        : defaultMobileNotificationPreferences(uid);
    },

    async savePreferences({ uid, preferences } = {}) {
      if (!uid) throw new Error('savePreferences requires uid');
      const normalized = normalizeMobileNotificationPreferences({ ...preferences, uid, updatedAt: Date.now() }, uid);
      await gateway.setUserDoc(uid, PREFERENCES, 'main', normalized);
      return normalized;
    },
  };
}

export { NOTIFICATIONS as MOBILE_NOTIFICATIONS_SUBCOLLECTION, PREFERENCES as MOBILE_NOTIFICATION_PREFERENCES_SUBCOLLECTION };
export default createMobileNotificationRepository;
