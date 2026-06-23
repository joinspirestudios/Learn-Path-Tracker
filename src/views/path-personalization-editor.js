// Web path personalization editor — owner-only. Returns HTML strings.
// Controls render only when `isOwner` is true; non-owners get nothing.

import { esc } from '../helpers.js';
import { safePathPersonalization, canEditPathPersonalization } from '../path-personalization-model.js';

export function pathPersonalizationEditorHTML(path = {}, { isOwner = false, uid = '' } = {}) {
  const owner = isOwner || canEditPathPersonalization(path, uid);
  if (!owner) return '';
  const p = (path && path.personalization) || {};
  return '<section class="panel card aurora-path-personalization-editor" aria-label="Personalize path">'
    + '<h3>Personalize this path</h3>'
    + '<div class="field"><label for="pathBannerFile">Path banner</label>'
    + '<input type="file" id="pathBannerFile" accept="image/jpeg,image/png,image/webp" disabled/>'
    + '<p class="muted" style="font-size:12px">Path banner upload is coming next.</p></div>'
    + '<div class="field"><label for="pathPublicSubtitle">Public subtitle</label>'
    + '<input type="text" id="pathPublicSubtitle" maxlength="140" value="' + esc(p.publicSubtitle || '') + '" placeholder="A short public tagline"/></div>'
    + '<div class="field"><label for="pathAccentColor">Accent color</label>'
    + '<input type="text" id="pathAccentColor" maxlength="7" value="' + esc(p.accentColor || '') + '" placeholder="#6D5DF6"/></div>'
    + '<div class="aurora-path-personalization-actions"><button class="btn gold lpt-button lpt-button-primary" id="pathPersonalizationSave" type="button">Save personalization</button></div>'
    + '</section>';
}

// Public-safe banner header for cards/previews (no storage paths).
export function pathBannerHTML(path = {}) {
  const safe = safePathPersonalization(path);
  if (!safe.bannerURL) return '';
  const style = safe.accentColor ? ' style="border-color:' + esc(safe.accentColor) + '"' : '';
  return '<div class="aurora-path-banner"' + style + '>'
    + '<img class="aurora-path-banner-img" src="' + esc(safe.bannerURL) + '" alt=""/>'
    + (safe.publicSubtitle ? '<div class="aurora-path-banner-subtitle">' + esc(safe.publicSubtitle) + '</div>' : '')
    + '</div>';
}

export default { pathPersonalizationEditorHTML, pathBannerHTML };
