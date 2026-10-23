/**
 * CG Gallery Manager - pure logic module for CG collection tracking
 * Factory function returning an API surface with register/unlock/query/progress/snapshot/restore/event capabilities
 */
function createCgGallery() {
  const registry = new Map(); // id -> {id, title, art, category}
  const registerOrder = []; // array of id in registration order
  const unlocked = new Set(); // set of unlocked ids
  const unlockOrder = []; // array of id in unlock order
  const newUnlockedQueue = []; // queue of newly unlocked ids since last drain
  const subscribers = new Set(); // set of callback functions

  /**
   * Register a new CG entry
   * @param {Object} entry - CG entry object
   * @param {string} entry.id - non-empty string identifier
   * @param {string} entry.art - non-empty string art reference
   * @param {string} [entry.title=''] - title string (empty allowed)
   * @param {string} [entry.category='main'] - optional category, defaults to 'main'
   * @returns {boolean} true on success, false on invalid params or duplicate id
   */
  function register(entry) {
    if (!entry || typeof entry !== 'object') return false;
    const { id, art, title = '', category = 'main' } = entry;
    if (typeof id !== 'string' || id.length === 0) return false;
    if (typeof art !== 'string' || art.length === 0) return false;
    if (typeof title !== 'string') return false;
    if (typeof category !== 'string') return false;
    if (registry.has(id)) return false;

    registry.set(id, { id, title, art, category });
    registerOrder.push(id);
    return true;
  }

  /**
   * Unlock a CG by id
   * @param {string} id - CG identifier
   * @returns {boolean} true on first unlock, false if not registered or already unlocked
   */
  function unlock(id) {
    if (!registry.has(id)) return false;
    if (unlocked.has(id)) return false;

    unlocked.add(id);
    unlockOrder.push(id);
    newUnlockedQueue.push(id);

    const entry = registry.get(id);
    const payload = { id: entry.id, title: entry.title };
    for (const cb of subscribers) {
      try { cb(payload); } catch (_) { /* callback error isolated */ }
    }

    return true;
  }

  /**
   * Check if a CG is unlocked
   * @param {string} id - CG identifier
   * @returns {boolean} true if unlocked
   */
  function isUnlocked(id) {
    return unlocked.has(id);
  }

  /**
   * Get all unlocked ids in unlock order
   * @returns {string[]} copy of unlock order array
   */
  function unlockedIds() {
    return [...unlockOrder];
  }

  /**
   * List CG entries with optional filtering
   * @param {Object} [opts] - filter options
   * @param {string} [opts.category] - filter by category
   * @param {boolean} [opts.unlockedOnly] - only return unlocked entries
   * @returns {Array} array of {id, title, art, category, unlocked}
   */
  function list(opts = {}) {
    const { category, unlockedOnly } = opts;
    const result = [];
    for (const id of registerOrder) {
      const entry = registry.get(id);
      const isEntryUnlocked = unlocked.has(id);
      if (unlockedOnly && !isEntryUnlocked) continue;
      if (category && entry.category !== category) continue;
      result.push({
        id: entry.id,
        title: entry.title,
        art: entry.art,
        category: entry.category,
        unlocked: isEntryUnlocked
      });
    }
    return result;
  }

  /**
   * Get collection progress
   * @returns {{unlocked: number, total: number, ratio: number}}
   */
  function progress() {
    const total = registry.size;
    const unlockedCount = unlocked.size;
    const ratio = total === 0 ? 0 : unlockedCount / total;
    return { unlocked: unlockedCount, total, ratio };
  }

  /**
   * Drain newly unlocked ids since last drain
   * @returns {string[]} array of newly unlocked ids in unlock order, then clears queue
   */
  function drainNew() {
    const drained = [...newUnlockedQueue];
    newUnlockedQueue.length = 0;
    return drained;
  }

  /**
   * Create a snapshot of current unlock state
   * @returns {{unlocked: string[]}} JSON-safe snapshot
   */
  function snapshot() {
    return { unlocked: [...unlockOrder] };
  }

  /**
   * Restore unlock state from snapshot
   * @param {Object} snap - snapshot object with unlocked array
   * @returns {number} count of actually restored ids
   */
  function restore(snap) {
    if (!snap || typeof snap !== 'object' || !Array.isArray(snap.unlocked)) {
      return 0;
    }

    let restored = 0;
    for (const id of snap.unlocked) {
      if (registry.has(id) && !unlocked.has(id)) {
        unlocked.add(id);
        unlockOrder.push(id);
        restored++;
      }
    }
    return restored;
  }

  /**
   * Subscribe to unlock events
   * @param {Function} cb - callback receiving {id, title} on first unlock
   * @returns {Function} unsubscribe function
   */
  function onUnlock(cb) {
    if (typeof cb !== 'function') return () => {};
    subscribers.add(cb);
    return () => subscribers.delete(cb);
  }

  return {
    register,
    unlock,
    isUnlocked,
    unlockedIds,
    list,
    progress,
    drainNew,
    snapshot,
    restore,
    onUnlock
  };
}

// Support both CommonJS and ESM
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { createCgGallery };
}