/*
  A data table of known API key formats. To support a new provider, add one row here.
  Each row: provider, ruleId, regex (must use the "g" and "d" flags), and the official source.
  Every regex may only START where a token starts (a lookbehind), which keeps it fast on long
  runs of letters. PUBLIC keys are deliberately NOT listed (see PUBLIC_KEY_PREFIXES below).
  Formats checked against the sources on 2026-11-19.
*/

/** One known API key format. */
export interface ApiKeyPattern {
  provider: string;
  ruleId: string;
  regex: RegExp;
  /** Where the format comes from (official docs wherever the provider publishes one). */
  sourceUrl: string;
  /**
   * If set, the key only counts when this context appears in the 60 characters before it
   * (for formats that are too generic on their own, like "40 random characters").
   */
  context?: RegExp;
}

/** GitHub's official list of providers it scans for; used to confirm providers without a spec. */
const GITHUB_SCANNING_LIST =
  'https://docs.github.com/en/code-security/secret-scanning/introduction/supported-secret-scanning-patterns';

export const API_KEY_PATTERNS: readonly ApiKeyPattern[] = [
  {
    provider: 'OpenAI',
    ruleId: 'api_key.openai',
    // "sk-proj-", "sk-svcacct-" or "sk-admin-", then 20–300 letters, digits, "_" or "-".
    // OpenAI publishes no formal format; its API reference shows "sk-admin-…" keys and GitHub
    // secret scanning lists OpenAI keys.
    regex: /(?<![\w-])sk-(?:proj|svcacct|admin)-[\w-]{20,300}(?![\w-])/dg,
    sourceUrl:
      'https://developers.openai.com/api/reference/resources/organization/subresources/admin_api_keys',
  },
  {
    provider: 'OpenAI',
    ruleId: 'api_key.openai_legacy',
    // Legacy "sk-" keys: 20 letters/digits, the marker "T3BlbkFJ" ("OpenAI" in base64), then
    // 20 more. Requiring the marker avoids flagging any word that happens to start with "sk-".
    regex: /(?<![\w-])sk-[\dA-Za-z]{20}T3BlbkFJ[\dA-Za-z]{20}(?![\w-])/dg,
    sourceUrl: GITHUB_SCANNING_LIST,
  },
  {
    provider: 'Anthropic',
    ruleId: 'api_key.anthropic',
    // "sk-ant-" (docs examples show "sk-ant-api03-…"), then 20–300 letters, digits, "_" or "-".
    regex: /(?<![\w-])sk-ant-[\w-]{20,300}(?![\w-])/dg,
    sourceUrl: 'https://platform.claude.com/docs/en/get-api-key',
  },
  {
    provider: 'Stripe',
    ruleId: 'api_key.stripe',
    // Secret "sk_live_"/"sk_test_", restricted "rk_live_"/"rk_test_", or organization "sk_org_",
    // then 10–250 letters, digits or "_". (Publishable "pk_" keys are public: not listed.)
    regex: /(?<!\w)(?:[rs]k_(?:live|test)|sk_org)_\w{10,250}(?!\w)/dg,
    sourceUrl: 'https://docs.stripe.com/keys',
  },
  {
    provider: 'GitHub',
    ruleId: 'api_key.github',
    // "ghp_" (personal), "gho_" (OAuth), "ghu_" (user-to-server), "ghs_" (server-to-server) or
    // "ghr_" (refresh), then exactly 36 letters/digits (40 characters in total).
    regex: /(?<!\w)gh[oprsu]_[\dA-Za-z]{36}(?!\w)/dg,
    sourceUrl:
      'https://github.blog/engineering/platform-security/behind-githubs-new-authentication-token-formats/',
  },
  {
    provider: 'GitHub',
    ruleId: 'api_key.github_pat',
    // Fine-grained personal access token: "github_pat_", 22 letters/digits, "_", 59 letters/digits.
    regex: /(?<!\w)github_pat_[\dA-Za-z]{22}_[\dA-Za-z]{59}(?!\w)/dg,
    sourceUrl: GITHUB_SCANNING_LIST,
  },
  {
    provider: 'AWS',
    ruleId: 'api_key.aws_access_key_id',
    // "AKIA" (access key) or "ASIA" (temporary access key), then 16 capital letters/digits,
    // not glued to other letters or digits on either side.
    regex: /(?<![\dA-Za-z])A[KS]IA[\dA-Z]{16}(?![\dA-Za-z])/dg,
    sourceUrl: 'https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_identifiers.html',
  },
  {
    provider: 'AWS',
    ruleId: 'api_key.aws_secret_access_key',
    // Exactly 40 letters, digits, "/" or "+" (the secret access key) — far too generic on its
    // own, so it only counts after AWS secret context (see `context`).
    // ("=" may come right BEFORE it, as in AWS_SECRET_ACCESS_KEY=…, but not after: base64
    // padding would mean the value is longer than 40.)
    regex: /(?<![\d+/A-Za-z])[\d+/A-Za-z]{40}(?![\d+/=A-Za-z])/dg,
    // "aws_secret_access_key", "aws_secret", "AWS_SECRET…", "secret access key" (any case).
    context: /aws_?secret|secret[\s_]?access[\s_]?key/i,
    sourceUrl: 'https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_access-keys.html',
  },
  {
    provider: 'Google',
    ruleId: 'api_key.google',
    // "AIza" then 35 letters, digits, "_" or "-" (39 characters in total, as in Google's example).
    regex: /(?<![\w-])AIza[\w-]{35}(?![\w-])/dg,
    sourceUrl: 'https://docs.cloud.google.com/docs/authentication/api-keys',
  },
  {
    provider: 'Slack',
    ruleId: 'api_key.slack',
    // Slack tokens: "xoxb-" (bot), "xoxp-" (user), "xoxo-"/"xoxs-" (older), "xoxe-" or
    // "xoxe.xapp-" (rotating), "xapp-" (app-level), "xwfp-" (workflow), then 10–250
    // letters, digits or "-". (xoxa-/xoxr- are not in Slack's current docs.)
    regex: /(?<![\w-])(?:xox[bops]|xoxe(?:\.xapp)?|xapp|xwfp)-[\dA-Za-z-]{10,250}(?![\w-])/dg,
    sourceUrl: 'https://docs.slack.dev/authentication/tokens',
  },
  {
    provider: 'SendGrid',
    ruleId: 'api_key.sendgrid',
    // "SG.", 22 characters, ".", 43 characters (letters, digits, "_", "-"): 69 in total, which
    // matches Twilio's statement that SendGrid keys are 69 characters long.
    regex: /(?<![\w-])SG\.[\w-]{22}\.[\w-]{43}(?![\w-])/dg,
    sourceUrl: 'https://www.twilio.com/docs/sendgrid/ui/account-and-settings/api-keys',
  },
  {
    provider: 'Twilio',
    ruleId: 'api_key.twilio_api_key',
    // API key SID: "SK" then exactly 32 hex digits (official pattern ^SK[0-9a-fA-F]{32}$).
    regex: /(?<![\dA-Za-z])SK[\dA-Fa-f]{32}(?![\dA-Za-z])/dg,
    sourceUrl: 'https://www.twilio.com/docs/iam/api-keys/key-resource-v1',
  },
  {
    provider: 'Twilio',
    ruleId: 'api_key.twilio_auth_token',
    // Auth token: 32 hex digits — only counts after "twilio" or "auth token" context.
    regex: /(?<![\dA-Za-z])[\da-f]{32}(?![\dA-Za-z])/dg,
    // "twilio" or "auth token" / "auth_token" / "authtoken" (any case).
    context: /twilio|auth[\s_-]?token/i,
    sourceUrl: 'https://www.twilio.com/docs/iam/api-keys',
  },
  {
    provider: 'Hugging Face',
    ruleId: 'api_key.huggingface',
    // "hf_" then 30–100 letters/digits.
    regex: /(?<![\w-])hf_[\dA-Za-z]{30,100}(?![\w-])/dg,
    sourceUrl: 'https://huggingface.co/docs/hub/security-tokens',
  },
  {
    provider: 'Supabase',
    ruleId: 'api_key.supabase_secret',
    // New-format secret key: "sb_secret_" then 20–200 letters, digits, "_" or "-".
    // (Legacy service_role keys are JWTs, caught by the JWT detector.)
    regex: /(?<![\w-])sb_secret_[\w-]{20,200}(?![\w-])/dg,
    sourceUrl: 'https://supabase.com/docs/guides/api/api-keys',
  },
];

/**
 * Public-by-design key formats. These are NOT secrets and are never reported:
 * - Stripe publishable keys (pk_live_, pk_test_): "safe to expose" (docs.stripe.com/keys)
 * - Supabase publishable keys (sb_publishable_): "safe to expose online" (Supabase docs)
 * - Twilio Account SIDs (AC + 32 hex): an account identifier, not a credential
 * The secret-entropy detector uses this list to skip them too.
 */
export const PUBLIC_KEY_PREFIXES: readonly string[] = ['pk_live_', 'pk_test_', 'sb_publishable_'];

// Twilio Account SID: "AC" then exactly 32 hex digits (official pattern ^AC[0-9a-fA-F]{32}$).
export const TWILIO_ACCOUNT_SID = /^AC[\dA-Fa-f]{32}$/;

/** True if the token is one of the public-by-design key formats above. */
export function isPublicKey(token: string): boolean {
  return (
    PUBLIC_KEY_PREFIXES.some((prefix) => token.startsWith(prefix)) || TWILIO_ACCOUNT_SID.test(token)
  );
}
