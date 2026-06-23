// Web profile editor — returns HTML strings (matches the codebase style).
// Never renders ID tokens, email is shown only as the signed-in account label,
// and private auth metadata is never exposed.

import { esc } from '../helpers.js';
import { safePublicProfile } from '../user-profile-model.js';

export function profilePreviewCardHTML(profile = {}) {
  const safe = safePublicProfile(profile) || {};
  const avatar = safe.avatarURL
    ? '<img class="aurora-profile-avatar" src="' + esc(safe.avatarURL) + '" alt=""/>'
    : '<div class="aurora-profile-avatar is-empty" aria-hidden="true"></div>';
  return '<section class="panel card aurora-profile-preview">'
    + (safe.coverURL ? '<img class="aurora-profile-cover" src="' + esc(safe.coverURL) + '" alt=""/>' : '')
    + '<div class="aurora-profile-preview-head">' + avatar
    + '<div><div class="aurora-profile-name">' + esc(safe.displayName || 'Your name') + '</div>'
    + (safe.username ? '<div class="aurora-profile-handle">@' + esc(safe.username) + '</div>' : '')
    + '</div></div>'
    + (safe.bio ? '<p class="aurora-profile-bio">' + esc(safe.bio) + '</p>' : '')
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
    + '<input type="file" id="profileAvatarFile" accept="image/jpeg,image/png,image/webp"/></div>'
    + '<div class="field"><label for="profileCoverFile">Cover image</label>'
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

export default { profilePreviewCardHTML, profileEditorHTML, profileSectionHTML };
