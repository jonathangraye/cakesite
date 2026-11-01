const KEY_PATTERNS = {
  test: /^(sk|rk)_test_/,
  live: /^(sk|rk)_live_/,
} as const;

type Env = Record<string, string | undefined>;

async function readParameter(name: string | undefined, localVar: string, paramVar: string): Promise<string> {
  if (!name) throw new Error(`Set ${localVar} (local) or ${paramVar} (AWS)`);
  // Provided by the Lambda runtime; not bundled.
  const { SSMClient, GetParameterCommand } = await import('@aws-sdk/client-ssm');
  const res = await new SSMClient({}).send(new GetParameterCommand({ Name: name, WithDecryption: true }));
  const value = res.Parameter?.Value;
  if (!value) throw new Error(`SSM parameter ${name} is empty`);
  return value;
}

export function stripeMode(env: Env = process.env): 'test' | 'live' {
  const mode = env.STRIPE_MODE ?? 'test';
  if (mode !== 'test' && mode !== 'live') throw new Error(`STRIPE_MODE must be "test" or "live", got "${mode}"`);
  return mode;
}

/** Refuses to run with a live key unless STRIPE_MODE=live, so test deploys can't take real payments. */
export async function loadStripeKey(env: Env = process.env): Promise<string> {
  const mode = stripeMode(env);
  // A trailing newline from copy-paste or a file makes Stripe fail with a misleading connection error.
  const key = (env.STRIPE_SECRET_KEY || (await readParameter(env.STRIPE_SECRET_PARAM, 'STRIPE_SECRET_KEY', 'STRIPE_SECRET_PARAM'))).trim();
  if (!KEY_PATTERNS[mode].test(key)) throw new Error(`The Stripe key is not a ${mode} key (STRIPE_MODE=${mode})`);
  return key;
}

export async function loadWebhookSecret(env: Env = process.env): Promise<string> {
  const secret = (
    env.STRIPE_WEBHOOK_SECRET || (await readParameter(env.STRIPE_WEBHOOK_SECRET_PARAM, 'STRIPE_WEBHOOK_SECRET', 'STRIPE_WEBHOOK_SECRET_PARAM'))
  ).trim();
  if (!secret.startsWith('whsec_')) throw new Error('The Stripe webhook secret should start with whsec_');
  return secret;
}
