/** Public TypeScript surface for the suppression client. */

/** The five standard reasons a `(contactHash, channel)` is suppressed. */
export type SuppressionReason =
  | "unsubscribe"
  | "bounce"
  | "complaint"
  | "manual"
  | "global";

/**
 * Validates and narrows opaque host opt-in evidence to a host type `T` at the
 * client boundary. Receives the raw value the component returned (`unknown`) and
 * MUST return a typed `T` or throw. A `convex/values` validator's `.parse` (or a
 * Zod `.parse`) fits directly; omit it to keep the value unvalidated.
 *
 * @typeParam T - The host's stored opt-in `proof` type.
 */
export type Parser<T> = (value: unknown) => T;

/** The public view of a suppression returned by {@link Suppression.isSuppressed}. */
export interface SuppressionView {
  /** The host's opaque contact hash — never a raw email/phone. */
  contactHash: string;
  /** The channel this entry applies to, or `null` for a global (all-channel) suppression. */
  channel: string | null;
  /** Why the contact was suppressed (audit only — never changes the effect). */
  reason: SuppressionReason;
  /** Absolute ms timestamp the suppression was recorded. */
  createdAt: number;
}

/** The public view of an opt-in proof returned by {@link Suppression.getOptInProof}. */
export interface OptInProofView<TProof = unknown> {
  /** The host's opaque contact hash. */
  contactHash: string;
  /** The list/purpose the opt-in applies to, or `null` for a global opt-in. */
  listKey: string | null;
  /** How the opt-in was captured (e.g. `"double-opt-in"`, `"checkbox"`). */
  source: string;
  /** The opaque host evidence (narrowed if a `proofValidator` is set). */
  proof?: TProof;
  /** Absolute ms timestamp the opt-in was confirmed. */
  confirmedAt: number;
}

/** Per-call options for {@link Suppression.suppress}. */
export interface SuppressOptions {
  /** The channel to suppress (`"email"`/`"sms"`/…). Omit for a global suppression. */
  channel?: string;
}

/** Per-call options for {@link Suppression.recordOptIn}. */
export interface RecordOptInOptions<TProof> {
  /** The list/purpose the opt-in applies to. Omit for a global opt-in. */
  listKey?: string;
  /** How the opt-in was captured. */
  source: string;
  /** Opaque host evidence (validated against `proofValidator` before storage). */
  proof?: TProof;
}

/** Per-call options for {@link Suppression.isEligible}. */
export interface IsEligibleOptions {
  /** The channel to check (`"email"`/`"sms"`/…). Omit to check the global gate only. */
  channel?: string;
  /** The list/purpose to require an opt-in for (used only when `requireOptIn`). */
  listKey?: string;
  /** When `true`, also require a recorded opt-in proof for `listKey`. */
  requireOptIn?: boolean;
}

/** Construction options for the {@link Suppression} client. */
export interface SuppressionOptions<TProof> {
  /**
   * Validates/narrows opaque opt-in `proof` to `TProof` at the boundary — applied
   * to the `proof` passed into `recordOptIn` (before storage) and the `proof`
   * returned by `getOptInProof` (on read). Throws on a mismatch. Omit to leave
   * proof evidence unvalidated.
   */
  proofValidator?: Parser<TProof>;
}
