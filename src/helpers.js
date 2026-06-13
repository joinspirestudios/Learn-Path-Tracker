// ── helpers.js ────────────────────────────────────────────────────────────
// Pure utilities + small UI primitives that have no app-state coupling.
// Anything here is safe to import from any other module without circular risk.

export const $ = (id) => document.getElementById(id);

function accessibilityToken(value, fallback = 'field'){
  const token = String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return token || fallback;
}

function accessibilityLabel(field){
  const wrapped = field.closest('label');
  if(wrapped) return wrapped;
  const parent = field.parentElement;
  if(!parent) return null;
  return Array.from(parent.children).find(child => child.tagName === 'LABEL') || null;
}

export function enhanceFormAccessibility(root = document){
  const fields = Array.from(root.querySelectorAll('input, textarea, select'));
  const occurrences = new Map();
  fields.forEach((field, index) => {
    const label = accessibilityLabel(field);
    const scope = field.closest('[id]')?.id || (field.closest('.modal-overlay') ? 'modal' : 'content');
    const identity = field.dataset.key
      || field.dataset.task
      || field.dataset.id
      || field.dataset.wi
      || field.getAttribute('placeholder')
      || label?.textContent
      || field.classList[0]
      || field.type
      || `field-${index + 1}`;
    const base = `lpt-${accessibilityToken(scope, 'view')}-${accessibilityToken(identity)}`;
    const count = (occurrences.get(base) || 0) + 1;
    occurrences.set(base, count);
    if(!field.id){
      let candidate = count === 1 ? base : `${base}-${count}`;
      let suffix = count;
      while(document.getElementById(candidate) && document.getElementById(candidate) !== field){
        suffix += 1;
        candidate = `${base}-${suffix}`;
      }
      field.id = candidate;
    }
    if(!field.name) field.name = field.id;
    if(label && !label.contains(field)) label.htmlFor = field.id;
    if(!label && !field.getAttribute('aria-label')){
      field.setAttribute('aria-label', field.getAttribute('placeholder') || field.name);
    }
  });

  root.querySelectorAll('button').forEach(button => {
    if(button.hasAttribute('aria-label')) return;
    const text = String(button.textContent || '').trim();
    const iconOnly = button.classList.contains('icon-btn')
      || button.classList.contains('modal-x')
      || button.classList.contains('ut-x')
      || /^[x+\-\u00d7\u2190\u2192\u22ee\u2026]$/i.test(text);
    if(!iconOnly) return;
    const action = button.dataset.act || '';
    const fallback = action.startsWith('del') ? 'Remove' : (button.classList.contains('modal-x') ? 'Close' : 'Action');
    button.setAttribute('aria-label', button.title || fallback);
  });
}

export function installFormAccessibility(){
  enhanceFormAccessibility(document);
  let queued = false;
  const observer = new MutationObserver(() => {
    if(queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      enhanceFormAccessibility(document);
    });
  });
  observer.observe(document.documentElement, { childList:true, subtree:true });
  return observer;
}

/* HTML escape — apply to every user-controlled string going into innerHTML.
   For new render code, prefer the `html` tagged template below which escapes
   automatically. */
export function esc(s){
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

/* Tagged template literal that auto-escapes interpolated values.
   Usage:
       html`<div class="card">${userInput}</div>`
   To inject already-trusted HTML (e.g. a sub-template), wrap with html.raw:
       html`<div>${html.raw(trustedFragment)}</div>`
   Existing renders use esc() directly and are already safe; this helper exists
   so new render code starts safe-by-default. */
const _RAW = Symbol('raw');
export function html(strings, ...values){
  let out = strings[0];
  for(let i = 0; i < values.length; i++){
    const v = values[i];
    out += (v != null && typeof v === 'object' && _RAW in v)
      ? v[_RAW]
      : esc(v == null ? '' : String(v));
    out += strings[i+1];
  }
  return out;
}
html.raw = (s) => ({ [_RAW]: s == null ? '' : String(s) });

/* Date helpers */
export function dstr(d){
  return d.getFullYear()
    + '-' + String(d.getMonth()+1).padStart(2,'0')
    + '-' + String(d.getDate()).padStart(2,'0');
}
export function addDays(d, n){ const x = new Date(d); x.setDate(x.getDate()+n); return x; }
export function todayKey(){
  const order = ['mon','tue','wed','thu','fri','sat','sun'];
  return order[(new Date().getDay()+6) % 7];
}

/* Tiny localStorage adapter — async-shaped so a future remote store can swap
   in without changing callers. */
export const Store = {
  async get(k){    try{ return localStorage.getItem(k); }catch(e){ return null; } },
  async set(k,v){  try{ localStorage.setItem(k,v); return true; }catch(e){ return false; } },
  async del(k){    try{ localStorage.removeItem(k); }catch(e){} },
  async list(p){
    try{
      const a=[];
      for(let i=0; i<localStorage.length; i++){
        const k = localStorage.key(i);
        if(k && k.indexOf(p) === 0) a.push(k);
      }
      return a;
    }catch(e){ return []; }
  },
};

/* Synced/Saved kicker in the header. Pass an explicit string to override the
   default (the default reflects cloud-vs-local mode). */
export function flash(text){
  const s = $('saved'); if(!s) return;
  s.textContent = text || 'Saved ✓';
  s.classList.add('show');
  clearTimeout(flash._t);
  flash._t = setTimeout(() => s.classList.remove('show'), 1100);
}

/* Undo toast — destructive actions apply immediately and surface a 6s window
   to reverse. Single instance: opening a new toast replaces any previous one
   (Gmail pattern, keeps mobile clean). */
export function undoToast(message, onUndo, timeoutMs = 6000){
  const old = document.getElementById('undo-toast'); if(old) old.remove();
  const t = document.createElement('div');
  t.id = 'undo-toast'; t.className = 'undo-toast';
  t.innerHTML = '<span class="ut-msg"></span>'
    + '<button class="ut-btn" type="button">Undo</button>'
    + '<button class="ut-x" type="button" aria-label="Dismiss">×</button>';
  t.querySelector('.ut-msg').textContent = message;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  let timer;
  const dismiss = () => {
    clearTimeout(timer);
    t.classList.remove('show');
    setTimeout(() => t.remove(), 220);
  };
  timer = setTimeout(dismiss, timeoutMs);
  t.querySelector('.ut-btn').onclick = () => {
    dismiss();
    try{ onUndo(); }catch(e){ console.warn('undo failed:', e); }
  };
  t.querySelector('.ut-x').onclick = dismiss;
}

/* Generic info modal. Body is treated as HTML — pass trusted content only. */
export function showInfo(title, bodyHtml){
  const o = document.createElement('div'); o.className = 'modal-overlay';
  o.innerHTML = '<div class="modal-box"><div class="modal-head"><h3>'
    + esc(title) + '</h3><button class="modal-x">×</button></div>'
    + '<div class="modal-body">' + bodyHtml + '</div></div>';
  document.body.appendChild(o);
  const close = () => o.remove();
  o.addEventListener('click', e => { if(e.target === o) close(); });
  o.querySelector('.modal-x').onclick = close;
}
