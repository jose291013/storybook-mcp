import sharp from "sharp";

const toPositiveInteger = (value, fallback) => {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export function configureImageMemory() {
  const concurrency = toPositiveInteger(process.env.SHARP_CONCURRENCY, 1);
  const memoryMb = toPositiveInteger(process.env.SHARP_CACHE_MEMORY_MB, 16);
  sharp.concurrency(concurrency);
  sharp.cache({ memory: memoryMb, files: 0, items: 32 });
  return { concurrency, memoryMb };
}

export function memoryUsageMb() {
  const usage = process.memoryUsage();
  const megabytes = (value) => Math.round((Number(value || 0) / 1024 / 1024) * 10) / 10;
  return {
    rss: megabytes(usage.rss),
    heapUsed: megabytes(usage.heapUsed),
    external: megabytes(usage.external),
    arrayBuffers: megabytes(usage.arrayBuffers),
  };
}

export function logMemory(event, context = {}) {
  console.info(`[memory] ${event}`, JSON.stringify({ ...context, ...memoryUsageMb() }));
}
