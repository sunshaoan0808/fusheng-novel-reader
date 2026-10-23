/**
 * ArtStage — pure logic character portrait stage manager.
 * No browser/DOM dependencies; works in Node via require.
 */

function createArtStage() {
  "use strict";

  const characters = new Map();
  const stage = new Map();
  const stageOrder = [];
  const listeners = new Set();

  function emitChange(payload) {
    for (const cb of listeners) {
      try {
        cb(payload);
      } catch (_) {
        // swallow listener errors
      }
    }
  }

  function getFirstExpressionKey(def) {
    const keys = Object.keys(def.expressions);
    return keys.length > 0 ? keys[0] : null;
  }

  function validateDef(def) {
    return def &&
           typeof def.expressions === "object" &&
           def.expressions !== null &&
           Object.keys(def.expressions).length > 0 &&
           Object.values(def.expressions).every(v => typeof v === "string" && v.length > 0);
  }

  function defineCharacter(id, def) {
    if (typeof id !== "string" || id.length === 0) return false;
    if (!validateDef(def)) return false;

    const expressions = { ...def.expressions };
    let defaultExpression = def.defaultExpression;
    if (typeof defaultExpression !== "string" || !Object.prototype.hasOwnProperty.call(expressions, defaultExpression)) {
      defaultExpression = getFirstExpressionKey(def);
    }

    characters.set(id, { expressions, defaultExpression });
    return true;
  }

  function resolve(id, expression) {
    const def = characters.get(id);
    if (!def) return null;

    if (expression && Object.prototype.hasOwnProperty.call(def.expressions, expression)) {
      return def.expressions[expression];
    }
    return def.expressions[def.defaultExpression];
  }

  function resolveExpressionName(id, expression) {
    const def = characters.get(id);
    if (!def) return null;

    if (expression && Object.prototype.hasOwnProperty.call(def.expressions, expression)) {
      return expression;
    }
    return def.defaultExpression;
  }

  function show(id, expression) {
    const def = characters.get(id);
    if (!def) return false;

    const usedExpression = resolveExpressionName(id, expression);
    const art = def.expressions[usedExpression];

    const wasOnStage = stage.has(id);
    const oldArt = wasOnStage ? stage.get(id).art : null;

    if (!wasOnStage) {
      stageOrder.push(id);
    }
    stage.set(id, { expression: usedExpression, art });

    if (!wasOnStage || oldArt !== art) {
      emitChange({ id, expression: usedExpression, art });
    }
    return art;
  }

  function hide(id) {
    const had = stage.has(id);
    if (had) {
      stage.delete(id);
      const idx = stageOrder.indexOf(id);
      if (idx >= 0) stageOrder.splice(idx, 1);
      emitChange({ id, removed: true });
    }
    return had;
  }

  function clearStage() {
    for (const id of stageOrder) {
      emitChange({ id, removed: true });
    }
    stage.clear();
    stageOrder.length = 0;
  }

  function applyCues(cues) {
    if (!Array.isArray(cues)) return [];

    const changed = [];
    for (const cue of cues) {
      const speaker = cue && cue.speaker;
      const expression = cue && cue.expression;
      if (!speaker || !characters.has(speaker)) continue;

      const def = characters.get(speaker);
      const usedExpression = resolveExpressionName(speaker, expression);
      const art = def.expressions[usedExpression];

      const wasOnStage = stage.has(speaker);
      const oldArt = wasOnStage ? stage.get(speaker).art : null;

      if (!wasOnStage) {
        stageOrder.push(speaker);
      }
      stage.set(speaker, { expression: usedExpression, art });

      if (!wasOnStage || oldArt !== art) {
        changed.push(speaker);
        emitChange({ id: speaker, expression: usedExpression, art });
      }
    }
    return changed;
  }

  function stageSnapshot() {
    const result = [];
    for (const id of stageOrder) {
      const entry = stage.get(id);
      if (entry) {
        result.push({ id, expression: entry.expression, art: entry.art });
      }
    }
    return result;
  }

  function current(id) {
    const entry = stage.get(id);
    if (!entry) return null;
    return { expression: entry.expression, art: entry.art };
  }

  function onChange(cb) {
    if (typeof cb !== "function") return () => {};
    listeners.add(cb);
    return function unsubscribe() {
      listeners.delete(cb);
    };
  }

  return {
    defineCharacter,
    resolve,
    show,
    hide,
    clearStage,
    applyCues,
    stage: stageSnapshot,
    current,
    onChange
  };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { createArtStage };
}