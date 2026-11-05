// supabase/functions/invite — the only place this platform holds a service key.
//
// Purpose (docs/adr/0005-invite-only-provisioning.md §4): an owner invites a person
// by email; GoTrue sends an invite link; that person sets their OWN password. No
// password is generated here, none is stored here, and none crosses this function.
//
// Authorization is NOT decided in this file. The caller's JWT is forwarded to the
// database, where assert_can_invite() applies the same owner/verified/disabled
// rules every other identity decision uses. That keeps the authority in one place
// and makes it testable with SQL (see 0011 and docs/risk-register.md).
//
// Status: authored; NOT DEPLOYED and NOT TYPE-CHECKED — there is no Deno runtime in
// this development environment, so nothing here has been compiled or served.
// Deploy with:  supabase functions deploy invite
// Secrets:      supabase secrets set INVITE_SERVICE_ROLE_KEY=...   (anon key and URL
//               are provided to functions as SUPABASE_URL / SUPABASE_ANON_KEY)
//               INVITE_REDIRECT_TO=https://<production origin>/#/login

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const JSON_HEADERS = { headers: { "Content-Type": "application/json" } };

function deny(status: number, code: string, message: string): Response {
  // Codes are stable and generic; nothing here echoes the stored hash, the link,
  // or which addresses exist.
  return new Response(JSON.stringify({ error: code, message }), { status, ...JSON_HEADERS });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "*",
        "Access-Control-Allow-Headers": "authorization, content-type",
        "Access-Control-Allow-Methods": "POST",
      },
    });
  }
  if (req.method !== "POST") return deny(405, "METHOD", "Use POST.");

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return deny(401, "UNAUTHORIZED", "A signed-in session is required.");
  }

  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const service = Deno.env.get("INVITE_SERVICE_ROLE_KEY");
  if (!url || !anon || !service) return deny(500, "CONFIG", "Function is not configured.");

  let body: {
    email?: string; full_name?: string; role_key?: string;
    role_instance_id?: string | null; delivery?: string;
  };
  try {
    body = await req.json();
  } catch {
    return deny(400, "BAD_JSON", "Expected a JSON body.");
  }

  const email = (body.email ?? "").trim().toLowerCase();
  const roleKey = (body.role_key ?? "").trim();
  const delivery = body.delivery === "manual_link" ? "manual_link" : "auto_email";
  if (!/^[^@\s]+@[^@\s.]+(\.[^@\s.]+)+$/.test(email)) return deny(400, "INVALID_EMAIL", "Check the address.");
  if (!["doctor", "nurse", "reception", "lab"].includes(roleKey)) {
    // 'admin' is deliberately excluded: an admin slot is assigned in-app by an
    // owner, never shipped to someone in an email.
    return deny(400, "INVALID_ROLE", "Choose doctor, nurse, reception or lab.");
  }

  // 1. Who is asking, and may they invite? Decided by SQL, as the caller.
  const asCaller = createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: grant, error: grantErr } = await asCaller
    .rpc("assert_can_invite", { p_role_key: roleKey });
  if (grantErr) {
    const msg = String(grantErr.message ?? "");
    if (msg.includes("ADMIN_GRANT_OWNER_ONLY")) return deny(403, "ADMIN_GRANT_OWNER_ONLY", "An owner assigns admin roles in the app.");
    if (msg.includes("FORBIDDEN")) return deny(403, "FORBIDDEN", "Only a platform owner can send invitations.");
    if (msg.includes("NOT_A_MEMBER")) return deny(403, "NOT_A_MEMBER", "Select an organisation first.");
    console.error("assert_can_invite failed:", msg.slice(0, 200));
    return deny(400, "INVITE_REFUSED", "The invitation could not be authorised.");
  }
  const orgId = (grant as { org_id?: string } | null)?.org_id;
  const actorId = (grant as { actor_id?: string } | null)?.actor_id;
  if (!orgId || !actorId) return deny(400, "INVITE_REFUSED", "The invitation could not be authorised.");

  const asService = createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let invitationId: string | null = null;
  let userId: string | null = null;
  let inviteLink: string | null = null;

  try {
    if (delivery === "manual_link") {
      // 2a. Owner receives the link once and delivers it themselves (SMS, letter,
      // in person). GoTrue creates the account as invited-but-unconfirmed.
      const { data: linkData, error: linkErr } = await asService.auth.admin.generateLink({
        type: "invite",
        email,
        options: {
          data: { full_name: (body.full_name ?? "").trim() },
          redirectTo: Deno.env.get("INVITE_REDIRECT_TO"),
        },
      });
      if (linkErr) throw new Error(`generateLink: ${linkErr.message}`);
      userId = linkData?.id ?? null;
      const hashedToken = linkData?.properties?.hashed_token;
      if (!hashedToken) throw new Error("generateLink returned no token");
      inviteLink = `${url}/auth/v1/verify?token=${hashedToken}&type=invite&redirect_to=${
        encodeURIComponent(Deno.env.get("INVITE_REDIRECT_TO") ?? "")
      }`;

      const { data: recId, error: recErr } = await asService.rpc("record_invitation", {
        p_email: email, p_full_name: body.full_name ?? null, p_role_key: roleKey,
        p_role_instance: body.role_instance_id ?? null,
        p_token_hash: await sha256Hex(hashedToken),
        p_delivery: "manual_link", p_org: orgId, p_actor: actorId,
      });
      if (recErr) throw new Error(`record_invitation: ${recErr.message}`);
      invitationId = (recId as string | null) ?? null;
    } else {
      // 2b. GoTrue emails the invite directly. We never see the token, so the
      // stored hash stays NULL — nothing secret is lost by that.
      const { data: invited, error: inviteErr } = await asService.auth.admin.inviteUserByEmail(
        email,
        {
          data: { full_name: (body.full_name ?? "").trim() },
          redirectTo: Deno.env.get("INVITE_REDIRECT_TO"),
        },
      );
      if (inviteErr) throw new Error(`inviteUserByEmail: ${inviteErr.message}`);
      userId = invited.user?.id ?? null;

      const { data: recId, error: recErr } = await asService.rpc("record_invitation", {
        p_email: email, p_full_name: body.full_name ?? null, p_role_key: roleKey,
        p_role_instance: body.role_instance_id ?? null, p_token_hash: null,
        p_delivery: "auto_email", p_org: orgId, p_actor: actorId,
      });
      if (recErr) throw new Error(`record_invitation: ${recErr.message}`);
      invitationId = (recId as string | null) ?? null;
    }
  } catch (err) {
    // The message is logged, not returned: it can contain the address or a token.
    console.error("invite failed:", String((err as Error)?.message ?? err).slice(0, 200));
    return deny(502, "INVITE_FAILED", "The invitation could not be sent. Try again.");
  }

  return new Response(
    JSON.stringify({
      ok: true,
      invitation_id: invitationId,
      user_id: userId,
      email,
      role_key: roleKey,
      // Returned once, for the owner to copy. Never persisted in clear text.
      invite_link: inviteLink,
      claim_hint: "They set their own password in the link. Access appears on their next sign-in.",
    }),
    JSON_HEADERS,
  );
});

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
