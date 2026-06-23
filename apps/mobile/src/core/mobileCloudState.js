// Pure cloud-state helpers for the mobile app.
//
// Small, serializable state shapes + transitions for auth and async cloud reads.
// No Firebase objects are stored here beyond minimal safe user info (uid/email).

export const AUTH_STATUS = {
  LOADING: 'loading',
  SIGNED_OUT: 'signed_out',
  SIGNED_IN: 'signed_in',
  CONFIG_MISSING: 'config_missing',
};

export const ASYNC_STATUS = {
  IDLE: 'idle',
  LOADING: 'loading',
  LOADED: 'loaded',
  EMPTY: 'empty',
  ERROR: 'error',
};

export function createAsyncState() {
  return { status: ASYNC_STATUS.IDLE, items: [], error: '' };
}

export function asyncLoading() {
  return { status: ASYNC_STATUS.LOADING, items: [], error: '' };
}

export function asyncLoaded(items = []) {
  const list = Array.isArray(items) ? items : [];
  return {
    status: list.length ? ASYNC_STATUS.LOADED : ASYNC_STATUS.EMPTY,
    items: list,
    error: '',
  };
}

export function asyncError(message = 'We could not load this yet.') {
  return { status: ASYNC_STATUS.ERROR, items: [], error: String(message || '') };
}

export function resolveAuthStatus({ configured, loading, user }) {
  if (!configured) return AUTH_STATUS.CONFIG_MISSING;
  if (loading) return AUTH_STATUS.LOADING;
  return user ? AUTH_STATUS.SIGNED_IN : AUTH_STATUS.SIGNED_OUT;
}

export function createCloudState() {
  return {
    auth: { status: AUTH_STATUS.LOADING, user: null },
    paths: createAsyncState(),
    discovery: createAsyncState(),
    selectedPathId: null,
    selectedPreviewId: null,
  };
}

export default {
  AUTH_STATUS,
  ASYNC_STATUS,
  createAsyncState,
  asyncLoading,
  asyncLoaded,
  asyncError,
  resolveAuthStatus,
  createCloudState,
};
