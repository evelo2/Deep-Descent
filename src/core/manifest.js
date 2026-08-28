// @ts-check
// Contract v1 validation — the rules a minigame's manifest.js must satisfy.
// Pure and dependency-free: it takes a manifest object and returns a list of
// human-readable problems (empty = valid). Core calls assertManifest() at
// registration so a broken manifest fails loudly at boot rather than at some
// later frame. See docs/superpowers/specs/2026-08-25-minigame-platform-contract-design.md §3.

/** The ABI version every contract-v1 manifest must declare. */
export const CONTRACT_VERSION = 1;

/**
 * Host services a minigame must opt into. Anything NOT on this list (audio,
 * input, particles, viewport, rng, open, close) is always present — those are
 * the shell itself, not a capability.
 */
export const GATED_CAPABILITIES = ['economy', 'progression', 'achievements', 'world'];

const SLUG = /^[a-z][a-z0-9]*$/;
const SEMVER = /^\d+\.\d+\.\d+$/;
const ENTRY_KINDS = ['world', 'menu'];

/** True when `id` is namespaced to `owner` — i.e. exactly `owner:<slug-ish>`. */
function namespacedTo(id, owner) {
  if (typeof id !== 'string') return false;
  const cut = id.indexOf(':');
  return cut > 0 && id.slice(0, cut) === owner && id.length > cut + 1;
}

/**
 * Walk a value and report any function found at a path other than the root
 * `module` thunk. Manifests must stay serialisable (spec §1 decision #6).
 * @param {*} value
 * @param {string} path
 * @param {string[]} out
 */
function findFunctions(value, path, out) {
  if (typeof value === 'function') { out.push(path); return; }
  if (Array.isArray(value)) {
    value.forEach((v, i) => findFunctions(v, `${path}[${i}]`, out));
    return;
  }
  if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) findFunctions(value[k], `${path}.${k}`, out);
  }
}

/**
 * @param {*} m  The manifest object (a module's default export).
 * @param {Object} [opts]
 * @param {{badges: Set<string>, stats: Set<string>, tracks: Set<string>}} [opts.grandfathered]
 *        Ids shipped before P11.1 that are allowed to stay bare. Omit to
 *        require namespacing everywhere.
 * @returns {string[]} problems; empty means valid.
 */
export function validateManifest(m, { grandfathered } = {}) {
  /** @type {string[]} */
  const errs = [];
  if (!m || typeof m !== 'object') return ['manifest is not an object'];

  // --- identity ---
  if (typeof m.id !== 'string' || !SLUG.test(m.id)) {
    errs.push(`id must be a lowercase slug, got ${JSON.stringify(m.id)}`);
  }
  if (typeof m.name !== 'string' || !m.name) errs.push('name must be a non-empty string');
  if (typeof m.version !== 'string' || !SEMVER.test(m.version)) {
    errs.push(`version must be semver, got ${JSON.stringify(m.version)}`);
  }
  if (m.contract !== CONTRACT_VERSION) {
    errs.push(`contract must be ${CONTRACT_VERSION}, got ${JSON.stringify(m.contract)}`);
  }

  // --- capabilities ---
  const caps = m.capabilities;
  if (!Array.isArray(caps)) {
    errs.push('capabilities must be an array');
  } else {
    for (const c of caps) {
      if (!GATED_CAPABILITIES.includes(c)) errs.push(`unknown capability '${c}'`);
    }
  }

  // --- entries ---
  if (!Array.isArray(m.entries) || m.entries.length === 0) {
    errs.push('entries must be a non-empty array');
  } else {
    const seen = new Set();
    for (const e of m.entries) {
      if (!e || typeof e.id !== 'string' || !e.id) { errs.push('every entry needs an id'); continue; }
      if (seen.has(e.id)) errs.push(`duplicate entry id '${e.id}'`);
      seen.add(e.id);
      if (!ENTRY_KINDS.includes(e.kind)) errs.push(`entry '${e.id}' has unknown kind '${e.kind}'`);
      if (typeof e.label !== 'string' || !e.label) errs.push(`entry '${e.id}' needs a label`);
    }
  }

  // --- the module thunk ---
  if (typeof m.module !== 'function') errs.push('module must be a () => import(...) thunk');

  // --- purity: the thunk is the only function permitted ---
  /** @type {string[]} */
  const fns = [];
  for (const k of Object.keys(m)) {
    if (k === 'module') continue;
    findFunctions(m[k], k, fns);
  }
  for (const p of fns) {
    errs.push(`function found at '${p}' — manifests must be pure data (only 'module' may be a function)`);
  }

  // --- goals + the namespacing rule ---
  const goals = m.goals || {};
  const owner = typeof m.id === 'string' ? m.id : '';
  const allowed = grandfathered || { badges: new Set(), stats: new Set(), tracks: new Set() };
  const declaredStats = new Set();

  const checkId = (id, kind, allowList) => {
    if (typeof id !== 'string' || !id) { errs.push(`every ${kind} needs an id`); return; }
    if (allowList.has(id)) return;                       // grandfathered, stays bare
    if (!namespacedTo(id, owner)) {
      errs.push(`${kind} '${id}' must be namespaced '${owner}:<key>'`);
    }
  };

  for (const s of goals.stats || []) {
    checkId(s && s.key, 'stat', allowed.stats);
    if (s && typeof s.key === 'string') declaredStats.add(s.key);
  }
  for (const b of goals.badges || []) checkId(b && b.id, 'badge', allowed.badges);
  for (const t of goals.tracks || []) {
    checkId(t && t.id, 'track', allowed.tracks);
    if (t && typeof t.stat === 'string' && !declaredStats.has(t.stat)) {
      errs.push(`track '${t.id}' references stat '${t.stat}' which this manifest does not declare`);
    }
    if (t && !Array.isArray(t.tiers)) errs.push(`track '${t && t.id}' needs a tiers array`);
  }

  return errs;
}

/**
 * validateManifest, but throws instead of returning problems.
 * @param {*} m
 * @param {Object} [opts]
 * @returns {*} the manifest, unchanged
 */
export function assertManifest(m, opts) {
  const errs = validateManifest(m, opts);
  if (errs.length) {
    throw new Error(`invalid manifest${m && m.id ? ` '${m.id}'` : ''}: ${errs.join('; ')}`);
  }
  return m;
}
