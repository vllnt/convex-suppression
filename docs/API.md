# API Reference — @vllnt/convex-suppression

**Compatibility:** `convex@^1.45.0`. Backend-only; no `./react` entry.

## Entry points

| Entry point                                      | Exports                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@vllnt/convex-suppression`                      | [`Suppression`](#suppression) class; types [`SuppressionComponent`](#suppressioncomponent), [`SuppressionOptions`](#suppressionoptions), [`SuppressOptions`](#suppressoptions), [`RecordOptInOptions`](#recordoptinoptions), [`IsEligibleOptions`](#iseligibleoptions), [`SuppressionView`](#suppressionview), [`OptInProofView`](#optinproofview), [`SuppressionReason`](#suppressionreason), [`Parser`](#parser) |
| `@vllnt/convex-suppression/convex.config`        | [default export](#convexconfig): the component definition for `app.use(...)` (also `./convex.config.js`)                                                                                                                                                                                                                                                                                                           |
| `@vllnt/convex-suppression/test`                 | [`register`](#register) for `convex-test` (TypeScript source)                                                                                                                                                                                                                                                                                                                                                      |
| `@vllnt/convex-suppression/_generated/component` | type-only [`ComponentApi`](#componentapi) from Convex codegen (also `./_generated/component.js`)                                                                                                                                                                                                                                                                                                                   |

`src/shared.ts` (`GLOBAL_CHANNEL`, `SUPPRESSION_REASONS`, `COMPONENT_NAME`) is
internal: it ships as source but is not in the package `exports` map.

## Client

### `Suppression`

```ts
// convex/dnc.ts
import { Suppression } from "@vllnt/convex-suppression";

import { components } from "./_generated/api";

export const dnc = new Suppression<{ ip: string }>(components.suppression, {
  proofValidator: (value) => {
    if (
      typeof value !== "object" ||
      value === null ||
      !("ip" in value) ||
      typeof value.ip !== "string"
    ) {
      throw new Error("Expected { ip: string }");
    }
    return { ip: value.ip };
  },
});
```

`new Suppression<TProof = unknown>(component, options?)`.

- `component`: the mounted component, `components.suppression` (or the name you
  gave `app.use`). Typed [`SuppressionComponent`](#suppressioncomponent).
- `options`: [`SuppressionOptions<TProof>`](#suppressionoptions), default `{}`.
  The only option is `proofValidator`.

`TProof` is the type of the opt-in `proof` your app stores. Every method takes
the host `ctx` first and the host's opaque `contactHash` second. The host
computes `contactHash` (for example an HMAC of the normalized email), keeps the
raw contact ↔ hash mapping, and owns the secret. The component never sees a raw
email or phone number, so an entry survives erasure of the person's data.

**Global entries.** Omitting `channel` targets the global (all-channel) entry;
omitting `listKey` targets the global opt-in. Both are stored under the `"*"`
sentinel, so passing `"*"` explicitly targets the global entry too. A channel
check also reads the global entry. A list check is exact: a global opt-in is not
a fallback for a named list.

**Time is server-sourced.** Each handler stamps `createdAt` / `confirmedAt` with
`Date.now()`; no method accepts a timestamp.

**Proof validation.** When `proofValidator` is set, the client runs it over the
`proof` passed to `recordOptIn` (before the write, and the return value is what
is stored) and over the `proof` returned by `getOptInProof`. It is skipped when
`proof` is `undefined`. It must return the typed value or throw; the thrown
error reaches your caller unchanged. `recordOptIn` is not an `async` function,
so its parser error is thrown synchronously by the call, before a promise
exists: `await` or a try/catch around the call catches it, a `.catch()` on the
result does not. `getOptInProof` rejects its promise instead. Without it, `proof` is passed through
unchecked. `isEligible` never runs it.

### `suppress`

`suppress(ctx, contactHash, reason, opts?) → Promise<null>`

- `ctx`: anything with `runMutation` (a mutation or action context).
- `reason`: [`SuppressionReason`](#suppressionreason). Recorded for audit; it
  never changes the effect. `"global"` does not make the entry global.
- `opts`: [`SuppressOptions`](#suppressoptions), default `{}`. `opts.channel`
  scopes the entry to one channel; omit it for a global entry.

Adds `(contactHash, channel)` to the do-not-contact list and stamps `createdAt`.

**Idempotent** on `(contactHash, channel)`: suppressing an existing entry
replaces its `reason` and refreshes `createdAt` instead of inserting a second
row, so a replayed bounce or complaint webhook never adds rows.

Throws `INVALID_ARGUMENT` with `field` `contactHash` or `channel` when that
value is `""`.

### `unsuppress`

`unsuppress(ctx, contactHash, channel?) → Promise<boolean>`

Removes the exact `(contactHash, channel)` entry. Omit `channel` to remove the
global entry. Removing the global entry leaves channel entries, and removing a
channel entry leaves the global one. Returns `true` if an entry was removed and
`false` if none matched (including an empty `contactHash`); it never throws
`INVALID_ARGUMENT`. Opt-in proofs are not touched.

### `isSuppressed`

`isSuppressed(ctx, contactHash, channel?) → Promise<SuppressionView | null>`

- `ctx`: anything with `runQuery` (a query, mutation or action context).

Returns the entry that blocks `(contactHash, channel)`, or `null`. With a
`channel`, it reads the global entry first and returns it if present, then the
channel entry. Without `channel`, it reads only the global entry. Returns
[`SuppressionView`](#suppressionview); `channel` is `null` for the global entry.
An empty `contactHash` returns `null`. An empty `channel` checks only the
global entry: it returns that entry if one exists, otherwise `null`. Use
[`isEligible`](#iseligible), which returns `false` for either and so fails
closed, as the send gate.

### `recordOptIn`

`recordOptIn(ctx, contactHash, opts) → Promise<null>`

- `opts`: [`RecordOptInOptions<TProof>`](#recordoptinoptions). `opts.listKey`
  scopes the proof to one list (omit it for a global opt-in); `opts.source` says
  how the opt-in was captured (`"double-opt-in"`, `"checkbox"`, …); `opts.proof`
  is your evidence, checked by `proofValidator`.

Stores the opt-in proof for `(contactHash, listKey)` and stamps `confirmedAt`.

**Idempotent** on `(contactHash, listKey)`: recording again replaces `source`,
`proof` and `confirmedAt` instead of inserting a second row. This keeps only the
latest proof, not a history. Recording again without `proof` removes the stored
proof. It does not remove any suppression.

`proof` is stored as any Convex value (`v.any()` in the component), so it must
be a Convex-serializable value and counts toward the 1 MiB document limit.

Throws `INVALID_ARGUMENT` with `field` `contactHash`, `listKey` or `source` when
that value is `""`.

### `getOptInProof`

`getOptInProof(ctx, contactHash, listKey?) → Promise<OptInProofView<TProof> | null>`

Returns the proof stored for the exact `(contactHash, listKey)`, or `null`. Omit
`listKey` for the global opt-in. `proof` is run through `proofValidator` when
both are set, so a stored value that the current parser rejects makes this call
throw the parser's error.

### `isEligible`

`isEligible(ctx, contactHash, opts?) → Promise<boolean>`

- `opts`: [`IsEligibleOptions`](#iseligibleoptions), default `{}`. Defaults:
  global channel, global list, `requireOptIn: false`.

The send gate (`¬suppressed [∧ opted in]`). Returns `true` when the contact is
not suppressed on `opts.channel` (the global entry or the channel entry) and,
only when `opts.requireOptIn` is `true`, a proof exists for the exact
`opts.listKey`. Suppression always blocks. Returns `false` for an empty
`contactHash` or `channel` instead of throwing, so a missing value fails closed.
Omitting `opts.channel` checks only the global entry; pass the channel you send
on.

## Types

### `SuppressionComponent`

The type of `components.suppression` that the client accepts: function
references `mutations.suppress`, `mutations.unsuppress`,
`mutations.recordOptIn`, `queries.isSuppressed`, `queries.getOptInProof`,
`queries.isEligible`. The generated [`ComponentApi`](#componentapi) is
assignable to it. The client always sends `channel` and `listKey` (the `"*"`
sentinel when omitted) and `requireOptIn` (default `false`).

### `SuppressionOptions`

`{ proofValidator?: Parser<TProof> }`. See [proof validation](#suppression).

### `SuppressOptions`

`{ channel?: string }`. Omit `channel` for a global entry.

### `RecordOptInOptions`

`{ listKey?: string; source: string; proof?: TProof }`. Omit `listKey` for a
global opt-in; `source` must not be `""`.

### `IsEligibleOptions`

`{ channel?: string; listKey?: string; requireOptIn?: boolean }`. `listKey` is
used only when `requireOptIn` is `true`.

### `SuppressionView`

`{ contactHash: string; channel: string | null; reason: SuppressionReason; createdAt: number }`.
`channel` is `null` for the global entry. `createdAt` is milliseconds since the
epoch, refreshed on every `suppress` of the same entry.

### `OptInProofView`

`{ contactHash: string; listKey: string | null; source: string; proof?: TProof; confirmedAt: number }`.
`listKey` is `null` for the global opt-in. `proof` is `undefined` when none was
stored. `confirmedAt` is milliseconds since the epoch.

### `SuppressionReason`

`"unsubscribe" | "bounce" | "complaint" | "manual" | "global"`. Any other string
is rejected by Convex argument validation. The reason is for audit only.

### `Parser`

`(value: unknown) => T`. Receives the opaque value and must return `T` or throw.
A Zod schema's `.parse` fits; `convex/values` validators have no `.parse`, so
they do not.

## Other entry points

### `convex.config`

The default export of `@vllnt/convex-suppression/convex.config` (or
`./convex.config.js`) is the component definition, named `suppression`. Pass it
to `app.use(suppression)` in `convex/convex.config.ts`. Mount it more than once
with `app.use(suppression, { name: "marketingDnc" })`; each mount has its own
tables and is reached through `components.<name>`.

### `register`

`register(t, name = "suppression") → void`, from
`@vllnt/convex-suppression/test`. Registers the component with a `convex-test`
instance built from your own schema (`convexTest(schema, modules)`). Pass the
mount name when you used `app.use(suppression, { name })`. The entry is
TypeScript source and needs `convex-test`, `vitest`, `vite` (for
`import.meta.glob` and `vite/client` types) and `@edge-runtime/vm`.

### `ComponentApi`

Type-only, from `@vllnt/convex-suppression/_generated/component` (or
`./_generated/component.js`). The Convex-generated type of the mounted
component, as used by the host's generated `components.suppression`.

## Error codes

The component throws one coded error, a `ConvexError` with `data` of the form
`{ code, field }`:

| Code               | Thrown by                 | When                                                                                                                        |
| ------------------ | ------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `INVALID_ARGUMENT` | `suppress`, `recordOptIn` | `field` is the empty string: `contactHash` or `channel` (`suppress`); `contactHash`, `listKey` or `source` (`recordOptIn`). |

Other failures are not component error codes:

- An argument of the wrong type, or a `reason` outside
  [`SuppressionReason`](#suppressionreason), fails Convex argument validation
  before the handler runs.
- A `proof` rejected by `proofValidator` throws your parser's own error, in the
  client: synchronously from the `recordOptIn` call (nothing is written), or as
  a rejected promise from `getOptInProof`.

Everything else is total: a missing entry or proof is `null` or `false`,
`unsuppress` of an unknown entry returns `false`, and a repeated `suppress` or
`recordOptIn` updates in place. `isEligible` returns `false` for an empty
`contactHash` or `channel`; `isSuppressed` returns `null` for an empty
`contactHash` and checks only the global entry for an empty `channel`;
`getOptInProof` returns `null` for an empty key. None of them throws
`INVALID_ARGUMENT`.

## Key matching

`contactHash`, `channel` and `listKey` are matched exactly (case- and
whitespace-sensitive). The component does no normalization, trimming or
plus-address folding. Normalize and hash contacts the same way everywhere, and
use one spelling per channel and list (always `"email"`, never `"Email"`).

## Tables and indexes

Both tables live in the component's sandbox; no host table is read or written.

| Table          | Fields                                                                       | Index                                         |
| -------------- | ---------------------------------------------------------------------------- | --------------------------------------------- |
| `suppressions` | `contactHash`, `channel` (`"*"` = global), `reason`, `createdAt`             | `by_hash_channel` on `[contactHash, channel]` |
| `optInProofs`  | `contactHash`, `listKey` (`"*"` = global), `source`, `proof?`, `confirmedAt` | `by_hash_list` on `[contactHash, listKey]`    |

A check reads at most three rows: the global entry, the channel entry and, with
`requireOptIn`, the proof.

## Cron / Maintenance

None. Entries and proofs have no expiry, TTL or retention sweep. `unsuppress`
deletes one exact entry and never its opt-in proof. Proofs stay until replaced
by `recordOptIn`; there is no method to list or export entries or to delete a
proof. Hashes and proof can still be personal data: your app owns the legal
basis, data minimization, retention and the check that consent is real.
