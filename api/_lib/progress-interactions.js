import { randomUUID } from 'node:crypto';

import { apiError } from './errors.js';
import { boundedText } from './http.js';
import { safeExternalUrl } from '../../src/urls.js';
import {
  PUBLIC_COMMENT_MAX,
  cleanAuthorName,
  cleanPublicCommentBody,
  emptyReactionCounts,
  normalizePublicComment,
  normalizeReactionCounts,
  normalizeReactionType,
  totalReactionCount,
} from '../../src/public-progress.js';

export function cleanPathId(value, field = 'pathId'){
  const id = boundedText(value, field, 180, { required:true });
  if(!/^[a-zA-Z0-9_-]+$/.test(id)) throw apiError('invalid_request', `${field} is invalid.`, 400);
  return id;
}

export function cleanEntryId(value){
  return cleanPathId(value, 'entryId');
}

export function cleanCommentId(value){
  const id = boundedText(value, 'commentId', 180, { required:true });
  if(!/^[a-zA-Z0-9_-]+$/.test(id)) throw apiError('invalid_request', 'commentId is invalid.', 400);
  return id;
}

export function cleanRequestedReaction(value){
  if(value == null || value === '') return null;
  const reaction = normalizeReactionType(value);
  if(!reaction) throw apiError('invalid_reaction', 'This reaction is not supported.', 400);
  return reaction;
}

export function cleanStoredReaction(value){
  return normalizeReactionType(value);
}

export function cleanCommentBody(value){
  if(typeof value !== 'string') throw apiError('invalid_comment', 'Comment body must be text.', 400);
  const trimmed = value.trim();
  if(!trimmed) throw apiError('invalid_comment', 'Comment cannot be empty.', 400);
  if(trimmed.length > PUBLIC_COMMENT_MAX) throw apiError('invalid_comment', 'Comment is too long.', 400);
  return cleanPublicCommentBody(trimmed);
}

export function publicUser(auth){
  const token = auth.token || {};
  return {
    uid:auth.uid,
    name:auth.name || token.name || token.displayName || null,
    photoURL:token.picture || token.photoURL || null,
  };
}

export function visiblePublicPath(path){
  return path && (path.visibility === 'public' || path.visibility === 'unlisted');
}

export function visiblePublicEntry(entry, pathId, entryId){
  return !!(
    entry &&
    entry.pathId === pathId &&
    entry.id === entryId &&
    entry.visibility === 'public' &&
    (entry.status === 'completed' || entry.status === 'visible')
  );
}

export function ensureInteractable(pathSnap, entrySnap, pathId, entryId){
  if(!pathSnap.exists) throw apiError('path_not_found', 'This path could not be found.', 404);
  const path = pathSnap.data() || {};
  if(!visiblePublicPath(path)) throw apiError('path_not_public', 'This progress entry is not public.', 403);
  if(!entrySnap.exists) throw apiError('progress_not_found', 'This public progress entry could not be found.', 404);
  const entry = entrySnap.data() || {};
  if(!visiblePublicEntry(entry, pathId, entryId)){
    throw apiError('progress_not_found', 'This public progress entry could not be found.', 404);
  }
  return { path, entry };
}

export function entryCounters(entry = {}){
  const reactionCounts = normalizeReactionCounts(entry.reactionCounts || emptyReactionCounts());
  return {
    reactionCounts,
    totalReactionCount:totalReactionCount(reactionCounts),
    visibleCommentCount:Math.max(0, Math.floor(Number(entry.visibleCommentCount || 0) || 0)),
  };
}

export function reactionResponse(pathId, entryId, reaction, counters){
  return {
    pathId,
    entryId,
    reaction,
    reactionCounts:counters.reactionCounts,
    totalReactionCount:counters.totalReactionCount,
  };
}

export function commentResponse(comment){
  const safe = normalizePublicComment(comment);
  return {
    id:safe.id,
    pathId:safe.pathId,
    entryId:safe.entryId,
    userId:safe.userId,
    authorName:safe.authorName,
    authorPhotoURL:safe.authorPhotoURL,
    body:safe.body,
    visibility:safe.visibility,
    status:safe.status,
    createdAt:safe.createdAt,
    updatedAt:safe.updatedAt,
    schemaVersion:safe.schemaVersion,
  };
}

export function makeComment({ pathId, entryId, auth, body, now }){
  const user = publicUser(auth);
  const id = 'comment_' + randomUUID().replace(/-/g, '').slice(0, 24);
  const stamp = now();
  return {
    id,
    pathId,
    entryId,
    userId:auth.uid,
    authorName:cleanAuthorName(user.name),
    authorPhotoURL:safeExternalUrl(user.photoURL) || '',
    body,
    visibility:'public',
    status:'visible',
    createdAt:stamp,
    updatedAt:stamp,
    hiddenAt:null,
    hiddenBy:'',
    hiddenReason:'',
    schemaVersion:1,
  };
}
