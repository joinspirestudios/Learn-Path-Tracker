import { esc } from "../../helpers.js";
import { normalizeClarifyingQuestions } from "../../ai-builder-model.js";
import { aiErrorDiagnosticHTML } from "./dom.js";
import { questionControlHTML } from "./question-controls.js";
import { guidedShellHTML } from "./shell.js";

export function currentClarifyingQuestion(builder) {
  const questions = normalizeClarifyingQuestions(builder?.questions || []);
  const index = Math.max(0, Math.min(Number(builder?.questionIndex || 0), Math.max(questions.length - 1, 0)));
  return questions[index] || null;
}

export function clarificationStepHTML(builder, deps = {}) {
  const hasActiveAIRequest = deps.hasActiveAIRequest || (() => false);
  const questions = normalizeClarifyingQuestions(builder?.questions || []);
  const question = currentClarifyingQuestion(builder);
  if (!question) {
    return guidedShellHTML(
      builder,
      `<div class="ai-step-copy"><h3>No more questions</h3><p>Continue to review your path rhythm.</p></div>`,
      `<button type="button" id="aiContinueClarification">Continue</button>`,
    );
  }
  const current = Math.min((builder?.questionIndex || 0) + 1, questions.length);
  const isLast = current >= questions.length;
  return guidedShellHTML(
    builder,
    `
      <div class="ai-step-copy">
        <p class="eyebrow">Question ${current} of ${questions.length}</p>
        <h3>${esc(question.label || "Clarify your path")}</h3>
        ${question.help ? `<p>${esc(question.help)}</p>` : ""}
      </div>
      ${questionControlHTML(question)}
      ${aiErrorDiagnosticHTML(builder?.lastError)}
    `,
    `
      <button type="button" class="secondary" id="aiBackQuestion" ${current <= 1 ? "disabled" : ""}>Back</button>
      <button type="button" id="aiContinueClarification" ${hasActiveAIRequest("clarify") ? "disabled" : ""}>${
        isLast ? "Review rhythm" : "Next"
      }</button>
    `,
  );
}
