import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  beginAIRequest, cancelAIRequests, canStartAIRequest, createAIRequestState,
  finishAIRequest, hasActiveAIRequest,
} from '../src/ai-builder-model.js';
import { localToPlatformParts, normalizePathDoc, platformToLocalPath } from '../src/platform.js';
import { externalLinkHTML, safeExternalUrl } from '../src/urls.js';
import { normalizeDraft, normalizePrompt } from '../api/generate-path.js';

test('external URL sanitizer accepts only absolute HTTP and HTTPS URLs', () => {
  assert.equal(safeExternalUrl('https://example.com/a?b=1'), 'https://example.com/a?b=1');
  assert.equal(safeExternalUrl('http://example.com'), 'http://example.com/');
  ['javascript:alert(1)', 'data:text/html,hello', 'file:///tmp/a', 'vbscript:msgbox(1)', 'blob:https://example.com/id', '/relative', 'mailto:user@example.com', ''].forEach(value => {
    assert.equal(safeExternalUrl(value), null, value);
  });
});

test('unsafe stored links render as escaped non-clickable text', () => {
  const unsafe = externalLinkHTML('javascript:alert(1)', '<img src=x onerror=alert(1)>');
  assert.match(unsafe, /invalid-link/);
  assert.doesNotMatch(unsafe, /href=/);
  assert.doesNotMatch(unsafe, /<img/);
  const safe = externalLinkHTML('https://example.com', 'Open');
  assert.match(safe, /href="https:\/\/example\.com\/"/);
  assert.match(safe, /rel="noopener noreferrer"/);
});

test('platform conversion removes unsafe task, resource, cover, and profile URLs', () => {
  const parts = localToPlatformParts('path-1', {
    title:'Path', coverImage:'javascript:alert(1)', profileImage:'https://example.com/avatar.png',
    weeks:[{ title:'Week', tasks:[{ text:'Task', resourceUrl:'data:text/html,no' }], resources:[{ label:'Guide', url:'https://example.com/guide' }] }],
  }, { uid:'owner', email:'owner@example.com' });
  assert.equal(parts.path.coverImage, null);
  assert.equal(parts.path.profileImage, 'https://example.com/avatar.png');
  assert.equal(parts.tasks.find(item => item.kind === 'task').resourceUrl, null);
  assert.equal(parts.tasks.find(item => item.kind === 'resource').resourceUrl, 'https://example.com/guide');

  const local = platformToLocalPath({
    id:'path-2', path:normalizePathDoc('path-2', { title:'Path' }),
    sections:[{ id:'s1', title:'One', order:0 }],
    tasks:[{ id:'t1', sectionId:'s1', title:'Task', resourceUrl:'file:///secret', order:0 }],
  });
  assert.equal(local.weeks[0].tasks[0].resourceUrl, null);
});

test('platform conversion preserves Phase 5.5 metadata across local and cloud shapes', () => {
  const confirmedBrief = {
    goal:'Finish a fixed course and run safely',
    durationDays:45,
    intensity:'intensive',
    domainProfile:{ primary:'fitness', detected:['fitness', 'course'], confidence:'high' },
    structuredResources:{ courses:[{ title:'Running Course', fixedSequence:true, currentPosition:{ label:'Module 2', index:2 }, totalUnits:10 }] },
    fitnessContext:{ activity:'running', baseline:'1 km', target:'5 km', frequencyPerWeek:3, sessionMinutes:30 },
    briefConfirmed:true,
    confirmedAt:'2026-06-18T00:00:00.000Z',
  };
  const parts = localToPlatformParts('phase55-path', {
    title:'Phase 5.5 path',
    goal:confirmedBrief.goal,
    durationDays:45,
    intensity:'intensive',
    aiBrief:confirmedBrief,
    domainProfile:confirmedBrief.domainProfile,
    structuredResources:confirmedBrief.structuredResources,
    fitnessContext:confirmedBrief.fitnessContext,
    weeks:[{ title:'Week', tasks:[{ text:'Run session' }], resources:[] }],
  }, { uid:'owner', email:'owner@example.com' }, 'owner');

  assert.equal(parts.path.intensity, 'intensive');
  assert.equal(parts.path.domainProfile.primary, 'fitness');
  assert.equal(parts.path.structuredResources.courses[0].title, 'Running Course');
  assert.equal(parts.path.fitnessContext.baseline, '1 km');
  assert.equal(parts.path.aiBrief.intensity, 'intensive');

  const local = platformToLocalPath({ id:'phase55-path', path:parts.path, sections:parts.sections, tasks:parts.tasks });
  assert.equal(local.intensity, 'intensive');
  assert.equal(local.domainProfile.primary, 'fitness');
  assert.equal(local.structuredResources.courses[0].fixedSequence, true);
  assert.equal(local.fitnessContext.frequencyPerWeek, 3);
  assert.equal(local.aiBrief.domainProfile.primary, 'fitness');
});

test('AI-generated unsafe resource URLs are removed or ignored during draft normalization', () => {
  const input = normalizePrompt({ confirmedBrief:{ goal:'Learn safely', durationDays:7 } });
  const draft = normalizeDraft({
    title:'Safe path', goal:'Learn safely', description:'', category:'skill', durationDays:7,
    durationLabel:'7 days', difficulty:null, intensity:null, previewTitle:'Safe path', previewDescription:'',
    coreCommitments:[], sections:[{ title:'Start', description:'', order:0 }],
    tasks:[{
      title:'Read guide', description:'', sectionTitle:'Start', scheduleType:'once', taskMode:'one_off',
      startDay:1, endDay:null, unlockDay:1, daysOfWeek:[], timesPerWeek:null, intervalDays:null,
      scheduledDay:1, progressionMetric:null, progressionUnit:null, startValue:null, targetValue:null,
      progressionCurve:null, progressionNotes:null, evidenceRequired:false, resourceUrl:'javascript:alert(1)', order:0,
    }],
    resources:[{ title:'Unsafe', url:'data:text/html,no', description:'Kept as descriptive text.' }], notes:[],
  }, input);
  assert.equal(draft.tasks[0].resourceUrl, null);
  assert.deepEqual(draft.resources, []);
});

test('AI request slots isolate stale cleanup and block cross-category overlap', () => {
  const requests = createAIRequestState();
  const firstController = { aborted:false, abort(){ this.aborted = true; } };
  const firstToken = beginAIRequest(requests, 'voice', firstController);
  assert.equal(hasActiveAIRequest(requests), true);
  assert.equal(canStartAIRequest({ phase:'input', requests }), false);

  const secondController = { aborted:false, abort(){ this.aborted = true; } };
  const secondToken = beginAIRequest(requests, 'voice', secondController);
  assert.equal(firstController.aborted, true);
  assert.equal(finishAIRequest(requests, 'voice', firstToken), false);
  assert.equal(requests.voice.loading, true);
  assert.equal(finishAIRequest(requests, 'voice', secondToken), true);
  assert.equal(hasActiveAIRequest(requests), false);
});

test('every paid request category blocks the other categories until cleanup', () => {
  for(const kind of ['voice', 'interpret', 'generate']){
    const requests = createAIRequestState();
    const token = beginAIRequest(requests, kind, { abort(){} });
    assert.equal(canStartAIRequest({ phase:'input', requests }), false, kind);
    assert.equal(finishAIRequest(requests, kind, token), true);
    assert.equal(canStartAIRequest({ phase:'input', requests }), true, kind);
  }
});

test('failed request cleanup clears only its captured slot', () => {
  const requests = createAIRequestState();
  const voiceToken = beginAIRequest(requests, 'voice', { abort(){} });
  const interpretToken = beginAIRequest(requests, 'interpret', { abort(){} });
  assert.equal(finishAIRequest(requests, 'voice', voiceToken), true);
  assert.equal(requests.voice.loading, false);
  assert.equal(requests.interpret.loading, true);
  assert.equal(finishAIRequest(requests, 'interpret', interpretToken), true);
});

test('closing a builder aborts and invalidates every paid request category', () => {
  const requests = createAIRequestState();
  const controllers = ['voice', 'interpret', 'generate'].map(() => ({ aborted:false, abort(){ this.aborted = true; } }));
  ['voice', 'interpret', 'generate'].forEach((kind, index) => beginAIRequest(requests, kind, controllers[index]));
  const previousTokens = Object.fromEntries(Object.entries(requests).map(([kind, slot]) => [kind, slot.token]));
  cancelAIRequests(requests);
  controllers.forEach(controller => assert.equal(controller.aborted, true));
  Object.entries(requests).forEach(([kind, slot]) => {
    assert.equal(slot.loading, false);
    assert.equal(slot.controller, null);
    assert.ok(slot.token > previousTokens[kind]);
  });
});

test('frontend generation request uses only confirmedBrief and saveOptions', () => {
  const source = fs.readFileSync(new URL('../src/views.js', import.meta.url), 'utf8');
  const requestBlock = source.slice(source.indexOf("authenticatedAIRequest(request, '/api/generate-path'"), source.indexOf('}, AI_GENERATE_TIMEOUT_MS)'));
  assert.match(requestBlock, /confirmedBrief/);
  assert.match(requestBlock, /saveOptions:\{ visibility:prompt\.visibility \}/);
  assert.doesNotMatch(requestBlock, /resourceLinks:prompt\.resourceLinks/);
  assert.doesNotMatch(requestBlock, /includeTasks:prompt\.includeTasks/);
  assert.doesNotMatch(requestBlock, /excludeTasks:prompt\.excludeTasks/);
});

test('local state save path sanitizes user paths and built-in resource edits', () => {
  const source = fs.readFileSync(new URL('../src/views.js', import.meta.url), 'utf8');
  const saveBlock = source.slice(source.indexOf('function sanitizePersistedUrls'), source.indexOf('/* ---- progress toggle'));
  assert.match(saveBlock, /path\.coverImage = safeExternalUrl/);
  assert.match(saveBlock, /task\.resourceUrl = safeExternalUrl/);
  assert.match(saveBlock, /resource\.url = safeExternalUrl/);
  assert.match(saveBlock, /resource\.u = safeExternalUrl/);
  assert.match(saveBlock, /sanitizePersistedUrls\(\);\s+await dbSaveState/);
});

test('modal close invalidates requests and stale results require a current builder and token', () => {
  const source = fs.readFileSync(new URL('../src/views.js', import.meta.url), 'utf8');
  const closeBlock = source.slice(source.indexOf('function closeAIBuilder'), source.indexOf('function collectAIPrompt'));
  assert.match(closeBlock, /abortAIRequest\(null, builder\)/);
  assert.match(closeBlock, /aiBuilder = null/);
  const currentCheck = source.slice(source.indexOf('function aiRequestIsCurrent'), source.indexOf('function finishAIClientRequest'));
  assert.match(currentCheck, /aiBuilder === request\.builder/);
  assert.match(currentCheck, /token === request\.token/);
});

test('browser-side AI timeout uses operation_timeout and preserves provider_timeout for server payloads', () => {
  const source = fs.readFileSync(new URL('../src/views.js', import.meta.url), 'utf8');
  const requestStart = source.indexOf('async function authenticatedAIRequest');
  const requestBlock = source.slice(requestStart, requestStart + 1200);
  assert.match(requestBlock, /timeoutError\.code = 'operation_timeout'/);
  assert.doesNotMatch(requestBlock, /timeoutError\.code = 'provider_timeout'/);
  assert.match(source, /\['operation_timeout', 'provider_timeout'\]\.includes/);
});

test('client join helper uses authenticated route and safe user-facing errors', () => {
  const apiSource = fs.readFileSync(new URL('../src/api.js', import.meta.url), 'utf8');
  const joinBlock = apiSource.slice(apiSource.indexOf('export async function joinPath'), apiSource.length);
  assert.match(joinBlock, /authFetch\('\/api\/join-path'/);
  assert.match(joinBlock, /method:'POST'/);
  assert.match(joinBlock, /JSON\.stringify\(\{ pathId \}\)/);
  assert.match(apiSource, /Sign in to join this path/);
  assert.match(apiSource, /This path is private/);
  assert.match(apiSource, /This path could not be found/);
  assert.match(apiSource, /Too many join attempts/);
  assert.doesNotMatch(joinBlock, /console\.error/);
});

test('public progress loading queries only public timeline entries', () => {
  const source = fs.readFileSync(new URL('../src/db.js', import.meta.url), 'utf8');
  const loadBlock = source.slice(source.indexOf('async function loadPublicProgress'), source.indexOf('export async function dbLoadPublicProgress'));
  assert.match(loadBlock, /fb\.query\(/);
  assert.match(loadBlock, /publicProgressCol\(pathId\)/);
  assert.match(loadBlock, /fb\.where\('visibility', '==', 'public'\)/);
  assert.match(loadBlock, /fb\.getDocs\(publicEntriesQuery\)/);
  assert.doesNotMatch(loadBlock, /fb\.getDocs\(publicProgressCol\(pathId\)\)/);
  assert.doesNotMatch(loadBlock, /syncErrorMessage/);
  assert.doesNotMatch(loadBlock, /applyCloudResult/);
  assert.match(loadBlock, /cachePublicProgress\(pathId, entries\)\.slice\(0, limit\)/);
});

test('public join button disables duplicate clicks while join request is active', () => {
  const source = fs.readFileSync(new URL('../src/views.js', import.meta.url), 'utf8');
  const joinBlock = source.slice(source.indexOf('async function joinPublicPath'), source.indexOf('function currentEnrollmentForPath'));
  assert.match(joinBlock, /if\(!record\?\.id \|\| joiningPathId\) return/);
  assert.match(joinBlock, /joiningPathId = record\.id/);
  assert.match(joinBlock, /joiningPathId = null/);
  assert.match(source, /Joining\.\.\./);
  assert.match(source, /id="joinPathBtn"[^+]*\+ \(joining \? 'disabled'/);
});
