import { esc } from "../../helpers.js";
import { safeExternalUrl } from "../../urls.js";

function savedValue(question) {
  if (!question) return "";
  const answers = question.answers || {};
  if (question.kind === "resource") return answers[question.key] || {};
  return answers[question.key] || question.answer || "";
}

export function questionControlHTML(question) {
  const saved = savedValue(question);
  if (question.kind === "choice") {
    return `<div class="ai-choice-list">${(question.options || [])
      .map(
        (option) => `
          <label class="ai-choice">
            <input type="radio" name="aiQuestionAnswer" value="${esc(option.value)}"${
              saved === option.value ? " checked" : ""
            }>
            <span><strong>${esc(option.label)}</strong>${option.description ? `<small>${esc(option.description)}</small>` : ""}</span>
          </label>
        `,
      )
      .join("")}</div>`;
  }
  if (question.kind === "multi") {
    const savedValues = Array.isArray(saved) ? saved : [];
    return `<div class="ai-choice-list">${(question.options || [])
      .map(
        (option) => `
          <label class="ai-choice">
            <input type="checkbox" name="aiQuestionAnswerMulti" value="${esc(option.value)}"${
              savedValues.includes(option.value) ? " checked" : ""
            }>
            <span><strong>${esc(option.label)}</strong>${option.description ? `<small>${esc(option.description)}</small>` : ""}</span>
          </label>
        `,
      )
      .join("")}</div>`;
  }
  if (question.kind === "resource") {
    const resourceType = question.resourceType || "course";
    const savedResource = saved && typeof saved === "object" ? saved : {};
    if (resourceType === "book") {
      return `
        <div class="ai-resource-capture">
          <label>Book title<input id="aiResourceTitle" value="${esc(savedResource.title || "")}" placeholder="e.g. Atomic Habits"></label>
          <label>Total pages<input id="aiResourceTotalPages" type="number" min="1" value="${esc(savedResource.totalPages || "")}" placeholder="320"></label>
          <label>Start page<input id="aiResourceStartPage" type="number" min="1" value="${esc(savedResource.startPage || "")}" placeholder="1"></label>
          <label>End page<input id="aiResourceEndPage" type="number" min="1" value="${esc(savedResource.endPage || "")}" placeholder="320"></label>
          <label>Pages per session<input id="aiResourcePagesPerSession" type="number" min="1" value="${esc(savedResource.pagesPerSession || "")}" placeholder="10"></label>
        </div>
      `;
    }
    if (resourceType === "programme") {
      return `
        <div class="ai-resource-capture">
          <label>Programme name<input id="aiResourceTitle" value="${esc(savedResource.title || "")}" placeholder="e.g. StrongLifts 5x5"></label>
          <label>Sessions per week<input id="aiResourceSessionsPerWeek" type="number" min="1" max="7" value="${esc(savedResource.sessionsPerWeek || "")}" placeholder="3"></label>
          <label>Session length<input id="aiResourceSessionMinutes" type="number" min="1" value="${esc(savedResource.sessionMinutes || "")}" placeholder="45"></label>
          <label>Equipment<textarea id="aiResourceEquipment" rows="2" placeholder="Dumbbells, mat, pull-up bar">${esc(
            Array.isArray(savedResource.equipment) ? savedResource.equipment.join("\n") : savedResource.equipment || "",
          )}</textarea></label>
          <label>Notes<textarea id="aiResourceNotes" rows="3" placeholder="Limitations, progression rules, rest days">${esc(
            savedResource.notes || savedResource.note || "",
          )}</textarea></label>
        </div>
      `;
    }
    return `
      <div class="ai-resource-capture">
        <label>Resource title<input id="aiResourceTitle" value="${esc(savedResource.title || "")}" placeholder="Course, playlist, documentation"></label>
        <label>Resource URL<input id="aiResourceUrl" value="${esc(savedResource.url || "")}" placeholder="https://..."></label>
        <label>Notes<textarea id="aiResourceNotes" rows="3" placeholder="Modules, exercises, or parts to prioritize">${esc(
          savedResource.notes || savedResource.note || savedResource.notesOrExercises || "",
        )}</textarea></label>
      </div>
    `;
  }
  if (question.kind === "number") {
    return `<input id="aiQuestionAnswer" type="number" min="${esc(question.min || 0)}" max="${esc(
      question.max || 999,
    )}" value="${esc(saved)}" placeholder="${esc(question.placeholder || "")}">`;
  }
  if (question.kind === "textarea") {
    return `<textarea id="aiQuestionAnswer" rows="4" placeholder="${esc(question.placeholder || "")}">${esc(saved)}</textarea>`;
  }
  return `<input id="aiQuestionAnswer" value="${esc(saved)}" placeholder="${esc(question.placeholder || "")}">`;
}

export function readQuestionAnswerFromDOM(getById, question) {
  if (!question) return null;
  if (question.kind === "choice") {
    return getById("aiBuilder")?.querySelector('input[name="aiQuestionAnswer"]:checked')?.value || "";
  }
  if (question.kind === "multi") {
    return [...(getById("aiBuilder")?.querySelectorAll('input[name="aiQuestionAnswerMulti"]:checked') || [])].map(
      (input) => input.value,
    );
  }
  if (question.kind === "resource") {
    const resourceType = question.resourceType || "course";
    const title = getById("aiResourceTitle")?.value?.trim() || "";
    if (resourceType === "book") {
      return {
        type: "book",
        title,
        totalPages: Number(getById("aiResourceTotalPages")?.value || 0) || null,
        startPage: Number(getById("aiResourceStartPage")?.value || 0) || null,
        endPage: Number(getById("aiResourceEndPage")?.value || 0) || null,
        pagesPerSession: Number(getById("aiResourcePagesPerSession")?.value || 0) || null,
      };
    }
    if (resourceType === "programme") {
      return {
        type: "programme",
        title,
        sessionsPerWeek: Number(getById("aiResourceSessionsPerWeek")?.value || 0) || null,
        sessionMinutes: Number(getById("aiResourceSessionMinutes")?.value || 0) || null,
        equipment: String(getById("aiResourceEquipment")?.value || "")
          .split(/\r?\n|,/)
          .map((item) => item.trim())
          .filter(Boolean),
        notes: getById("aiResourceNotes")?.value?.trim() || "",
      };
    }
    return {
      type: "course",
      title,
      url: safeExternalUrl(getById("aiResourceUrl")?.value || ""),
      notes: getById("aiResourceNotes")?.value?.trim() || "",
    };
  }
  if (question.kind === "number") return Number(getById("aiQuestionAnswer")?.value || 0) || null;
  return getById("aiQuestionAnswer")?.value?.trim() || "";
}
