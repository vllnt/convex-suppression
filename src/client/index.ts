import type {
  FunctionArgs,
  FunctionReference,
  FunctionReturnType,
} from "convex/server";
import type {
  IsEligibleOptions,
  OptInProofView,
  Parser,
  RecordOptInOptions,
  SuppressionOptions,
  SuppressionReason,
  SuppressionView,
  SuppressOptions,
} from "./types.js";
import { GLOBAL_CHANNEL } from "../shared.js";

/**
 * The component's raw opt-in proof view, before the client narrows opaque host
 * evidence. `proof` is `unknown` here; the {@link Suppression} client runs the
 * host validator over it at its typed boundary.
 */
type RawProofView = {
  contactHash: string;
  listKey: string | null;
  source: string;
  proof?: unknown;
  confirmedAt: number;
};

/**
 * The suppression component's function references, as exposed on the host via
 * `components.suppression`. The host's stored opt-in `proof` is opaque here
 * (`unknown`); the {@link Suppression} client narrows it at its own typed boundary.
 */
export interface SuppressionComponent {
  mutations: {
    suppress: FunctionReference<
      "mutation",
      "internal",
      { contactHash: string; channel: string; reason: SuppressionReason },
      null
    >;
    unsuppress: FunctionReference<
      "mutation",
      "internal",
      { contactHash: string; channel: string },
      boolean
    >;
    recordOptIn: FunctionReference<
      "mutation",
      "internal",
      { contactHash: string; listKey: string; source: string; proof?: unknown },
      null
    >;
  };
  queries: {
    isSuppressed: FunctionReference<
      "query",
      "internal",
      { contactHash: string; channel: string },
      SuppressionView | null
    >;
    getOptInProof: FunctionReference<
      "query",
      "internal",
      { contactHash: string; listKey: string },
      RawProofView | null
    >;
    isEligible: FunctionReference<
      "query",
      "internal",
      {
        contactHash: string;
        channel: string;
        listKey: string;
        requireOptIn: boolean;
      },
      boolean
    >;
  };
}

interface RunQueryCtx {
  runQuery<Q extends FunctionReference<"query", "internal">>(
    reference: Q,
    args: FunctionArgs<Q>,
  ): Promise<FunctionReturnType<Q>>;
}

interface RunMutationCtx {
  runMutation<M extends FunctionReference<"mutation", "internal">>(
    reference: M,
    args: FunctionArgs<M>,
  ): Promise<FunctionReturnType<M>>;
}

/**
 * Consumer-facing client for the do-not-contact suppression gate (GDPR opt-out /
 * CAN-SPAM). The host hashes a contact (`hash(normalize(email|phone))`) and passes
 * the opaque `contactHash`; the component stores a `(contactHash, channel)`
 * anti-membership tombstone that survives erasure of the subject. A sender calls
 * `isEligible` before every send (`¬suppressed [∧ confirmed]`); an unsubscribe /
 * bounce / complaint webhook calls `suppress`; a double-opt-in confirmation calls
 * `recordOptIn`. The host owns meaning and auth — it resolves identity, hashes the
 * contact, and decides the channel/list semantics. Pass `proofValidator` to narrow
 * the opaque opt-in evidence to `TProof` at the boundary — there is no unchecked
 * cast.
 *
 * @typeParam TProof - The host's opt-in proof evidence type (defaults to `unknown`).
 *
 * @example
 * ```ts
 * const dnc = new Suppression(components.suppression, {
 *   proofValidator: v.object({ ip: v.string() }).parse,
 * });
 * // a webhook suppresses on complaint:
 * await dnc.suppress(ctx, contactHash, "complaint", { channel: "email" });
 * // a sender gates a marketing send:
 * if (await dnc.isEligible(ctx, contactHash, { channel: "email", listKey: "news", requireOptIn: true })) {
 *   // ...send
 * }
 * ```
 */
export class Suppression<TProof = unknown> {
  private readonly proofValidator: Parser<TProof> | undefined;

  constructor(
    private readonly component: SuppressionComponent,
    options: SuppressionOptions<TProof> = {},
  ) {
    this.proofValidator = options.proofValidator;
  }

  /** Narrow an opaque value through a host parser; pass `undefined` and unset parsers through. */
  private parse(value: unknown): TProof | undefined {
    if (value === undefined) {
      return undefined;
    }
    if (this.proofValidator === undefined) {
      return value as TProof;
    }
    return this.proofValidator(value);
  }

  /**
   * Suppress a `(contactHash, channel)` — add it to the do-not-contact list.
   * `opts.channel` scopes the suppression to one channel; omit it for a global
   * (all-channel) suppression. Idempotent on `(contactHash, channel)`. `reason` is
   * recorded for audit.
   */
  suppress(
    ctx: RunMutationCtx,
    contactHash: string,
    reason: SuppressionReason,
    opts: SuppressOptions = {},
  ): Promise<null> {
    return ctx.runMutation(this.component.mutations.suppress, {
      contactHash,
      channel: opts.channel ?? GLOBAL_CHANNEL,
      reason,
    });
  }

  /**
   * Remove a `(contactHash, channel)` from the do-not-contact list (a rare,
   * audited re-subscribe). Omit `channel` to clear the global entry. Returns `true`
   * if an entry was removed, `false` if none matched.
   */
  unsuppress(
    ctx: RunMutationCtx,
    contactHash: string,
    channel?: string,
  ): Promise<boolean> {
    return ctx.runMutation(this.component.mutations.unsuppress, {
      contactHash,
      channel: channel ?? GLOBAL_CHANNEL,
    });
  }

  /**
   * The matching suppression for `(contactHash, channel)`, or `null` if the
   * contact is not suppressed on that channel. A global suppression matches every
   * channel and wins. Omit `channel` to check the global entry only.
   */
  isSuppressed(
    ctx: RunQueryCtx,
    contactHash: string,
    channel?: string,
  ): Promise<SuppressionView | null> {
    return ctx.runQuery(this.component.queries.isSuppressed, {
      contactHash,
      channel: channel ?? GLOBAL_CHANNEL,
    });
  }

  /**
   * Record an opt-in proof for a `(contactHash, listKey)` — the legal evidence of
   * a confirmed opt-in. `opts.listKey` scopes the proof to one list; omit it for a
   * global opt-in. `opts.proof` is opaque host evidence validated against
   * `proofValidator` before storage. Idempotent on `(contactHash, listKey)`.
   */
  recordOptIn(
    ctx: RunMutationCtx,
    contactHash: string,
    opts: RecordOptInOptions<TProof>,
  ): Promise<null> {
    return ctx.runMutation(this.component.mutations.recordOptIn, {
      contactHash,
      listKey: opts.listKey ?? GLOBAL_CHANNEL,
      source: opts.source,
      proof: opts.proof === undefined ? undefined : this.parse(opts.proof),
    });
  }

  /**
   * The opt-in proof for `(contactHash, listKey)`, or `null` if none is recorded.
   * Omit `listKey` to fetch a global opt-in. `proof` is narrowed by the host
   * validator on read.
   */
  async getOptInProof(
    ctx: RunQueryCtx,
    contactHash: string,
    listKey?: string,
  ): Promise<OptInProofView<TProof> | null> {
    const raw = await ctx.runQuery(this.component.queries.getOptInProof, {
      contactHash,
      listKey: listKey ?? GLOBAL_CHANNEL,
    });
    if (raw === null) {
      return null;
    }
    return {
      contactHash: raw.contactHash,
      listKey: raw.listKey,
      source: raw.source,
      proof: this.parse(raw.proof),
      confirmedAt: raw.confirmedAt,
    };
  }

  /**
   * The send gate: `true` when the contact may be contacted — NOT suppressed on
   * `opts.channel` (global or channel-specific) and, when `opts.requireOptIn` is
   * set, holding a recorded opt-in proof for `opts.listKey`. Suppression always
   * blocks; the opt-in requirement is per call.
   */
  isEligible(
    ctx: RunQueryCtx,
    contactHash: string,
    opts: IsEligibleOptions = {},
  ): Promise<boolean> {
    return ctx.runQuery(this.component.queries.isEligible, {
      contactHash,
      channel: opts.channel ?? GLOBAL_CHANNEL,
      listKey: opts.listKey ?? GLOBAL_CHANNEL,
      requireOptIn: opts.requireOptIn ?? false,
    });
  }
}

export type {
  IsEligibleOptions,
  OptInProofView,
  Parser,
  RecordOptInOptions,
  SuppressionOptions,
  SuppressionReason,
  SuppressionView,
  SuppressOptions,
};
