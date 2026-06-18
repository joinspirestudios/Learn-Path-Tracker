import { esc } from "../../helpers.js";
import { AI_GOAL_EXAMPLES, AI_GOAL_SUGGESTIONS } from "./suggestions.js";
import { guidedShellHTML } from "./shell.js";

export function goalStepHTML(builder, deps = {}) {
  const prompt = builder?.prompt || {};
  const hasActiveAIRequest = deps.hasActiveAIRequest || (() => false);
  const voiceIsActive = deps.voiceIsActive || (() => false);
  const canBuild = Boolean(String(prompt.goal || "").trim()) && !hasActiveAIRequest("goal");
  const example = AI_GOAL_EXAMPLES[builder?.exampleIndex || 0] || AI_GOAL_EXAMPLES[0];
  return guidedShellHTML(
    builder,
    `
      <div class="ai-step-copy">
        <p class="eyebrow">Build with AI</p>
        <h3>What path do you want to build?</h3>
        <p>Describe the outcome, resource, timeline, and constraints. Claude will ask follow-up questions before drafting the path.</p>
      </div>
      <label class="ai-goal-field">Goal
        <textarea id="aiGoal" rows="5" placeholder="${esc(example)}">${esc(prompt.goal || "")}</textarea>
      </label>
      <div class="ai-goal-tools">
        <button type="button" class="secondary small" id="aiVoiceGoal" data-voice-enabled="${voiceIsActive() ? "true" : "false"}">
          ${voiceIsActive() ? "Stop voice" : "Speak goal"}
        </button>
        <span class="muted">Voice input is optional.</span>
      </div>
      <div class="ai-goal-suggestions" aria-label="Goal examples">
        ${AI_GOAL_SUGGESTIONS.map(
          (suggestion) => `<button type="button" class="chip" data-goal-suggestion="${esc(suggestion)}">${esc(suggestion)}</button>`,
        ).join("")}
      </div>
    `,
    `
      <button type="button" class="secondary" id="aiBasic">Basic starter</button>
      <button type="button" id="aiBuild" ${canBuild ? "" : "disabled"}>${hasActiveAIRequest("goal") ? "Thinking..." : "Build with AI"}</button>
    `,
  );
}
