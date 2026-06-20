export const DISCOVERY_PAGE_SIZE = 24;
export const DISCOVERY_PAGE_SIZE_MIN = 1;
export const DISCOVERY_PAGE_SIZE_MAX = 30;

export const DEFAULT_DISCOVERY_PAGE = {
  pageSize: DISCOVERY_PAGE_SIZE,
  loading: false,
  loadingMore: false,
  hasMore: true,
  cursor: null,
  loadedPublicIds: [],
  lastLoadedAt: 0,
  errorStatus: '',
  errorMessage: '',
};

export function boundedDiscoveryPageSize(value, fallback = DISCOVERY_PAGE_SIZE){
  const n = Math.floor(Number(value));
  const safeFallback = Math.floor(Number(fallback));
  const base = Number.isFinite(n) && n > 0 ? n : (Number.isFinite(safeFallback) && safeFallback > 0 ? safeFallback : DISCOVERY_PAGE_SIZE);
  return Math.min(DISCOVERY_PAGE_SIZE_MAX, Math.max(DISCOVERY_PAGE_SIZE_MIN, base));
}

export function dedupeDiscoveryIds(ids = []){
  const seen = new Set();
  const out = [];
  (Array.isArray(ids) ? ids : []).forEach(id => {
    const value = String(id || '').trim();
    if(!value || seen.has(value)) return;
    seen.add(value);
    out.push(value);
  });
  return out;
}

export function mergeDiscoveryLoadedIds(existing = [], incoming = []){
  return dedupeDiscoveryIds([...(Array.isArray(existing) ? existing : []), ...(Array.isArray(incoming) ? incoming : [])]);
}

export function normalizeDiscoveryPageState(value = {}){
  const state = value && typeof value === 'object' ? value : {};
  return {
    pageSize: boundedDiscoveryPageSize(state.pageSize),
    loading: !!state.loading,
    loadingMore: !!state.loadingMore,
    hasMore: state.hasMore !== false,
    cursor: state.cursor || null,
    loadedPublicIds: dedupeDiscoveryIds(state.loadedPublicIds),
    lastLoadedAt: Number.isFinite(Number(state.lastLoadedAt)) ? Number(state.lastLoadedAt) : 0,
    errorStatus: String(state.errorStatus || ''),
    errorMessage: String(state.errorMessage || ''),
  };
}

export function resetDiscoveryPageState(pageSize = DISCOVERY_PAGE_SIZE){
  return {
    ...DEFAULT_DISCOVERY_PAGE,
    pageSize: boundedDiscoveryPageSize(pageSize),
    loadedPublicIds: [],
  };
}

export function serializableDiscoveryPageState(value = {}){
  const normalized = normalizeDiscoveryPageState(value);
  return {
    ...normalized,
    cursor: null,
  };
}
