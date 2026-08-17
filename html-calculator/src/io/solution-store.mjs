import { parseSolution, serializeSolution } from "./solution-file.mjs";

const DATABASE_NAME = "ant-charge-station-calculator";
const STORE_NAME = "solutions";
const CURRENT_KEY = "current";
const DATABASE_VERSION = 1;

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

/** Creates the local-only IndexedDB store used for automatic valid-state saves. */
export function createSolutionStore(indexedDbFactory = globalThis.indexedDB, validationContext) {
  if (!indexedDbFactory || typeof indexedDbFactory.open !== "function") throw new Error("浏览器不支持IndexedDB");
  let databasePromise;

  function database() {
    if (!databasePromise) {
      databasePromise = new Promise((resolve, reject) => {
        const request = indexedDbFactory.open(DATABASE_NAME, DATABASE_VERSION);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error("无法打开本地方案库"));
        request.onblocked = () => reject(new Error("本地方案库被其他页面占用"));
      });
    }
    return databasePromise;
  }

  async function run(mode, action) {
    const db = await database();
    const transaction = db.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    const value = await action(store);
    await new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("本地方案事务失败"));
      transaction.onabort = () => reject(transaction.error ?? new Error("本地方案事务已取消"));
    });
    return value;
  }

  return {
    async save(state, options = {}) {
      const text = serializeSolution(state, { name: "自动保存", ...options });
      await run("readwrite", (store) => requestResult(store.put(text, CURRENT_KEY)));
    },

    async load() {
      const text = await run("readonly", (store) => requestResult(store.get(CURRENT_KEY)));
      if (text === undefined) return null;
      const envelope = parseSolution(text, validationContext);
      return { modelVersion: envelope.modelVersion, ...envelope.state };
    },

    async clear() {
      await run("readwrite", (store) => requestResult(store.delete(CURRENT_KEY)));
    },

    async close() {
      if (!databasePromise) return;
      const db = await databasePromise;
      db.close();
      databasePromise = undefined;
    },
  };
}
