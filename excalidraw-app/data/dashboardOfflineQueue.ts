/**
 * Offline save queue — queues diagram saves to IndexedDB when offline,
 * drains them when connectivity is restored.
 */
import { createStore, set, get, del, keys } from "idb-keyval";
import { saveDiagram } from "./dashboard";

interface QueuedSave {
  id: string;
  elements: readonly any[];
  meta?: { title?: string; project?: string };
  timestamp: number;
}

const queueStore = createStore("dashboard-offline-queue", "pending-saves");

export async function queueSave(
  id: string,
  elements: readonly any[],
  meta?: { title?: string; project?: string },
): Promise<void> {
  const entry: QueuedSave = { id, elements, meta, timestamp: Date.now() };
  // Key by diagram ID — latest save wins for the same diagram
  await set(id, entry, queueStore);
}

export async function drainQueue(): Promise<number> {
  const allKeys = await keys(queueStore);
  let synced = 0;
  for (const key of allKeys) {
    const entry = await get<QueuedSave>(key, queueStore);
    if (!entry) {
      await del(key, queueStore);
      continue;
    }
    try {
      await saveDiagram(entry.id, entry.elements, entry.meta);
      await del(key, queueStore);
      synced++;
    } catch {
      // Leave in queue for next drain attempt
    }
  }
  return synced;
}

export async function getPendingCount(): Promise<number> {
  const allKeys = await keys(queueStore);
  return allKeys.length;
}
