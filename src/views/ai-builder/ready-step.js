import { esc } from "../../helpers.js";
import { guidedShellHTML } from "./shell.js";

export function processingStepHTML(builder, deps = {}) {
  const status = builder?.processingMessage || "Thinking through your path...";
  const hasActiveAIRequest = deps.hasActiveAIRequest || (() => false);
  return guidedShellHTML(
    builder,
    `
      <div class="ai-processing">
        <div class="spinner" aria-hidden="true"></div>
        <h3>${esc(status)}</h3>
        <p>Claude is turning your goal into a structured path. This can take a moment.</p>
      </div>
    `,
    `<button type="button" class="secondary" id="aiCancelRequest" ${hasActiveAIRequest() ? "" : "disabled"}>Cancel</button>`,
  );
}

export function readyStepHTML(builder) {
  const path = builder?.savedPath;
  return guidedShellHTML(
    builder,
    `
      <div class="ai-step-copy">
        <p class="eyebrow">Saved</p>
        <h3>${esc(path?.title || "Your AI path is ready")}</h3>
        <p>Your path was saved as private. You can open it now or keep editing from your library.</p>
      </div>
    `,
    `
      <button type="button" id="aiOpenSavedPath">Open path</button>
      <button type="button" class="secondary" id="aiCloseBuilder">Close</button>
    `,
  );
}

export function errorStepHTML(builder) {
  const error = builder?.lastError;
  return guidedShellHTML(
    builder,
    `
      <div class="ai-step-copy">
        <p class="eyebrow">AI builder</p>
        <h3>Something needs attention</h3>
        <p>${esc(error?.message || "The path could not be generated. Please try again.")}</p>
        ${error?.code ? `<p class="ai-error-detail">${esc(error.code)}</p>` : ""}
      </div>
    `,
    `
      <button type="button" id="aiRetry">Try again</button>
      <button type="button" class="secondary" data-ai-act="basic">Basic starter</button>
    `,
  );
}
