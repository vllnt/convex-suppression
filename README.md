<!-- Badges -->
[![convex-component](https://img.shields.io/badge/convex-component-EE342F.svg)](https://www.convex.dev/components)
[![npm](https://img.shields.io/npm/v/@vllnt/convex-suppression.svg)](https://www.npmjs.com/package/@vllnt/convex-suppression)
[![CI](https://github.com/vllnt/convex-suppression/actions/workflows/ci.yml/badge.svg)](https://github.com/vllnt/convex-suppression/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/@vllnt/convex-suppression.svg)](./LICENSE)

# @vllnt/convex-suppression

The do-not-contact suppression list + opt-in proof, as a Convex component.

The GDPR opt-out / CAN-SPAM primitive: a **global do-not-contact list** keyed by a
**`contactHash`** (never raw PII, so it survives erasure) plus an **opt-in proof**
ledger. The host hashes a contact, then before every send asks one question —
`isEligible` (`¬suppressed [∧ confirmed]`); an unsubscribe / bounce / complaint
calls `suppress`; a double-opt-in confirmation calls `recordOptIn`. Domain-neutral:
a game's marketing opt-out, a SaaS notification do-not-contact, a newsletter
unsubscribe, any push/SMS opt-out — channels and reasons are the host's. The host
owns the raw contact, the hashing, and auth; this component owns only the
hash-keyed do-not-contact gate.

**Suppression is the residue that is _not_ a membership.** A subscriber *list*
(who is on `<list>`) is a flat membership edge or host data. Suppression is an
**anti-membership** — an entry with no member and no resource that says "never
contact this hash" and must persist *after* the subject is deleted.

## Features

- **Hash-keyed, erasure-surviving** — the component stores only the host's opaque `contactHash` (`hash(normalize(email|phone))`), never raw PII, so a "do not contact" tombstone outlives erasure of the subject. The host owns the hash and salt policy.
- **Channel-aware** — `suppress(contactHash, reason, { channel? })` scopes a suppression to one channel (`"email"`/`"sms"`/`"push"`/…) or, with no channel, marks a global all-channel tombstone. A check matches the channel entry _or_ the global one.
- **One send gate** — `isEligible(contactHash, { channel?, listKey?, requireOptIn? })` answers `¬suppressed [∧ confirmed]` in one call: suppression always blocks; the opt-in requirement is per call (marketing sets it; transactional may not).
- **Opt-in proof ledger** — `recordOptIn` / `getOptInProof` store legal proof-of-consent (source, opaque evidence, confirmation time) per list — kept separate from any authz/ReBAC store so marketing data never pollutes access queries.
- **Idempotent** — re-suppressing or re-recording an opt-in on its key tuple updates in place, so a replayed bounce/complaint/confirmation webhook can never duplicate a row.
- **Typed, opaque proof** — `Suppression<TProof>` types the stored opt-in `proof` end to end; pass `proofValidator` to narrow the opaque evidence at the boundary (no unchecked cast, no `v.any()` dump).
- **Server-sourced time** — `createdAt`/`confirmedAt` are stamped from the server clock inside every handler; a caller can never supply a timestamp.
- **Mount-safe** — runs correctly under multiple named `app.use` mounts; each instance is an isolated sandbox (e.g. a separate marketing vs. transactional do-not-contact list).

## Architecture

```
src/
├── shared.ts              # constants (component name, reasons, global-channel sentinel)
├── test.ts                # convex-test register() helper
├── client/                # Suppression class (the public API)
└── component/             # schema (suppressions + optInProofs) + mutations + queries
```

Sandboxed tables:

- `suppressions {contactHash, channel, reason, createdAt}` — indexed `by_hash` (every entry for a hash, for unsuppress/audit) and `by_hash_channel` (the exact-channel + global lookups a check makes).
- `optInProofs {contactHash, listKey, source, proof?, confirmedAt}` — indexed `by_hash_list`.

No host tables are touched. The host hashes the raw contact and keeps the raw ↔
hash mapping; the component only ever holds the opaque hash.

## Installation

```bash
pnpm add @vllnt/convex-suppression
```

Peer dependency: `convex@^1.41.0`.

## Usage

```ts
// convex/convex.config.ts
import { defineApp } from "convex/server";
import suppression from "@vllnt/convex-suppression/convex.config";

const app = defineApp();
app.use(suppression);
export default app;
```

```ts
// convex/email.ts — host owns auth + hashing; pass an opaque contactHash in.
import { components } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { Suppression } from "@vllnt/convex-suppression";

const dnc = new Suppression<{ ip: string }>(components.suppression, {
  proofValidator: v.object({ ip: v.string() }).parse, // narrow at the boundary
});

// host hashes the raw contact (normalize + hash + salt policy is the host's)
const hash = (email: string) => myHash(email.trim().toLowerCase());

// 1) The send gate — call before every send.
export const canEmail = query({
  args: { email: v.string() },
  handler: (ctx, { email }) =>
    dnc.isEligible(ctx, hash(email), {
      channel: "email",
      listKey: "newsletter",
      requireOptIn: true, // marketing → require a recorded opt-in
    }),
});

// 2) A provider webhook (via @vllnt/convex-webhook) suppresses on complaint.
export const onComplaint = mutation({
  args: { email: v.string() },
  handler: (ctx, { email }) =>
    dnc.suppress(ctx, hash(email), "complaint", { channel: "email" }),
});

// 3) A confirmed double opt-in records the proof.
export const confirmOptIn = mutation({
  args: { email: v.string(), ip: v.string() },
  handler: (ctx, { email, ip }) =>
    dnc.recordOptIn(ctx, hash(email), {
      listKey: "newsletter",
      source: "double-opt-in",
      proof: { ip },
    }),
});
```

## API Reference

See [docs/API.md](docs/API.md). Summary:

| Method | Kind | Result |
|--------|------|--------|
| `suppress(ctx, contactHash, reason, opts?)` | mutation | `null` (`reason`: `"unsubscribe" \| "bounce" \| "complaint" \| "manual" \| "global"`; `opts`: `{ channel? }`) |
| `unsuppress(ctx, contactHash, channel?)` | mutation | `boolean` (`true` if an entry was removed) |
| `recordOptIn(ctx, contactHash, opts)` | mutation | `null` (`opts`: `{ listKey?; source; proof? }`) |
| `isSuppressed(ctx, contactHash, channel?)` | query | `SuppressionView \| null` |
| `getOptInProof(ctx, contactHash, listKey?)` | query | `OptInProofView \| null` |
| `isEligible(ctx, contactHash, opts?)` | query | `boolean` (`opts`: `{ channel?; listKey?; requireOptIn? }`) |

Client options:
`new Suppression(component, { proofValidator? })`. Omitting `channel`/`listKey`
targets the global (all-channel / all-list) entry.

## React

This component ships **backend-only** — no `./react` entry. The consumer surface is
a server-side `isEligible` gate before a send and webhook-driven `suppress` writes
— there is no user-facing management surface a hook would serve. A reactive
do-not-contact badge, if ever needed, is an ordinary `useQuery` over the host's own
re-exported `isSuppressed` ref (which returns live in Convex), so a dedicated hook
would add a wrapper with no value over the host's existing `api`.

## Security Model

The component is **auth-agnostic**: it never authenticates or authorizes. The host
resolves identity, decides whether a caller may suppress/unsuppress/query a given
hash, and passes an opaque `contactHash`.

**Hash-keyed, never raw PII** — the component stores only `contactHash`. The host
hashes and normalizes the contact (`hash(normalize(contact))`), owns the salt
policy, and keeps the raw ↔ hash mapping. A suppression therefore survives erasure
of the subject (the GDPR crux: erasure removes the data, the do-not-contact
tombstone remains). Component tables are sandboxed — the host reaches them only
through the exported functions, and the component never reads host or sibling
tables. The opt-in `proof` is opaque to the component; the host narrows it with
`proofValidator` at the client boundary. **Time is server-sourced** — `createdAt`
and `confirmedAt` come from `Date.now()` inside each handler, never from the caller.

## Testing

```bash
pnpm test           # single run
pnpm test:coverage  # enforced 100% on covered files
```

Tests run against the real component runtime via `convex-test` (`@edge-runtime/vm`), not mocks.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Author

Built by [bntvllnt](https://github.com/bntvllnt) · [bntvllnt.com](https://bntvllnt.com) · [X @bntvllnt](https://x.com/bntvllnt)

Part of the [@vllnt](https://github.com/vllnt) Convex component fleet — [vllnt.com](https://vllnt.com)

If this is useful, [sponsor the work](https://github.com/sponsors/bntvllnt).

## License

MIT — see [LICENSE](LICENSE).
