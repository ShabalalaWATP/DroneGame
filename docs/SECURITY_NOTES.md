# Security notes

## What this protects against

Site Guard runs on one person's machine, with no sign-in and no secrets. It holds saved laydowns, run history and tuning figures. The realistic threats are:

1. **A web page you visit** trying to read or change the local service through your browser.
2. **Someone on your network** reaching the service.
3. **A crafted link or file** running script in the game, or corrupting saved data.
4. **A compromised dependency.**

It is not built to be hosted. See [Before hosting](#before-hosting).

## Protections

| Threat | Protection | Where |
|---|---|---|
| Network access | Binds to `127.0.0.1` | `backend/app/__main__.py` |
| DNS rebinding | Only `localhost` and `127.0.0.1` are accepted as hosts | `TrustedHostMiddleware` in `main.py` |
| Cross-site writes | Writes must be `application/json`, and no CORS is offered, so a browser refuses the cross-site request | `RequestGuard` in `security.py` |
| Large requests | 1 MB limit, counting what actually arrives, so chunked bodies can't dodge it | `RequestGuard` |
| Bad input | Pydantic: known names only, coordinates in the world, finite numbers, length limits, capped lists, unknown fields refused | `schemas.py` |
| SQL injection | Bound parameters only, with a test that checks the source | `db/stores.py` |
| Script injection | React escapes everything, and a test bans `innerHTML` and similar in `ui/` | `tests/boundary.test.js` |
| Loading other scripts | Content Security Policy with no inline scripts and same-origin connections only | `security.py` |
| Being framed | `frame-ancestors 'none'` | `security.py` |
| Reaching files | Only `frontend/dist` is served, never the project folder or the database | `main.py` |
| Malicious links in data | Source links render only if they are `https`, with `noopener` | `SourceLinks.jsx` |
| Imported figure files | Only known keys and finite numbers are applied | `sim/config/figures.js` |
| Input echoed back | Validation errors say what is wrong, without repeating the input | `main.py` |
| Dependencies | Exact versions and lockfiles, with Python packages limited to releases at least two weeks old | `package.json`, `pyproject.toml` |

## How this was checked

The automated tests cover refused input, wrong hosts, non-JSON writes, oversized and chunked bodies, path traversal, finite numbers and the Content Security Policy headers.

These were also checked by hand on a running server, on 2026-11-04:

- Real sockets for chunked bodies, a bogus `Content-Length`, path traversal and the LAN address.
- A play-through in a real browser with a `securitypolicyviolation` listener running, which recorded no violations.

An independent security review on the same date found one low-severity bug, now fixed: an imported figures file could overwrite built-in JavaScript objects through keys such as `constructor`. Figure import and the enemy learning command now accept only their own known keys, tested through `JSON.parse` because that is what real input goes through. The backend still accepts those keys in stored figures. They are harmless there, because it only stores them.

`npm audit` and `pip-audit` reported nothing on that date. Neither is run automatically, because there is no CI until a remote exists.

## Accepted limits

- **Run results are self-reported.** The browser sends them, so they are a record for the player and not proof of a score. There is no leaderboard for this reason.
- **Anything already running on this machine can reach the API,** because there is no sign-in. Local programs are outside this threat model.
- **No record limits.** Someone with access could fill the disk, which is acceptable for local use.
- **The database is not encrypted.** It holds no personal data beyond what the player types as names.
- **Kept runs sit in browser storage** until the server returns, readable by anything running on the same origin.
- **A run can occasionally be saved twice,** if the page closes after the server stored it but before its answer arrived, or if two tabs retry together. The player can delete the extra row. The saver prefers a duplicate to a lost run.
- **`Cross-Origin-Resource-Policy` and the rest of the headers rely on a modern browser.**

## Before hosting

A hosted version needs a new security review before deployment, and at least:

- Sign-in, with ownership checks on every record, not just every route.
- Rate limits and per-user quotas.
- HTTPS, with a real host allowlist from configuration.
- A move off SQLite, if many users write at once.
- Server-side checks on run results if scores are ever to mean anything.
- Automated dependency scanning.

Treat this list as a starting point, not as complete.
