const ACCEPTED_AUDIO_TYPES = new Set([
  'audio/webm',
  'audio/mp4',
  'audio/mpeg',
  'audio/wav',
  'audio/ogg',
]);
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

export const config = {
  api: {
    bodyParser: false,
  },
};

function text(value, fallback = ''){
  return String(value == null ? fallback : value).trim();
}

function codedError(message, code, status = 400){
  const err = new Error(message);
  err.code = code;
  err.status = status;
  return err;
}

function cleanContentType(value){
  return text(value).split(';')[0].toLowerCase();
}

async function readAudioBody(req){
  if(req.body){
    if(Buffer.isBuffer(req.body)) return req.body;
    if(typeof req.body === 'string') return Buffer.from(req.body);
    if(req.body instanceof ArrayBuffer) return Buffer.from(req.body);
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req){
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buf.length;
    if(size > MAX_AUDIO_BYTES){
      throw codedError('This recording is too large. Please keep voice memos under 5 minutes.', 'audio_too_large', 413);
    }
    chunks.push(buf);
  }
  return Buffer.concat(chunks);
}

function mapDeepgramError(status){
  if(status === 401 || status === 403){
    return codedError('Deepgram authentication failed. Check the server API key.', 'deepgram_auth_error', status);
  }
  if(status === 429){
    return codedError('Deepgram rate limit reached. Please retry later.', 'deepgram_rate_limited', 429);
  }
  if(status >= 500){
    return codedError('Deepgram service error. Please retry later.', 'deepgram_server_error', status || 502);
  }
  return codedError('Voice transcription failed. Please try again.', 'transcription_failed', status || 502);
}

function extractTranscript(payload){
  const channel = payload?.results?.channels?.[0];
  const alternative = channel?.alternatives?.[0];
  const transcript = text(alternative?.transcript);
  const confidence = Number(alternative?.confidence);
  const duration = Number(payload?.metadata?.duration);
  return {
    transcript,
    confidence: Number.isFinite(confidence) ? confidence : null,
    duration: Number.isFinite(duration) ? duration : null,
  };
}

export default async function handler(req, res){
  if(req.method !== 'POST'){
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok:false, code:'method_not_allowed', message:'POST only.' });
  }
  try{
    const apiKey = process.env.DEEPGRAM_API_KEY;
    if(!apiKey){
      return res.status(503).json({
        ok:false,
        code:'missing_deepgram_config',
        message:'Voice transcription requires Deepgram configuration.',
      });
    }

    const contentType = cleanContentType(req.headers['content-type']);
    if(!contentType){
      throw codedError('Missing audio content type.', 'missing_audio', 400);
    }
    if(!ACCEPTED_AUDIO_TYPES.has(contentType)){
      throw codedError('This audio format is not supported. Please try recording again.', 'unsupported_audio_type', 415);
    }

    const contentLength = Number(req.headers['content-length'] || 0);
    if(Number.isFinite(contentLength) && contentLength > MAX_AUDIO_BYTES){
      throw codedError('This recording is too large. Please keep voice memos under 5 minutes.', 'audio_too_large', 413);
    }

    const audio = await readAudioBody(req);
    if(!audio.length) throw codedError('Add an audio recording before transcribing.', 'missing_audio', 400);
    if(audio.length > MAX_AUDIO_BYTES){
      throw codedError('This recording is too large. Please keep voice memos under 5 minutes.', 'audio_too_large', 413);
    }

    const dgRes = await fetch('https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true', {
      method:'POST',
      headers:{
        Authorization:'Token ' + apiKey,
        'Content-Type':contentType,
      },
      body:audio,
    });
    if(!dgRes.ok) throw mapDeepgramError(dgRes.status);

    const payload = await dgRes.json();
    const result = extractTranscript(payload);
    if(!result.transcript){
      throw codedError('We could not detect speech clearly. Try recording again or type your goal manually.', 'empty_transcript', 422);
    }

    return res.status(200).json({
      ok:true,
      transcript:result.transcript,
      duration:result.duration,
      confidence:result.confidence,
    });
  }catch(e){
    return res.status(e.status || 502).json({
      ok:false,
      code:e.code || 'transcription_failed',
      message:e.message || 'Voice transcription failed. Please try again.',
    });
  }
}
