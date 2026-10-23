function createActionManager(config = {}) {
  const maxOptions = (typeof config.maxOptions === 'number' && config.maxOptions > 0)
    ? Math.floor(config.maxOptions)
    : 4;

  let round = 0;
  let status = 'idle';
  let options = [];
  let lastSettled = null;

  const changeSubs = new Set();
  const pickSubs = new Set();

  function emitChange() {
    const snap = state();
    for (const cb of changeSubs) {
      try { cb(snap); } catch (_) {}
    }
  }

  function emitPick(payload) {
    for (const cb of pickSubs) {
      try { cb(payload); } catch (_) {}
    }
  }

  function normalizeInput(list) {
    if (!Array.isArray(list)) return [];
    const seen = new Set();
    const result = [];
    const pairs = [["'", "'"], ['"', '"'], ['「', '」'], ['『', '』'], ['《', '》']];
    for (let item of list) {
      if (typeof item === 'number') {
        item = String(item);
      } else if (typeof item !== 'string') {
        continue;
      }
      let text = item.trim();
      if (text.length >= 2) {
        for (const [open, close] of pairs) {
          if (text.startsWith(open) && text.endsWith(close)) {
            text = text.slice(open.length, text.length - close.length);
            break;
          }
        }
      }
      if (!text) continue;
      if (seen.has(text)) continue;
      seen.add(text);
      result.push(text);
      if (result.length >= maxOptions) break;
    }
    return result;
  }

  function settleCurrent(outcomeStatus, pickedPayload = null) {
    if (status === 'pending' && options.length > 0) {
      lastSettled = {
        round,
        status: outcomeStatus,
        picked: pickedPayload,
        options: options.map(o => o.text)
      };
    }
  }

  function present(list) {
    if (!Array.isArray(list)) return state();
    const normalized = normalizeInput(list);

    if (normalized.length === 0) {
      if (status === 'pending') {
        settleCurrent('replaced');
      }
      if (status !== 'idle') {
        status = 'idle';
        options = [];
        emitChange();
      }
      return state();
    }

    if (status === 'pending') {
      settleCurrent('replaced');
    }

    round += 1;
    options = normalized.map((text, index) => ({ id: index, text, index }));
    status = 'pending';
    emitChange();
    return state();
  }

  function getOptions() {
    if (status === 'picked' || status === 'dismissed') {
      return [];
    }
    return options.map(o => ({ id: o.id, text: o.text, index: o.index }));
  }

  function state() {
    return {
      round,
      status,
      options: getOptions()
    };
  }

  function pick(idOrIndex) {
    if (status !== 'pending') return null;
    let idx = -1;
    if (typeof idOrIndex === 'number') {
      idx = idOrIndex;
    } else if (typeof idOrIndex === 'string' && /^\d+$/.test(idOrIndex.trim())) {
      idx = parseInt(idOrIndex.trim(), 10);
    } else {
      idx = options.findIndex(o => o.id === idOrIndex);
    }
    if (idx < 0 || idx >= options.length) return null;
    const chosen = options[idx];
    const payload = { id: chosen.id, text: chosen.text, index: chosen.index, round };
    lastSettled = { round, status: 'picked', picked: payload, options: options.map(o => o.text) };
    status = 'picked';
    emitChange();
    emitPick(payload);
    return payload;
  }

  function dismiss() {
    if (status !== 'pending') return false;
    lastSettled = { round, status: 'dismissed', picked: null, options: options.map(o => o.text) };
    status = 'dismissed';
    emitChange();
    return true;
  }

  function lastOutcome() {
    return lastSettled;
  }

  function onChange(cb) {
    if (typeof cb !== 'function') return () => {};
    changeSubs.add(cb);
    return () => changeSubs.delete(cb);
  }

  function onPick(cb) {
    if (typeof cb !== 'function') return () => {};
    pickSubs.add(cb);
    return () => pickSubs.delete(cb);
  }

  return {
    present,
    getOptions,
    state,
    pick,
    dismiss,
    lastOutcome,
    onChange,
    onPick
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { createActionManager };
}