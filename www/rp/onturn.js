function createTurnOrchestrator() {
  const steps = [];
  const stepByName = new Map();
  const stepListeners = [];
  const settledListeners = [];
  let running = false;
  let roundCounter = 0;

  function register(name, fn, opts = {}) {
    if (typeof name !== 'string' || name.length === 0) {
      return false;
    }
    if (typeof fn !== 'function') {
      return false;
    }
    if (stepByName.has(name)) {
      return false;
    }
    const enabled = opts.enabled !== false;
    const step = { name, fn, enabled };
    steps.push(step);
    stepByName.set(name, step);
    return true;
  }

  function unregister(name) {
    const step = stepByName.get(name);
    if (!step) {
      return false;
    }
    const idx = steps.indexOf(step);
    if (idx >= 0) {
      steps.splice(idx, 1);
    }
    stepByName.delete(name);
    return true;
  }

  function setEnabled(name, enabled) {
    const step = stepByName.get(name);
    if (!step) {
      return false;
    }
    step.enabled = Boolean(enabled);
    return true;
  }

  function has(name) {
    return stepByName.has(name);
  }

  function names() {
    return steps.map(s => s.name);
  }

  function isRunning() {
    return running;
  }

  function onStep(cb) {
    if (typeof cb !== 'function') {
      return () => {};
    }
    stepListeners.push(cb);
    return () => {
      const idx = stepListeners.indexOf(cb);
      if (idx >= 0) {
        stepListeners.splice(idx, 1);
      }
    };
  }

  function onSettled(cb) {
    if (typeof cb !== 'function') {
      return () => {};
    }
    settledListeners.push(cb);
    return () => {
      const idx = settledListeners.indexOf(cb);
      if (idx >= 0) {
        settledListeners.splice(idx, 1);
      }
    };
  }

  function emitStepEvent(event) {
    for (const cb of stepListeners) {
      try {
        cb(event);
      } catch (_) {
      }
    }
  }

  function emitSettledEvent(report) {
    for (const cb of settledListeners) {
      try {
        cb(report);
      } catch (_) {
      }
    }
  }

  async function settle(context = null) {
    if (running) {
      return null;
    }
    running = true;
    try {
      const ctx = context || {};
      if (ctx.round === undefined) {
        roundCounter += 1;
        ctx.round = roundCounter;
      }
      if (!ctx.outcomes) {
        ctx.outcomes = {};
      }

      const results = [];
      let okCount = 0;
      let failCount = 0;
      let skippedCount = 0;

      for (const step of steps) {
        if (!step.enabled) {
          results.push({ name: step.name, skipped: true });
          skippedCount += 1;
          continue;
        }

        let value;
        let error;
        let ok = false;
        try {
          value = await step.fn(ctx);
          ok = true;
          okCount += 1;
        } catch (e) {
          error = e && e.message ? String(e.message) : String(e);
          ok = false;
          failCount += 1;
        }

        const result = { name: step.name, ok };
        if (ok) {
          result.value = value;
        } else {
          result.error = error;
        }
        ctx.outcomes[step.name] = ok ? value : undefined;
        results.push(result);
        emitStepEvent({ name: step.name, ok, round: ctx.round, ...(ok ? { value } : { error }) });
      }

      const report = {
        round: ctx.round,
        total: steps.length,
        okCount,
        failCount,
        skippedCount,
        results
      };
      emitSettledEvent(report);
      return report;
    } finally {
      running = false;
    }
  }

  return {
    register,
    unregister,
    setEnabled,
    has,
    names,
    settle,
    isRunning,
    onStep,
    onSettled
  };
}

module.exports = { createTurnOrchestrator };