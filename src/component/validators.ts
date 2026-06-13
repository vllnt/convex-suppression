import { v } from "convex/values";

/**
 * Opaque host-owned legal evidence attached to an opt-in proof — e.g. the IP,
 * user-agent, double-opt-in token ref, or form snapshot the host captured at
 * confirmation. The component never inspects it; it is last-resort arbitrary data,
 * aliased here rather than left bare in function signatures. The host narrows it at
 * the {@link Suppression} client boundary via an optional `proofValidator` parser.
 *
 * This is the single documented `v.any()` escape hatch in the component; the lint
 * rule `convex-rules/no-bare-v-any` is satisfied by routing the arbitrary host
 * payload through this alias instead of a bare `v.any()`.
 */
export const jsonValue = v.any();

/** The five standard reasons a `(contactHash, channel)` is suppressed. */
export const suppressionReason = v.union(
  v.literal("unsubscribe"),
  v.literal("bounce"),
  v.literal("complaint"),
  v.literal("manual"),
  v.literal("global"),
);

/**
 * Public projection of a suppression returned by {@link isSuppressed}. `channel`
 * is the host-supplied channel the entry applies to, or `null` for a global
 * (all-channel) tombstone. `contactHash` is the host's opaque contact hash — never
 * a raw email/phone.
 */
export const suppressionView = v.object({
  contactHash: v.string(),
  channel: v.union(v.string(), v.null()),
  reason: suppressionReason,
  createdAt: v.number(),
});

/**
 * Public projection of an opt-in proof returned by {@link getOptInProof}.
 * `listKey` scopes the proof to one list/purpose, or `null` for a global opt-in.
 * `source` tags how the opt-in was captured; `proof` is opaque host evidence.
 */
export const optInProofView = v.object({
  contactHash: v.string(),
  listKey: v.union(v.string(), v.null()),
  source: v.string(),
  proof: v.optional(jsonValue),
  confirmedAt: v.number(),
});
