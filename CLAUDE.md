<!-- convex-ai-start -->
This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read `example/convex/_generated/ai/guidelines.md` first** for
important guidelines on how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running `npx convex ai-files install`.
<!-- convex-ai-end -->

# @vllnt/convex-suppression

The do-not-contact suppression list + opt-in proof (GDPR opt-out / CAN-SPAM), as a Convex component.
The host hashes a contact and passes the opaque `contactHash`; the component stores a
`(contactHash, channel)` anti-membership tombstone that says "never contact this hash" and survives
erasure of the subject. A sender calls `isEligible` before every send; an unsubscribe / bounce /
complaint calls `suppress`; a double-opt-in confirmation calls `recordOptIn`. It follows the vllnt
Component Standard (see the `convex-components` hub `.claude/rules/component-standard.md`).

## Architecture

```
src/
├── shared.ts              # constants: component name, reasons, global-channel sentinel
├── test.ts                # convex-test register() helper
├── client/
│   ├── index.ts           # Suppression<TProof> class (consumer-facing API)
│   └── types.ts           # public TypeScript interfaces
└── component/
    ├── schema.ts           # sandboxed tables: suppressions {contactHash, channel, reason, createdAt}, optInProofs {contactHash, listKey, source, proof?, confirmedAt}
    ├── convex.config.ts    # defineComponent("suppression")
    ├── mutations.ts        # suppress, unsuppress, recordOptIn
    ├── queries.ts          # isSuppressed, getOptInProof, isEligible
    └── validators.ts       # shared validators (suppressionReason, suppressionView, optInProofView, jsonValue)
```

Sandboxed tables: `suppressions` — indexed `by_hash` (every entry for a hash) and `by_hash_channel`
(the exact-channel + global lookups a check makes); `optInProofs` — indexed `by_hash_list`. No host
tables are touched. The host hashes the raw contact and keeps the raw ↔ hash mapping; the component
only ever holds the opaque hash, so a suppression survives erasure. The stored opt-in `proof` is opaque
to the component; the host narrows it via `proofValidator` at the client boundary.

## Ownership boundary

**Component owns:**

- The do-not-contact list (`suppressions` table) — suppress, unsuppress, check
- The opt-in proof ledger (`optInProofs` table) — record, fetch
- The eligibility gate (`isEligible`) — `¬suppressed [∧ confirmed]`
- Server-sourced time — `Date.now()` inside every handler stamps `createdAt`/`confirmedAt`; no caller clock
- Idempotency of `(contactHash, channel)` and `(contactHash, listKey)` (re-suppress / re-opt-in update in place)
- The channel-aware semantics: a global (`*`) entry matches every channel; a channel entry matches only itself

**Host owns:**

- The raw contact (email / phone / token) and the hashing — `hash(normalize(contact))`, the salt policy, the raw ↔ hash mapping
- Auth and authorization — whether a caller may suppress, unsuppress, or query a given hash
- The meaning of `channel` (`"email"`/`"sms"`/`"push"`/…) and `listKey` (which list/purpose)
- The opt-in `proof` evidence type (`TProof`) — opaque to the component, narrowed by a host validator
- Confirming the opt-in (double-opt-in token, checkbox, import) before calling `recordOptIn`
- Acting on the gate — the component answers `isEligible`; the host decides to send

**Auth:** the component is completely auth-agnostic. The host resolves identity, decides access, and
passes an opaque `contactHash`. There is no built-in scope dimension — the host namespaces hashes
itself (or uses `listKey`), or mounts a second instance (`app.use(component, { name })`) for a static
partition (e.g. a separate marketing vs. transactional do-not-contact list).

## Key design decisions

- **Hash-keyed, never raw PII (the GDPR crux):** the component stores only the host's opaque
  `contactHash`, never a raw email/phone. Erasure removes the subject's data from the host, but the
  "do not contact" tombstone remains keyed by the hash — honoring both erasure AND the do-not-contact
  obligation. The host owns `hash(normalize(contact))` and the salt policy; the component never
  re-identifies.

- **Suppression is an anti-membership, not a list edge:** an entry has no member and no resource — it
  is a `(contactHash, channel)` tombstone. A subscriber *list* (who is on `<list>`) is a flat
  `@vllnt/convex-memberships` edge or host data and is explicitly NOT modeled here. This is the residue
  that is not a membership: it must persist after the subject is deleted and every subscription tuple
  is gone.

- **Channel-aware via a global sentinel:** a suppression with no channel is stored under the
  `GLOBAL_CHANNEL` sentinel (`"*"`) rather than `undefined`, so a channel-scoped check is two bounded
  equality reads on `by_hash_channel` (the global row, then the channel row) with no `undefined` index
  gap. A global tombstone wins and blocks every channel; a channel entry blocks only its channel.

- **`isEligible` is the single send gate:** `¬suppressed [∧ confirmed]`. Suppression always blocks; the
  opt-in requirement is per call (`requireOptIn`) — marketing mail sets it, a transactional send may
  not. One call answers "may I send to this hash on this channel for this list?".

- **Idempotent writes:** `suppress` and `recordOptIn` update in place on their key tuple rather than
  inserting a duplicate, so a replayed bounce/complaint/confirmation webhook (at-least-once delivery)
  can never fan the table out. `.unique()` on the key index is the structural guard.

- **Opt-in proof is legal evidence, not an authz relation:** `optInProofs` records proof-of-consent
  (source, opaque evidence, confirmation time) for a list — kept separate from any access/ReBAC store
  so marketing data never pollutes security-critical authz queries.

- **Typed-generic opaque proof, never `v.any()` dumped raw:** opt-in `proof` rides through the single
  documented `jsonValue` alias and is narrowed to `TProof` by a host parser at the client boundary on
  write and read — no unchecked cast.

- **Server-sourced time:** every handler stamps `createdAt`/`confirmedAt` from `Date.now()`; no API
  surface accepts a caller-supplied timestamp.

- **Backend-only (no `./react` entry):** the consumer surface is a server-side `isEligible` gate before
  a send and webhook-driven `suppress` writes — no user-facing management surface a hook would serve, and
  a secret-free reactive read is an ordinary `useQuery` over the host's re-exported `isSuppressed` ref.
  Explicit analysis decision (see README); re-run when a real management-surface consumer appears.

## Conventions

- Mutations in `mutations.ts`, queries in `queries.ts` (enforced by `@vllnt/eslint-config/convex`).
- Explicit `args` + `returns` on every Convex function.
- Host data via typed generics / host validators — never `v.any()` dumps; `jsonValue` is the documented
  last resort for the stored opaque opt-in `proof`.
- 100% test coverage is BLOCKING (`vitest.config.mts` thresholds: statements, branches, functions, lines).
- Runtime deps: only official `@convex-dev/*` + `@vllnt/*`.

## Docs sync

| Changed | Update in the same commit |
|---------|--------------------------|
| Public API (suppress/unsuppress/recordOptIn/isSuppressed/getOptInProof/isEligible signatures) | README API Reference table, `docs/API.md`, `llms.txt` context |
| Config options / defaults (proofValidator, reasons, channels) | README API Reference, `docs/API.md` constructor section |
| Schema / tables / indexes | README Architecture, `docs/API.md` |
| Error codes | `docs/API.md` → `## Error codes` table |
| `peerDependencies.convex` version | `llms.txt` context line (`convex@^X.Y.Z`), `docs/API.md` Compatibility line, README Installation peer note |
| Channel / reason semantics | `docs/API.md` mutation sections, Key design decisions above |

Grep old values before committing (e.g. after a `peerDependencies.convex` bump, `git grep "1.41.0"` → only the new range survives).
