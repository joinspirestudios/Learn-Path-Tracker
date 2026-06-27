// ── server/gemini-vision-provider.js ────────────────────────────────────────
// Server-only Gemini Vision client. Uses the Gemini REST API via `fetch`
// (injectable for tests). GEMINI_API_KEY is read from the environment and NEVER
// exposed to the client/mobile. The feature is gated by GEMINI_VISION_ENABLED.
// It never logs image bytes or raw prompts containing private data, and returns
// safe disabled reasons instead of throwing.

import { buildGeminiVisionPrompt } from './evidence-vision-sanitizer.js';

export const SUPPORTED_VISION_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export function geminiVisionConfig(env = process.env) {
  return {
    enabled: String(env.GEMINI_VISION_ENABLED || '').toLowerCase() === 'true',
    apiKey: String(env.GEMINI_API_KEY || '').trim(),
    model: String(env.GEMINI_VISION_MODEL || 'gemini-2.5-flash').trim() || 'gemini-2.5-flash',
    maxImageMb: Math.max(1, Number(env.GEMINI_VISION_MAX_IMAGE_MB) || 10),
  };
}

// Configured = explicitly enabled AND an API key is present (server-only).
export function geminiVisionConfigured(env = process.env) {
  const cfg = geminiVisionConfig(env);
  return cfg.enabled && !!cfg.apiKey;
}

function base64Bytes(base64) {
  const s = String(base64 || '').replace(/^data:[^;]+;base64,/, '');
  // 4 base64 chars ≈ 3 bytes; padding accounted for.
  const len = s.length;
  if (!len) return 0;
  const padding = (s.endsWith('==') ? 2 : (s.endsWith('=') ? 1 : 0));
  return Math.floor((len * 3) / 4) - padding;
}

// Extract structured JSON from a Gemini response. Returns {} on any failure.
export function normalizeGeminiVisionResponse(response = {}) {
  try {
    const parts = response?.candidates?.[0]?.content?.parts;
    const text = Array.isArray(parts) ? parts.map(p => p && p.text).filter(Boolean).join('\n') : '';
    if (!text) return {};
    const match = text.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : {};
  } catch {
    return {};
  }
}

// Analyze an image with Gemini. `image` = { mimeType, base64 }. Returns
// { ok:true, raw } on success, or { ok:false, disabledReason } otherwise.
export async function analyzeImageWithGemini({ image, context = {}, env = process.env, fetchImpl } = {}) {
  const cfg = geminiVisionConfig(env);
  if (!cfg.enabled) return { ok: false, disabledReason: 'vision_disabled' };
  if (!cfg.apiKey) return { ok: false, disabledReason: 'missing_api_key' };
  const img = image && typeof image === 'object' ? image : {};
  if (!img.base64) return { ok: false, disabledReason: 'missing_image' };
  const mimeType = String(img.mimeType || '').toLowerCase();
  if (!SUPPORTED_VISION_MIME_TYPES.includes(mimeType)) return { ok: false, disabledReason: 'unsupported_media_type' };
  if (base64Bytes(img.base64) > cfg.maxImageMb * 1024 * 1024) return { ok: false, disabledReason: 'image_too_large' };

  const doFetch = fetchImpl || (typeof fetch !== 'undefined' ? fetch : null);
  if (!doFetch) return { ok: false, disabledReason: 'provider_error' };

  const url = 'https://generativelanguage.googleapis.com/v1beta/models/'
    + encodeURIComponent(cfg.model) + ':generateContent';
  const body = {
    contents: [{
      role: 'user',
      parts: [
        { text: buildGeminiVisionPrompt(context) },
        { inlineData: { mimeType, data: String(img.base64).replace(/^data:[^;]+;base64,/, '') } },
      ],
    }],
    generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
  };
  try {
    const res = await doFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': cfg.apiKey },
      body: JSON.stringify(body),
    });
    if (res && res.status === 429) return { ok: false, disabledReason: 'rate_limited' };
    if (!res || !res.ok) return { ok: false, disabledReason: 'provider_error' };
    const json = await res.json();
    return { ok: true, raw: normalizeGeminiVisionResponse(json) };
  } catch {
    return { ok: false, disabledReason: 'provider_error' };
  }
}

export default {
  SUPPORTED_VISION_MIME_TYPES,
  geminiVisionConfig,
  geminiVisionConfigured,
  analyzeImageWithGemini,
  normalizeGeminiVisionResponse,
};
