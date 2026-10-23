/**
 * ZoneStore — per-round streaming partition storage for chat page.
 * No browser/DOM dependencies; works in Node via require.
 */

const KIND_PARSERS = {
  data: parseDataKind,
  text: parseTextKind,
  rows: parseRowsKind,
  list: parseListKind
};

const STRIP_WRAPPERS = [
  /^'(.*)'$/,
  /^"(.*)"$/,
  /^「(.*)」$/,
  /^『(.*)』$/,
  /^《(.*)》$/
];

function stripWrappers(str) {
  for (const re of STRIP_WRAPPERS) {
    const m = str.match(re);
    if (m) return m[1];
  }
  return str;
}

function parseDataKind(raw) {
  const obj = {};
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const idxA = trimmed.indexOf(':');
    const idxB = trimmed.indexOf('：');
    const idx = idxA === -1 ? idxB : (idxB === -1 ? idxA : Math.min(idxA, idxB));
    if (idx > 0) {
      const key = stripWrappers(trimmed.slice(0, idx).trim());
      const val = stripWrappers(trimmed.slice(idx + 1).trim());
      obj[key] = val;
    }
  }
  return obj;
}

function parseTextKind(raw) {
  return stripWrappers(raw.trim());
}

function parseRowsKind(raw) {
  const out = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const cleaned = trimmed.replace(/^(?:[-*•]\s+|\d+\s*[.\)、]\s+)/, '');
    out.push(stripWrappers(cleaned));
  }
  return out;
}

function parseListKind(raw) {
  const out = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    out.push(stripWrappers(trimmed));
  }
  return out;
}

function getParser(kind) {
  return KIND_PARSERS[kind] || KIND_PARSERS.text;
}

class ZoneStore {
  constructor() {
    this.declarations = new Map();
    this.committed = new Map();
    this.roundBuffer = new Map();
    this.pendingTails = new Map();
    this.subscribers = new Map();
    this.roundDone = new Set();
    this.roundNumber = 0;
  }

  declare(zone, { kind = 'text', hold, complete } = {}) {
    if (hold === undefined) hold = kind === 'data';
    if (complete === undefined) complete = kind === 'data';
    if (this.declarations.has(zone)) {
      const existing = this.declarations.get(zone);
      existing.kind = kind;
      existing.hold = hold;
      existing.complete = complete;
    } else {
      this.declarations.set(zone, { kind, hold, complete });
    }
    if (!this.roundBuffer.has(zone)) {
      this.roundBuffer.set(zone, '');
    }
    if (!this.pendingTails.has(zone)) {
      this.pendingTails.set(zone, '');
    }
  }

  begin() {
    this.roundNumber++;
    this.roundDone.clear();
    for (const zone of this.declarations.keys()) {
      this.roundBuffer.set(zone, '');
      this.pendingTails.set(zone, '');
    }
  }

  feed(zone, chunk) {
    const decl = this.declarations.get(zone);
    if (!decl) return;

    let buffer = this.roundBuffer.get(zone) || '';
    const tail = this.pendingTails.get(zone) || '';
    buffer = tail + chunk;
    this.pendingTails.set(zone, '');

    const closeTag = `</${zone}>`;
    let idx;
    while ((idx = buffer.indexOf(closeTag)) !== -1) {
      const completePart = buffer.slice(0, idx);
      buffer = buffer.slice(idx + closeTag.length);
      this.roundBuffer.set(zone, completePart);
      this._commitZone(zone);
      if (!this.declarations.has(zone)) break;
    }

    this.roundBuffer.set(zone, buffer);
    this.pendingTails.set(zone, buffer);
  }

  _contentOf(zone) {
    let raw = this.roundBuffer.get(zone) || '';
    const openTag = '<' + zone + '>';
    const lead = raw.trimStart();
    if (lead.startsWith(openTag)) {
      raw = lead.slice(openTag.length);
    }
    return raw;
  }

  _commitZone(zone) {
    const decl = this.declarations.get(zone);
    if (!decl) return;

    const raw = this._contentOf(zone);
    const parser = getParser(decl.kind);
    const value = parser(raw);

    this.committed.set(zone, value);
    this.roundDone.add(zone);

    const subs = this.subscribers.get(zone);
    if (subs) {
      for (const cb of subs) {
        try { cb(value, zone); } catch (_) {}
      }
    }

    this.roundBuffer.set(zone, '');
    this.pendingTails.set(zone, '');
  }

  get(zone, { hold, complete } = {}) {
    const decl = this.declarations.get(zone);
    if (!decl) return undefined;

    const effectiveHold = hold ?? decl.hold;
    const effectiveComplete = complete ?? decl.complete;

    if (effectiveComplete) {
      if (this.committed.has(zone)) {
        return this.committed.get(zone);
      }
      return undefined;
    }

    const roundVal = this._contentOf(zone);
    if (roundVal !== '') {
      let rawForParse = roundVal;
      if ((decl.kind === 'rows' || decl.kind === 'list') && !rawForParse.endsWith('\n')) {
        const cut = rawForParse.lastIndexOf('\n');
        rawForParse = cut === -1 ? '' : rawForParse.slice(0, cut + 1);
      }
      const parser = getParser(decl.kind);
      return parser(rawForParse);
    }

    if (this.roundDone.has(zone) && this.committed.has(zone)) {
      return this.committed.get(zone);
    }

    if (effectiveHold && this.committed.has(zone)) {
      return this.committed.get(zone);
    }

    return undefined;
  }

  onZoneComplete(zone, cb) {
    if (!this.subscribers.has(zone)) {
      this.subscribers.set(zone, new Set());
    }
    this.subscribers.get(zone).add(cb);
    return () => {
      const subs = this.subscribers.get(zone);
      if (subs) subs.delete(cb);
    };
  }
}

function createZoneStore() {
  return new ZoneStore();
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { ZoneStore, createZoneStore };
}
if (typeof window !== "undefined") {
  window.ZoneStore = ZoneStore;
  window.createZoneStore = createZoneStore;
}