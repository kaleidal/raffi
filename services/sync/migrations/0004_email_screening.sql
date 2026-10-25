-- Addresses DeBounce accepted, so repeat sign-in codes don't pay for another lookup.
CREATE TABLE "debounce_verified" (
  "email" TEXT NOT NULL PRIMARY KEY,
  "checkedAt" INTEGER NOT NULL
);

-- Lookups per UTC day, capped by DEBOUNCE_DAILY_LIMIT.
CREATE TABLE "debounce_usage" (
  "day" TEXT NOT NULL PRIMARY KEY,
  "lookups" INTEGER NOT NULL
);
