import { randomUUID } from 'node:crypto';

// ponytail: in-memory publish jobs — single Node process, so a Map is enough. Jobs are lost
// on restart (a publish in flight during a restart is rare; just re-publish).
export interface Job {
  status: 'running' | 'done' | 'error';
  done: number;
  total: number;
  error?: string;
}

const jobs = new Map<string, Job>();

export function createJob(): string {
  const id = randomUUID();
  jobs.set(id, { status: 'running', done: 0, total: 0 });
  return id;
}

export const getJob = (id: string): Job | undefined => jobs.get(id);

export function updateJob(id: string, patch: Partial<Job>): void {
  const job = jobs.get(id);
  if (job) Object.assign(job, patch);
}

/** Mark terminal and free the entry a minute later (client has read the final status by then). */
export function finishJob(id: string, patch: Partial<Job>): void {
  updateJob(id, patch);
  setTimeout(() => jobs.delete(id), 60_000).unref?.();
}
