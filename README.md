<!-- Badges -->
[![convex-component](https://img.shields.io/badge/convex-component-EE342F.svg)](https://www.convex.dev/components)
[![npm](https://img.shields.io/npm/v/@vllnt/convex-suppression.svg)](https://www.npmjs.com/package/@vllnt/convex-suppression)
[![CI](https://github.com/vllnt/convex-suppression/actions/workflows/ci.yml/badge.svg)](https://github.com/vllnt/convex-suppression/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/@vllnt/convex-suppression.svg)](./LICENSE)

# @vllnt/convex-suppression

The do-not-contact suppression list + opt-in proof, as a Convex component.

```ts
const dnc = new Suppression(components.suppression);
await dnc.suppress(ctx, contactHash, "complaint", { channel: "email" });
const canSend = await dnc.isEligible(ctx, contactHash, { channel: "email" });
```

The GDPR opt-out / CAN-SPAM primitive: a global do-not-contact list keyed by an
opaque **`contactHash`** (never raw PII, so it survives erasure) plus an opt-in
proof ledger. Before every send the host asks `isEligible`; an unsubscribe / bounce
/ complaint calls `suppress`; a double-opt-in confirmation calls `recordOptIn`.
Domain-neutral — channels and reasons are the host's.

## Features

- **Hash-keyed, erasure-surviving** — stores only the opaque `contactHash`, never raw PII, so a tombstone outlives erasure of the subject.
- **Channel-aware** — scope a suppression to one channel (`"email"`/`"sms"`/`"push"`), or omit `channel` for a global all-channel tombstone.
- **One send gate** — `isEligible` answers `¬suppressed [∧ confirmed]` in one call; suppression always blocks, opt-in is per call.
- **Opt-in proof ledger** — `recordOptIn` / `getOptInProof` store legal proof-of-consent per list, kept separate from any authz store.
- **Idempotent** — re-suppressing / re-recording on its key tuple updates in place, so a replayed webhook never duplicates a row.
- **Typed, opaque proof** — `Suppression<TProof>` with an optional `proofValidator` narrows the stored evidence at the boundary.
- **Server-sourced time** — `createdAt`/`confirmedAt` are stamped from the server clock; a caller can never supply a timestamp.
- **Mount-safe** — correct under multiple named `app.use` mounts (e.g. marketing vs. transactional lists), each an isolated sandbox.

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
  proofValidator: v.object({ ip: v.string() }).parse,
});
const hash = (email: string) => myHash(email.trim().toLowerCase()); // host's hashing + salt policy

// The send gate — call before every send.
export const canEmail = query({
  args: { email: v.string() },
  handler: (ctx, { email }) =>
    dnc.isEligible(ctx, hash(email), { channel: "email", listKey: "newsletter", requireOptIn: true }),
});

// A provider webhook suppresses on complaint; a confirmed double opt-in records proof.
export const onComplaint = mutation({
  args: { email: v.string() },
  handler: (ctx, { email }) => dnc.suppress(ctx, hash(email), "complaint", { channel: "email" }),
});
export const confirmOptIn = mutation({
  args: { email: v.string(), ip: v.string() },
  handler: (ctx, { email, ip }) =>
    dnc.recordOptIn(ctx, hash(email), { listKey: "newsletter", source: "double-opt-in", proof: { ip } }),
});
```

Client options: `new Suppression(component, { proofValidator? })`. Omitting `channel`/`listKey` targets the global entry.

## API Reference

| Method | Kind | Result |
|--------|------|--------|
| `suppress(ctx, contactHash, reason, opts?)` | mutation | `null` (`reason`: `"unsubscribe" \| "bounce" \| "complaint" \| "manual" \| "global"`; `opts`: `{ channel? }`) |
| `unsuppress(ctx, contactHash, channel?)` | mutation | `boolean` (`true` if an entry was removed) |
| `recordOptIn(ctx, contactHash, opts)` | mutation | `null` (`opts`: `{ listKey?; source; proof? }`) |
| `isSuppressed(ctx, contactHash, channel?)` | query | `SuppressionView \| null` |
| `getOptInProof(ctx, contactHash, listKey?)` | query | `OptInProofView \| null` |
| `isEligible(ctx, contactHash, opts?)` | query | `boolean` (`opts`: `{ channel?; listKey?; requireOptIn? }`) |

Full reference: [docs/API.md](docs/API.md).

## React

Backend-only — no `./react` entry. The consumer surface is a server-side
`isEligible` gate and webhook-driven `suppress` writes; a reactive do-not-contact
badge, if ever needed, is an ordinary `useQuery` over the host's re-exported
`isSuppressed` ref.

## Security

- **Auth-agnostic** — the host authenticates the caller, decides who may suppress/query a hash, and passes an opaque `contactHash`; tables are sandboxed.
- **Hash-keyed, never raw PII** — the host hashes and normalizes the contact and owns the salt policy; a suppression survives erasure of the subject.
- **Server-sourced time** — `createdAt`/`confirmedAt` come from `Date.now()` in each handler, never the caller; the opt-in `proof` is opaque, narrowed by the host validator.

See [docs/API.md](docs/API.md).

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
