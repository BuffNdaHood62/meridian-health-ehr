# Edge Functions

One function exists: `invite/` — an owner invites a person by email so they can set
their own password (ADR-0005 §4). It is the **only** place the service key lives; the
SPA keeps using the anon key.

Nothing here has been deployed or type-checked: there is no Deno runtime in this
development environment. Treat `invite/index.ts` as reviewed-by-reading, not verified.

```bash
supabase functions deploy invite                        # needs the CLI + a link
supabase secrets set INVITE_SERVICE_ROLE_KEY=<service key>
supabase secrets set INVITE_REDIRECT_TO=https://<production origin>/#/login
```

Rules the function depends on, all enforced in SQL rather than in TypeScript:

- `assert_can_invite(role_key)` — the caller's JWT must belong to a platform owner
  with an active membership; it also refuses `role_key='admin'`.
- `record_invitation(...)` — refuses any caller whose `auth.jwt()->>'role'` is not
  `service_role`, then re-validates that the claimed inviter is *still* an owner and
  a member of the org it names, so the function cannot be talked into forging one.
- `claim_invitation()` — the invitee side. Matches the signed-in email to a live
  invitation and creates the membership + role assignment. No bearer token is used,
  because opening the invite link already proved the mailbox.

Deployment order matters: `0011` must be applied before this function is deployed,
or `assert_can_invite` does not exist and every call fails closed (which is the right
failure, but not a useful one).
