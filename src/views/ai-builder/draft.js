import { safeExternalUrl } from "../../urls.js";
import {
  normalizeCoreCommitment,
  normalizeCoreCommitments,
  normalizeConfirmedBrief,
  normalizeIntensity,
} from "../../ai-builder-model.js";
import {
  clampDay,
  normalizeGoalBrief,
  normalizeProgressionCurve,
  normalizeScheduleType,
  normalizeTaskMode,
  nullableNumber,
  titleFromGoal,
} from "./formatting.js";

export function normalizeGeneratedDraft(raw, prompt = {}) {
  if (!raw || typeof raw !== "object") throw new Error("The generator returned an invalid draft.");
  const durationDays = clampDay(raw.durationDays || prompt.durationDays || 30, 30, 365);
  const sections = (Array.isArray(raw.sections) ? raw.sections : []).slice(0, 12).map((section, index) => ({
    title: String(section.title || `Section ${index + 1}`).slice(0, 100),
    description: String(section.description || "").slice(0, 500),
    order: Number.isFinite(Number(section.order)) ? Number(section.order) : index,
  })).filter((section) => section.title);
  if (!sections.length) sections.push({ title: "Foundation", description: "Start here.", order: 0 });

  const sectionNames = new Set(sections.map((section) => section.title));
  const tasks = (Array.isArray(raw.tasks) ? raw.tasks : []).slice(0, 90).map((task, index) => {
    const scheduleType = normalizeScheduleType(task.scheduleType || task.schedule);
    const startDay = clampDay(task.startDay || task.unlockDay || 1, 1, durationDays);
    const recurring = !["once", "sequential"].includes(scheduleType);
    const endDay = recurring ? clampDay(task.endDay || durationDays, startDay, durationDays) : null;
    const unlockDay = recurring ? startDay : clampDay(task.unlockDay || task.scheduledDay || startDay, startDay, durationDays);
    const taskMode = normalizeTaskMode(task.taskMode, scheduleType);
    return {
      title: String(task.title || `Task ${index + 1}`).slice(0, 140),
      description: String(task.description || "").slice(0, 500),
      sectionTitle: sectionNames.has(task.sectionTitle) ? task.sectionTitle : sections[0].title,
      scheduleType,
      taskMode,
      startDay,
      endDay,
      unlockDay,
      daysOfWeek: Array.isArray(task.daysOfWeek) ? task.daysOfWeek.slice(0, 7) : [],
      timesPerWeek: nullableNumber(task.timesPerWeek),
      intervalDays: nullableNumber(task.intervalDays),
      scheduledDay: nullableNumber(task.scheduledDay) || unlockDay,
      progressionMetric: task.progressionMetric ? String(task.progressionMetric).slice(0, 80) : null,
      progressionUnit: task.progressionUnit ? String(task.progressionUnit).slice(0, 40) : null,
      startValue: nullableNumber(task.startValue),
      targetValue: nullableNumber(task.targetValue),
      progressionCurve: normalizeProgressionCurve(task.progressionCurve, taskMode),
      progressionNotes: task.progressionNotes ? String(task.progressionNotes).slice(0, 300) : null,
      evidenceRequired: Boolean(task.evidenceRequired),
      resourceUrl: safeExternalUrl(task.resourceUrl),
      order: Number.isFinite(Number(task.order)) ? Number(task.order) : index,
    };
  }).filter((task) => task.title);
  if (!tasks.length) throw new Error("The generator returned no usable tasks.");

  return {
    title: String(raw.title || titleFromGoal(prompt.goal)).slice(0, 100),
    description: String(raw.description || prompt.description || prompt.goal || "").slice(0, 1000),
    goal: String(raw.goal || prompt.goal || "").slice(0, 800),
    category: String(raw.category || prompt.pathType || "").slice(0, 80),
    durationDays,
    durationLabel: String(raw.durationLabel || `${durationDays} days`).slice(0, 80),
    difficulty: ["beginner", "intermediate", "advanced"].includes(raw.difficulty) ? raw.difficulty : prompt.currentLevel,
    intensity: normalizeIntensity(raw.intensity || prompt.intensity),
    previewTitle: String(raw.previewTitle || raw.title || titleFromGoal(prompt.goal)).slice(0, 100),
    previewDescription: String(raw.previewDescription || raw.description || prompt.goal || "").slice(0, 500),
    visibility: ["private", "unlisted", "public"].includes(raw.visibility || prompt.visibility)
      ? raw.visibility || prompt.visibility
      : "private",
    sections: sections.sort((a, b) => a.order - b.order),
    tasks: tasks.sort((a, b) => a.order - b.order),
    resources: (Array.isArray(raw.resources) ? raw.resources : []).slice(0, 12).map((resource, index) => ({
      title: String(resource.title || `Resource ${index + 1}`).slice(0, 100),
      url: safeExternalUrl(resource.url) || "",
      description: String(resource.description || "").slice(0, 300),
    })).filter((resource) => resource.title || resource.url || resource.description),
    notes: (Array.isArray(raw.notes) ? raw.notes : []).map((note) => String(note || "").slice(0, 300)).filter(Boolean).slice(0, 8),
    coreCommitments: normalizeCoreCommitments(raw.coreCommitments, prompt.coreCommitments),
    confirmedBrief: prompt.confirmedBrief ? normalizeConfirmedBrief(prompt.confirmedBrief) : null,
    source: raw.source || "ai",
  };
}

export function localGeneratedDraft(prompt = {}) {
  const durationDays = clampDay(prompt.durationDays || 30, 30, 365);
  const title = titleFromGoal(prompt.goal);
  const sections = [
    { title: "Foundation", description: "Set up the routine and first repeatable actions.", order: 0 },
    { title: "Build", description: "Practice consistently and make visible progress.", order: 1 },
    { title: "Review", description: "Reflect, ship proof, and decide the next step.", order: 2 },
  ];
  const commitments = normalizeCoreCommitments(prompt.coreCommitments);
  const starterCommitments = commitments.length ? commitments : [normalizeCoreCommitment({
    id: "goal-session",
    title: "Complete a focused session toward the goal",
    description: "Use the available time for the next concrete step toward the desired outcome.",
    required: true,
    cadence: { type: "times_per_week", timesPerWeek: 3 },
    estimatedMinutes: nullableNumber(String(prompt.dailyTime || "").match(/\d+/)?.[0]) || 30,
    evidenceType: prompt.evidenceStyle || "",
    reason: "Provides a conservative repeatable starting rhythm without adding unrelated habits.",
  })];
  const tasks = starterCommitments.slice(0, 12).map((commitment, index) => ({
    title: commitment.title,
    description: commitment.description || "Repeat this commitment during the path.",
    sectionTitle: "Foundation",
    scheduleType: commitment.cadence.type,
    taskMode: normalizeTaskMode(null, commitment.cadence.type),
    startDay: 1,
    endDay: durationDays,
    unlockDay: commitment.cadence.scheduledDay || 1,
    daysOfWeek: commitment.cadence.daysOfWeek,
    timesPerWeek: commitment.cadence.timesPerWeek,
    intervalDays: commitment.cadence.intervalDays,
    scheduledDay: commitment.cadence.scheduledDay,
    progressionMetric: null,
    progressionUnit: null,
    startValue: null,
    targetValue: null,
    progressionCurve: null,
    progressionNotes: null,
    evidenceRequired: Boolean(commitment.evidenceType) || /proof|evidence|upload|log|record/i.test(prompt.evidenceStyle || ""),
    resourceUrl: null,
    order: index,
  }));
  const every = durationDays >= 90 ? 30 : durationDays >= 45 ? 15 : 7;
  for (let day = every; day < durationDays; day += every) {
    tasks.push({
      title: "Review progress and adjust the next stretch",
      description: "Look at what worked, what slipped, and what needs to change.",
      sectionTitle: day > durationDays * 0.66 ? "Review" : "Build",
      scheduleType: "once",
      taskMode: "one_off",
      startDay: day,
      endDay: null,
      unlockDay: day,
      progressionMetric: null,
      progressionUnit: null,
      startValue: null,
      targetValue: null,
      progressionCurve: null,
      progressionNotes: null,
      evidenceRequired: false,
      resourceUrl: null,
      order: tasks.length,
    });
  }
  tasks.push({
    title: "Complete a final reflection",
    description: "Summarize progress, proof, lessons, and next steps.",
    sectionTitle: "Review",
    scheduleType: "once",
    taskMode: "one_off",
    startDay: durationDays,
    endDay: null,
    unlockDay: durationDays,
    progressionMetric: null,
    progressionUnit: null,
    startValue: null,
    targetValue: null,
    progressionCurve: null,
    progressionNotes: null,
    evidenceRequired: true,
    resourceUrl: null,
    order: tasks.length,
  });
  return normalizeGeneratedDraft({
    title,
    description: prompt.description || prompt.goal,
    goal: prompt.goal,
    category: prompt.pathType,
    durationDays,
    durationLabel: `${durationDays} days`,
    difficulty: prompt.currentLevel,
    intensity: normalizeIntensity(prompt.intensity),
    previewTitle: title,
    previewDescription: prompt.description || prompt.goal,
    sections,
    tasks,
    resources: String(prompt.resourceLinks || "").split(/\s+/).filter((item) => /^https?:\/\//i.test(item)).map((url, index) => ({
      title: `Resource ${index + 1}`,
      url,
      description: "",
    })),
    notes: ["Basic starter template. Review and edit before saving."].concat(
      ["fitness", "challenge"].includes(prompt.pathType)
        ? ["Adapt intensity to your health, ability, and professional guidance where needed."]
        : [],
    ),
    coreCommitments: starterCommitments,
    source: "fallback",
  }, prompt);
}

export function aiDraftToLocalPath(draft, currentUser = null) {
  const confirmed = normalizeGoalBrief(draft.confirmedBrief || {});
  const sections = draft.sections.length ? draft.sections : [{ title: "Foundation", description: "", order: 0 }];
  const weeks = sections.map((section) => ({
    title: section.title,
    description: section.description || "",
    tasks: [],
    resources: [],
  }));
  const indexByTitle = {};
  sections.forEach((section, index) => {
    indexByTitle[section.title] = index;
  });
  (draft.tasks || []).forEach((task) => {
    const index = indexByTitle[task.sectionTitle] == null ? 0 : indexByTitle[task.sectionTitle];
    weeks[index].tasks.push({
      text: task.title,
      description: task.description || "",
      resourceUrl: task.resourceUrl || null,
      scheduleType: task.scheduleType,
      taskMode: task.taskMode || null,
      startDay: task.startDay == null ? null : Number(task.startDay),
      endDay: task.endDay == null ? null : Number(task.endDay),
      unlockDay: task.unlockDay == null ? null : Number(task.unlockDay),
      progressionMetric: task.progressionMetric || null,
      progressionUnit: task.progressionUnit || null,
      startValue: task.startValue == null ? null : Number(task.startValue),
      targetValue: task.targetValue == null ? null : Number(task.targetValue),
      progressionCurve: task.progressionCurve || null,
      progressionNotes: task.progressionNotes || null,
      daysOfWeek: Array.isArray(task.daysOfWeek) ? task.daysOfWeek : [],
      timesPerWeek: task.timesPerWeek == null ? null : Number(task.timesPerWeek),
      intervalDays: task.intervalDays == null ? null : Number(task.intervalDays),
      scheduledDay: task.scheduledDay == null ? null : Number(task.scheduledDay),
      evidenceRequired: Boolean(task.evidenceRequired),
    });
  });
  (draft.resources || []).forEach((resource) => {
    weeks[0].resources.push({
      label: resource.title || resource.url,
      url: resource.url || "",
      description: resource.description || "",
    });
  });
  return {
    title: draft.title,
    goal: draft.goal,
    description: draft.description,
    category: draft.category,
    durationDays: clampDay(draft.durationDays, 1, 365),
    durationLabel: draft.durationLabel || `${draft.durationDays} days`,
    intensity: normalizeIntensity(draft.intensity || confirmed.intensity),
    domainProfile: confirmed.domainProfile,
    structuredResources: confirmed.structuredResources,
    fitnessContext: confirmed.fitnessContext,
    creatorName: currentUser ? (currentUser.displayName || (currentUser.email || "").split("@")[0]) : "",
    creatorId: currentUser?.uid || "",
    creatorEmail: currentUser?.email || "",
    coreCommitments: normalizeCoreCommitments(draft.coreCommitments),
    aiBrief: draft.confirmedBrief ? confirmed : null,
    visibility: draft.visibility || "private",
    discoverable: false,
    previewEnabled: true,
    previewTitle: draft.previewTitle || draft.title,
    previewDescription: draft.previewDescription || draft.description || draft.goal,
    previewIncludesScheme: false,
    coverImage: null,
    profileImage: null,
    created: Date.now(),
    weeks,
  };
}
