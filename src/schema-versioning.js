export const CURRENT_SCHEMA_VERSIONS = {
  path: 1,
  pathStats: 1,
  member: 1,
  participantStats: 1,
  enrollment: 1,
  dayLog: 2,
  evidenceSubmission: 1,
  publicProgress: 2,
  publicProgressComment: 1,
  publicProgressReaction: 1,
  discoveryPagination: 1,
  moderationReport: 1,
  rateLimit: 1,
};

export function normalizeSchemaVersion(value, fallback = 0){
  const n = Number(value);
  if(!Number.isFinite(n) || n < 0) return fallback;
  return Math.floor(n);
}

export function currentSchemaVersion(type){
  return CURRENT_SCHEMA_VERSIONS[type] || 0;
}

export function isLegacySchema(data){
  return !data || typeof data !== 'object' || data.schemaVersion == null;
}

export function normalizeDocumentSchemaVersion(type, data = {}, fallback = 0){
  const current = currentSchemaVersion(type);
  const raw = data && typeof data === 'object' ? data.schemaVersion : null;
  const safeFallback = fallback == null ? 0 : fallback;
  const version = normalizeSchemaVersion(raw, safeFallback);
  return version > current ? version : version;
}

export function withSchemaVersion(type, data = {}){
  const current = currentSchemaVersion(type);
  const safe = data && typeof data === 'object' ? data : {};
  const explicit = normalizeSchemaVersion(safe.schemaVersion, 0);
  const schemaVersion = explicit > current ? explicit : current;
  return { ...safe, schemaVersion };
}

export function schemaLabel(type, version = null){
  const normalized = version == null ? currentSchemaVersion(type) : normalizeSchemaVersion(version, 0);
  return normalized > 0 ? `${type}@v${normalized}` : `${type}@legacy`;
}
