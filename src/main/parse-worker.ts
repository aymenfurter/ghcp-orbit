/* Worker thread for log parsing — keeps main thread responsive */
import { parentPort, workerData } from 'worker_threads';
import { parseAllLogs } from './parser';

const dirs: string[] = workerData.dirs;
const result = parseAllLogs(dirs, (done, total, sessions, label) => {
  parentPort!.postMessage({ type: 'progress', done, total, sessions, label });
});

// Serialize Maps to plain objects for structured clone transfer
const editLocPlain: Record<string, Record<string, number>> = {};
for (const [reqId, fileMap] of result.editLocIndex) {
  editLocPlain[reqId] = Object.fromEntries(fileMap);
}

parentPort!.postMessage({
  type: 'done',
  sessions: result.sessions,
  editLocPlain,
});
