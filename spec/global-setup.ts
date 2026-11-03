import type { TestProject } from "vitest/node";

declare module "vitest" {
  export interface ProvidedContext {
    baseUrl: string;
  }
}

// The spec checks a RUNNING app over HTTP, so it holds whatever the app is
// built with. CI builds the Dockerfile, starts the image and points APP_URL
// at it, so what passes there is what deploys. Locally, start your app however
// you run it, then `pnpm check`; APP_URL says where it's listening. It waits
// up to a minute, since some stacks take a while to boot or migrate.
export default async function setup(project: TestProject): Promise<void> {
  const baseUrl = process.env.APP_URL ?? "http://localhost:8080";

  for (let attempt = 0; ; attempt++) {
    try {
      await fetch(baseUrl);
      break;
    } catch {
      // not up yet
    }
    if (attempt >= 300) {
      throw new Error(
        `nothing is answering at ${baseUrl}: start your app first, or set APP_URL to where it's listening`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  // The spec registers dozens of accounts and creates posts, so it only runs
  // against an instance that declares itself disposable (BOP_DISPOSABLE_DB=1,
  // never set on Fly or for the local preview database — see src/server.ts).
  const health = await fetch(new URL("/healthz/test-target", baseUrl)).then((r) => r.json()).catch(() => null);
  if (!health?.disposable) {
    throw new Error(
      `refusing to run the spec against ${baseUrl}: it is not a disposable test instance. ` +
        "Start one with `pnpm dev:test` (or BOP_DISPOSABLE_DB=1 and a throwaway DATABASE_PATH) and point APP_URL at it.",
    );
  }

  project.provide("baseUrl", baseUrl);
}
