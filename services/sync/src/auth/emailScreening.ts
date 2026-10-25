import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { checkWithDebounce } from "./debounceGate";
import { normalizeEmail, screenEmail } from "./emailPolicy";

const SEND_CODE_PATH = "/email-otp/send-verification-otp";

const MESSAGES = {
  invalid: "That email address can't receive mail. Check it and try again.",
  disposable: "Temporary email addresses can't be used with Raffi. Use your regular email.",
};

function reject(code: string, message: string): never {
  throw APIError.fromStatus("BAD_REQUEST", { code, message });
}

const typoMessage = (suggestion: string) => `Did you mean ${suggestion}? Check the address and try again.`;

/**
 * Screens addresses before a sign-in code goes out to one that doesn't have an account
 * yet: malformed, disposable and mistyped addresses are refused locally, and whatever
 * passes is checked with DeBounce when DEBOUNCE_API_KEY is set. Existing accounts are
 * never screened, so tightening the rules can't lock anyone out.
 */
export const emailScreening = (env: Env) => ({
  id: "email-screening",
  hooks: {
    before: [{
      matcher: (context) => context.path === SEND_CODE_PATH,
      handler: createAuthMiddleware(async (ctx) => {
        const rawEmail = (ctx.body as { email?: unknown } | undefined)?.email;
        if (typeof rawEmail !== "string") return;

        const email = normalizeEmail(rawEmail);
        if (await ctx.context.internalAdapter.findUserByEmail(email)) return;

        const screening = screenEmail(email);
        if (!screening.ok) {
          if (screening.reason === "typo") reject("EMAIL_TYPO", typoMessage(screening.suggestion));
          reject(screening.reason === "disposable" ? "DISPOSABLE_EMAIL" : "INVALID_EMAIL", MESSAGES[screening.reason]);
        }

        if (!env.DEBOUNCE_API_KEY) return;
        const verdict = await checkWithDebounce({
          db: env.DB,
          apiKey: env.DEBOUNCE_API_KEY,
          dailyLimit: env.DEBOUNCE_DAILY_LIMIT,
        }, email);
        if (verdict.ok) return;
        if (verdict.suggestion) reject("EMAIL_TYPO", typoMessage(verdict.suggestion));
        reject(verdict.reason === "disposable" ? "DISPOSABLE_EMAIL" : "UNDELIVERABLE_EMAIL", MESSAGES[verdict.reason]);
      }),
    }],
  },
}) satisfies BetterAuthPlugin;
