# BEMO M1 local foundation draft

Status: owner approved and applied to BEMO Development on 2026-11-03 as migration 20261103153548_bemo_m1_foundation. No website route uses these APIs yet. This implements the narrow profile/store foundation; it does not implement checkout, stock, shipping, badges, admin operations, account deletion, or Google OAuth setup.

## RPC contract

All arguments use the exact names below (Supabase named RPC arguments). All protected calls derive the user from the verified session; none accept a target user ID.

| Function | Arguments | Result |
|---|---|---|
| `public.bemo_onboard` | `display_name text`, `locale text = 'ar'` | Own profile JSON; same auth subject keeps same business UUID and profile choices on retry |
| `public.bemo_get_profile` | none | Own profile JSON |
| `public.bemo_update_profile` | `display_name text`, `locale text` | Own profile JSON; cannot edit email, roles, status or identity |
| `public.bemo_create_store` | `title text`, `slug text`, `description text = ''` | Own store JSON; immediately ACTIVE; an exact active retry returns original store |
| `public.bemo_get_my_store` | none | Own store JSON or null |
| `public.bemo_list_stores` | `search_text text = ''`, `limit_count int = 24`, `offset_count int = 0` | Rows with `id`, `slug`, `title`, `description`, `created_at` only |

Profile JSON: `id`, `email`, `display_name`, `locale`, `status`, `created_at`, `updated_at`. Store JSON omits owner ID and includes `id`, `slug`, `title`, `description`, `status`, `created_at`, `updated_at`. Roles are never included.

## Security and business invariants

- `bemo_private.app_users` has a stable random business UUID and immutable, unique auth subject; the Google verified identity email must match the normalized confirmed auth email. Gmail aliases are not conflated into person identity claims.
- Fresh database checks require a live, nonanonymous, nondeleted, unbanned user and a matching session row whose `not_after` has not expired. Missing/revoked session, malformed session UUID, non-OAuth AMR, mismatched/unverified Google identity, or non-Gmail email fails closed. Editable user metadata is never consulted.
- AMR `oauth` is generic. Before activation, configure **Google as the sole sign-in provider**, disable email/password/OTP, phone, anonymous/custom OAuth and other providers, and disable manual identity linking. Confirm actual Google login and refresh AMR/identity behavior on the hosted project. Inactivity policies require separate configuration/testing; session row presence plus `not_after` alone is not an inactivity guarantee.
- All private tables have RLS enabled, no policies and no direct client table privileges. This intentionally denies direct table access. Every protected SECURITY DEFINER implementation separately checks identity and ownership; RLS does not secure the privileged implementation itself. Functions have fixed empty search paths and explicit EXECUTE grants. Keep `bemo_private` outside Data API exposed schemas.
- Public wrappers run as invoker. The public directory is a deliberate bounded read API backed by a private definer: it exposes only the five documented safe columns for ACTIVE stores whose application and Auth accounts are active. Signed-in suspended users are rejected; public information is still available anonymously.
- App roles are a private trusted table with no client writer and no provisioning API. No first-user admin shortcut. This draft grants no administrative power, seller staff or finance capability.
- One permanent store row per owner; unique slug; title unique after trim/lower. Exact creation retry is idempotent. Closed/suspended rows retain slug, title and owner uniqueness. There is no delete/rename/reopen endpoint in this milestone.
- Reserved route/brand slugs are seeded as constants, not fake business records. Additional banned impersonations require the later moderation workflow; this is not trademark or identity verification.
- Profile mutation and creation lock the app profile row to serialize owner operations and status changes. Database uniqueness remains the final invariant. Local PGlite tests cannot prove parallel session behavior; hosted multi-connection tests remain required.
- A private append-only-to-clients audit table records profile creation/update and store creation with stable IDs and timestamps, never submitted names/emails/descriptions. Retention/deletion policy is deferred to the approved lifecycle milestone.
- Auth FK uses `ON DELETE RESTRICT`; no automatic deletion of store/order identity history. Account deletion/30-day erasure is not implemented and must be designed before public launch.

## Expected error codes

- `42501`: missing/ineligible identity, invalid session or unavailable/suspended profile. Messages start `BEMO_`.
- `22023`: invalid text/locale/pagination or reserved slug.
- `23505`: one-store conflict, slug collision, normalized title collision, or conflicting normalized email. UI must map constraints to safe localized errors, not display raw database details.

## Local auth fixture contract (test-only)

Use PostgreSQL roles `anon`, `authenticated`, `service_role` and minimal managed-auth fixtures:

- `auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, is_anonymous boolean, banned_until timestamptz, deleted_at timestamptz)`
- `auth.identities(user_id uuid, provider text, identity_data jsonb)` with verified Google identity data `{ "email": "...@gmail.com", "email_verified": true }`.
- `auth.sessions(id uuid primary key, user_id uuid, not_after timestamptz)`.
- `auth.uid()` and `auth.jwt()` test adapters from local request claims; normal API callers cannot set arbitrary signed claims in production.
- Claims include `sub`, `session_id`, `amr: [{ "method": "oauth", "timestamp": ... }]`.

Fixtures are not Supabase Auth or proof of Google authentication. SQL allow/deny tests passed, architectural approval was received and the CLI-generated migration was applied to the empty development project. Hosted structure/privileges and anonymous Data API checks also passed. Test actual hosted auth providers, session revocation, duplicate requests and authenticated Data API isolation before enabling the UI.

## Sources checked

- [Supabase sessions](https://supabase.com/docs/guides/auth/sessions): session-ID validation and logout behavior; expired-session cleanup may lag.
- [Supabase identities](https://supabase.com/docs/guides/auth/identities): managed identity data.
- [Supabase database functions](https://supabase.com/docs/guides/database/functions): privileges and fixed search paths.
- [Supabase row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security): direct table authorization and definer caveats.

No frontend framework or production package added. Plain PostgreSQL is the existing selected database technology. The separate local test runner may use PGlite, but it is not a production backend or a second application database.
