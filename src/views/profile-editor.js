// Web profile editor — returns HTML strings (matches the codebase style).
// Never renders ID tokens; email is shown only as the signed-in account label,
// and private auth metadata is never exposed.

import { esc } from '../helpers.js';
import { safePublicProfile } from '../user-profile-model.js';

function initialsFor(name, username) {
  const src = String(name || username || '').trim();
  if (!src) return '?';
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

export function profileAvatarMarkHTML(profile = {}, className = 'aurora-profile-avatar') {
  const safe = safePublicProfile(profile) || {};
  if (safe.avatarURL) {
    return '<img class="' + esc(className) + '" src="' + esc(safe.avatarURL) + '" alt=""/>';
  }
  return '<div class="' + esc(className) + ' is-empty" aria-hidden="true">' + esc(initialsFor(safe.displayName, safe.username)) + '</div>';
}

export function profilePreviewCardHTML(profile = {}) {
  const safe = safePublicProfile(profile) || {};
  const website = safe && profile.websiteURL ? profile.websiteURL : '';
  return '<section class="panel card aurora-profile-preview">'
    + (safe.coverURL
      ? '<img class="aurora-profile-cover" src="' + esc(safe.coverURL) + '" alt=""/>'
      : '<div class="aurora-profile-cover is-empty" aria-hidden="true"></div>')
    + '<div class="aurora-profile-preview-head">' + profileAvatarMarkHTML(profile)
    + '<div class="aurora-profile-identity"><div class="aurora-profile-name">' + esc(safe.displayName || 'Your name') + '</div>'
    + (safe.username ? '<div class="aurora-profile-handle">@' + esc(safe.username) + '</div>' : '')
    + '<div class="aurora-profile-visibility">' + (safe.publicProfileEnabled ? 'Public profile' : 'Private profile') + '</div>'
    + '</div></div>'
    + (safe.bio ? '<p class="aurora-profile-bio">' + esc(safe.bio) + '</p>' : '')
    + (website ? '<a class="aurora-profile-website" href="' + esc(website) + '" target="_blank" rel="noopener noreferrer">' + esc(website) + '</a>' : '')
    + '</section>';
}

export function profileEditorHTML(profile = {}) {
  const p = profile || {};
  return '<section class="panel card aurora-profile-editor" aria-label="Edit profile">'
    + '<h3>Edit profile</h3>'
    + '<div class="field"><label for="profileDisplayName">Display name</label>'
    + '<input type="text" id="profileDisplayName" maxlength="60" value="' + esc(p.displayName || '') + '" placeholder="Your name"/></div>'
    + '<div class="field"><label for="profileUsername">Username</label>'
    + '<input type="text" id="profileUsername" maxlength="24" value="' + esc(p.username || p.usernameLower || '') + '" placeholder="your_handle"/>'
    + '<p class="muted" style="font-size:12px">3–24 chars, lowercase letters, numbers, underscore or period.</p></div>'
    + '<div class="field"><label for="profileBio">Bio</label>'
    + '<textarea id="profileBio" maxlength="300" placeholder="A short intro">' + esc(p.bio || '') + '</textarea></div>'
    + '<div class="field"><label for="profileWebsite">Website</label>'
    + '<input type="text" id="profileWebsite" value="' + esc(p.websiteURL || '') + '" placeholder="https://..."/></div>'
    + '<div class="field"><label for="profileAvatarFile">Profile picture</label>'
    + '<img id="profileAvatarPreview" class="aurora-profile-avatar-preview" alt="" src="' + esc(p.avatarURL || '') + '"' + (p.avatarURL ? '' : ' style="display:none"') + '/>'
    + '<input type="file" id="profileAvatarFile" accept="image/jpeg,image/png,image/webp"/></div>'
    + '<div class="field"><label for="profileCoverFile">Cover image</label>'
    + '<img id="profileCoverPreview" class="aurora-profile-cover-preview" alt="" src="' + esc(p.coverURL || '') + '"' + (p.coverURL ? '' : ' style="display:none"') + '/>'
    + '<input type="file" id="profileCoverFile" accept="image/jpeg,image/png,image/webp"/></div>'
    + '<label class="toggle-row"><input type="checkbox" id="profilePublicEnabled" ' + (p.publicProfileEnabled !== false ? 'checked' : '') + '/> Show my public profile details</label>'
    + '<div class="aurora-profile-editor-actions"><button class="btn gold lpt-button lpt-button-primary" id="profileSave" type="button">Save profile</button></div>'
    + '<div class="aurora-profile-editor-status" id="profileSaveStatus" aria-live="polite"></div>'
    + '</section>';
}

export function profileSectionHTML(profile = {}) {
  return '<div class="aurora-profile-grid">'
    + profilePreviewCardHTML(profile)
    + profileEditorHTML(profile)
    + '</div>';
}

export default { profileAvatarMarkHTML, profilePreviewCardHTML, profileEditorHTML, profileSectionHTML };
