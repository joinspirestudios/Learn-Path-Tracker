import { esc } from "../../helpers.js";

export function aiErrorDiagnosticHTML(error) {
  if (!error) return "";
  const detail = error.detail || error.code || "";
  return `<p class="ai-error-detail">${esc(error.message || error)}${detail ? ` <span>${esc(detail)}</span>` : ""}</p>`;
}

export function statusMessageHTML(message, tone = "muted") {
  if (!message) return "";
  return `<p class="${tone === "error" ? "ai-error-detail" : "muted"}">${esc(message)}</p>`;
}
