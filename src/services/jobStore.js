import fs from "fs";
import path from "path";

const JOBS_PATH = path.resolve("data/jobs.json");

function ensureStore() {
  const dir = path.dirname(JOBS_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(JOBS_PATH)) fs.writeFileSync(JOBS_PATH, JSON.stringify({ jobs: {} }, null, 2));
}

export function createJob(initial = {}) {
  ensureStore();
  const store = JSON.parse(fs.readFileSync(JOBS_PATH, "utf8"));
  const id = cryptoRandomId();
  store.jobs[id] = {
    id,
    status: "queued",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...initial
  };
  fs.writeFileSync(JOBS_PATH, JSON.stringify(store, null, 2));
  return store.jobs[id];
}

export function updateJob(id, patch) {
  ensureStore();
  const store = JSON.parse(fs.readFileSync(JOBS_PATH, "utf8"));
  if (!store.jobs[id]) throw new Error("Job not found");
  store.jobs[id] = { ...store.jobs[id], ...patch, updatedAt: new Date().toISOString() };
  fs.writeFileSync(JOBS_PATH, JSON.stringify(store, null, 2));
  return store.jobs[id];
}

export function getJob(id) {
  ensureStore();
  const store = JSON.parse(fs.readFileSync(JOBS_PATH, "utf8"));
  return store.jobs[id] || null;
}

function cryptoRandomId() {
  // no dependency; good enough for MVP
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}
