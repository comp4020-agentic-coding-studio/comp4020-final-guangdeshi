// Shared guard for every browser script that creates accounts or posts:
// refuse to run unless APP_URL points at an instance that reports itself
// disposable via /healthz/test-target (BOP_DISPOSABLE_DB=1; never true on Fly or for the
// local preview database — see src/server.ts). Prevents a repeat of the time
// a test run aimed at the preview server's port filled it with test users.
export async function requireDisposableTarget(baseUrl) {
  if (!baseUrl) {
    console.error("Refusing to run: set APP_URL to a disposable test server, e.g. `pnpm dev:test` on its own port.");
    process.exit(2);
  }
  let health = null;
  try {
    health = await fetch(new URL("/healthz/test-target", baseUrl)).then((r) => r.json());
  } catch {
    // unreachable or not JSON
  }
  if (!health?.disposable) {
    console.error(`Refusing to run against ${baseUrl}: it does not report itself as a disposable test instance (BOP_DISPOSABLE_DB=1).`);
    process.exit(2);
  }
}
