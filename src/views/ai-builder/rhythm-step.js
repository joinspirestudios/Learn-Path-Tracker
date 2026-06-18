import { esc } from "../../helpers.js";
import {
  AI_CADENCE_TYPES,
  AI_PROGRESSION_CURVES,
  AI_INTENSITY_DETAILS,
  AI_INTENSITY_LEVELS,
  cadenceLabel,
  commitmentSummary,
  normalizeBriefAssumptions,
  normalizeConfirmedBrief,
  normalizeCoreCommitment,
  normalizeIntensity,
} from "../../ai-builder-model.js";
import { guidedShellHTML } from "./shell.js";
import { joinLines, selectOptions } from "./formatting.js";

export function naturalCadenceOptions(selected) {
  return AI_CADENCE_TYPES.map((value) => `<option value="${esc(value)}"${value === selected ? " selected" : ""}>${esc(cadenceLabel({ type: value }))}</option>`).join("");
}

function cadenceFieldsHTML(brief) {
  return `
    <div class="ai-brief-grid compact">
      <label>Cadence
        <select id="aiBriefCadence">${naturalCadenceOptions(brief.cadenceType)}</select>
      </label>
      <label>Daily minutes
        <input id="aiBriefDailyMinutes" type="number" min="1" max="600" value="${esc(brief.dailyTimeMinutes || "")}" placeholder="30">
      </label>
      <label>Weekly days
        <input id="aiBriefWeeklyDays" type="number" min="1" max="7" value="${esc(brief.weeklyDays || "")}" placeholder="5">
      </label>
      <label>Session minutes
        <input id="aiBriefSessionMinutes" type="number" min="1" max="600" value="${esc(brief.sessionDurationMinutes || "")}" placeholder="45">
      </label>
      <label>Progression
        <select id="aiBriefProgression">${selectOptions(AI_PROGRESSION_CURVES, brief.progressionCurve)}</select>
      </label>
    </div>
  `;
}

function commitmentRowHTML(commitment, index) {
  const item = normalizeCoreCommitment(commitment || {});
  return `
    <div class="ai-commitment-row" data-commitment-index="${index}">
      <select data-commitment-field="type">${selectOptions(["time", "pages", "lessons", "sessions", "reps", "distance", "custom"], item.type)}</select>
      <input data-commitment-field="amount" type="number" min="1" value="${esc(item.amount || "")}" placeholder="Amount">
      <input data-commitment-field="unit" value="${esc(item.unit || "")}" placeholder="minutes, pages, sessions">
      <select data-commitment-field="frequency">${selectOptions(["daily", "weekly", "per-session"], item.frequency)}</select>
    </div>
  `;
}

export function commitmentsHTML(brief) {
  const commitments = (brief.coreCommitments?.length ? brief.coreCommitments : [normalizeCoreCommitment({})]).slice(0, 4);
  return `
    <div class="ai-commitments">
      <div class="section-heading">
        <h4>Core commitments</h4>
        <p>These become the recurring backbone of the path.</p>
      </div>
      ${commitments.map((commitment, index) => commitmentRowHTML(commitment, index)).join("")}
    </div>
  `;
}

export function assumptionsHTML(brief) {
  const assumptions = normalizeBriefAssumptions(brief.assumptions || []);
  return `
    <label>Assumptions to keep visible
      <textarea id="aiBriefAssumptions" rows="3" placeholder="One assumption per line">${esc(joinLines(assumptions))}</textarea>
    </label>
  `;
}

export function intensityOptionsHTML(brief) {
  const selected = normalizeIntensity(brief.intensity);
  return `<div class="ai-intensity-options" id="aiIntensityOptions">${AI_INTENSITY_LEVELS.map(
    (value) => `
      <label class="ai-intensity-card ${selected === value ? "selected" : ""}">
        <input type="radio" name="aiIntensityChoice" value="${esc(value)}"${selected === value ? " checked" : ""}>
        <span><strong>${esc(value.charAt(0).toUpperCase() + value.slice(1))}</strong><small>${esc(AI_INTENSITY_DETAILS[value])}</small></span>
      </label>
    `,
  ).join("")}</div>`;
}

function rhythmAdvancedHTML(brief) {
  return `
    <details class="ai-advanced">
      <summary>Advanced rhythm details</summary>
      ${cadenceFieldsHTML(brief)}
      ${commitmentsHTML(brief)}
      ${assumptionsHTML(brief)}
    </details>
  `;
}

export function rhythmStepHTML(builder, deps = {}) {
  const hasActiveAIRequest = deps.hasActiveAIRequest || (() => false);
  const brief = normalizeConfirmedBrief(builder?.confirmedBrief || {});
  const summary = commitmentSummary(brief.coreCommitments?.[0] || {}, 0);
  const commitment = summary?.title || "A daily commitment";
  return guidedShellHTML(
    builder,
    `
      <div class="ai-step-copy">
        <p class="eyebrow">Path rhythm</p>
        <h3>Choose the effort level</h3>
        <p>${esc(commitment)} will be adjusted to the intensity you choose.</p>
      </div>
      ${intensityOptionsHTML(brief)}
      ${rhythmAdvancedHTML(brief)}
    `,
    `
      <button type="button" class="secondary" id="aiBackToQuestions">Back</button>
      <button type="button" id="aiGenerateRoadmap" ${hasActiveAIRequest("draft") ? "disabled" : ""}>${
        hasActiveAIRequest("draft") ? "Generating..." : "Generate roadmap"
      }</button>
    `,
  );
}
