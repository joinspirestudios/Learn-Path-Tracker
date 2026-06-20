export function platformAccessRecordFromState({ store, id, def = store?.state?.userPaths?.[id] } = {}){
  const record = store?.platformPaths?.[id] || {};
  const path = def?.platformData || record.path || def || null;
  return {
    id,
    path,
    membership:def?.membership || record.membership || null,
    sections:record.sections || [],
    tasks:record.tasks || [],
    publicProgress:record.publicProgress || [],
    childrenLoaded:!!(record.childrenLoaded || def?.childrenLoaded),
  };
}

export function canOpenFullPlatformPath({ store, id, def = store?.state?.userPaths?.[id], canAccessFullPath } = {}){
  if(!def?.platform) return true;
  const record = platformAccessRecordFromState({ store, id, def });
  return !!canAccessFullPath?.(record.path, record.membership, store?.currentUser);
}

export function catalogCtaForPath({ owner = false, fullAccess = false } = {}){
  if(owner) return 'Open / manage &rarr;';
  return fullAccess ? 'Open &rarr;' : 'View &rarr;';
}
