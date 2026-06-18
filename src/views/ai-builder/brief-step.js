import { esc } from "../../helpers.js";
import {
  AI_PATH_TYPES,
  normalizeConfirmedBrief,
  normalizeCoreCommitments,
} from "../../ai-builder-model.js";
import { guidedShellHTML } from "./shell.js";
import {
  joinLines,
  progressiveTargetsToText,
  selectOptions,
} from "./formatting.js";
import { assumptionsHTML, commitmentsHTML, naturalCadenceOptions } from "./rhythm-step.js";

export function structuredResourceSummary(resources = {}) {
  const items = [];
  if (resources.course?.title || resources.course?.url) items.push(`Course: ${resources.course.title || resources.course.url}`);
  if (resources.book?.title) items.push(`Book: ${resources.book.title}`);
  if (resources.programme?.title) items.push(`Programme: ${resources.programme.title}`);
  if (resources.videoSeries?.title) items.push(`Video series: ${resources.videoSeries.title}`);
  if (resources.documentation?.title || resources.documentation?.url) {
    items.push(`Documentation: ${resources.documentation.title || resources.documentation.url}`);
  }
  return items;
}

export function domainSummary(brief) {
  const bits = [
    brief.domain,
    brief.pathType && brief.pathType !== "auto" ? `${brief.pathType} path` : "",
    brief.outcome,
    brief.successMetric,
  ].filter(Boolean);
  return bits.length ? bits.join(" | ") : "General learning path";
}

function briefItemHTML(label, value, key) {
  return `
    <button type="button" class="ai-brief-item" data-confirm-key="${esc(key)}">
      <span>${esc(label)}</span>
      <strong>${esc(value || "Not set")}</strong>
    </button>
  `;
}

export function conciseBriefHTML(builder) {
  const brief = normalizeConfirmedBrief(builder?.confirmedBrief || {});
  const resources = structuredResourceSummary(brief.structuredResources);
  const commitments = normalizeCoreCommitments(brief.coreCommitments || []);
  return `
    <div class="ai-brief-card">
      <div class="section-heading">
        <h4>Confirmed brief</h4>
        <p>Tap a field to mark it confirmed.</p>
      </div>
      <div class="ai-brief-list">
        ${briefItemHTML("Goal", brief.goal, "goal")}
        ${briefItemHTML("Domain", domainSummary(brief), "domain")}
        ${briefItemHTML("Rhythm", brief.cadenceType || "daily", "cadenceType")}
        ${briefItemHTML("Commitment", commitments[0] ? `${commitments[0].amount || ""} ${commitments[0].unit || ""} ${commitments[0].frequency}` : "", "coreCommitments")}
        ${briefItemHTML("Resources", resources.join(", "), "structuredResources")}
      </div>
    </div>
  `;
}

export function goalBriefHTML(builder) {
  const brief = normalizeConfirmedBrief(builder?.confirmedBrief || {});
  return guidedShellHTML(
    builder,
    `
      <div class="ai-step-copy">
        <p class="eyebrow">Confirm brief</p>
        <h3>Review the inputs before generation</h3>
        <p>These fields shape the generated milestones, recurring tasks, and evidence prompts.</p>
      </div>
      <div class="ai-brief-grid">
        <label>Goal<input id="aiBriefGoal" value="${esc(brief.goal)}"></label>
        <label>Domain<input id="aiBriefDomain" value="${esc(brief.domain)}"></label>
        <label>Path type<select id="aiBriefPathType">${selectOptions(AI_PATH_TYPES, brief.pathType)}</select></label>
        <label>Outcome<input id="aiBriefOutcome" value="${esc(brief.outcome)}"></label>
        <label>Experience<input id="aiBriefExperience" value="${esc(brief.experience)}"></label>
        <label>Timeline<input id="aiBriefTimeline" value="${esc(brief.timeline)}"></label>
        <label>Constraints<textarea id="aiBriefConstraints" rows="3">${esc(joinLines(brief.constraints))}</textarea></label>
        <label>Focus areas<textarea id="aiBriefFocus" rows="3">${esc(joinLines(brief.focusAreas))}</textarea></label>
        <label>Starting point<input id="aiBriefStartingPoint" value="${esc(brief.startingPoint)}"></label>
        <label>Success metric<input id="aiBriefSuccessMetric" value="${esc(brief.successMetric)}"></label>
        <label>Capstone<input id="aiBriefCapstone" value="${esc(brief.capstone)}"></label>
        <label>Rest days<input id="aiBriefRestDays" value="${esc(brief.restDays)}"></label>
        <label>Preferred days<textarea id="aiBriefPreferredDays" rows="2">${esc(joinLines(brief.preferredDays))}</textarea></label>
        <label>Equipment<textarea id="aiBriefEquipment" rows="2">${esc(joinLines(brief.equipment))}</textarea></label>
        <label>Injury notes<textarea id="aiBriefInjuryNotes" rows="2">${esc(brief.injuryNotes)}</textarea></label>
        <label>Location<input id="aiBriefLocation" value="${esc(brief.location)}"></label>
        <label>Progressive targets<textarea id="aiBriefProgressiveTargets" rows="3">${esc(progressiveTargetsToText(brief.progressiveTargets))}</textarea></label>
        <label>Cadence<select id="aiBriefCadence">${naturalCadenceOptions(brief.cadenceType)}</select></label>
      </div>
      ${commitmentsHTML(brief)}
      ${assumptionsHTML(brief)}
    `,
    `
      <button type="button" class="secondary" id="aiBackToRhythm">Back</button>
      <button type="button" id="aiConfirmBrief">Confirm brief</button>
    `,
  );
}
