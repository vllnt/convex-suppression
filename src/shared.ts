/** Shared constants used by both `client/` and `component/`. */

export const COMPONENT_NAME = "suppression";

/**
 * The standard suppression reasons. `unsubscribe` is an explicit opt-out (a
 * one-click unsubscribe or a list-removal request); `bounce` and `complaint` are
 * deliverability signals fed from a mail/SMS provider's events; `manual` is an
 * operator action; `global` marks a do-not-contact-anywhere tombstone. The reason
 * is recorded for audit — it never changes the suppression's effect (a suppressed
 * hash is suppressed regardless of why).
 */
export const SUPPRESSION_REASONS = [
  "unsubscribe",
  "bounce",
  "complaint",
  "manual",
  "global",
] as const;

/** A single suppression reason. */
export type SuppressionReason = (typeof SUPPRESSION_REASONS)[number];

/**
 * The sentinel stored in the `channel` index slot for a global (all-channel)
 * suppression. A real channel is any other host-supplied string (`"email"`,
 * `"sms"`, `"push"`, …). Storing a concrete value rather than `undefined` lets a
 * channel-scoped check hit a single equality index that matches the global row and
 * the channel row in two bounded reads, with no `undefined` index gap.
 */
export const GLOBAL_CHANNEL = "*";
