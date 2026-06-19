import { getAdminFirestore } from './firebase-admin.js';
import { apiError } from './errors.js';

const ROUTE_LIMITS = {
  interpret:{ hourlyEnv:'RATE_LIMIT_INTERPRET_PER_HOUR', burstEnv:'RATE_LIMIT_INTERPRET_BURST_PER_10_MINUTES', hourly:40, burst:8 },
  generate:{ hourlyEnv:'RATE_LIMIT_GENERATE_PER_HOUR', burstEnv:'RATE_LIMIT_GENERATE_BURST_PER_10_MINUTES', hourly:12, burst:3 },
  transcribe:{ hourlyEnv:'RATE_LIMIT_TRANSCRIBE_PER_HOUR', burstEnv:'RATE_LIMIT_TRANSCRIBE_BURST_PER_10_MINUTES', hourly:20, burst:6 },
  joinPath:{ hourlyEnv:'RATE_LIMIT_JOIN_PATH_PER_HOUR', burstEnv:'RATE_LIMIT_JOIN_PATH_BURST_PER_10_MINUTES', hourly:80, burst:12 },
};

function configuredLimit(name, fallback){
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function safeId(value){
  return String(value).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 180);
}

export function limitsFor(routeKey){
  const config = ROUTE_LIMITS[routeKey];
  if(!config) throw apiError('internal_error', 'Unknown rate-limit route.', 500);
  return {
    hourly:configuredLimit(config.hourlyEnv, config.hourly),
    burst:configuredLimit(config.burstEnv, config.burst),
    burstWindowMs:10 * 60 * 1000,
    hourlyWindowMs:60 * 60 * 1000,
  };
}

export async function enforceRateLimit(uid, routeKey, { db = getAdminFirestore(), now = Date.now() } = {}){
  const limits = limitsFor(routeKey);
  const ref = db.collection('_internalRateLimits').doc(`${safeId(uid)}_${routeKey}`);
  const result = await db.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    const existing = snapshot.exists ? snapshot.data() : {};
    const burstWindowStart = Number(existing.burstWindowStart || 0);
    const hourlyWindowStart = Number(existing.hourlyWindowStart || 0);
    const burstActive = now - burstWindowStart < limits.burstWindowMs;
    const hourlyActive = now - hourlyWindowStart < limits.hourlyWindowMs;
    const burstCount = burstActive ? Number(existing.burstCount || 0) : 0;
    const hourlyCount = hourlyActive ? Number(existing.hourlyCount || 0) : 0;

    if(burstCount >= limits.burst){
      return { allowed:false, retryAfterSeconds:Math.ceil((burstWindowStart + limits.burstWindowMs - now) / 1000) };
    }
    if(hourlyCount >= limits.hourly){
      return { allowed:false, retryAfterSeconds:Math.ceil((hourlyWindowStart + limits.hourlyWindowMs - now) / 1000) };
    }

    transaction.set(ref, {
      uid,
      routeKey,
      burstWindowStart:burstActive ? burstWindowStart : now,
      burstCount:burstCount + 1,
      hourlyWindowStart:hourlyActive ? hourlyWindowStart : now,
      hourlyCount:hourlyCount + 1,
      updatedAt:new Date(now),
      expiresAt:new Date(now + 2 * limits.hourlyWindowMs),
    }, { merge:false });
    return { allowed:true };
  });

  if(!result.allowed){
    const error = apiError('rate_limited', 'You have reached the current usage limit. Try again later.', 429);
    error.retryAfterSeconds = result.retryAfterSeconds;
    throw error;
  }
  return result;
}
