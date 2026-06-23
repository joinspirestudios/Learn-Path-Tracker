// Local-only starter state for the mobile core loop.
//
// Pure data + tiny constructors. No React, no React Native, no Firebase, no API
// calls, no environment reads, no side effects.
//
// IMPORTANT: This is a LOCAL DEMO path. It is private/local-only and exists so
// the mobile core loop has something to operate on before real mobile data sync
// arrives (Phase 6.12+). It must never claim public proof-backed metrics, fake
// joined counts, fake verification, or community data.

export const MOBILE_SESSION_STATUS = {
  NOT_STARTED: 'not_started',
  IN_PROGRESS: 'in_progress',
  FINISHED: 'finished',
};

// A small, generic, product-safe proof-of-growth day (3-4 tasks).
// One task requires short text proof/reflection; one is optional.
export function localDemoTasks() {
  return [
    {
      id: 'review',
      title: 'Read or review one resource',
      description: 'Spend a few minutes reviewing one resource that moves this goal forward.',
      required: true,
      requiresProof: false,
    },
    {
      id: 'work-block',
      title: 'Complete one focused work block',
      description: 'Do one focused block of real work on the goal — no multitasking.',
      required: true,
      requiresProof: false,
    },
    {
      id: 'proof',
      title: 'Submit short text proof or reflection',
      description: 'Write a short note describing what you actually did today.',
      required: true,
      requiresProof: true,
    },
    {
      id: 'self-check',
      title: 'Self-check the day',
      description: 'Optional: a quick honest self-check on how the day went.',
      required: false,
      requiresProof: false,
    },
  ];
}

export function localDemoPath() {
  return {
    id: 'local-demo-path',
    title: 'Local mobile starter path',
    dayNumber: 1,
    local: true, // private/local-only; not synced, not public
    intensity: 'balanced',
  };
}

export function createInitialTaskState(tasks) {
  const taskState = {};
  for (const task of tasks) {
    taskState[task.id] = { done: false, proofText: '', reflection: '' };
  }
  return taskState;
}

export default {
  MOBILE_SESSION_STATUS,
  localDemoTasks,
  localDemoPath,
  createInitialTaskState,
};
