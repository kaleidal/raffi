import { getSyncDatabase } from "./d1Session";
import { HttpError, optionalString } from "./http";
import {
  buildTraktHeaders,
  connectTraktTokens,
  requireTraktCredentials,
  TRAKT_API_BASE_URL,
} from "./trakt";

type DeviceSignInState = "pending" | "slow-down" | "expired" | "denied";

const STATE_BY_STATUS: Record<number, DeviceSignInState> = {
  400: "pending",
  404: "expired",
  409: "expired",
  410: "expired",
  418: "denied",
  429: "slow-down",
};

export const deviceSignInState = (status: number): DeviceSignInState | undefined => STATE_BY_STATUS[status];

const deviceRequest = (path: "code" | "token", clientId: string, body: Record<string, string>) =>
  fetch(`${TRAKT_API_BASE_URL}/oauth/device/${path}`, {
    method: "POST",
    headers: { ...buildTraktHeaders(clientId), "User-Agent": "Raffi Sync" },
    body: JSON.stringify(body),
  });

export const startTraktDeviceSignIn = async (env: Env) => {
  const { clientId } = requireTraktCredentials(env);
  const response = await deviceRequest("code", clientId, { client_id: clientId });
  if (!response.ok) throw new HttpError(502, "Trakt couldn't start sign-in", "trakt_error");
  const code = await response.json() as {
    device_code: string;
    user_code: string;
    verification_url: string;
    expires_in: number;
    interval: number;
  };
  return {
    deviceCode: code.device_code,
    userCode: code.user_code,
    verificationUrl: code.verification_url,
    expiresIn: code.expires_in,
    interval: code.interval,
  };
};

export const pollTraktDeviceSignIn = async (env: Env, userId: string, deviceCode: unknown) => {
  const code = optionalString(deviceCode);
  if (!code) throw new HttpError(400, "Missing Trakt device code", "missing_code");
  const { clientId, clientSecret } = requireTraktCredentials(env);

  const response = await deviceRequest("token", clientId, {
    code,
    client_id: clientId,
    client_secret: clientSecret,
  });
  if (response.ok) {
    const tokens = await response.json() as Record<string, unknown>;
    await connectTraktTokens(getSyncDatabase(env), userId, clientId, tokens);
    return { status: "connected" as const };
  }

  const status = deviceSignInState(response.status);
  if (!status) throw new HttpError(502, `Trakt answered ${response.status}`, "trakt_error");
  return { status };
};
