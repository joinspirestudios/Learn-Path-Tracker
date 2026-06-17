import { readFileSync } from 'node:fs';

function fail(message){
  console.error('[runtime-deps] ' + message);
  process.exit(1);
}

function readJson(path){
  return JSON.parse(readFileSync(new URL('../' + path, import.meta.url), 'utf8'));
}

function major(version){
  const match = /^(\d+)\./.exec(String(version || ''));
  return match ? Number(match[1]) : null;
}

const pkg = readJson('package.json');
const lock = readJson('package-lock.json');
const root = lock.packages?.[''] || {};
const packages = lock.packages || {};
const admin = packages['node_modules/firebase-admin'];
const jwks = packages['node_modules/jwks-rsa'];
const joseRuntime = packages['node_modules/jwks-rsa/node_modules/jose'] || packages['node_modules/jose'];

if(pkg.dependencies?.['firebase-admin'] !== '13.10.0'){
  fail('firebase-admin must be pinned exactly to 13.10.0 in dependencies.');
}
if(root.dependencies?.['firebase-admin'] !== '13.10.0'){
  fail('package-lock root must pin firebase-admin exactly to 13.10.0.');
}
if(admin?.version !== '13.10.0'){
  fail('installed lockfile firebase-admin must resolve to 13.10.0.');
}
if(major(admin?.version) === 14){
  fail('firebase-admin major 14 is blocked until the Vercel jwks-rsa/jose compatibility issue is reassessed.');
}
if(!jwks || major(jwks.version) !== 3){
  fail(`firebase-admin runtime jwks-rsa must resolve to major 3, got ${jwks?.version || 'missing'}.`);
}
if(!String(admin.dependencies?.['jwks-rsa'] || '').startsWith('^3.')){
  fail('firebase-admin must depend on the jwks-rsa 3.x branch.');
}
if(!joseRuntime || major(joseRuntime.version) === 6){
  fail(`firebase-admin runtime jose must not be major 6, got ${joseRuntime?.version || 'missing'}.`);
}
if(pkg.dependencies?.['firebase-tools']){
  fail('firebase-tools must not be a production dependency.');
}
if(!pkg.devDependencies?.['firebase-tools']){
  fail('firebase-tools must remain in devDependencies for emulator/tooling usage.');
}
if(pkg.dependencies?.['jwks-rsa'] || pkg.dependencies?.jose){
  fail('Do not add jwks-rsa or jose as direct production dependencies to mask firebase-admin runtime issues.');
}
if(pkg.overrides && (JSON.stringify(pkg.overrides).includes('jwks-rsa') || JSON.stringify(pkg.overrides).includes('jose'))){
  fail('Remove npm overrides affecting jwks-rsa or jose.');
}
if(root.overrides && (JSON.stringify(root.overrides).includes('jwks-rsa') || JSON.stringify(root.overrides).includes('jose'))){
  fail('Remove package-lock overrides affecting jwks-rsa or jose.');
}

for(const route of ['api/interpret-goal.js', 'api/generate-path.js', 'api/transcribe-voice.js']){
  const source = readFileSync(new URL('../' + route, import.meta.url), 'utf8');
  if(source.includes('firebase-tools')){
    fail(`${route} must not import firebase-tools.`);
  }
}

console.log('[runtime-deps] firebase-admin@13.10.0 -> jwks-rsa@' + jwks.version + ' -> jose@' + joseRuntime.version);
