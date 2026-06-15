function escapeHtml(value){
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function safeExternalUrl(value){
  const candidate = String(value == null ? '' : value).trim();
  if(!candidate) return null;
  try{
    const parsed = new URL(candidate);
    if(parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.toString();
  }catch(error){
    return null;
  }
}

export function externalLinkHTML(value, label, options = {}){
  const safeUrl = safeExternalUrl(value);
  const text = escapeHtml(label || value || options.fallbackLabel || 'Unavailable link');
  const className = String(options.className || '').replace(/[^a-zA-Z0-9 _-]/g, '').trim();
  const classAttr = className ? ` class="${className}"` : '';
  if(!safeUrl){
    const invalidClass = ['invalid-link', className].filter(Boolean).join(' ');
    return `<span class="${invalidClass}" aria-disabled="true">${text}</span>`;
  }
  return `<a${classAttr} href="${escapeHtml(safeUrl)}" target="_blank" rel="noopener noreferrer">${text}</a>`;
}
