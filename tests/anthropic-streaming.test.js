import test from 'node:test';
import assert from 'node:assert/strict';

import { runProviderRequest } from '../api/_lib/provider.js';
import { callAnthropic as callGenerateAnthropic, basicStarterDraft, normalizePrompt } from '../api/generate-path.js';
import { callAnthropic as callInterpretAnthropic } from '../api/interpret-goal.js';

function streamClient(message, onCall = () => {}){
  let calls = 0;
  let finalMessageAwaited = false;
  const client = {
    messages:{
      stream(params, options){
        calls += 1;
        onCall(params, options);
        return {
          async finalMessage(){
            finalMessageAwaited = true;
            return typeof message === 'function' ? message(params, options) : message;
          },
        };
      },
    },
  };
  return {
    client,
    calls:() => calls,
    finalMessageAwaited:() => finalMessageAwaited,
  };
}

test('interpretation uses Anthropic messages.stream and awaits final tool-use message', async () => {
  const controller = new AbortController();
  let receivedSignal = null;
  let toolName = null;
  const toolInput = {
    goal:'Write one gratitude entry every night for 14 days',
    summary:'Gratitude practice',
    pathType:'habit',
    durationDays:14,
    materialGaps:[],
    clarifyingQuestions:[],
    assumptions:[],
    readyToGenerate:true,
  };
  const mock = streamClient({
    content:[{ type:'tool_use', name:'interpret_goal_brief', input:toolInput }],
    usage:{ input_tokens:111, output_tokens:222 },
  }, (params, options) => {
    receivedSignal = options.signal;
    toolName = params.tool_choice.name;
  });

  const raw = await callInterpretAnthropic({ roughGoal:'Gratitude habit' }, controller.signal, mock.client);

  assert.equal(mock.calls(), 1);
  assert.equal(mock.finalMessageAwaited(), true);
  assert.equal(receivedSignal, controller.signal);
  assert.equal(toolName, 'interpret_goal_brief');
  assert.deepEqual(raw, toolInput);
  assert.deepEqual(raw.__usage, { inputTokens:111, outputTokens:222 });
});

test('roadmap generation uses Anthropic messages.stream and awaits final tool-use message', async () => {
  const controller = new AbortController();
  let receivedSignal = null;
  let toolName = null;
  const input = normalizePrompt({ confirmedBrief:{ goal:'Learn piano', durationDays:30 } });
  const toolInput = basicStarterDraft(input, 'test');
  const mock = streamClient({
    content:[{ type:'tool_use', name:'create_learning_path', input:toolInput }],
    usage:{ input_tokens:333, output_tokens:444 },
  }, (params, options) => {
    receivedSignal = options.signal;
    toolName = params.tool_choice.name;
  });

  const raw = await callGenerateAnthropic(input, controller.signal, mock.client);

  assert.equal(mock.calls(), 1);
  assert.equal(mock.finalMessageAwaited(), true);
  assert.equal(receivedSignal, controller.signal);
  assert.equal(toolName, 'create_learning_path');
  assert.deepEqual(raw, toolInput);
  assert.deepEqual(raw.__usage, { inputTokens:333, outputTokens:444 });
});

test('stream-backed provider timeout aborts the active stream and returns structured 504', async () => {
  let streamSignal = null;
  let aborted = false;
  const mock = {
    messages:{
      stream(params, options){
        streamSignal = options.signal;
        return {
          finalMessage(){
            return new Promise((resolve, reject) => {
              options.signal.addEventListener('abort', () => {
                aborted = true;
                reject(new Error('aborted'));
              });
            });
          },
        };
      },
    },
  };

  await assert.rejects(
    () => runProviderRequest(null, 5, signal => callInterpretAnthropic({ roughGoal:'Learn piano' }, signal, mock)),
    error => error.code === 'provider_timeout' && error.status === 504
  );
  assert.ok(streamSignal);
  assert.equal(aborted, true);
});

test('Anthropic SDK errors still map to a safe provider error', async () => {
  const mock = streamClient(null);
  mock.client.messages.stream = () => ({
    async finalMessage(){
      const error = new Error('raw provider detail');
      error.status = 429;
      error.type = 'rate_limit_error';
      throw error;
    },
  });

  await assert.rejects(
    () => callGenerateAnthropic(normalizePrompt({ confirmedBrief:{ goal:'Learn piano', durationDays:30 } }), new AbortController().signal, mock.client),
    error => error.code === 'provider_unavailable' && error.status === 503
  );
});
