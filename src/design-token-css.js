import { DESIGN_TOKENS } from './design-tokens.js';

const META_KEYS = new Set([
  'purpose', 'usage', 'a11y', 'role', 'description', 'wcag', 'rule', 'behavior', 'pattern',
  'showSkeleton', 'showEmptyState', 'cursor',
]);

function isPlainObject(value){
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function normalizeCssValue(value, path = []){
  if(typeof value === 'number'){
    if(path[0] === 'spacing') return value + 'px';
    return String(value);
  }
  return String(value);
}

export function flattenDesignTokens(tokens = DESIGN_TOKENS, path = []){
  if(!isPlainObject(tokens)){
    return [{ path, value:normalizeCssValue(tokens, path) }];
  }
  if(Object.prototype.hasOwnProperty.call(tokens, 'value')){
    return [{ path, value:normalizeCssValue(tokens.value, path) }];
  }
  return Object.entries(tokens).flatMap(([key, value]) => {
    if(META_KEYS.has(key)) return [];
    if(Array.isArray(value)) return [];
    if(isPlainObject(value) || typeof value !== 'function'){
      return flattenDesignTokens(value, [...path, key]);
    }
    return [];
  });
}

export function tokenPathToCssVariable(path = []){
  const name = (Array.isArray(path) ? path : [])
    .filter(Boolean)
    .map(part => String(part) === 'spacing' ? 'space' : part)
    .map(part => String(part).replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase())
    .join('-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return name ? '--lpt-' + name : '--lpt-token';
}

export function designTokensToCssVariables(tokens = DESIGN_TOKENS){
  const entries = flattenDesignTokens(tokens);
  return entries.map(entry => ({
    name:tokenPathToCssVariable(entry.path),
    value:entry.value,
    path:entry.path,
  }));
}

export function designTokensToCssRoot(tokens = DESIGN_TOKENS){
  const lines = designTokensToCssVariables(tokens)
    .map(entry => '  ' + entry.name + ': ' + entry.value + ';');
  return ':root {\n' + lines.join('\n') + '\n}\n';
}

export function designTokensToThemeObject(tokens = DESIGN_TOKENS){
  return Object.fromEntries(designTokensToCssVariables(tokens).map(entry => [entry.name, entry.value]));
}
