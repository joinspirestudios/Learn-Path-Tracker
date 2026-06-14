import { fb } from './firebase.js';

function authError(){
  const error = new Error('Your session has expired. Sign in again to continue.');
  error.code = 'unauthorized';
  return error;
}

export async function authFetch(url, options = {}){
  const user = fb.auth?.currentUser;
  if(!user) throw authError();

  const request = async (forceRefresh = false) => {
    let token;
    try{ token = await user.getIdToken(forceRefresh); }
    catch(error){ throw authError(); }
    const headers = new Headers(options.headers || {});
    headers.set('Authorization', `Bearer ${token}`);
    return fetch(url, { ...options, headers });
  };

  const response = await request(false);
  if(response.status !== 401) return response;
  return request(true);
}
