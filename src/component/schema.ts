import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { jsonValue, suppressionReason } from "./validators";

/**
 * Two sandboxed tables — the do-not-contact gate's own concern.
 *
 * `suppressions` is the anti-membership: a `(contactHash, channel)` tombstone that
 * says "never contact this hash on this channel". `contactHash` is the host's
 * opaque `hash(normalize(contact))` — the component never stores a raw email or
 * phone, so a suppression survives erasure of the underlying subject. `channel`
 * holds the host channel (`"email"`/`"sms"`/…) or the `GLOBAL_CHANNEL` sentinel
 * `"*"` for an all-channel suppression. `reason` is recorded for audit. Indexed
 * `by_hash_channel` (the exact-channel and global lookups an `isSuppressed` check
 * makes) and `by_hash` (every entry for a hash, for `unsuppress` and audit).
 *
 * `optInProofs` is the legal evidence (not an authz relation): a `(contactHash,
 * listKey)` record of a confirmed opt-in. `listKey` scopes it to one list/purpose
 * or holds `GLOBAL_CHANNEL` for a global opt-in; `source` tags the capture
 * channel; `proof` is opaque host evidence narrowed by a host validator. Indexed
 * `by_hash_list` (the exact lookup `getOptInProof`/`isEligible` make).
 */
export default defineSchema({
  suppressions: defineTable({
    contactHash: v.string(),
    channel: v.string(),
    reason: suppressionReason,
    createdAt: v.number(),
  })
    .index("by_hash", ["contactHash"])
    .index("by_hash_channel", ["contactHash", "channel"]),

  optInProofs: defineTable({
    contactHash: v.string(),
    listKey: v.string(),
    source: v.string(),
    proof: v.optional(jsonValue),
    confirmedAt: v.number(),
  }).index("by_hash_list", ["contactHash", "listKey"]),
});
