// The Terms and Privacy Policy version users accept. When what we collect or why changes, bump POLICY_VERSION,
// set the new effective date, add a POLICY_CHANGES entry and add the version to the policy_versions table.
// Typo fixes in privacy.md or terms.md keep the version.
export const POLICY_VERSION = 3
export const POLICY_EFFECTIVE_DATE = '2026-10-25'
export const OPERATOR_NAME = 'Ankur Paul'

// The short "what changed" list shown when a signed-in user has to accept a newer version.
export const POLICY_CHANGES: Record<number, string[]> = {
  1: ['First version.'],
  2: [
    "Institutes can save timetables online, including teachers' names. Every member can open them, and the last 20 versions are kept.",
    'A saved timetable can be published at a link that anyone who has it can open without signing in.',
    "When you save or publish other people's details, you confirm your institution allows it.",
  ],
  3: [
    "The optional assistant sends your questions and the timetable details it looks up to Anthropic, a US company. Teachers' names are replaced by codes first, and we don't store your chats.",
    'We record how many questions each institute asks and what they cost, never the text, and who redeemed each trial coupon.',
    'The assistant can be wrong, so check its answers. Trial coupons are free and can be withdrawn.',
  ],
}
