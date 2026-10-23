/**
 * FavorEngine — pure-logic favorability engine for chat page.
 * Consumes zone status key-value objects, maintains per-character favor state.
 * No browser/DOM dependencies; works in Node via require.
 */

const DEFAULT_MIN = 0;
const DEFAULT_MAX = 100;
const DEFAULT_INITIAL = 0;
const DEFAULT_THRESHOLDS = [0, 20, 40, 60, 80];
const DEFAULT_LEVELS = ['疏远', '平淡', '友善', '亲近', '倾心'];

const FAVOR_KEY_SUFFIXES = ['好感', '好感度'];
const BARE_KEYS = ['好感', '好感度'];

function extractNumber(str) {
  if (typeof str !== 'string') return null;
  const m = str.match(/([+-]?\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : null;
}

function isBareKey(key) {
  return BARE_KEYS.includes(key);
}

function parseFavorKey(key) {
  for (const suffix of FAVOR_KEY_SUFFIXES) {
    if (key.endsWith(suffix)) {
      const name = key.slice(0, -suffix.length);
      if (name.length > 0) {
        return { name, suffix };
      }
    }
  }
  return null;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function computeLevel(value, min, max, thresholds, levelNames) {
  const ratio = max > min ? (value - min) / (max - min) : 0;
  let levelIndex = 0;
  for (let i = thresholds.length - 1; i >= 0; i--) {
    const t = thresholds[i];
    if (value >= t) {
      levelIndex = i;
      break;
    }
  }
  return {
    value,
    ratio: clamp(ratio, 0, 1),
    levelIndex,
    levelName: levelNames[levelIndex] ?? levelNames[levelNames.length - 1]
  };
}

function createFavorEngine(options = {}) {
  const min = options.min ?? DEFAULT_MIN;
  const max = options.max ?? DEFAULT_MAX;
  const initial = options.initial ?? DEFAULT_INITIAL;
  const thresholds = options.thresholds ?? DEFAULT_THRESHOLDS;
  const levelNames = options.levelNames ?? DEFAULT_LEVELS;

  const state = new Map();
  const subscribers = new Set();

  function getInternal(name) {
    if (!state.has(name)) {
      state.set(name, clamp(initial, min, max));
    }
    return state.get(name);
  }

  function setInternal(name, value) {
    const clamped = clamp(value, min, max);
    state.set(name, clamped);
    return clamped;
  }

  function applyStatus(zoneValue, opts = {}) {
    if (!zoneValue || typeof zoneValue !== 'object' || Array.isArray(zoneValue)) {
      return { changes: [] };
    }

    const defaultTarget = opts.defaultTarget;
    const changes = [];

    for (const [key, rawValue] of Object.entries(zoneValue)) {
      let targetName = null;
      let mode = null;

      if (isBareKey(key)) {
        if (defaultTarget) {
          targetName = defaultTarget;
        } else {
          continue;
        }
      } else {
        const parsed = parseFavorKey(key);
        if (!parsed) continue;
        targetName = parsed.name;
      }

      let num;
      let isDelta = false;
      if (typeof rawValue === 'number') {
        if (!Number.isFinite(rawValue)) continue;
        num = rawValue;
      } else {
        const str = String(rawValue).replace(/＋/g, '+').replace(/－/g, '-');
        num = extractNumber(str);
        if (num === null) continue;
        const t = str.trim();
        isDelta = t.startsWith('+') || t.startsWith('-');
      }
      const current = getInternal(targetName);
      let newValue;
      let delta;

      if (isDelta) {
        newValue = current + num;
        delta = num;
      } else {
        newValue = num;
        delta = newValue - current;
      }

      const clamped = clamp(newValue, min, max);
      const actualDelta = clamped - current;

      if (actualDelta !== 0) {
        setInternal(targetName, clamped);
        changes.push({
          name: targetName,
          delta: actualDelta,
          total: clamped,
          mode: isDelta ? 'increment' : 'set'
        });
      }
    }

    if (changes.length > 0) {
      const snapshot = allFavor();
      for (const cb of subscribers) {
        try {
          cb(changes, snapshot);
        } catch (_) {}
      }
    }

    return { changes };
  }

  function favorOf(name) {
    return state.has(name) ? state.get(name) : clamp(initial, min, max);
  }

  function allFavor() {
    const out = {};
    for (const [name, value] of state) {
      out[name] = value;
    }
    return out;
  }

  function has(name) {
    return state.has(name);
  }

  function levelOf(name) {
    const value = favorOf(name);
    return computeLevel(value, min, max, thresholds, levelNames);
  }

  function snapshot() {
    const data = {};
    for (const [name, value] of state) {
      data[name] = value;
    }
    return { min, max, initial, thresholds, levelNames, data };
  }

  function restore(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return;
    const { data: favorData = {} } = data;
    if (!favorData || typeof favorData !== 'object' || Array.isArray(favorData)) return;

    for (const [name, value] of Object.entries(favorData)) {
      const num = typeof value === 'number' ? value : extractNumber(String(value));
      if (num !== null && Number.isFinite(num)) {
        setInternal(name, num);
      }
    }
  }

  function reset(name) {
    if (name) {
      state.delete(name);
    } else {
      state.clear();
    }
  }

  function onChange(cb) {
    if (typeof cb !== 'function') return () => {};
    subscribers.add(cb);
    return () => subscribers.delete(cb);
  }

  return {
    applyStatus,
    favorOf,
    allFavor,
    has,
    levelOf,
    snapshot,
    restore,
    reset,
    onChange
  };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { FavorEngine: createFavorEngine, createFavorEngine };
}
if (typeof window !== "undefined") {
  window.createFavorEngine = createFavorEngine;
  window.FavorEngine = createFavorEngine;
}