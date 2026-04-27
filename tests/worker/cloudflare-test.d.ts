// Augment cloudflare:test with our project's Env shape so SELF.fetch is typed.

import type { Env } from "../../src/types.js";

declare module "cloudflare:test" {
  interface ProvidedEnv extends Env {}
}
