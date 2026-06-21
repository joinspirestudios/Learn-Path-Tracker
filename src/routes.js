const PATH_ID_RE = /^[a-zA-Z0-9_-]+$/;

function safeDecode(value){
  try{ return decodeURIComponent(String(value || '')); }
  catch(error){ return ''; }
}

export function cleanPathId(value){
  const id = safeDecode(value).trim();
  return PATH_ID_RE.test(id) ? id : '';
}

function parseParts(parts, source){
  if(parts[0] !== 'path') return null;
  const id = cleanPathId(parts[1]);
  if(!id) return null;
  const mode = safeDecode(parts[2] || 'plan') || 'plan';
  const preview = mode === 'preview';
  const tab = preview ? null : (mode === 'roadmap' ? 'plan' : mode);
  const dayIdx = parts.indexOf('day');
  const rawDay = dayIdx >= 0 ? Number(parts[dayIdx + 1] || 0) : null;
  const day = Number.isFinite(rawDay) && rawDay > 0 ? Math.floor(rawDay) : null;
  const focus = day ? parts.indexOf('focus') > dayIdx : false;
  return {
    kind:'path',
    id,
    preview,
    options:{ tab, day, focus },
    source,
  };
}

export function pathHash(id, tab = 'plan', day = null){
  const cleanId = cleanPathId(id);
  if(!cleanId) return '#/discover';
  let hash = '#/path/' + encodeURIComponent(cleanId) + '/' + encodeURIComponent(tab || 'plan');
  if(day != null) hash += '/roadmap/day/' + encodeURIComponent(day);
  return hash;
}

export function focusHash(id, day){
  const cleanId = cleanPathId(id);
  if(!cleanId || !day) return '#/discover';
  return '#/path/' + encodeURIComponent(cleanId) + '/plan/roadmap/day/' + encodeURIComponent(day) + '/focus';
}

export function pathPreviewHash(id){
  const cleanId = cleanPathId(id);
  return cleanId ? '#/path/' + encodeURIComponent(cleanId) + '/preview' : '#/discover';
}

export function pathPreviewPath(id){
  const cleanId = cleanPathId(id);
  return cleanId ? '/path/' + encodeURIComponent(cleanId) + '/preview' : '/';
}

export function hashRouteUrl(hash, origin = globalThis.location?.origin || ''){
  const route = String(hash || '#/discover');
  return origin ? origin.replace(/\/$/, '') + '/' + route : route;
}

export function pathShareLink(id, origin = globalThis.location?.origin || ''){
  const path = pathPreviewPath(id);
  return origin ? origin.replace(/\/$/, '') + path : path;
}

export function legacyPathShareLink(id, origin = globalThis.location?.origin || ''){
  return hashRouteUrl(pathPreviewHash(id), origin);
}

export function parsePathRoute({ hash = '', pathname = '', search = '' } = {}){
  const rawHash = String(hash || '').replace(/^#\/?/, '');
  if(rawHash){
    const hashParts = rawHash.split('/').map(safeDecode);
    const hashRoute = parseParts(hashParts, 'hash');
    if(hashRoute) return hashRoute;
  }
  const cleanPath = String(pathname || '').replace(/^\/+/, '').replace(/\/+$/, '');
  if(cleanPath){
    const pathParts = cleanPath.split('/').map(safeDecode);
    const pathRoute = parseParts(pathParts, 'pathname');
    if(pathRoute) return pathRoute;
  }
  const query = new URLSearchParams(String(search || '').replace(/^\?/, ''));
  const queryId = cleanPathId(query.get('pathId') || '');
  if(queryId) return { kind:'path', id:queryId, preview:true, options:{ tab:null, day:null }, source:'search' };
  return null;
}

export function initialRouteIntent(locationLike = {}, lastRoute = ''){
  const current = parsePathRoute(locationLike);
  if(current) return { pathRoute:current, restoreHash:null, source:'current-url' };
  const hash = String(locationLike.hash || '');
  if(hash) return { pathRoute:parsePathRoute({ hash }), restoreHash:null, source:'hash' };
  const stored = String(lastRoute || '');
  return { pathRoute:parsePathRoute({ hash:stored }), restoreHash:stored || null, source:'last-route' };
}

export function makePendingPathRoute(route, waitingFor = 'cloud'){
  if(!route || route.kind !== 'path') return null;
  return {
    kind:'path',
    id:route.id,
    preview:!!route.preview,
    options:{ ...(route.options || {}), focus:!!(route.options?.focus) },
    source:route.source || 'hash',
    waitingFor,
    attemptedAt:Date.now(),
    attempts:Number(route.attempts || 0),
  };
}
