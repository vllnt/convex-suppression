# @vllnt/convex-suppression

TypeScript Convex component for a do-not-contact suppression list (GDPR, CAN-SPAM): unsubscribes, bounces and complaints by contact hash, plus opt-in proof.

## For coding agents

Docs for the installed version are in `node_modules/@vllnt/convex-suppression/`:
`docs/API.md`, `llms.txt`, `CHANGELOG.md` and the TypeScript `src/`. Read them
before writing code against this package.

## When to use

- Use it when every email, SMS or push send must first check that the contact
  did not unsubscribe, bounce or complain.
- Use it when the do-not-contact entry must outlive erasure of the person's
  data: the component stores only a hash you compute.
- Use it when a marketing send must also find a recorded opt-in proof for the
  list.
- Do not use it when you need consent to processing per purpose, with withdrawal
  and full history: use
  [`@vllnt/convex-consent`](https://oss.vllnt.com/packages/convex-consent).
- Do not use it when you need to know who is on a subscriber list: use
  [`@vllnt/convex-memberships`](https://oss.vllnt.com/packages/convex-memberships).
- Do not use it when you need to queue and send the email: use
  [`@vllnt/convex-email`](https://oss.vllnt.com/packages/convex-email), and call
  `isEligible` here first.

## Install

```bash
pnpm add @vllnt/convex-suppression
```

## Quick start

```ts
// convex/convex.config.ts
import suppression from "@vllnt/convex-suppression/convex.config";
import { defineApp } from "convex/server";

const app = defineApp();
app.use(suppression);
export default app;
```

```ts
// convex/email.ts
import { Suppression } from "@vllnt/convex-suppression";
import { v } from "convex/values";

import { components } from "./_generated/api";
import { internalMutation, internalQuery } from "./_generated/server";

const dnc = new Suppression(components.suppression);

// The send gate: call it before every newsletter email.
export const canEmail = internalQuery({
  args: { contactHash: v.string() },
  returns: v.boolean(),
  handler: (ctx, { contactHash }) =>
    dnc.isEligible(ctx, contactHash, {
      channel: "email",
      listKey: "newsletter",
      requireOptIn: true,
    }),
});

// Your provider's complaint webhook, after you verify it.
export const onComplaint = internalMutation({
  args: { contactHash: v.string() },
  returns: v.null(),
  handler: (ctx, { contactHash }) =>
    dnc.suppress(ctx, contactHash, "complaint", { channel: "email" }),
});

// Your double opt-in confirmation link, after you check its token.
export const confirmOptIn = internalMutation({
  args: { contactHash: v.string() },
  returns: v.null(),
  handler: (ctx, { contactHash }) =>
    dnc.recordOptIn(ctx, contactHash, {
      listKey: "newsletter",
      source: "double-opt-in",
    }),
});
```

Run `npx convex dev` once to generate `components.suppression`. The component
never reads auth and never sees a raw email or phone number: your code
normalizes and hashes the contact (see [Common tasks](#common-tasks)), checks
who may call, and passes the opaque `contactHash`.

## API

Full reference: [docs/API.md](docs/API.md).

| Export                                                                   | Import from                                      | What it does                                                                        |
| ------------------------------------------------------------------------ | ------------------------------------------------ | ----------------------------------------------------------------------------------- |
| [`Suppression`](docs/API.md#suppression)                                 | `@vllnt/convex-suppression`                      | Host client: `new Suppression<TProof>(components.suppression, { proofValidator? })` |
| [`suppress(ctx, contactHash, reason, opts?)`](docs/API.md#suppress)      | `Suppression` method, mutation                   | Add `(contactHash, channel)` to the list; returns `null`                            |
| [`unsuppress(ctx, contactHash, channel?)`](docs/API.md#unsuppress)       | `Suppression` method, mutation                   | Remove that exact entry; returns `true` if one was removed                          |
| [`isSuppressed(ctx, contactHash, channel?)`](docs/API.md#issuppressed)   | `Suppression` method, query                      | The matching entry (global first) or `null`                                         |
| [`recordOptIn(ctx, contactHash, opts)`](docs/API.md#recordoptin)         | `Suppression` method, mutation                   | Store the latest opt-in proof for `(contactHash, listKey)`; returns `null`          |
| [`getOptInProof(ctx, contactHash, listKey?)`](docs/API.md#getoptinproof) | `Suppression` method, query                      | The stored opt-in proof or `null`                                                   |
| [`isEligible(ctx, contactHash, opts?)`](docs/API.md#iseligible)          | `Suppression` method, query                      | Send gate: not suppressed, and opted in when `requireOptIn`; returns `boolean`      |
| [`SuppressionComponent`](docs/API.md#suppressioncomponent)               | `@vllnt/convex-suppression` (type)               | Type of `components.suppression` the client accepts                                 |
| [`SuppressionOptions`](docs/API.md#suppressionoptions)                   | `@vllnt/convex-suppression` (type)               | `{ proofValidator? }`                                                               |
| [`SuppressOptions`](docs/API.md#suppressoptions)                         | `@vllnt/convex-suppression` (type)               | `{ channel? }`                                                                      |
| [`RecordOptInOptions`](docs/API.md#recordoptinoptions)                   | `@vllnt/convex-suppression` (type)               | `{ listKey?, source, proof? }`                                                      |
| [`IsEligibleOptions`](docs/API.md#iseligibleoptions)                     | `@vllnt/convex-suppression` (type)               | `{ channel?, listKey?, requireOptIn? }`                                             |
| [`SuppressionView`](docs/API.md#suppressionview)                         | `@vllnt/convex-suppression` (type)               | Result of `isSuppressed`                                                            |
| [`OptInProofView`](docs/API.md#optinproofview)                           | `@vllnt/convex-suppression` (type)               | Result of `getOptInProof`                                                           |
| [`SuppressionReason`](docs/API.md#suppressionreason)                     | `@vllnt/convex-suppression` (type)               | `"unsubscribe" \| "bounce" \| "complaint" \| "manual" \| "global"`                  |
| [`Parser`](docs/API.md#parser)                                           | `@vllnt/convex-suppression` (type)               | `(value: unknown) => T`, the `proofValidator` shape                                 |
| [`default` (component config)](docs/API.md#convexconfig)                 | `@vllnt/convex-suppression/convex.config`        | Pass to `app.use(...)`                                                              |
| [`register`](docs/API.md#register)                                       | `@vllnt/convex-suppression/test`                 | Mount the component in `convex-test`                                                |
| [`ComponentApi`](docs/API.md#componentapi)                               | `@vllnt/convex-suppression/_generated/component` | Generated type of the mounted component                                             |

`GLOBAL_CHANNEL` (`"*"`) and the other constants in `src/shared.ts` are internal
and not importable.

## Common tasks

Gate a transactional email (no opt-in needed) and a marketing email (opt-in
needed) for the same contact. Always pass the channel you send on:

```ts
// convex/gates.ts
import { Suppression } from "@vllnt/convex-suppression";
import { v } from "convex/values";

import { components } from "./_generated/api";
import { internalQuery } from "./_generated/server";

const dnc = new Suppression(components.suppression);

export const canSendReceipt = internalQuery({
  args: { contactHash: v.string() },
  returns: v.boolean(),
  handler: (ctx, { contactHash }) =>
    dnc.isEligible(ctx, contactHash, { channel: "email" }),
});

export const canSendPromo = internalQuery({
  args: { contactHash: v.string() },
  returns: v.boolean(),
  handler: (ctx, { contactHash }) =>
    dnc.isEligible(ctx, contactHash, {
      channel: "email",
      listKey: "promotions",
      requireOptIn: true,
    }),
});
```

Suppress one channel, or every channel, and undo it later. A global entry is the
one with no channel; `unsuppress` removes only the exact entry you name:

```ts
// convex/lists.ts
import { Suppression } from "@vllnt/convex-suppression";
import { v } from "convex/values";

import { components } from "./_generated/api";
import { internalMutation } from "./_generated/server";

const dnc = new Suppression(components.suppression);

export const onBounce = internalMutation({
  args: { contactHash: v.string() },
  returns: v.null(),
  handler: (ctx, { contactHash }) =>
    dnc.suppress(ctx, contactHash, "bounce", { channel: "email" }),
});

export const blockEverywhere = internalMutation({
  args: { contactHash: v.string() },
  returns: v.null(),
  handler: (ctx, { contactHash }) => dnc.suppress(ctx, contactHash, "manual"),
});

export const resubscribeEmail = internalMutation({
  args: { contactHash: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { contactHash }) => {
    const removedEmail = await dnc.unsuppress(ctx, contactHash, "email");
    const removedGlobal = await dnc.unsuppress(ctx, contactHash);
    return removedEmail || removedGlobal;
  },
});
```

Store typed opt-in evidence. `proofValidator` checks `proof` before it is stored
and again when `getOptInProof` reads it; it must return the value or throw:

```ts
// convex/optIn.ts
import { Suppression } from "@vllnt/convex-suppression";
import { v } from "convex/values";

import { components } from "./_generated/api";
import { internalMutation, internalQuery } from "./_generated/server";

type Evidence = { ip: string };

const dnc = new Suppression<Evidence>(components.suppression, {
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

export const confirm = internalMutation({
  args: { contactHash: v.string(), ip: v.string() },
  returns: v.null(),
  handler: (ctx, { contactHash, ip }) =>
    dnc.recordOptIn(ctx, contactHash, {
      listKey: "newsletter",
      source: "double-opt-in",
      proof: { ip },
    }),
});

export const evidence = internalQuery({
  args: { contactHash: v.string() },
  returns: v.union(v.null(), v.string()),
  handler: async (ctx, { contactHash }) => {
    const proof = await dnc.getOptInProof(ctx, contactHash, "newsletter");
    return proof?.proof?.ip ?? null;
  },
});
```

Read why and when a contact was suppressed, for an audit or support screen:

```ts
// convex/audit.ts
import { Suppression } from "@vllnt/convex-suppression";
import { v } from "convex/values";

import { components } from "./_generated/api";
import { internalQuery } from "./_generated/server";

const dnc = new Suppression(components.suppression);

export const why = internalQuery({
  args: { contactHash: v.string(), channel: v.string() },
  returns: v.union(
    v.null(),
    v.object({ reason: v.string(), since: v.number() }),
  ),
  handler: async (ctx, { contactHash, channel }) => {
    const entry = await dnc.isSuppressed(ctx, contactHash, channel);
    return entry === null
      ? null
      : { reason: entry.reason, since: entry.createdAt };
  },
});
```

Keep separate lists, for example marketing and transactional. Each named mount
has its own tables:

```ts
// convex/convex.config.ts
import suppression from "@vllnt/convex-suppression/convex.config";
import { defineApp } from "convex/server";

const app = defineApp();
app.use(suppression, { name: "marketingDnc" });
app.use(suppression, { name: "transactionalDnc" });
export default app;
```

```ts
// convex/clients.ts
import { Suppression } from "@vllnt/convex-suppression";

import { components } from "./_generated/api";

export const marketing = new Suppression(components.marketingDnc);
export const transactional = new Suppression(components.transactionalDnc);
```

Hash a contact before you call the component. The package does not do this for
you. A keyed hash (HMAC) stops anyone who reads the table from hashing guessed
emails to find a match. Keep the secret on the server, for example in a Convex
environment variable:

```ts
// convex/contactHash.ts
/** HMAC-SHA-256 of the trimmed, lowercased email, as hex. */
export async function contactHash(
  email: string,
  secret: string,
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(email.trim().toLowerCase()),
  );
  return Array.from(new Uint8Array(signature), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
```

## Errors and fixes

The component throws one coded error: a `ConvexError` whose `data` is
`{ code, field }`. Catch it in the host with `error instanceof ConvexError` and
read `error.data.code` and `error.data.field`.

| Code or message                        | Thrown by                                                   | Cause                                                                                                                         | Fix                                                                                                      |
| -------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `INVALID_ARGUMENT`                     | `suppress`, `recordOptIn`                                   | `field` names the empty string: `contactHash` or `channel` (`suppress`); `contactHash`, `listKey` or `source` (`recordOptIn`) | Check the value before calling. Omit `channel` or `listKey` for the global entry instead of passing `""` |
| Convex argument validation error       | any method                                                  | An argument has the wrong type, or `reason` is not one of the five `SuppressionReason` values                                 | Pass a `SuppressionReason`; TypeScript catches this at compile time                                      |
| The error your `proofValidator` throws | `recordOptIn` (before the write), `getOptInProof` (on read) | Your parser rejected `proof`. From `recordOptIn` it is thrown synchronously by the call; `await` or a try/catch around the call catches it, a `.catch()` on the result does not | Fix the proof, or let the parser accept every shape you have stored before                               |

These never throw `INVALID_ARGUMENT`: `isEligible` returns `false` for an empty
`contactHash` or `channel`. `isSuppressed` returns `null` for an empty
`contactHash`; with an empty `channel` it checks only the global entry (it
returns that entry if one exists, otherwise `null`). `getOptInProof` returns
`null` for an empty key and `unsuppress` returns `false`. A missing entry is
`null` or `false`, never an error, and a repeated write updates in place.

## Limits and gotchas

- Omitting `channel` in `isEligible` or `isSuppressed` checks only the global
  entry, not the channel entries. Always pass the channel you send on.
- A channel check also matches the global entry, and the global entry wins:
  `isSuppressed` returns it first.
- Omitting `channel` (or passing `"*"`) makes an entry global; `reason:
  "global"` with another channel still blocks only that channel. `reason` never
  changes the effect.
- `"*"` is the stored value for "global". Passing `"*"` as a `channel` or
  `listKey` targets the global entry.
- `isEligible` checks opt-in only when `requireOptIn: true`; the default is
  `false`, and `listKey` is ignored without it.
- Opt-in `listKey` is matched exactly. A global opt-in (no `listKey`) does not
  satisfy a check for a named list.
- `recordOptIn` does not remove any suppression. `unsuppress` removes one exact
  entry: clearing the global entry leaves channel entries, and the reverse.
- One proof per `(contactHash, listKey)`, the latest. Recording again replaces
  `source`, `proof` and `confirmedAt`; recording again without `proof` removes
  the stored proof. There is no history.
- `proofValidator` runs only when `proof` is set, and its return value is what
  gets stored. `isEligible` does not run it.
- Keys are matched exactly, with no trimming, case folding or plus-address
  folding: `"Email"` is not `"email"`. Normalize contacts, channels and list
  keys the same way everywhere.
- Changing your normalization or hash secret changes every hash, so old entries
  stop matching. Keep the old secret, or re-suppress under the new hashes.
- An empty `contactHash` or `channel` makes `isEligible` return `false`. For
  `isSuppressed`, an empty `contactHash` returns `null` (not suppressed), and an
  empty `channel` checks only the global entry. Use `isEligible` as the gate.
- No expiry, TTL or cron. Entries stay until `unsuppress`; proofs stay until
  replaced. There is no method to list entries, export them or delete a proof.
- `proof` is stored as any Convex value (no functions or class instances) and
  counts toward Convex's 1 MiB document limit. Hashes and proof can still be
  personal data; store only what you need.
- Writes need a context with `runMutation` (a mutation or action); reads need
  `runQuery` (a query, mutation or action).
- This package is not a legal-compliance guarantee. Your app owns the legal
  basis, consent checks, retention and data minimization.

## Compatibility

- Peer dependency: `convex@^1.45.0`. CI runs the tests and the packed-package
  test on the locked convex version (1.51.0); 1.45.0 is not tested in CI.
- Node.js: `engines` says `>=18`, but convex needs Node.js 20 or later
  (1.45–1.48) and Node.js 22 or later (1.49 and newer). ES modules only.
- The component runs in the default Convex runtime; it needs no `"use node"`.
- `@vllnt/convex-suppression/test` is TypeScript source and needs `convex-test`,
  `vitest`, `vite` and `@edge-runtime/vm`, with the Vitest config shown under
  Testing.
- React: not applicable. The package is backend-only and has no `./react` entry;
  to show a status in the UI, call `isSuppressed` from your own query and read
  it with `useQuery`.

## Testing

Mount the component in your own `convex-test` suite with `register`. Use the
Vitest settings `convex-test` recommends (edge runtime, `convex-test` inlined):

```ts
// vitest.config.mts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "edge-runtime",
    server: { deps: { inline: ["convex-test"] } },
  },
});
```

This test uses the Quick start functions and your app's `convex/schema.ts`; if
you have none, `export default defineSchema({})` from `convex/server` is enough:

```ts
// convex/email.test.ts
/// <reference types="vite/client" />
import { register } from "@vllnt/convex-suppression/test";
import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { internal } from "./_generated/api";
import schema from "./schema";

test("a complaint blocks the newsletter", async () => {
  const t = convexTest(schema, import.meta.glob("./**/*.ts"));
  register(t);
  const contactHash = "hash-of-a-test-contact";
  const canEmail = () => t.query(internal.email.canEmail, { contactHash });

  expect(await canEmail()).toBe(false);
  await t.mutation(internal.email.confirmOptIn, { contactHash });
  expect(await canEmail()).toBe(true);
  await t.mutation(internal.email.onComplaint, { contactHash });
  expect(await canEmail()).toBe(false);
});
```

`register(t, name)` takes the mount name when you used
`app.use(suppression, { name })`; the default is `"suppression"`.

This repository's own tests run on the simulated `convex-test` runtime, not
mocks (`pnpm test:coverage`, 100% coverage enforced).

## Security

- The component does not authenticate. Your app decides who may suppress,
  unsuppress or read a hash. Keep these calls in internal functions, or check
  auth before them; never take a `contactHash` from an unauthenticated client.
- Its tables are sandboxed: they are reachable only through the component's
  functions, and the component reads no host table.
- Time is set by the server: `createdAt` and `confirmedAt` come from
  `Date.now()` inside each handler; no method accepts a timestamp.
- Verify provider webhooks before calling `suppress`, and verify the opt-in
  (token, checkbox) before calling `recordOptIn`.

Report vulnerabilities as described in
[SECURITY.md](https://github.com/vllnt/convex-suppression/blob/main/SECURITY.md).

## Related packages

None. This package has no dependency, shared test or example with another
package. For packages that solve nearby problems, see
[When to use](#when-to-use).

## Contributing

See
[CONTRIBUTING.md](https://github.com/vllnt/convex-suppression/blob/main/CONTRIBUTING.md).

## Links

- Docs and changelog: [oss.vllnt.com/packages/convex-suppression](https://oss.vllnt.com/packages/convex-suppression) · [release feed](https://oss.vllnt.com/packages/convex-suppression/rss.xml)
- All @vllnt packages: [oss.vllnt.com](https://oss.vllnt.com) · [search packages and docs on index.vllnt.com](https://index.vllnt.com)
- Source and issues: [GitHub](https://github.com/vllnt/convex-suppression) · [issues](https://github.com/vllnt/convex-suppression/issues) · [npm](https://www.npmjs.com/package/@vllnt/convex-suppression)
- Questions and updates: [Discord](https://bntvllnt.com/discord) · [X @bntvllnt](https://x.com/bntvllnt)
- Company and author: [vllnt.com](https://vllnt.com) · [bntvllnt.com](https://bntvllnt.com) · [GitHub @bntvllnt](https://github.com/bntvllnt) · [LinkedIn](https://linkedin.com/in/bntvllnt)
- Sponsor: [GitHub Sponsors](https://github.com/sponsors/bntvllnt)

## License

MIT. See [LICENSE](LICENSE).

[![npm version of @vllnt/convex-suppression](https://img.shields.io/npm/v/@vllnt/convex-suppression.svg)](https://www.npmjs.com/package/@vllnt/convex-suppression)
[![CI status](https://github.com/vllnt/convex-suppression/actions/workflows/ci.yml/badge.svg)](https://github.com/vllnt/convex-suppression/actions/workflows/ci.yml)

---

Part of [vllnt open source](https://oss.vllnt.com) · [Package page](https://oss.vllnt.com/packages/convex-suppression) · [vllnt.com](https://vllnt.com) · Built by [bntvllnt](https://bntvllnt.com)
