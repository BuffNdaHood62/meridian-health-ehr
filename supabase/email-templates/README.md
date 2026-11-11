# Email templates — Supabase GoTrue

Dashboard → Authentication → **Email Templates** is the only live copy of these, so the
repo files are the source of truth: edit here, paste the body there, keep the comment
block out of the editor.

Every file shares one design so a clinician sees the same thing whichever mail arrives:
`#f1f5f9` canvas (the app's `body` background), a white card with a `#e2e8f0` hairline and
16px radius, the brand cross tile + wordmark from `Login.tsx`, `#13726c` (brand-600)
actions, and a brand-50 notice panel with a brand-600 rule for the one thing the recipient
most needs to know. Inter first, Helvetica/Arial fallback, all styles inline, tables for
layout — Outlook and Gmail strip `<style>` and `@import`.

| File | Dashboard entry | Subject | Does this app send it? |
| --- | --- | --- | --- |
| `confirm-signup.html` | Confirm signup | Confirm your Wellness with Writingale account | **Yes** — `signUp()` in `src/identity/supabase-adapter.ts` |
| `invite-user.html` | Invite user | You have been invited to Wellness with Writingale | Not yet — `functions/invite` is undeployed and `claim_invitation()` needs `0011` (ADR-0005) |
| `reset-password.html` | Reset password | Reset your Wellness with Writingale password | Only from the Dashboard — there is no forgot-password route in `Login.tsx` |
| `change-email.html` | Change email address | Confirm your new Wellness with Writingale email address | No — `updateUser()` is called with a password only |
| `magic-link.html` | Magic link or OTP | Your Wellness with Writingale sign-in link | No — nothing calls `signInWithOtp`, and the identity state machine has no outcome for it |
| `reauthentication.html` | Reauthentication | Confirm this change to your Wellness with Writingale account | No — step-up is `/login/step-up` + `has_recent_mfa()`, not email |

Configure all six anyway. GoTrue's defaults are the only thing a dormant template sends
if someone flips the flow on later, and a generic "Confirm your email" mail on a clinical
system is how a recipient learns about the product from a phishing-looking link.

## Before testing any of them

- **Site URL and the Redirect URLs allowlist** must point at the deployed origin, or every
  link in every one of these mails goes to localhost (`GO-LIVE-RUNBOOK.md` §4, R-23).
- Keep `{{ .ConfirmationURL }}` and `{{ .Email }}` verbatim; if the Dashboard editor names a
  link variable differently, trust the editor over these files.
- `support@example.org` is the same deploy-time placeholder as `VITE_SUPPORT_EMAIL`
  (`src/config.ts`). Replace both together so mail and app never disagree.
- The brand tile is a text `+`, mirroring `src/components/ui/WwwLogo.tsx`. When the
  foundation supplies a real logo, host it and swap that cell for an `<img width="44">` —
  do not paste a local path, remote images are what makes it render in mail clients.

## Copy rules these files follow

No expiry times (this project configures none), no "secure/encrypted/HIPAA/SOC 2" wording,
no claim that anything was *detected* — only that a change was *requested*. Confirming an
email is stated as separate from being approved, because `approve_profile()` grants access
and that distinction is what the pending screen is for.
