/**
 * Long-running worker. It sweeps expired holds and due payments, and dispatches alerts.
 *
 * All state is in Postgres, so a restart or a crash loses nothing. Each run re-reads
 * what is due. A browser timer or a sleeping request is not a scheduler, and this is one.
 *
 * Run with:  npm run worker
 */
import { getDeps } from '../server/deps.ts';
import { dispatchDueJobs, sweep } from '../server/services/jobs.ts';

const intervalMs = Number(process.env.BB_WORKER_INTERVAL_MS ?? 5000);
if (!Number.isInteger(intervalMs) || intervalMs < 1000 || intervalMs > 60_000) {
  throw new Error('BB_WORKER_INTERVAL_MS must be a whole number between 1000 and 60000.');
}

const deps = getDeps();
let running = true;

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    console.log(JSON.stringify({ level: 'info', msg: 'worker_stopping', signal }));
    running = false;
  });
}

console.log(JSON.stringify({ level: 'info', msg: 'worker_started', intervalMs }));

while (running) {
  try {
    const swept = await sweep(deps);
    const dispatched = await dispatchDueJobs(deps);
    const changed = Object.values(swept).some((n) => n > 0) || dispatched.claimed > 0;
    if (changed) console.log(JSON.stringify({ level: 'info', msg: 'worker_tick', swept, dispatched }));
  } catch (error) {
    // A failed tick is logged and the loop continues. Nothing is lost, because state is in the database.
    console.error(JSON.stringify({ level: 'error', msg: 'worker_tick_failed', message: error instanceof Error ? error.message : 'unknown' }));
  }
  await new Promise((resolve) => setTimeout(resolve, intervalMs));
}

await deps.db.end();
console.log(JSON.stringify({ level: 'info', msg: 'worker_stopped' }));
