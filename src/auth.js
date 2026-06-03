// ── auth.js ───────────────────────────────────────────────────────────────
// Firebase auth flow + the email/password/Google sign-in modal.
// Exposes setSignInHandler() so main.js can register what runs after a
// successful auth state change without us needing to import main (circular).

import { fb } from './firebase.js';
import { store } from './store.js';

/* Callback registry — main.js sets these on init. */
let _onSignedIn = null;
let _onSignedOut = null;
export function setSignInHandler(fn){  _onSignedIn  = fn; }
export function setSignOutHandler(fn){ _onSignedOut = fn; }

/* ---- auth label cache (so refreshes don't flash the sign-in button) ----
   We store only a first name (never the full email) so the kicker never briefly
   reads "WELCOME, NAME@DOMAIN.COM" before onAuthStateChanged resolves. */
export function cacheAuthLabel(u){
  try{
    const name = ((u.displayName || '').split(' ')[0])
              || ((u.email || '').split('@')[0])
              || '';
    if(name) localStorage.setItem('lpt_auth', name);
  }catch(e){}
}
export function clearAuthLabel(){ try{ localStorage.removeItem('lpt_auth'); }catch(e){} }
export function cachedAuthLabel(){ try{ return localStorage.getItem('lpt_auth'); }catch(e){ return null; } }

/* ---- friendly error messages ---- */
export function authMsg(code){
  return ({
    'auth/email-already-in-use':'That email already has an account. Try logging in instead.',
    'auth/invalid-email':'That email address looks invalid.',
    'auth/weak-password':'Password is too weak (use at least 6 characters).',
    'auth/wrong-password':'Wrong password. Try again or reset it.',
    'auth/user-not-found':'No account with that email. Create one instead.',
    'auth/invalid-credential':'Email or password is incorrect.',
    'auth/operation-not-allowed':'Email sign-in is not enabled yet. Firebase → Authentication → Sign-in method → enable Email/Password.',
    'auth/too-many-requests':'Too many attempts. Wait a moment and try again.',
  })[code] || ('Could not continue: ' + code);
}

/* ---- public name from currentUser (or the cached pending label) ---- */
export function firstName(){
  const n = store.currentUser
    ? (store.currentUser.displayName || (store.currentUser.email || '').split('@')[0])
    : (!store.authChecked ? cachedAuthLabel() : '');
  return n ? String(n).split(' ')[0] : '';
}

/* ---- Firebase init: wire onAuthStateChanged once + flush any redirect result ---- */
export function initFirebase(){
  if(fb.ready){
    fb.onAuthStateChanged(fb.auth, onAuth);
    fb.getRedirectResult(fb.auth).catch(e => console.warn('redirect result:', e && e.code, e));
  }
  return fb.ready;
}

async function onAuth(user){
  store.authChecked = true;
  store.currentUser = user || null;
  if(user){
    cacheAuthLabel(user);
    if(_onSignedIn) await _onSignedIn();
  } else {
    clearAuthLabel();
    if(_onSignedOut) _onSignedOut();
  }
}

/* ---- Google ---- */
export async function signIn(){
  if(!fb.ready){
    alert("Cloud sync isn't configured - add your Firebase env vars (see README).");
    return;
  }
  const provider = new fb.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try{
    await fb.signInWithPopup(fb.auth, provider);
  }catch(e){
    const code = (e && e.code) ? e.code : String(e);
    console.warn('sign-in error:', code, e);
    if(code === 'auth/operation-not-allowed'){
      alert("Google sign-in isn't enabled. Firebase → Authentication → Sign-in method → enable Google.");
      return;
    }
    if(code === 'auth/unauthorized-domain'){
      alert("This domain isn't authorized. Firebase → Authentication → Settings → Authorized domains.");
      return;
    }
    if([
      'auth/popup-blocked','auth/popup-closed-by-user','auth/cancelled-popup-request',
      'auth/operation-not-supported-in-this-environment','auth/web-storage-unsupported',
      'auth/internal-error',
    ].includes(code)){
      try{ await fb.signInWithRedirect(fb.auth, provider); }
      catch(e2){ alert('Redirect sign-in also failed: ' + ((e2 && e2.code) || e2)); }
      return;
    }
    alert('Sign-in failed: ' + code);
  }
}

/* ---- email/password ---- */
export async function emailSignup(name, email, pw){
  const cred = await fb.createUserWithEmailAndPassword(fb.auth, email, pw);
  if(name){ try{ await fb.updateProfile(cred.user, { displayName: name }); }catch(e){} }
}
export async function emailLogin(email, pw){ await fb.signInWithEmailAndPassword(fb.auth, email, pw); }
export async function doSignOut(){ try{ await fb.signOut(fb.auth); }catch(e){ console.warn(e); } }

/* ---- the auth modal (email/password + Google) ---- */
export function openAuthModal(mode){
  if(!fb.ready){
    alert("Cloud sync isn't configured - add your Firebase env vars (see README).");
    return;
  }
  const o = document.createElement('div'); o.className = 'modal-overlay';
  o.innerHTML = '<div class="modal-box auth-modal"><div class="modal-head"><h3 id="amTitle"></h3><button class="modal-x">×</button></div>'
    + '<div class="modal-body">'
    + '<div class="am-err" id="amErr"></div>'
    + '<div class="field" id="amNameField"><label>Name</label><input type="text" id="amName" placeholder="What should we call you?" autocomplete="name"/></div>'
    + '<div class="field" style="margin-top:10px"><label>Email</label><input type="email" id="amEmail" placeholder="you@email.com" autocomplete="email"/></div>'
    + '<div class="field" style="margin-top:10px"><label>Password</label><input type="password" id="amPass" placeholder="At least 6 characters" autocomplete="current-password"/></div>'
    + '<button class="linklike am-forgot" id="amForgot" style="margin-top:8px">Forgot password?</button>'
    + '<button class="btn gold am-primary" id="amPrimary" style="width:100%;margin-top:14px"></button>'
    + '<div class="am-or"><span>or</span></div>'
    + '<button class="gbtn am-google" id="amGoogle" style="width:100%;justify-content:center"><span class="gg">G</span> Continue with Google</button>'
    + '<div class="am-toggle" id="amToggle"></div>'
    + '</div></div>';
  document.body.appendChild(o);
  const close = () => o.remove();
  o.addEventListener('click', e => { if(e.target === o) close(); });
  o.querySelector('.modal-x').onclick = close;
  const err = o.querySelector('#amErr');
  const showErr = m => { err.textContent = m; err.style.display = m ? 'block' : 'none'; };

  function paint(){
    const signup = mode === 'signup';
    o.querySelector('#amTitle').textContent = signup ? 'Create your account' : 'Welcome back';
    o.querySelector('#amNameField').style.display = signup ? '' : 'none';
    o.querySelector('#amForgot').style.display = signup ? 'none' : '';
    o.querySelector('#amPrimary').textContent = signup ? 'Create account' : 'Log in';
    o.querySelector('#amPass').setAttribute('autocomplete', signup ? 'new-password' : 'current-password');
    o.querySelector('#amToggle').innerHTML = signup
      ? 'Already have an account? <button class="linklike" id="amSwap">Log in</button>'
      : 'New here? <button class="linklike" id="amSwap">Create an account</button>';
    o.querySelector('#amSwap').onclick = () => { mode = signup ? 'login' : 'signup'; showErr(''); paint(); };
    showErr('');
  }
  paint();

  o.querySelector('#amGoogle').onclick = () => { close(); signIn(); };
  o.querySelector('#amForgot').onclick = async () => {
    const email = o.querySelector('#amEmail').value.trim();
    if(!email){ showErr('Enter your email above first, then tap reset.'); return; }
    try{ await fb.sendPasswordResetEmail(fb.auth, email); showErr('Reset link sent. Check your inbox.'); }
    catch(e){ showErr(authMsg(e && e.code)); }
  };
  o.querySelector('#amPrimary').onclick = async () => {
    const name  = o.querySelector('#amName').value.trim();
    const email = o.querySelector('#amEmail').value.trim();
    const pw    = o.querySelector('#amPass').value;
    if(!email || !pw){ showErr('Enter your email and password.'); return; }
    const btn = o.querySelector('#amPrimary'); btn.disabled = true; btn.textContent = 'Working...';
    try{
      if(mode === 'signup') await emailSignup(name, email, pw);
      else                  await emailLogin(email, pw);
      close(); // onAuthStateChanged restores the rest
    }catch(e){ showErr(authMsg(e && e.code)); btn.disabled = false; paint(); }
  };
}
