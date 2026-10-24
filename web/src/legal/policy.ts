// The Terms and Privacy Policy version users accept. When what we collect or why changes, bump POLICY_VERSION,
// set the new effective date, add a POLICY_CHANGES entry and add the version to the policy_versions table.
// Typo fixes in privacy.md or terms.md keep the version.
export const POLICY_VERSION = 1
export const POLICY_EFFECTIVE_DATE = '2026-10-24'
export const OPERATOR_NAME = 'Ankur Paul'

// The short "what changed" list shown when a signed-in user has to accept a newer version.
export const POLICY_CHANGES: Record<number, string[]> = {
  1: ['First version.'],
}
