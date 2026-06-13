import { v } from "convex/values";
import { components } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import { Suppression } from "../../src/client";

/**
 * Host-app wrappers. The host owns auth and hashing: resolve identity here, hash
 * the contact (`hash(normalize(email|phone))`), then pass the opaque `contactHash`
 * into the client. Time is server-sourced inside the component — there is no clock
 * to pass.
 */
const dnc = new Suppression(components.suppression);

/** A second client on the named `marketing` mount — proves mount-safe isolation. */
const marketingDnc = new Suppression(components.marketing);

/**
 * A strict client that validates opt-in proof against a host parser — proves the
 * `proofValidator` boundary on write and read.
 */
const strictDnc = new Suppression<{ ip: string }>(components.suppression, {
  proofValidator: (value) => {
    if (
      typeof value !== "object" ||
      value === null ||
      typeof (value as { ip?: unknown }).ip !== "string"
    ) {
      throw new Error("invalid proof: expected { ip: string }");
    }
    return value as { ip: string };
  },
});

const suppressionReason = v.union(
  v.literal("unsubscribe"),
  v.literal("bounce"),
  v.literal("complaint"),
  v.literal("manual"),
  v.literal("global"),
);

const suppressionView = v.object({
  contactHash: v.string(),
  channel: v.union(v.string(), v.null()),
  reason: suppressionReason,
  createdAt: v.number(),
});

const optInProofView = v.object({
  contactHash: v.string(),
  listKey: v.union(v.string(), v.null()),
  source: v.string(),
  proof: v.optional(v.any()),
  confirmedAt: v.number(),
});

export const suppress = mutation({
  args: {
    contactHash: v.string(),
    reason: suppressionReason,
    channel: v.optional(v.string()),
  },
  returns: v.null(),
  handler: (ctx, a) =>
    dnc.suppress(ctx, a.contactHash, a.reason, { channel: a.channel }),
});

export const unsuppress = mutation({
  args: { contactHash: v.string(), channel: v.optional(v.string()) },
  returns: v.boolean(),
  handler: (ctx, a) => dnc.unsuppress(ctx, a.contactHash, a.channel),
});

export const isSuppressed = query({
  args: { contactHash: v.string(), channel: v.optional(v.string()) },
  returns: v.union(v.null(), suppressionView),
  handler: (ctx, a) => dnc.isSuppressed(ctx, a.contactHash, a.channel),
});

export const recordOptIn = mutation({
  args: {
    contactHash: v.string(),
    source: v.string(),
    listKey: v.optional(v.string()),
    proof: v.optional(v.any()),
  },
  returns: v.null(),
  handler: (ctx, a) =>
    dnc.recordOptIn(ctx, a.contactHash, {
      listKey: a.listKey,
      source: a.source,
      proof: a.proof,
    }),
});

export const getOptInProof = query({
  args: { contactHash: v.string(), listKey: v.optional(v.string()) },
  returns: v.union(v.null(), optInProofView),
  handler: (ctx, a) => dnc.getOptInProof(ctx, a.contactHash, a.listKey),
});

export const isEligible = query({
  args: {
    contactHash: v.string(),
    channel: v.optional(v.string()),
    listKey: v.optional(v.string()),
    requireOptIn: v.optional(v.boolean()),
  },
  returns: v.boolean(),
  handler: (ctx, a) =>
    dnc.isEligible(ctx, a.contactHash, {
      channel: a.channel,
      listKey: a.listKey,
      requireOptIn: a.requireOptIn,
    }),
});

/** Named-mount variants — prove a second instance is independent. */
export const suppressMarketing = mutation({
  args: { contactHash: v.string(), reason: suppressionReason },
  returns: v.null(),
  handler: (ctx, a) => marketingDnc.suppress(ctx, a.contactHash, a.reason),
});

export const isSuppressedMarketing = query({
  args: { contactHash: v.string() },
  returns: v.union(v.null(), suppressionView),
  handler: (ctx, a) => marketingDnc.isSuppressed(ctx, a.contactHash),
});

/** Strict-client variants — exercise the proof validator. */
export const recordOptInStrict = mutation({
  args: { contactHash: v.string(), proof: v.any() },
  returns: v.null(),
  handler: (ctx, a) =>
    strictDnc.recordOptIn(ctx, a.contactHash, {
      listKey: "news",
      source: "double-opt-in",
      proof: a.proof,
    }),
});

export const getOptInProofStrict = query({
  args: { contactHash: v.string() },
  returns: v.union(v.null(), optInProofView),
  handler: (ctx, a) => strictDnc.getOptInProof(ctx, a.contactHash, "news"),
});

/**
 * Host-side contact helper — writes the host's own `contacts` table, completely
 * outside the component's sandbox, proving host/component table isolation. The host
 * keeps the raw contact ↔ hash mapping; the component only ever holds the hash.
 */
export const addContact = mutation({
  args: { contactHash: v.string(), rawEmail: v.string() },
  returns: v.null(),
  handler: async (ctx, { contactHash, rawEmail }) => {
    await ctx.db.insert("contacts", { contactHash, rawEmail });
    return null;
  },
});

export const getContactEmail = query({
  args: { contactHash: v.string() },
  returns: v.union(v.null(), v.string()),
  handler: async (ctx, { contactHash }) => {
    const row = await ctx.db
      .query("contacts")
      .withIndex("by_hash", (q) => q.eq("contactHash", contactHash))
      .unique();
    return row?.rawEmail ?? null;
  },
});
