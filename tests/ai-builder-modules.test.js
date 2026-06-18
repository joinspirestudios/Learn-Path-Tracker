import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  AI_GOAL_EXAMPLES,
  AI_GOAL_SUGGESTIONS,
  aiDraftToLocalPath,
  aiTaskRowHTML,
  goalStepHTML,
  localGeneratedDraft,
  normalizeGeneratedDraft,
  readQuestionAnswerFromDOM,
  startExampleRotation,
  stopExampleRotation,
  updateGoalSuggestionButtons,
} from '../src/views/ai-builder/index.js';

test('AI builder modules expose focused rendering, events, and draft helpers', () => {
  assert.ok(AI_GOAL_SUGGESTIONS.includes('Speak French confidently'));
  assert.ok(AI_GOAL_EXAMPLES[0].startsWith('I want to'));

  const source = readFileSync(new URL('../src/views.js', import.meta.url), 'utf8');
  assert.match(source, /views\/ai-builder\/index\.js/);
  assert.doesNotMatch(source, /const AI_GOAL_SUGGESTIONS\s*=/);
  assert.doesNotMatch(source, /const AI_ROTATING_GOAL_EXAMPLES\s*=/);
  assert.match(source, /createLocalGeneratedDraft/);
  assert.match(source, /normalizeAIGeneratedDraft/);
  assert.match(source, /aiGeneratedDraftToLocalPath/);
});

test('goal step rendering keeps the entry actions and suggestion hooks isolated', () => {
  const html = goalStepHTML(
    { phase:'goal', prompt:{ goal:'' }, requests:{}, exampleIndex:0 },
    { hasActiveAIRequest:() => false, voiceIsActive:() => false },
  );
  assert.match(html, /Basic starter/);
  assert.match(html, /id="aiBuild"/);
  assert.match(html, /Build with AI/);
  assert.match(html, /data-goal-suggestion/);
  assert.match(html, /data-voice-enabled="false"/);
});

test('review task rows keep resource URL editing available', () => {
  const html = aiTaskRowHTML({
    title:'Daily practice',
    description:'Practice today.',
    scheduleType:'times_per_week',
    taskMode:'fixed_recurring',
    startDay:1,
    endDay:75,
    resourceUrl:'https://example.com/lesson',
  }, 0);
  assert.match(html, /data-task-field="resourceUrl"/);
  assert.match(html, /Task resource URL/);
  assert.match(html, /https:\/\/example\.com\/lesson/);
});

test('example rotation helper starts, advances, disables suggestions, and cleans up', () => {
  const builder = { phase:'goal', exampleIndex:0 };
  const input = { value:'', placeholder:'' };
  const buttons = [
    { disabled:false, attrs:{}, setAttribute(key, value){ this.attrs[key] = value; } },
    { disabled:false, attrs:{}, setAttribute(key, value){ this.attrs[key] = value; } },
  ];
  const root = { querySelectorAll:() => buttons };
  const intervals = [];
  const cleared = [];

  const timer = startExampleRotation(builder, {
    getGoalInput:() => input,
    getActiveElement:() => null,
    isCurrentBuilder:() => true,
    prefersReducedMotion:() => false,
    setIntervalFn:(fn, ms) => {
      intervals.push({ fn, ms });
      return 'timer-1';
    },
    clearIntervalFn:(id) => cleared.push(id),
  });

  assert.equal(timer, 'timer-1');
  assert.equal(intervals[0].ms, 3500);
  assert.equal(input.placeholder, AI_GOAL_EXAMPLES[0]);
  intervals[0].fn();
  assert.equal(input.placeholder, AI_GOAL_EXAMPLES[1]);

  updateGoalSuggestionButtons(root, 'Custom goal');
  assert.equal(buttons[0].disabled, true);
  assert.equal(buttons[0].attrs['aria-disabled'], 'true');

  stopExampleRotation(builder, { markInteracted:true, clearIntervalFn:(id) => cleared.push(id) });
  assert.equal(builder.exampleRotationStopped, true);
  assert.ok(cleared.includes('timer-1'));
});

test('structured resource answers preserve course details without flattening', () => {
  const values = {
    aiResourceTitle:{ value:'Design Course' },
    aiResourceUrl:{ value:'https://example.com/course' },
    aiResourceNotes:{ value:'Use modules 1-5' },
  };
  const answer = readQuestionAnswerFromDOM((id) => values[id] || null, {
    kind:'resource',
    resourceType:'course',
    key:'course',
    answers:{},
  });
  assert.deepEqual(answer, {
    type:'course',
    title:'Design Course',
    url:'https://example.com/course',
    notes:'Use modules 1-5',
  });
});

test('draft helpers preserve current journey scheduling and Phase 5.5 context fields', () => {
  const prompt = {
    goal:'Run my first 15 km',
    pathType:'fitness',
    durationDays:75,
    intensity:'balanced',
    confirmedBrief:{
      goal:'Run my first 15 km',
      intensity:'balanced',
      domainProfile:{ primary:'fitness', detected:['fitness'], confidence:'medium' },
      structuredResources:{ courses:[], books:[], programmes:[] },
      fitnessContext:{ activity:'running', target:'15 km' },
    },
  };
  const draft = normalizeGeneratedDraft(localGeneratedDraft(prompt), prompt);
  assert.equal(draft.durationDays, 75);
  assert.equal(draft.tasks[0].scheduleType, 'times_per_week');
  assert.equal(draft.tasks[0].taskMode, 'fixed_recurring');

  const path = aiDraftToLocalPath(draft, {
    uid:'user-1',
    email:'runner@example.com',
    displayName:'Runner',
  });
  assert.equal(path.creatorId, 'user-1');
  assert.equal(path.visibility, 'private');
  assert.equal(path.discoverable, false);
  assert.equal(path.domainProfile.primary, 'fitness');
  assert.equal(path.fitnessContext.target, '15 km');
  assert.equal(path.weeks[0].tasks[0].scheduleType, 'times_per_week');
  assert.equal(path.weeks[0].tasks[0].taskMode, 'fixed_recurring');
});

test('AI model defaults do not reintroduce duplicate generated resource keys', () => {
  const modelSource = readFileSync(new URL('../src/ai-builder-model.js', import.meta.url), 'utf8');
  const bookResourceBlock = modelSource.slice(
    modelSource.indexOf('function normalizeBookResource'),
    modelSource.indexOf('function normalizeProgrammeResource'),
  );
  const promptDefaultsBlock = modelSource.slice(
    modelSource.indexOf('export function aiPromptDefaults'),
    modelSource.indexOf('export function isMeaningfulAIGoal'),
  );
  assert.equal((bookResourceBlock.match(/pagesPerSession\s*:/g) || []).length, 1);
  assert.equal((promptDefaultsBlock.match(/assumptions\s*:/g) || []).length, 1);
});
