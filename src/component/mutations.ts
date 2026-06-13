import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { jsonValue, suppressionReason } from "./validators";

/**
 * Suppress a `(contactHash, channel)` — add it to the do-not-contact list. The
 * host hashes and normalizes the contact itself and passes the opaque
 * `contactHash`; the component never sees a raw email/phone, so the entry survives
 * erasure of the underlying subject. `channel` is the host channel string
 * (`"email"`/`"sms"`/`"push"`/…) the suppression applies to; omit it for a global
 * (all-channel) suppression. `reason` is recorded for audit.
 *
 * Idempotent on `(contactHash, channel)`: re-suppressing an existing entry updates
 * its `reason` and refreshes `createdAt` rather than inserting a duplicate, so a
 * replayed bounce/complaint webhook can never fan the table out. `createdAt` is
 * stamped from the server clock (`Date.now()` inside the handler — never
 * caller-supplied).
 */
export const suppress = mutation({
  args: {
    contactHash: v.string(),
    channel: v.string(),
    reason: suppressionReason,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("suppressions")
      .withIndex("by_hash_channel", (q) =>
        q.eq("contactHash", args.contactHash).eq("channel", args.channel),
      )
      .unique();
    const now = Date.now();
    if (existing !== null) {
      await ctx.db.patch(existing._id, { reason: args.reason, createdAt: now });
      return null;
    }
    await ctx.db.insert("suppressions", {
      contactHash: args.contactHash,
      channel: args.channel,
      reason: args.reason,
      createdAt: now,
    });
    return null;
  },
});

/**
 * Remove a `(contactHash, channel)` from the do-not-contact list — a rare, audited
 * re-subscribe. Removing a global suppression (`channel` = the sentinel) clears
 * only the global row, not per-channel entries; removing a channel row clears only
 * that channel. Returns `true` if an entry was removed, `false` if none matched (a
 * no-op unsuppress of an address that was never suppressed is not an error).
 */
export const unsuppress = mutation({
  args: { contactHash: v.string(), channel: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("suppressions")
      .withIndex("by_hash_channel", (q) =>
        q.eq("contactHash", args.contactHash).eq("channel", args.channel),
      )
      .unique();
    if (existing === null) {
      return false;
    }
    await ctx.db.delete(existing._id);
    return true;
  },
});

/**
 * Record an opt-in proof for a `(contactHash, listKey)` — the legal evidence that
 * this contact confirmed receiving mail/messages for one list/purpose (a double
 * opt-in, an explicit checkbox, an import with consent). `listKey` scopes the
 * proof to one list or holds the global sentinel; `source` tags how it was
 * captured; `proof` is opaque host evidence (IP, token ref, form snapshot) narrowed
 * by the host's validator at the client boundary.
 *
 * Idempotent on `(contactHash, listKey)`: a second confirmation updates `source`,
 * `proof`, and `confirmedAt` rather than inserting a duplicate. `confirmedAt` is
 * server-sourced.
 */
export const recordOptIn = mutation({
  args: {
    contactHash: v.string(),
    listKey: v.string(),
    source: v.string(),
    proof: v.optional(jsonValue),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("optInProofs")
      .withIndex("by_hash_list", (q) =>
        q.eq("contactHash", args.contactHash).eq("listKey", args.listKey),
      )
      .unique();
    const now = Date.now();
    if (existing !== null) {
      await ctx.db.patch(existing._id, {
        source: args.source,
        proof: args.proof,
        confirmedAt: now,
      });
      return null;
    }
    await ctx.db.insert("optInProofs", {
      contactHash: args.contactHash,
      listKey: args.listKey,
      source: args.source,
      proof: args.proof,
      confirmedAt: now,
    });
    return null;
  },
});
