const DEBOUNCE_URL = "https://api.debounce.io/v1/";
const TIMEOUT_MS = 10_000;

// https://help.debounce.com/understanding-results/result-codes/
const REJECTED_CODES: Record<string, "invalid" | "disposable"> = {
  "1": "invalid", // syntax
  "2": "invalid", // spam trap
  "3": "disposable",
  "6": "invalid", // mailbox doesn't exist
};

type DebounceResponse = {
  success?: string;
  debounce?: {
    code?: string;
    reason?: string;
    did_you_mean?: string;
    error?: string;
  };
};

export type DebounceVerdict =
  | { ok: true }
  | { ok: false; reason: "invalid" | "disposable"; suggestion: string | null };

/**
 * Asks DeBounce whether an address can receive mail. Anything other than a clear
 * rejection lets the address through, so an outage or empty balance never blocks sign-in.
 */
export const verifyWithDebounce = async (apiKey: string, email: string): Promise<DebounceVerdict> => {
  const url = new URL(DEBOUNCE_URL);
  url.searchParams.set("api", apiKey);
  url.searchParams.set("email", email);

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    const payload = await response.json() as DebounceResponse;
    if (!response.ok || payload.success !== "1") {
      console.warn(JSON.stringify({
        level: "warn",
        message: "DeBounce verification unavailable",
        status: response.status,
        error: payload.debounce?.error,
      }));
      return { ok: true };
    }

    const reason = REJECTED_CODES[payload.debounce?.code ?? ""];
    if (!reason) return { ok: true };
    return { ok: false, reason, suggestion: payload.debounce?.did_you_mean || null };
  } catch (error) {
    console.warn(JSON.stringify({
      level: "warn",
      message: "DeBounce verification failed",
      error: error instanceof Error ? error.message : String(error),
    }));
    return { ok: true };
  }
};
