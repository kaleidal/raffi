export type SyncD1Database = D1Database | D1DatabaseSession;

export const getSyncDatabase = (env: Env): SyncD1Database => {
  return env.DB.withSession("first-unconstrained");
};
