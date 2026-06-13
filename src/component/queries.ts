import { v } from "convex/values";
import { query } from "./_generated/server";
import { GLOBAL_CHANNEL } from "../shared";
import { optInProofView, suppressionView } from "./validators";
import type { Doc } from "./_generated/dataModel";

/** Project a stored suppression row to its public view (drops internal fields). */
function view(row: Doc<"suppressions">) {
  return {
    contactHash: row.contactHash,
    channel: row.channel === GLOBAL_CHANNEL ? null : row.channel,
    reason: row.reason,
    createdAt: row.createdAt,
  };
}

/**
 * The matching suppression for `(contactHash, channel)`, or `null` if the contact
 * is not suppressed on that channel. A `channel` argument matches a global
 * (all-channel) suppression OR a channel-specific one — a global tombstone wins
 * and is returned first. Omit `channel` (the sentinel) to check the global entry
 * only. Two bounded equality reads on `by_hash_channel`; never spans contacts.
 */
export const isSuppressed = query({
  args: { contactHash: v.string(), channel: v.string() },
  returns: v.union(v.null(), suppressionView),
  handler: async (ctx, args) => {
    const globalRow = await ctx.db
      .query("suppressions")
      .withIndex("by_hash_channel", (q) =>
        q.eq("contactHash", args.contactHash).eq("channel", GLOBAL_CHANNEL),
      )
      .unique();
    if (globalRow !== null) {
      return view(globalRow);
    }
    if (args.channel === GLOBAL_CHANNEL) {
      return null;
    }
    const channelRow = await ctx.db
      .query("suppressions")
      .withIndex("by_hash_channel", (q) =>
        q.eq("contactHash", args.contactHash).eq("channel", args.channel),
      )
      .unique();
    return channelRow === null ? null : view(channelRow);
  },
});

/**
 * The opt-in proof for `(contactHash, listKey)`, or `null` if none is recorded.
 * `listKey` holds the global sentinel to fetch a global opt-in. `proof` is the
 * opaque host evidence, narrowed by the host validator at the client boundary.
 */
export const getOptInProof = query({
  args: { contactHash: v.string(), listKey: v.string() },
  returns: v.union(v.null(), optInProofView),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("optInProofs")
      .withIndex("by_hash_list", (q) =>
        q.eq("contactHash", args.contactHash).eq("listKey", args.listKey),
      )
      .unique();
    if (row === null) {
      return null;
    }
    return {
      contactHash: row.contactHash,
      listKey: row.listKey === GLOBAL_CHANNEL ? null : row.listKey,
      source: row.source,
      proof: row.proof,
      confirmedAt: row.confirmedAt,
    };
  },
});

/**
 * The send gate: `true` when the contact may be contacted. A contact is eligible
 * when it is NOT suppressed on `channel` (global or channel-specific) and — when
 * `requireOptIn` is set — has a recorded opt-in proof for `listKey`. This is the
 * single call a sender makes before every send: `¬suppressed [∧ confirmed]`.
 * Suppression always blocks; the opt-in requirement is opt-in per call (marketing
 * mail sets it; a transactional send may not).
 */
export const isEligible = query({
  args: {
    contactHash: v.string(),
    channel: v.string(),
    listKey: v.string(),
    requireOptIn: v.boolean(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const globalRow = await ctx.db
      .query("suppressions")
      .withIndex("by_hash_channel", (q) =>
        q.eq("contactHash", args.contactHash).eq("channel", GLOBAL_CHANNEL),
      )
      .unique();
    if (globalRow !== null) {
      return false;
    }
    if (args.channel !== GLOBAL_CHANNEL) {
      const channelRow = await ctx.db
        .query("suppressions")
        .withIndex("by_hash_channel", (q) =>
          q.eq("contactHash", args.contactHash).eq("channel", args.channel),
        )
        .unique();
      if (channelRow !== null) {
        return false;
      }
    }
    if (args.requireOptIn) {
      const proof = await ctx.db
        .query("optInProofs")
        .withIndex("by_hash_list", (q) =>
          q.eq("contactHash", args.contactHash).eq("listKey", args.listKey),
        )
        .unique();
      if (proof === null) {
        return false;
      }
    }
    return true;
  },
});
