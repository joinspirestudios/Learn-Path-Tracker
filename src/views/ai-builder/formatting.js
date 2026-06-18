import { esc } from "../../helpers.js";
import {
  AI_CADENCE_TYPES,
  AI_PROGRESSION_CURVES,
  AI_TASK_MODES,
  normalizeConfirmedBrief,
} from "../../ai-builder-model.js";
import { formatProgressiveTaskTitle } from "../../journey.js";

export function selectOptions(values, selected) {
  return values
    .map((value) => `<option value="${esc(value)}"${value === selected ? " selected" : ""}>${esc(value)}</option>`)
    .join("");
}

export function clampDay(value, fallback = 1, max = 365) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(1, Math.min(max, Math.round(numeric)));
}

export function nullableNumber(value) {
  if (value == null || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function splitLines(value) {
  return String(value || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function joinLines(values) {
  return Array.isArray(values) ? values.filter(Boolean).join("\n") : "";
}

export function normalizeGoalBrief(brief = {}) {
  return normalizeConfirmedBrief(brief || {});
}

export function progressiveTargetsFromText(value) {
  return String(value || "").split(/\n+/).map((line) => {
    const parts = line.split("|").map((item) => item.trim());
    return {
      area: parts[0] || "",
      currentValue: nullableNumber(parts[1]),
      targetValue: nullableNumber(parts[2]),
      unit: parts[3] || "",
      notes: parts.slice(4).join(" | "),
    };
  }).filter((target) => target.area || target.notes);
}

export function progressiveTargetsToText(targets = []) {
  return (Array.isArray(targets) ? targets : [])
    .map((target) => [
      target.area || "",
      target.currentValue == null ? "" : target.currentValue,
      target.targetValue == null ? "" : target.targetValue,
      target.unit || "",
      target.notes || "",
    ].join(" | "))
    .join("\n");
}

export function briefToPromptPatch(brief = {}, prompt = {}) {
  const normalized = normalizeGoalBrief(brief);
  const targetLines = (normalized.progressiveTargets || []).map((target) => {
    const range = [target.currentValue, target.targetValue].filter((value) => value != null).join(" to ");
    return [
      target.area,
      range ? `(${range}${target.unit ? ` ${target.unit}` : ""})` : "",
      target.notes,
    ].filter(Boolean).join(" ");
  });
  const briefText = [
    normalized.summary ? `Summary: ${normalized.summary}` : "",
    normalized.goal ? `Goal: ${normalized.goal}` : "",
    normalized.currentStage ? `Current stage: ${normalized.currentStage}` : "",
    normalized.desiredEndState ? `Desired end state: ${normalized.desiredEndState}` : "",
    targetLines.length ? `Progressive targets: ${targetLines.join("; ")}` : "",
    normalized.assumptions?.length
      ? `Accepted assumptions: ${normalized.assumptions.filter((item) => item.accepted).map((item) => item.text).join("; ")}`
      : "",
  ].filter(Boolean).join("\n");
  return {
    goal: normalized.goal || normalized.summary,
    durationDays: normalized.durationDays || prompt.durationDays || null,
    deadline: normalized.deadline || prompt.deadline || "",
    intensity: normalized.intensity || prompt.intensity || "",
    pathType: normalized.pathType || (prompt.pathType === "auto" ? "custom" : prompt.pathType) || "custom",
    currentStage: normalized.currentStage || prompt.currentStage || "",
    desiredEndState: normalized.desiredEndState || prompt.desiredEndState || "",
    baseline: normalized.progressiveTargets?.length ? targetLines.join("; ") : (prompt.baseline || ""),
    targetOutcome: normalized.desiredEndState || prompt.targetOutcome || "",
    constraints: normalized.constraints?.join("\n") || prompt.constraints || "",
    preferredSchedule: normalized.scheduleNotes || prompt.preferredSchedule || "",
    existingResources: normalized.resourcesMentioned?.join("\n") || prompt.existingResources || "",
    dailyTime: normalized.dailyTimeAvailable || prompt.dailyTime || "",
    evidenceStyle: normalized.evidencePreference || prompt.evidenceStyle || "",
    includeTasks: [joinLines(normalized.knownTasks), joinLines(normalized.milestones), briefText]
      .filter(Boolean)
      .join("\n\n"),
    coreCommitments: normalized.coreCommitments?.length ? normalized.coreCommitments : prompt.coreCommitments,
    assumptions: normalized.assumptions,
    progressiveTargets: normalized.progressiveTargets,
    domainProfile: normalized.domainProfile,
    structuredResources: normalized.structuredResources,
    fitnessContext: normalized.fitnessContext,
    clarifiedBrief: normalized,
  };
}

export function normalizeTaskMode(value, scheduleType) {
  if (AI_TASK_MODES.includes(value)) return value;
  return ["daily", "weekdays", "selected_days", "times_per_week", "weekly", "interval"].includes(scheduleType)
    ? "fixed_recurring"
    : (scheduleType === "sequential" ? "sequential_learning" : "one_off");
}

export function normalizeScheduleType(value) {
  return AI_CADENCE_TYPES.includes(value) ? value : "once";
}

export function normalizeProgressionCurve(value, taskMode) {
  if (!value) return null;
  if (AI_PROGRESSION_CURVES.includes(value)) return value;
  return taskMode === "progressive_recurring" ? "gradual" : null;
}

export function taskTitleForDay(task, day) {
  return formatProgressiveTaskTitle(task, day);
}

export function titleFromGoal(goal) {
  const cleaned = String(goal || "New path").replace(/^i want to\s+/i, "").trim() || "New path";
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

export function resourceLinksHTML(resources = []) {
  const links = (Array.isArray(resources) ? resources : []).filter((resource) => resource?.url);
  if (!links.length) return "";
  return `<ul class="ai-resource-links">${links
    .map(
      (resource) =>
        `<li><a href="${esc(resource.url)}" target="_blank" rel="noreferrer">${esc(resource.title || resource.url)}</a></li>`,
    )
    .join("")}</ul>`;
}

export function userPrefersReducedMotion() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
