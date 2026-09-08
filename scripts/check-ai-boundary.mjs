#!/usr/bin/env node
/**
 * CI guard for the S11 boundary (AIDO §4, SPEC §8 SEC-18).
 *
 * ESLint covers provider *imports*. This covers the two things it cannot:
 *   1. AI credentials/config read outside src/modules/ai/
 *   2. Any AI reference at all inside the AI-free zones (S5 forecast, S10 reconcile)
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');
const AI_MODULE = join('src', 'modules', 'ai');
const AI_FREE_ZONES = [join('src', 'modules', 'forecast'), join('src', 'modules', 'reconcile')];

const AI_ENV = /\bprocess\.env\.(AI_API_KEY|AI_PROVIDER|AI_MODEL|AI_ENABLED|AI_[A-Z0-9_]+)\b/;
const AI_REFERENCE = /\b(modules\/ai|aiService|callProvider|process\.env\.AI_)/;

function walk(dir) {
  let out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out = out.concat(walk(full));
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

const violations = [];

for (const file of walk(SRC)) {
  const rel = relative(ROOT, file);
  const source = readFileSync(file, 'utf8');

  if (!rel.startsWith(AI_MODULE + sep) && AI_ENV.test(source)) {
    violations.push(`${rel} — reads AI_* configuration outside ${AI_MODULE}/ (SEC-18)`);
  }

  for (const zone of AI_FREE_ZONES) {
    if (rel.startsWith(zone + sep) && AI_REFERENCE.test(source)) {
      violations.push(`${rel} — AI reference inside the AI-free zone ${zone}/ (AIDO §6)`);
    }
  }
}

if (violations.length > 0) {
  console.error('AI boundary violations:\n');
  for (const v of violations) console.error(`  ✗ ${v}`);
  console.error('\nAll model calls go through src/modules/ai/ (S11). See AIDO §4 and §6.');
  process.exit(1);
}

console.log('✓ AI boundary clean');
