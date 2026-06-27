// Mobile Gemini Vision (pure). Normalizes a server vision observation for safe
// display and exposes the consent/disclaimer copy. Mobile NEVER calls Gemini
// directly, never holds the API key, never sends localUri/base64/storage paths,
// and never auto-analyzes. No web/DOM imports.

export const MOBILE_VISION_CONSENT_COPY = 'Analyze this proof image with AI? Vision insights are private by default and help describe what the image appears to show. They do not verify that the activity happened.';
export const MOBILE_VISION_DISCLAIMER = 'Vision insights describe what an image appears to show. They do not verify that an activity happened.';

const TASK_ALIGNMENTS = ['clear_context', 'needs_caption', 'needs_better_evidence', 'unrelated_or_unclear', 'unknown'];
const UNCERTAINTIES = ['low', 'medium', 'high', 'unknown'];

function str(value, max = 600) { return String(value == null ? '' : value).slice(0, max); }

export function normalizeMobileVisionDraft(raw = {}) {
  const o = raw && typeof raw === 'object' ? raw : {};
  return {
    id: str(o.id, 200),
    pathId: str(o.pathId, 120),
    status: ['draft', 'reviewed', 'dismissed', 'failed'].includes(o.status) ? o.status : 'draft',
    imageObservation: str(o.imageObservation, 600),
    needsMoreContext: o.needsMoreContext === true,
    suggestedCaption: str(o.suggestedCaption, 160),
    taskAlignment: TASK_ALIGNMENTS.includes(o.taskAlignment) ? o.taskAlignment : 'unknown',
    uncertainty: UNCERTAINTIES.includes(o.uncertainty) ? o.uncertainty : 'unknown',
  };
}

export function mobileVisionSummary(draft = {}) {
  const o = normalizeMobileVisionDraft(draft);
  if (o.imageObservation) return o.imageObservation;
  if (o.needsMoreContext) return 'This proof image appears to need more context.';
  return 'A private vision insight for this proof image.';
}

// Map a server disabledReason to safe display copy.
export function mobileVisionDisabledCopy(reason) {
  switch (reason) {
    case 'vision_disabled': return 'Vision analysis is not enabled yet.';
    case 'missing_api_key': return 'Vision analysis is not configured.';
    case 'image_too_large': return 'This proof image is too large.';
    case 'unsupported_media_type': return 'This proof type is not supported yet.';
    case 'missing_image': return 'This proof image could not be loaded.';
    case 'rate_limited': return 'Vision analysis is busy. Try again shortly.';
    default: return 'Vision analysis could not be completed.';
  }
}

export default {
  MOBILE_VISION_CONSENT_COPY,
  MOBILE_VISION_DISCLAIMER,
  normalizeMobileVisionDraft,
  mobileVisionSummary,
  mobileVisionDisabledCopy,
};
