import { apiError } from './errors.js';

export async function runProviderRequest(req, timeoutMs, operation){
  const controller = new AbortController();
  let timedOut = false;
  let clientAborted = false;
  const onAborted = () => {
    clientAborted = true;
    controller.abort(new Error('Client disconnected.'));
  };
  if(req?.once) req.once('aborted', onAborted);
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(new Error('Provider timeout.'));
  }, timeoutMs);

  try{
    return await operation(controller.signal);
  }catch(error){
    if(timedOut){
      throw apiError('provider_timeout', 'The provider request took too long and was cancelled. Try again.', 504);
    }
    if(clientAborted || controller.signal.aborted){
      throw apiError('provider_unavailable', 'The request was cancelled before completion.', 503);
    }
    throw error;
  }finally{
    clearTimeout(timer);
    if(req?.off) req.off('aborted', onAborted);
  }
}
