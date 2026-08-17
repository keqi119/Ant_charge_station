function clone(value) {
  return structuredClone(value);
}

function setAtPath(target, path, value) {
  const parts = String(path).split(".").filter(Boolean);
  if (parts.length === 0) throw new Error("update path cannot be empty");
  let cursor = target;
  for (const part of parts.slice(0, -1)) {
    if (!cursor[part] || typeof cursor[part] !== "object") cursor[part] = {};
    cursor = cursor[part];
  }
  cursor[parts.at(-1)] = value;
}

function friendlyMessage(error) {
  const message = error instanceof Error ? error.message : String(error);
  const translations = [
    [/targetGuns must be a non-negative even integer/i, "目标枪数必须为非负偶数"],
    [/guns must be a non-negative even integer/i, "枪数必须为非负偶数"],
    [/shares must sum to 100%/i, "投放曲线合计必须等于100%"],
    [/residual cannot exceed financed principal/i, "留购款不能超过融资本金"],
    [/candidate capacity cannot satisfy targetGuns/i, "候选城市容量无法满足目标枪数"],
  ];
  return translations.find(([pattern]) => pattern.test(message))?.[1] ?? message;
}

/** Maintains separate draft and last-valid states so invalid edits never erase results. */
export function createAppState(initialState, calculate) {
  if (!initialState || typeof initialState !== "object") throw new TypeError("initialState is required");
  if (typeof calculate !== "function") throw new TypeError("calculate must be a function");

  const baseline = clone(initialState);
  let draft = clone(initialState);
  let validState = clone(initialState);
  let result = calculate(validState);
  let validation = { status: "PASS", errors: [] };
  let activePage = "summary";
  let lastCalculatedAt = new Date().toISOString();
  const listeners = new Set();

  function snapshot() {
    return { draft, validState, result, validation, activePage, lastCalculatedAt };
  }

  function notify() {
    const current = snapshot();
    for (const listener of listeners) listener(current);
    return current;
  }

  function promote(candidate, errorPath) {
    draft = candidate;
    try {
      const nextResult = calculate(candidate);
      validState = clone(candidate);
      result = nextResult;
      validation = { status: "PASS", errors: [] };
      lastCalculatedAt = new Date().toISOString();
    } catch (error) {
      validation = {
        status: "FAIL",
        errors: [{ path: errorPath, message: friendlyMessage(error) }],
      };
    }
    return notify();
  }

  return {
    subscribe(listener) {
      if (typeof listener !== "function") throw new TypeError("listener must be a function");
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    update(path, value) {
      const candidate = clone(draft);
      setAtPath(candidate, path, value);
      return promote(candidate, path);
    },

    replaceHistory(history) {
      const candidate = clone(draft);
      candidate.history = clone(history);
      return promote(candidate, "history");
    },

    replaceState(state) {
      return promote(clone(state), "state");
    },

    restoreBaseline() {
      return promote(clone(baseline), "state");
    },

    setActivePage(pageId) {
      if (typeof pageId !== "string" || pageId.length === 0) throw new TypeError("pageId is required");
      activePage = pageId;
      return notify();
    },

    getSnapshot: snapshot,
  };
}
