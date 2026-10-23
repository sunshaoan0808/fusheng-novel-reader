/**
 * Diary log manager — pure logic module for entry storage and retrieval.
 * No DOM or browser dependencies; works in Node via require.
 */

function createDiary() {
  const entries = [];
  let nextId = 1;

  function add(input) {
    if (!input || typeof input.body !== 'string') {
      return null;
    }
    const trimmedBody = input.body.trim();
    if (!trimmedBody) {
      return null;
    }

    const title = typeof input.title === 'string' ? input.title : '';
    const category = typeof input.category === 'string' ? input.category : 'misc';
    const round = typeof input.round === 'number' && Number.isFinite(input.round) ? input.round : null;
    const tags = Array.isArray(input.tags)
      ? input.tags.filter(t => typeof t === 'string')
      : [];

    const entry = {
      id: nextId++,
      title,
      body: input.body,
      category,
      round,
      tags
    };

    entries.push(entry);
    return { ...entry };
  }

  function get(id) {
    const idx = entries.findIndex(e => e.id === id);
    if (idx === -1) return null;
    return { ...entries[idx] };
  }

  function count() {
    return entries.length;
  }

  function list(opts = {}) {
    const { category, offset = 0, limit } = opts;
    let result = [...entries].reverse();

    if (typeof category === 'string') {
      result = result.filter(e => e.category === category);
    }

    if (offset > 0) {
      result = result.slice(offset);
    }

    if (typeof limit === 'number' && limit > 0) {
      result = result.slice(0, limit);
    }

    return result.map(e => ({ ...e }));
  }

  function search(keyword) {
    if (typeof keyword !== 'string') return [];
    const kw = keyword.trim().toLowerCase();
    if (!kw) return [];

    return [...entries]
      .reverse()
      .filter(e =>
        e.title.toLowerCase().includes(kw) ||
        e.body.toLowerCase().includes(kw)
      )
      .map(e => ({ ...e }));
  }

  function remove(id) {
    const idx = entries.findIndex(e => e.id === id);
    if (idx === -1) return false;
    entries.splice(idx, 1);
    return true;
  }

  function categories() {
    const seen = new Set();
    const result = [];
    for (const e of entries) {
      if (!seen.has(e.category)) {
        seen.add(e.category);
        result.push(e.category);
      }
    }
    return result;
  }

  function snapshot() {
    return {
      entries: entries.map(e => ({ ...e })),
      nextId
    };
  }

  function restore(snap) {
    if (!snap || typeof snap !== 'object' || !Array.isArray(snap.entries)) {
      return false;
    }

    entries.length = 0;
    for (const e of snap.entries) {
      if (!e || typeof e !== 'object') continue;
      if (typeof e.id !== 'number' || typeof e.body !== 'string') continue;
      entries.push({
        id: e.id,
        title: typeof e.title === 'string' ? e.title : '',
        body: e.body,
        category: typeof e.category === 'string' ? e.category : 'misc',
        round: typeof e.round === 'number' && Number.isFinite(e.round) ? e.round : null,
        tags: Array.isArray(e.tags) ? e.tags.filter(t => typeof t === 'string') : []
      });
    }

    const declared = typeof snap.nextId === 'number' && Number.isFinite(snap.nextId) ? snap.nextId : 1;
    let maxId = 0;
    for (const e of entries) {
      if (e.id > maxId) maxId = e.id;
    }
    nextId = Math.max(declared, maxId + 1);
    return true;
  }

  return {
    add,
    get,
    count,
    list,
    search,
    remove,
    categories,
    snapshot,
    restore
  };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { createDiary };
}