import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * The example host app's own table. It is host-side state living entirely outside
 * the component's sandboxed `suppressions`/`optInProofs` tables — used to prove the
 * component never reaches into host tables (and the host never into the component's,
 * except through the exported client). The host owns the raw contact ↔ hash mapping;
 * the component only ever sees the hash.
 */
export default defineSchema({
  contacts: defineTable({
    contactHash: v.string(),
    rawEmail: v.string(),
  }).index("by_hash", ["contactHash"]),
});
