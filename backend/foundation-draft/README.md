# BEMO foundation verification

Owner approved the foundation on 2026-11-03. It is applied to **BEMO Development** (`qjtsfdfcczxowsfjtrwy`) as migration `20261103153548_bemo_m1_foundation`. The directory name preserves the original review package; it no longer indicates that deployment is pending.

The canonical applied SQL is `../../supabase/migrations/20261103153548_bemo_m1_foundation.sql`. `foundation.sql` is the historical review snapshot; its only difference at application was the first comment. Do not apply it again. The CLI created the file first; its version was then aligned with the migration version returned by Supabase MCP.

Run local SQL behavior checks with Node 22+:

```sh
npm ci --ignore-scripts
npm test
```

PGlite is a pinned **test-only** dependency; neither it nor this directory is part of the static site's `dist` deployment. The local fixtures emulate the required Supabase auth relations and verified request context. They do not test Google OAuth, cryptographic JWT validation, or multiple database connections.

`hosted-inspection.sql` contains read-only database catalog assertions. `hosted-api-check.mjs` accepts one JSON line on stdin with `url` and a modern **public** publishable `key`; it checks an empty development project's anonymous read/denial boundaries and rejects secret-key input. Never provide service-role keys or a user session. Its empty-directory expectation is intentionally for a fresh development database.

Verification completed: 31 local behavior tests, 23 hosted structure/privilege checks and 9 actual HTTP checks. See `../../docs/FOUNDATION_DELIVERY_AR.md` for remaining launch gates and informational advisories.
