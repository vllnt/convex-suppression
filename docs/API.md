# API Reference — @vllnt/convex-suppression

**Compatibility:** `convex@^1.41.0`

Construct the client with the mounted component and an optional host proof validator:

```ts
import { Suppression } from "@vllnt/convex-suppression";
import { v } from "convex/values";

const dnc = new Suppression<MyProof>(components.suppression, {
  proofValidator: v.object({ ip: v.string() }).parse, // narrow stored opt-in proof
});
```

`Suppression<TProof = unknown>` is generic over the host's opaque opt-in `proof`
type. All methods take the host `ctx` (a query or mutation context) as the first
argument and the host's opaque `contactHash` (`hash(normalize(contact))`) as the
second — the component never sees a raw email/phone.

**Hash-keyed.** The host hashes and normalizes the contact, owns the salt policy,
and keeps the raw ↔ hash mapping. A suppression survives erasure of the subject
because it is keyed only by the hash.

**Channel & list defaults.** Omitting `channel` targets a global (all-channel)
suppression; omitting `listKey` targets a global opt-in. Internally these map to a
`"*"` sentinel so a channel/list check is a bounded equality index read.

**Time is server-sourced.** Every handler stamps `createdAt`/`confirmedAt` from
`Date.now()` itself; no method accepts a caller-supplied clock.

**Validation.** When `proofValidator` is set it runs at the client boundary: over
the `proof` written by `recordOptIn` (before storage) and over the `proof` returned
by `getOptInProof` (on read). It must return the typed value or throw. Omit it to
leave the opaque evidence unvalidated.

## Mutations

### `suppress(ctx, contactHash, reason, opts?) → null`

`reason` is `"unsubscribe" | "bounce" | "complaint" | "manual" | "global"`. `opts`:
`{ channel?: string }`.

Add `(contactHash, channel)` to the do-not-contact list. `opts.channel` scopes the
suppression to one channel (`"email"`/`"sms"`/…); omit it for a global all-channel
suppression. `reason` is recorded for audit and never changes the effect (a
suppressed hash is suppressed regardless of why). `createdAt` is server-stamped.

**Idempotent** on `(contactHash, channel)`: re-suppressing an existing entry updates
its `reason` and refreshes `createdAt` rather than inserting a duplicate, so a
replayed bounce/complaint webhook can never fan the table out.

### `unsuppress(ctx, contactHash, channel?) → boolean`

Remove `(contactHash, channel)` from the do-not-contact list — a rare, audited
re-subscribe. Omit `channel` to clear the global entry; clearing a global row does
not clear per-channel rows and vice versa. Returns `true` if an entry was removed,
`false` if none matched (a no-op unsuppress is not an error).

### `recordOptIn(ctx, contactHash, opts) → null`

`opts`: `{ listKey?: string; source: string; proof?: TProof }`.

Record an opt-in proof for `(contactHash, listKey)` — the legal evidence of a
confirmed opt-in for one list/purpose. `opts.listKey` scopes the proof to one list;
omit it for a global opt-in. `opts.source` tags how it was captured
(`"double-opt-in"`, `"checkbox"`, …); `opts.proof` is opaque host evidence validated
against `proofValidator` before storage. `confirmedAt` is server-stamped.

**Idempotent** on `(contactHash, listKey)`: a second confirmation updates `source`,
`proof`, and `confirmedAt` rather than inserting a duplicate.

## Queries

### `isSuppressed(ctx, contactHash, channel?) → SuppressionView | null`

The matching suppression for `(contactHash, channel)`, or `null` if the contact is
not suppressed on that channel. A `channel` argument matches a global (all-channel)
suppression OR a channel-specific one — a global tombstone wins. Omit `channel` to
check the global entry only. `SuppressionView` is
`{ contactHash, channel, reason, createdAt }`; `channel` is `null` for a global
entry.

### `getOptInProof(ctx, contactHash, listKey?) → OptInProofView | null`

The opt-in proof for `(contactHash, listKey)`, or `null` if none is recorded. Omit
`listKey` for a global opt-in. `OptInProofView` is
`{ contactHash, listKey, source, proof?, confirmedAt }`; `listKey` is `null` for a
global opt-in and `proof` is narrowed by the host validator when set.

### `isEligible(ctx, contactHash, opts?) → boolean`

`opts`: `{ channel?: string; listKey?: string; requireOptIn?: boolean }` (defaults:
global channel/list, `requireOptIn = false`).

The send gate. Returns `true` when the contact may be contacted: NOT suppressed on
`opts.channel` (global or channel-specific) AND — when `opts.requireOptIn` is set —
holding a recorded opt-in proof for `opts.listKey`. Suppression always blocks; the
opt-in requirement is per call. This is the single call a sender makes before every
send (`¬suppressed [∧ confirmed]`).

## Error codes

This component does not throw coded `ConvexError`s. Every operation is total: a
missing suppression / opt-in is a `null` or `false` return, an unsuppress of an
unknown address is a no-op `false`, and a re-suppress / re-opt-in is an idempotent
update rather than a conflict. Invalid `reason` values are rejected by the `args`
validator before the handler runs; an opt-in `proof` failing the host
`proofValidator` throws the host's own error at the client boundary, never a
component error code.

## Cron / Maintenance

None. Suppressions and opt-in proofs are durable do-not-contact / legal records
that must persist (a tombstone survives erasure of the subject), so the component
registers no retention sweep or cron. A host with its own retention policy for an
unsuppressed re-subscribe deletes via `unsuppress`.
