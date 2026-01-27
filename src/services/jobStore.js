import fs from "fs";
import path from "path";

const JOBS_PATH = path.resolve("data/jobs.json");

function ensureStore() {
  const dir = path.dirname(JOBS_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  // If file doesn't exist OR is empty, initialize it properly
  if (!fs.existsSync(JOBS_PATH) || fs.statSync(JOBS_PATH).size === 0) {
    fs.writeFileSync(JOBS_PATH, JSON.stringify({ jobs: {} }, null, 2), "utf8");
  }
}

function readStoreSafe() {
  ensureStore();
  const raw = fs.readFileSync(JOBS_PATH, "utf8").trim();

  if (!raw) return { jobs: {} };

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !parsed.jobs) return { jobs: {} };
    return parsed;
  } catch {
    // If corrupted, reset safely (MVP)
    fs.writeFileSync(JOBS_PATH, JSON.stringify({ jobs: {} }, null, 2), "utf8");
    return { jobs: {} };
  }
}

function writeStore(store) {
  fs.writeFileSync(JOBS_PATH, JSON.stringify(store, null, 2), "utf8");
}

export function createJob(initial = {}) {
  const store = readStoreSafe();
  const id = cryptoRandomId();

  store.jobs[id] = {
    id,
    status: "queued",
    kind: initial.kind || "preview",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...initial
  };

  writeStore(store);
  return store.jobs[id];
}

export function updateJob(id, patch) {
  const store = readStoreSafe();
  if (!store.jobs[id]) throw new Error("Job not found");

  store.jobs[id] = {
  ...store.jobs[id],
  ...patch,
  final_blueprint:
    patch.final_blueprint !== undefined
      ? patch.final_blueprint
      : store.jobs[id].final_blueprint,
  updatedAt: new Date().toISOString()
};


  writeStore(store);
  return store.jobs[id];
}

export function getJob(id) {
  const store = readStoreSafe();
  return store.jobs[id] || null;
}

function cryptoRandomId() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

