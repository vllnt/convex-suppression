/* eslint-disable */
/**
 * Generated `ComponentApi` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type { FunctionReference } from "convex/server";

/**
 * A utility for referencing a Convex component's exposed API.
 *
 * Useful when expecting a parameter like `components.myComponent`.
 * Usage:
 * ```ts
 * async function myFunction(ctx: QueryCtx, component: ComponentApi) {
 *   return ctx.runQuery(component.someFile.someQuery, { ...args });
 * }
 * ```
 */
export type ComponentApi<Name extends string | undefined = string | undefined> =
  {
    mutations: {
      suppress: FunctionReference<
        "mutation",
        "internal",
        {
          channel: string;
          contactHash: string;
          reason:
            | "unsubscribe"
            | "bounce"
            | "complaint"
            | "manual"
            | "global";
        },
        null,
        Name
      >;
      unsuppress: FunctionReference<
        "mutation",
        "internal",
        { channel: string; contactHash: string },
        boolean,
        Name
      >;
      recordOptIn: FunctionReference<
        "mutation",
        "internal",
        { contactHash: string; listKey: string; proof?: any; source: string },
        null,
        Name
      >;
    };
    queries: {
      isSuppressed: FunctionReference<
        "query",
        "internal",
        { channel: string; contactHash: string },
        null | {
          channel: string | null;
          contactHash: string;
          createdAt: number;
          reason:
            | "unsubscribe"
            | "bounce"
            | "complaint"
            | "manual"
            | "global";
        },
        Name
      >;
      getOptInProof: FunctionReference<
        "query",
        "internal",
        { contactHash: string; listKey: string },
        null | {
          confirmedAt: number;
          contactHash: string;
          listKey: string | null;
          proof?: any;
          source: string;
        },
        Name
      >;
      isEligible: FunctionReference<
        "query",
        "internal",
        {
          channel: string;
          contactHash: string;
          listKey: string;
          requireOptIn: boolean;
        },
        boolean,
        Name
      >;
    };
  };
