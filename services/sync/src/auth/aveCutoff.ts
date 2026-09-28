export const acceptsAveTokens = (env: Env) => Date.now() < Date.parse(env.AVE_ACCEPTED_UNTIL);
