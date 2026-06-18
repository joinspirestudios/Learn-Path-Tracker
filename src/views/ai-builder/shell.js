import { esc } from "../../helpers.js";
import {
  AI_GUIDED_STAGES,
  commitmentSummary,
  creationStageForPhase,
  normalizeConfirmedBrief,
} from "../../ai-builder-model.js";

export function wizardProgressHTML(builder) {
  const currentStage = creationStageForPhase(builder?.phase || "goal");
  return `<div class="ai-progress-rail" aria-label="AI builder progress">${AI_GUIDED_STAGES.map((stage, index) => {
    const currentIndex = AI_GUIDED_STAGES.indexOf(currentStage);
    const state = index < currentIndex ? "done" : index === currentIndex ? "current" : "upcoming";
    return `<span class="ai-progress-step ${state}"><span>${index + 1}</span>${esc(stage)}</span>`;
  }).join("")}</div>`;
}

export function guidedSummaryHTML(builder) {
  const brief = normalizeConfirmedBrief(builder?.confirmedBrief || {});
  const parts = [
    brief.goal,
    brief.domain ? `${brief.domain} path` : "",
    brief.intensity ? `${brief.intensity} intensity` : "",
    commitmentSummary(brief.coreCommitments?.[0]),
  ].filter(Boolean);
  if (!parts.length) return "";
  return `<div class="ai-guided-summary">${parts.map((part) => `<span>${esc(part)}</span>`).join("")}</div>`;
}

export function guidedShellHTML(builder, content, actions = "") {
  return `
    <div class="ai-guided">
      ${wizardProgressHTML(builder)}
      ${guidedSummaryHTML(builder)}
      <div class="ai-guided-panel">
        ${content}
        ${actions ? `<div class="ai-guided-actions">${actions}</div>` : ""}
      </div>
    </div>
  `;
}
