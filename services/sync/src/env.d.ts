// Secrets and optional settings aren't in wrangler.jsonc, so `wrangler types` can't see them.
interface Env {
  DEBOUNCE_API_KEY?: string;
  DEBOUNCE_DAILY_LIMIT?: string;
}
