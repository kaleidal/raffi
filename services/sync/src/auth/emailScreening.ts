import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { verifyWithDebounce } from "./debounce";
import { normalizeEmail, screenEmail } from "./emailPolicy";

const SEND_CODE_PATH = "/email-otp/send-verification-otp";
const VERIFIED_CACHE_MS = 60 * 60 * 1000;
const VERIFIED_CACHE_LIMIT = 500;

const MESSAGES = {
  invalid: "That email address can't receive mail. Check it and try again.",
  disposable: "Temporary email addresses can't be used with Raffi. Use your regular email.",
};

// Lets "send a new code" skip a second paid lookup while the isolate is warm.
const verified = new Map<string, number>();

const rememberVerified = (email: string) => {
  if (verified.size >= VERIFIED_CACHE_LIMIT) verified.delete(verified.keys().next().value!);
  verified.set(email, Date.now() + VERIFIED_CACHE_MS);
};

const wasVerified = (email: string) => {
  const expiresAt = verified.get(email);
  if (expiresAt === undefined) return false;
  if (expiresAt > Date.now()) return true;
  verified.delete(email);
  return false;
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
        if (wasVerified(email)) return;
        if (await ctx.context.internalAdapter.findUserByEmail(email)) return;

        const screening = screenEmail(email);
        if (!screening.ok) {
          if (screening.reason === "typo") reject("EMAIL_TYPO", typoMessage(screening.suggestion));
          reject(screening.reason === "disposable" ? "DISPOSABLE_EMAIL" : "INVALID_EMAIL", MESSAGES[screening.reason]);
        }

        if (env.DEBOUNCE_API_KEY) {
          const verdict = await verifyWithDebounce(env.DEBOUNCE_API_KEY, email);
          if (!verdict.ok) {
            if (verdict.suggestion) reject("EMAIL_TYPO", typoMessage(verdict.suggestion));
            reject(verdict.reason === "disposable" ? "DISPOSABLE_EMAIL" : "UNDELIVERABLE_EMAIL", MESSAGES[verdict.reason]);
          }
        }
        rememberVerified(email);
      }),
    }],
  },
}) satisfies BetterAuthPlugin;
