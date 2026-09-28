import { betterAuth } from "better-auth";
import { bearer, emailOTP, jwt } from "better-auth/plugins";
import { aveHandoff } from "./legacyAve";
import { OTP_LIFETIME_SECONDS, sendSignInCode } from "./otpEmail";

const DAY_SECONDS = 24 * 60 * 60;

const createAuth = (env: Env) => betterAuth({
  appName: "Raffi",
  baseURL: env.BETTER_AUTH_URL,
  basePath: "/auth",
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: env.TRUSTED_ORIGINS.split(","),
  database: env.DB,
  telemetry: { enabled: false },
  session: {
    expiresIn: 90 * DAY_SECONDS,
    updateAge: DAY_SECONDS,
  },
  rateLimit: {
    enabled: true,
    storage: "database",
  },
  advanced: {
    database: { generateId: "uuid" },
    ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] },
  },
  plugins: [
    emailOTP({
      otpLength: 6,
      expiresIn: OTP_LIFETIME_SECONDS,
      allowedAttempts: 5,
      storeOTP: "hashed",
      sendVerificationOTP: ({ email, otp }) => sendSignInCode(env, email, otp),
    }),
    bearer(),
    jwt({
      jwt: {
        issuer: env.BETTER_AUTH_URL,
        audience: env.BETTER_AUTH_URL,
        expirationTime: "15m",
        definePayload: () => ({}),
      },
    }),
    aveHandoff(env),
  ],
});

export type Auth = ReturnType<typeof createAuth>;

let instance: { env: Env; auth: Auth } | null = null;

export const getAuth = (env: Env): Auth => {
  if (instance?.env !== env) instance = { env, auth: createAuth(env) };
  return instance.auth;
};
