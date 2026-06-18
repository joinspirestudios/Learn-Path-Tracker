import { AI_GOAL_EXAMPLES } from "./suggestions.js";
import { userPrefersReducedMotion } from "./formatting.js";

let exampleTimer = null;

export function stopExampleRotation(builder, deps = {}) {
  const clearIntervalFn = deps.clearIntervalFn || clearInterval;
  if (exampleTimer) {
    clearIntervalFn(exampleTimer);
    exampleTimer = null;
  }
  if (deps.markInteracted && builder) builder.exampleRotationStopped = true;
}

export function startExampleRotation(builder, deps = {}) {
  const setIntervalFn = deps.setIntervalFn || setInterval;
  const getGoalInput = deps.getGoalInput || (() => null);
  const getActiveElement = deps.getActiveElement || (() => null);
  const isCurrentBuilder = deps.isCurrentBuilder || ((candidate) => candidate === builder);
  const prefersReducedMotion = deps.prefersReducedMotion || userPrefersReducedMotion;

  stopExampleRotation(builder, deps);
  if (!builder || builder.exampleRotationStopped || prefersReducedMotion()) return null;
  const input = getGoalInput();
  if (!input || input.value) return null;
  builder.exampleIndex = Number(builder.exampleIndex || 0) % AI_GOAL_EXAMPLES.length;
  input.placeholder = AI_GOAL_EXAMPLES[builder.exampleIndex];

  exampleTimer = setIntervalFn(() => {
    const goalInput = getGoalInput();
    if (!isCurrentBuilder(builder) || !goalInput || goalInput.value || getActiveElement() === goalInput) {
      stopExampleRotation(builder, deps);
      return;
    }
    builder.exampleIndex = ((builder.exampleIndex || 0) + 1) % AI_GOAL_EXAMPLES.length;
    goalInput.placeholder = AI_GOAL_EXAMPLES[builder.exampleIndex];
  }, 3500);
  return exampleTimer;
}

export function updateGoalSuggestionButtons(root, goalValue) {
  if (!root) return;
  const hasGoal = Boolean(String(goalValue || "").trim());
  root.querySelectorAll("[data-goal-suggestion]").forEach((button) => {
    button.disabled = hasGoal;
    button.setAttribute("aria-disabled", hasGoal ? "true" : "false");
  });
}

export function suggestionShouldReplaceGoal(goalValue) {
  return !String(goalValue || "").trim();
}
