import { getAdminAuth } from './firebase-admin.js';
import { apiError } from './errors.js';

function bearerToken(req){
  const header = String(req?.headers?.authorization || '').trim();
  const match = /^Bearer\s+([^\s]+)$/i.exec(header);
  if(!match) throw apiError('unauthorized', 'Authentication is required.', 401);
  return match[1];
}

export async function requireAuth(req, verifyIdToken){
  const token = bearerToken(req);
  try{
    const decoded = await (verifyIdToken || ((value) => getAdminAuth().verifyIdToken(value, true)))(token);
    if(!decoded?.uid) throw new Error('Token has no uid.');
    return {
      uid:decoded.uid,
      email:decoded.email || null,
      name:decoded.name || null,
      token:decoded,
    };
  }catch(error){
    if(error?.code === 'internal_error') throw error;
    throw apiError('unauthorized', 'Your session is invalid or expired. Sign in again.', 401);
  }
}
