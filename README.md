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
proof store (latest proof per contact/list, not append-only history). Before
every send the host asks `isEligible`; an unsubscribe / bounce / complaint calls
`suppress`; a double-opt-in confirmation calls `recordOptIn`. Domain-neutral —
channels are host-defined; reasons use the fixed union listed below.

## Features

- **Hash-keyed, erasure-surviving** — stores only the opaque `contactHash`,
  never raw PII, so a tombstone outlives erasure of the subject.
- **Channel-aware** — scope a suppression to one channel
  (`"email"`/`"sms"`/`"push"`), or omit `channel` for a global all-channel
  tombstone.
- **One send gate** — `isEligible` answers `¬suppressed [∧ confirmed]` in one
  call; suppression always blocks, opt-in is per call.
- **Opt-in proof ledger** — `recordOptIn` / `getOptInProof` store legal
  proof-of-consent per list, kept separate from any authz store.
- **Idempotent** — re-suppressing / re-recording on its key tuple updates in
  place, so a replayed webhook never duplicates a row.
- **Typed, opaque proof** — `Suppression<TProof>` with an optional
  `proofValidator` narrows the stored evidence at the boundary.
- **Server-sourced time** — `createdAt`/`confirmedAt` are stamped from the
  server clock; a caller can never supply a timestamp.
- **Mount-safe** — correct under multiple named `app.use` mounts (e.g. marketing
  vs. transactional lists), each an isolated sandbox.

## Installation

```bash
pnpm add @vllnt/convex-suppression convex@^1.45.0
```

Peer dependency: `convex@^1.45.0`. This README follows `main`; the `canary`
dist-tag carries pre-release builds (pin an exact canary version for
reproducible installs).

## Quick start

After mounting, run `pnpm exec convex dev` to generate `components.suppression`.
These internal functions accept a contact hash from trusted server code. The
host must normalize and hash contacts consistently, authenticate webhooks, and
verify opt-in before calling them.

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
import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { Suppression } from "@vllnt/convex-suppression";

const dnc = new Suppression<{ ip: string }>(components.suppression, {
  proofValidator: (value) => {
    if (
      typeof value !== "object" ||
      value === null ||
      !("ip" in value) ||
      typeof value.ip !== "string"
    ) {
      throw new Error("Expected an ip string");
    }
    return { ip: value.ip };
  },
});

// The send gate — call before every send.
export const canEmail = internalQuery({
  args: { contactHash: v.string() },
  handler: (ctx, { contactHash }) =>
    dnc.isEligible(ctx, contactHash, {
      channel: "email",
      listKey: "newsletter",
      requireOptIn: true,
    }),
});

// A provider webhook suppresses on complaint; a confirmed double opt-in records proof.
export const onComplaint = internalMutation({
  args: { contactHash: v.string() },
  handler: (ctx, { contactHash }) =>
    dnc.suppress(ctx, contactHash, "complaint", { channel: "email" }),
});
export const confirmOptIn = internalMutation({
  args: { contactHash: v.string(), ip: v.string() },
  handler: (ctx, { contactHash, ip }) =>
    dnc.recordOptIn(ctx, contactHash, {
      listKey: "newsletter",
      source: "double-opt-in",
      proof: { ip },
    }),
});
```

Client options: `new Suppression(component, { proofValidator? })`. Omitting
`channel`/`listKey` targets the global entry.

## API Reference

| Method                                      | Kind     | Result                                                                                                        |
| ------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------- |
| `suppress(ctx, contactHash, reason, opts?)` | mutation | `null` (`reason`: `"unsubscribe" \| "bounce" \| "complaint" \| "manual" \| "global"`; `opts`: `{ channel? }`) |
| `unsuppress(ctx, contactHash, channel?)`    | mutation | `boolean` (`true` if an entry was removed)                                                                    |
| `recordOptIn(ctx, contactHash, opts)`       | mutation | `null` (`opts`: `{ listKey?; source; proof? }`)                                                               |
| `isSuppressed(ctx, contactHash, channel?)`  | query    | `SuppressionView \| null`                                                                                     |
| `getOptInProof(ctx, contactHash, listKey?)` | query    | `OptInProofView \| null`                                                                                      |
| `isEligible(ctx, contactHash, opts?)`       | query    | `boolean` (`opts`: `{ channel?; listKey?; requireOptIn? }`)                                                   |

Full reference: [docs/API.md](docs/API.md).

## Options and limitations

- The only constructor option is `proofValidator`, a parser
  `(unknown) => TProof`, not `v.*.parse`.
- A channel-specific check first checks the global `"*"` suppression. Omitting
  `channel` checks only the global row, not all channel rows. Always pass the
  send's channel.
- Opt-in uses an exact `listKey` match: global proof is not a fallback for a
  named list. `recordOptIn` does not remove suppression; `unsuppress` removes
  only the exact channel/global row.
- No TTL, pruning, or cron exists. Suppressions remain until `unsuppress`;
  opt-in proofs remain and are overwritten on re-recording, with no public
  delete method.
- Hashing is host-owned and does not make data automatically anonymous. Proof
  may contain personal data; minimize it and choose a compliant retention
  policy. This package is not a legal-compliance guarantee.
- Mount separately with `app.use(suppression, { name: "marketingDnc" })` and
  `new Suppression(components.marketingDnc)`.

## Integrations

Backend-only — no `./react` entry. The consumer surface is a server-side
`isEligible` gate and webhook-driven `suppress` writes; a reactive
do-not-contact badge, if ever needed, is an ordinary `useQuery` over the host's
re-exported `isSuppressed` ref.

## Security

- **Auth-agnostic** — the host authenticates the caller, decides who may
  suppress/query a hash, and passes an opaque `contactHash`; tables are
  sandboxed.
- **Hash-keyed, never raw PII** — the host hashes and normalizes the contact and
  owns the salt policy; a suppression survives erasure of the subject.
- **Server-sourced time** — `createdAt`/`confirmedAt` come from `Date.now()` in
  each handler, never the caller; the opt-in `proof` is opaque, narrowed by the
  host validator.

See [docs/API.md](docs/API.md).

## Testing

```bash
pnpm test           # single run
pnpm test:coverage  # enforced 100% on covered files
```

Tests run against the real component runtime via `convex-test`
(`@edge-runtime/vm`), not mocks.

## Documentation

`llms.txt` is the maintained discovery index. `pnpm generate:llms` checks its
heading and local links without generating a source bundle.

[API reference](docs/API.md) · [LLM index](llms.txt) ·
[Security policy](SECURITY.md)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Author

Built by [bntvllnt](https://github.com/bntvllnt) ·
[bntvllnt.com](https://bntvllnt.com) · [X @bntvllnt](https://x.com/bntvllnt)

Part of the [@vllnt](https://github.com/vllnt) Convex component fleet —
[vllnt.com](https://vllnt.com)

If this is useful, [sponsor the work](https://github.com/sponsors/bntvllnt).

## License

MIT — see [LICENSE](LICENSE).
