/* RP_SYSTEM：系统通知中心。
 * 统一收集来自各处的系统级消息（解锁、好感、存档、判定等），
 * 支持相同通知合并计数、优先级排序、批量取走。
 * 纯逻辑，无 DOM/浏览器依赖，可在 Node 直接 require。
 */
function createNotificationCenter() {
  "use strict";

  let nextId = 1;
  const queue = [];
  const subscribers = new Set();

  const VALID_CHANNELS = new Set(["inline", "toast", "modal"]);

  function normalizeChannel(ch) {
    return VALID_CHANNELS.has(ch) ? ch : "inline";
  }

  function notifySubscribers(notification) {
    for (const cb of subscribers) {
      try {
        cb(notification);
      } catch (_) {
        // 回调抛错不影响模块状态
      }
    }
  }

  function findDuplicate(kind, text, channel) {
    for (const item of queue) {
      if (item.kind === kind && item.text === text && item.channel === channel) {
        return item;
      }
    }
    return null;
  }

  function post(input) {
    if (!input || typeof input !== "object") return null;
    const rawText = input.text;
    if (typeof rawText !== "string") return null;
    if (!rawText.trim()) return null;
    const text = rawText;

    const kind = typeof input.kind === "string" && input.kind.trim() ? input.kind.trim() : "info";
    const priority = typeof input.priority === "number" && isFinite(input.priority) ? input.priority : 0;
    const channel = normalizeChannel(input.channel);

    const existing = findDuplicate(kind, text, channel);
    if (existing) {
      existing.count += 1;
      if (priority > existing.priority) {
        existing.priority = priority;
      }
      notifySubscribers({ ...existing });
      return { ...existing };
    }

    const notification = {
      id: nextId++,
      kind,
      text,
      priority,
      channel,
      count: 1
    };
    queue.push(notification);
    notifySubscribers({ ...notification });
    return { ...notification };
  }

  function sortQueue(arr) {
    return [...arr].sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return a.id - b.id;
    });
  }

  function pending() {
    return sortQueue(queue).map(n => ({ ...n }));
  }

  function peek() {
    return pending();
  }

  function drain() {
    const result = pending();
    queue.length = 0;
    return result;
  }

  function count() {
    return queue.length;
  }

  function clear() {
    const cleared = queue.length;
    queue.length = 0;
    return cleared;
  }

  function onPost(cb) {
    if (typeof cb !== "function") return () => {};
    subscribers.add(cb);
    return function unsubscribe() {
      subscribers.delete(cb);
    };
  }

  return {
    post,
    pending,
    peek,
    drain,
    count,
    clear,
    onPost
  };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { createNotificationCenter };
}