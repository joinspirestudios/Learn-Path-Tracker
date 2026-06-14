import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { apiError } from './errors.js';

function adminConfig(){
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if(!projectId || !clientEmail || !privateKey){
    throw apiError(
      'internal_error',
      'Server authentication is not configured.',
      503
    );
  }
  return { projectId, clientEmail, privateKey };
}

export function getAdminApp(){
  return getApps()[0] || initializeApp({ credential:cert(adminConfig()) });
}

export function getAdminAuth(){
  return getAuth(getAdminApp());
}

export function getAdminFirestore(){
  return getFirestore(getAdminApp());
}
