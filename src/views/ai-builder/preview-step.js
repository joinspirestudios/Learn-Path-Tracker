import { esc } from "../../helpers.js";
import { AI_TASK_MODES } from "../../ai-builder-model.js";
import { getTasksForDay } from "../../journey.js";
import { guidedShellHTML } from "./shell.js";
import { aiErrorDiagnosticHTML } from "./dom.js";
import {
  normalizeProgressionCurve,
  normalizeTaskMode,
  resourceLinksHTML,
  selectOptions,
  taskTitleForDay,
} from "./formatting.js";
import { naturalCadenceOptions } from "./rhythm-step.js";

export function visibilityOptionsHTML(selected) {
  return `
    <div class="segmented">
      <label><input type="radio" name="aiVisibility" value="private"${selected !== "public" ? " checked" : ""}> Private</label>
      <label><input type="radio" name="aiVisibility" value="public"${selected === "public" ? " checked" : ""}> Public</label>
    </div>
  `;
}

export function aiTaskRowHTML(task, index) {
  const mode = normalizeTaskMode(task.mode);
  return `
    <article class="ai-task-row" data-task-index="${index}">
      <div class="ai-task-main">
        <input data-task-field="title" value="${esc(task.title || "")}" aria-label="Task title">
        <textarea data-task-field="description" rows="2" aria-label="Task description">${esc(task.description || "")}</textarea>
        <input data-task-field="resourceUrl" value="${esc(task.resourceUrl || "")}" placeholder="Resource URL" aria-label="Task resource URL">
        <input data-task-field="deliverable" value="${esc(task.deliverable || "")}" placeholder="Deliverable" aria-label="Task deliverable">
      </div>
      <div class="ai-task-meta">
        <label>Mode<select data-task-field="mode">${selectOptions(AI_TASK_MODES, mode)}</select></label>
        <label>Day<input data-task-field="day" type="number" min="1" max="75" value="${esc(task.day || 1)}"></label>
        <label>Start<input data-task-field="startDay" type="number" min="1" max="75" value="${esc(task.startDay || task.day || 1)}"></label>
        <label>End<input data-task-field="endDay" type="number" min="1" max="75" value="${esc(task.endDay || task.day || 75)}"></label>
        <label>Cadence<select data-task-field="cadence">${naturalCadenceOptions(task.cadence || "daily")}</select></label>
        <label>Times/week<input data-task-field="timesPerWeek" type="number" min="1" max="7" value="${esc(task.timesPerWeek || "")}"></label>
        <label>Interval<input data-task-field="intervalDays" type="number" min="1" max="75" value="${esc(task.intervalDays || "")}"></label>
        <label>Scheduled day<input data-task-field="scheduledDay" type="number" min="1" max="75" value="${esc(task.scheduledDay || "")}"></label>
        <label>Progression<select data-task-field="progressionCurve">${selectOptions(["steady", "ramp-up", "wave", "deload"], normalizeProgressionCurve(task.progressionCurve))}</select></label>
        <label class="check"><input data-task-field="evidenceRequired" type="checkbox"${task.evidenceRequired ? " checked" : ""}> Evidence</label>
      </div>
    </article>
  `;
}

export function aiReviewHTML(builder) {
  const draft = builder?.draft;
  if (!draft) return "";
  const day = builder?.previewDay || 1;
  const dayTasks = getTasksForDay(draft, day);
  return `
    <div class="ai-review">
      <div class="section-heading">
        <h4>Review generated path</h4>
        <p>Edit the draft before saving. New AI paths stay private by default.</p>
      </div>
      <div class="ai-review-grid">
        <label>Title<input id="aiDraftTitle" value="${esc(draft.title || "")}"></label>
        <label>Goal<textarea id="aiDraftGoal" rows="3">${esc(draft.goal || "")}</textarea></label>
        <label>Preview<textarea id="aiDraftPreview" rows="3">${esc(draft.preview || "")}</textarea></label>
        <label>Duration<input id="aiDraftDuration" type="number" min="1" max="75" value="${esc(draft.durationDays || 75)}"></label>
        <label>Cover URL<input id="aiDraftCoverUrl" value="${esc(draft.coverUrl || "")}"></label>
        <label>Profile URL<input id="aiDraftProfileUrl" value="${esc(draft.profileUrl || "")}"></label>
      </div>
      ${visibilityOptionsHTML(draft.visibility)}
      ${draft.assumptions?.length ? `<div class="ai-assumptions"><strong>Assumptions</strong><ul>${draft.assumptions.map((item) => `<li>${esc(item)}</li>`).join("")}</ul></div>` : ""}
      <div class="ai-day-preview">
        <div class="section-heading">
          <h4>Day ${day} preview</h4>
          <p>${dayTasks.length ? `${dayTasks.length} scheduled task${dayTasks.length === 1 ? "" : "s"}` : "No scheduled tasks for this day yet."}</p>
        </div>
        <input id="aiPreviewDay" type="range" min="1" max="${esc(draft.durationDays || 75)}" value="${esc(day)}">
        <div class="ai-preview-tasks">
          ${dayTasks
            .map(
              (task) => `
                <div class="ai-preview-task">
                  <strong>${esc(taskTitleForDay(task, day))}</strong>
                  <p>${esc(task.description || "")}</p>
                  ${resourceLinksHTML([task])}
                </div>
              `,
            )
            .join("")}
        </div>
      </div>
      <div class="ai-review-section">
        <h4>Milestones</h4>
        ${(draft.sections || [])
          .map(
            (section, index) => `
              <article class="ai-section-row" data-section-index="${index}">
                <input data-section-field="title" value="${esc(section.title || "")}" aria-label="Section title">
                <textarea data-section-field="description" rows="2" aria-label="Section description">${esc(section.description || "")}</textarea>
              </article>
            `,
          )
          .join("")}
      </div>
      <div class="ai-review-section">
        <h4>Tasks</h4>
        ${(draft.tasks || []).map((task, index) => aiTaskRowHTML(task, index)).join("")}
      </div>
      <div class="ai-review-section">
        <h4>Resources</h4>
        ${(draft.resources || [])
          .map(
            (resource, index) => `
              <article class="ai-resource-row" data-resource-index="${index}">
                <input data-resource-field="title" value="${esc(resource.title || "")}" aria-label="Resource title">
                <input data-resource-field="url" value="${esc(resource.url || "")}" aria-label="Resource URL">
                <textarea data-resource-field="description" rows="2" aria-label="Resource description">${esc(resource.description || "")}</textarea>
              </article>
            `,
          )
          .join("")}
      </div>
    </div>
  `;
}

export function previewStepHTML(builder, deps = {}) {
  const hasActiveAIRequest = deps.hasActiveAIRequest || (() => false);
  return guidedShellHTML(
    builder,
    `
      <div class="ai-step-copy">
        <p class="eyebrow">Draft ready</p>
        <h3>Review and save your path</h3>
        <p>Adjust milestones, tasks, resources, visibility, and preview details before saving.</p>
      </div>
      ${aiReviewHTML(builder)}
      ${aiErrorDiagnosticHTML(builder?.lastError)}
    `,
    `
      <button type="button" class="secondary" data-ai-act="regenerate">Regenerate</button>
      <button type="button" class="secondary" data-ai-act="basic">Basic starter</button>
      <button type="button" id="aiSaveDraft" ${hasActiveAIRequest("save") ? "disabled" : ""}>${
        hasActiveAIRequest("save") ? "Saving..." : "Save path"
      }</button>
    `,
  );
}

export function savingStepHTML(builder) {
  return guidedShellHTML(
    builder,
    `<div class="ai-step-copy"><h3>Saving path...</h3><p>Your generated path is being added to your library.</p></div>`,
    "",
  );
}
