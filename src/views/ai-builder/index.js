import { goalStepHTML } from "./goal-step.js";
import { clarificationStepHTML } from "./clarification-step.js";
import { rhythmStepHTML } from "./rhythm-step.js";
import { conciseBriefHTML, goalBriefHTML } from "./brief-step.js";
import { previewStepHTML, savingStepHTML, aiReviewHTML } from "./preview-step.js";
import { processingStepHTML, readyStepHTML, errorStepHTML } from "./ready-step.js";

export * from "./formatting.js";
export * from "./suggestions.js";
export * from "./draft.js";
export * from "./dom.js";
export * from "./shell.js";
export * from "./question-controls.js";
export * from "./goal-step.js";
export * from "./clarification-step.js";
export * from "./rhythm-step.js";
export * from "./brief-step.js";
export * from "./preview-step.js";
export * from "./ready-step.js";
export * from "./events.js";

export function aiPromptHTML(builder, deps = {}) {
  if (!builder) return "";
  if (builder.phase === "processing") return processingStepHTML(builder, deps);
  if (builder.phase === "clarifying") return clarificationStepHTML(builder, deps);
  if (builder.phase === "rhythm") return rhythmStepHTML(builder, deps);
  if (builder.phase === "brief") return goalBriefHTML(builder, deps);
  if (builder.phase === "preview") return previewStepHTML(builder, deps);
  if (builder.phase === "saving") return savingStepHTML(builder, deps);
  if (builder.phase === "ready") return readyStepHTML(builder, deps);
  if (builder.phase === "error") return errorStepHTML(builder, deps);
  return goalStepHTML(builder, deps);
}

export function aiCompactBriefHTML(builder) {
  return conciseBriefHTML(builder);
}

export { aiReviewHTML };
