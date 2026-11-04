// One image decode at a time, process-wide (see src/images.ts for why).
// Kept free of imports so it can be unit-tested without opening a database.
//
// sharp.concurrency only limits threads *within* one image; separate sharp
// calls still decode in parallel on libuv's threadpool. A post's four photos
// went through Promise.all, so four full-size decodes overlapped: measured
// locally, four 4096x4096 WebPs in one request peaked ~440MB above baseline,
// against ~110MB once every decode took this one slot. The worst case is one
// image's cost however many images or requests arrive together; each image
// takes ~50ms, so the queue stays short.
let imageSlot: Promise<unknown> = Promise.resolve();

export function withImageSlot<T>(task: () => Promise<T>): Promise<T> {
  const run = imageSlot.then(task);
  imageSlot = run.catch(() => undefined);
  return run;
}
