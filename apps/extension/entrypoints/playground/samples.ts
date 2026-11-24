/*
  Five realistic sample prompts for the Detection Playground (DEV ONLY).
  EVERY value is fake: example.com emails, Stripe/IBAN/AWS official documentation examples,
  sample-range phone numbers, and keys/IDs ASSEMBLED AT RUNTIME from pieces, so no complete
  real-looking credential appears in the source (GitHub push-protection rule).
  Each sample also contains things that must NOT be flagged (dates, versions, UUIDs, prices…).
*/

/** Deterministic made-up characters (never a real key). */
function fakeChars(length: number, step = 7): string {
  const alphabet = 'aZ3kQ9mW2xR7tY4pL8vB5nC6hJ1dF0gSeUiOoAbcDEfGHIjKlMNPqrsTuVwXyz';
  return Array.from({ length }, (_, i) => alphabet.charAt((i * step + 3) % alphabet.length)).join(
    '',
  );
}

const base64url = (text: string) =>
  btoa(text).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');

const FAKE_STRIPE_SECRET = 'sk_' + 'live_' + fakeChars(24);
const FAKE_STRIPE_PUBLISHABLE = 'pk_' + 'live_' + fakeChars(24); // public: must NOT be flagged
const FAKE_GITHUB_TOKEN = 'gh' + 'p_' + fakeChars(36);
const FAKE_AWS_KEY_ID = 'AKIA' + 'IOSFODNN7' + 'EXAMPLE'; // AWS documentation example
const FAKE_AWS_SECRET = 'wJalrXUtnFEMI/K7MDENG/' + 'bPxRfiCY' + 'EXAMPLEKEY'; // AWS docs example
const FAKE_JWT = `${base64url('{"alg":"HS256","typ":"JWT"}')}.${base64url('{"sub":"fake-user"}')}.FAKE_SIGNATURE_VALUE`;
const FAKE_SECRET_KEY = fakeChars(40, 13);
const FAKE_CNIC = ['35202', '1234567', '1'].join('-');
const FAKE_SSN = ['123', '45', '6789'].join('-');
const FAKE_NINO = ['AB', '12', '34', '56', 'C'].join(' ');
const FAKE_EMIRATES_ID = ['784', '1990', '1234567', '1'].join('-');
const FAKE_PRIVATE_KEY = [
  '-----BEGIN ' + 'PRIVATE KEY-----',
  'FAKE00KEYLINEFORTHEPLAYGROUNDONLYXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
  'FAKE01KEYLINEFORTHEPLAYGROUNDONLYXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
  '-----END ' + 'PRIVATE KEY-----',
].join('\n');

/** One sample: a short label for the dropdown and the text. */
export interface Sample {
  label: string;
  text: string;
}

export const SAMPLES: readonly Sample[] = [
  {
    label: 'Agency client email',
    text: `Hi Sarah,

Following up on the Apollo launch for ABC Corp. Please send the signed contract to
ali.raza@example.com and copy Dr. Ayesha Khan. You can reach me on +92 300 1234567 or
the office line 042 35761234 (ext. 22).

Our meeting is on 2026-11-24 at 10:30 at 12 Model Town, Lahore. Budget approved: $12,500.

Regards,
Hamza Iqbal`,
  },
  {
    label: '.env file pasted in',
    text: `# production config — version 2.4.1
DATABASE_URL=postgres://app_user:FakeDbPass9@db.example.com:5432/app
DB_PASSWORD=fakeOne1!
STRIPE_SECRET_KEY=${FAKE_STRIPE_SECRET}
STRIPE_PUBLISHABLE_KEY=${FAKE_STRIPE_PUBLISHABLE}
GITHUB_TOKEN=${FAKE_GITHUB_TOKEN}
AWS_ACCESS_KEY_ID=${FAKE_AWS_KEY_ID}
AWS_SECRET_ACCESS_KEY=${FAKE_AWS_SECRET}
SESSION_SECRET_KEY=${FAKE_SECRET_KEY}
REQUEST_ID=550e8400-e29b-41d4-a716-446655440000
DEBUG=false`,
  },
  {
    label: 'Invoice',
    text: `INVOICE #10023 — due 18/12/2026

Bill to: Acme Traders, 221B Baker Street, London SW1A 1AA
Amount: Rs 45,000 (USD 160.50)

Pay by bank transfer:
IBAN: GB82 WEST 1234 5698 7654 32
Account number: 0123 4567 8901

Or by card: 4242 4242 4242 4242 (exp 12/28)
Order ref: ORD-2026-000123, tracking 1Z999AA10123456784`,
  },
  {
    label: 'HR note',
    text: `Name: Bilal Ahmed
CNIC: ${FAKE_CNIC}
Previous US role — SSN ${FAKE_SSN}
UK NI number: ${FAKE_NINO}
Emirates ID: ${FAKE_EMIRATES_ID}

Joining date 2026-12-01, probation 3 months, salary band B2.
Emergency contact: Mrs Sara Ali, 0300-1234567, House #12, Street 5, Sector F-7.
Hi team, please don't forward this note.`,
  },
  {
    label: 'Support ticket with code',
    text: `Ticket #48213 — login fails after upgrading to v3.2.0 (commit 9fceb02d0ae598e95dc970b74767f19372d61af8)

Steps: open https://app.example.com/callback?code=FAKE_OAUTH_CODE_123&state=xyz
Header used: Authorization: Bearer ${FAKE_JWT}

const config = {
  apiUrl: "https://api.example.com/v1",
  password: "fake-pass-for-playground",
  retries: 3,
  timeoutMs: 30000,
};

The deploy key someone pasted earlier:
${FAKE_PRIVATE_KEY}

Forgot password? Use the password reset link. Our roadmap: Phase 2 of the project, then the Road map review.`,
  },
];
