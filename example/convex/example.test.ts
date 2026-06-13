import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { register } from "../../src/test";

const modules = import.meta.glob("./**/*.ts");

function setup() {
  const t = convexTest(schema, modules);
  register(t); // default "suppression" mount
  register(t, "marketing"); // second named mount — proves mount-safety
  return t;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("suppression — the do-not-contact gate (happy path)", () => {
  test("suppress → isSuppressed → unsuppress walks a channel entry", async () => {
    const t = setup();
    expect(
      await t.query(api.example.isSuppressed, {
        contactHash: "h1",
        channel: "email",
      }),
    ).toBeNull();

    vi.setSystemTime(1_000);
    await t.mutation(api.example.suppress, {
      contactHash: "h1",
      reason: "complaint",
      channel: "email",
    });
    const hit = await t.query(api.example.isSuppressed, {
      contactHash: "h1",
      channel: "email",
    });
    expect(hit?.channel).toBe("email");
    expect(hit?.reason).toBe("complaint");
    expect(hit?.createdAt).toBe(1_000);

    // suppressing email does not suppress sms
    expect(
      await t.query(api.example.isSuppressed, {
        contactHash: "h1",
        channel: "sms",
      }),
    ).toBeNull();

    const removed = await t.mutation(api.example.unsuppress, {
      contactHash: "h1",
      channel: "email",
    });
    expect(removed).toBe(true);
    expect(
      await t.query(api.example.isSuppressed, {
        contactHash: "h1",
        channel: "email",
      }),
    ).toBeNull();
  });

  test("a global suppression (no channel) matches every channel and reports null channel", async () => {
    const t = setup();
    await t.mutation(api.example.suppress, {
      contactHash: "hg",
      reason: "global",
    });
    const onEmail = await t.query(api.example.isSuppressed, {
      contactHash: "hg",
      channel: "email",
    });
    expect(onEmail?.channel).toBeNull();
    expect(onEmail?.reason).toBe("global");
    // also matches a different channel
    expect(
      await t.query(api.example.isSuppressed, {
        contactHash: "hg",
        channel: "push",
      }),
    ).not.toBeNull();
    // and the global-only check (no channel arg)
    expect(
      await t.query(api.example.isSuppressed, { contactHash: "hg" }),
    ).not.toBeNull();
  });

  test("recordOptIn → getOptInProof round-trips on a list", async () => {
    const t = setup();
    expect(
      await t.query(api.example.getOptInProof, {
        contactHash: "h2",
        listKey: "news",
      }),
    ).toBeNull();

    vi.setSystemTime(500);
    await t.mutation(api.example.recordOptIn, {
      contactHash: "h2",
      source: "double-opt-in",
      listKey: "news",
      proof: { ip: "1.2.3.4" },
    });
    const proof = await t.query(api.example.getOptInProof, {
      contactHash: "h2",
      listKey: "news",
    });
    expect(proof?.listKey).toBe("news");
    expect(proof?.source).toBe("double-opt-in");
    expect(proof?.proof).toEqual({ ip: "1.2.3.4" });
    expect(proof?.confirmedAt).toBe(500);
  });

  test("a global opt-in (no listKey) reports a null listKey", async () => {
    const t = setup();
    await t.mutation(api.example.recordOptIn, {
      contactHash: "hgo",
      source: "import",
    });
    const proof = await t.query(api.example.getOptInProof, {
      contactHash: "hgo",
    });
    expect(proof?.listKey).toBeNull();
    expect(proof?.source).toBe("import");
    expect(proof?.proof).toBeUndefined();
  });
});

describe("suppression — isEligible (the send gate)", () => {
  test("an unknown contact is eligible (not suppressed, no opt-in required)", async () => {
    const t = setup();
    expect(
      await t.query(api.example.isEligible, {
        contactHash: "fresh",
        channel: "email",
      }),
    ).toBe(true);
  });

  test("a suppressed contact is not eligible", async () => {
    const t = setup();
    await t.mutation(api.example.suppress, {
      contactHash: "sup",
      reason: "unsubscribe",
      channel: "email",
    });
    expect(
      await t.query(api.example.isEligible, {
        contactHash: "sup",
        channel: "email",
      }),
    ).toBe(false);
    // a global suppression blocks every channel through the gate too
    await t.mutation(api.example.suppress, {
      contactHash: "supg",
      reason: "global",
    });
    expect(
      await t.query(api.example.isEligible, {
        contactHash: "supg",
        channel: "sms",
      }),
    ).toBe(false);
  });

  test("requireOptIn blocks a contact without a recorded opt-in, allows one with it", async () => {
    const t = setup();
    // no opt-in yet → blocked when required
    expect(
      await t.query(api.example.isEligible, {
        contactHash: "m1",
        channel: "email",
        listKey: "news",
        requireOptIn: true,
      }),
    ).toBe(false);
    await t.mutation(api.example.recordOptIn, {
      contactHash: "m1",
      source: "double-opt-in",
      listKey: "news",
    });
    expect(
      await t.query(api.example.isEligible, {
        contactHash: "m1",
        channel: "email",
        listKey: "news",
        requireOptIn: true,
      }),
    ).toBe(true);
  });

  test("a global-only eligibility check skips the per-channel read", async () => {
    const t = setup();
    await t.mutation(api.example.suppress, {
      contactHash: "ch",
      reason: "bounce",
      channel: "email",
    });
    // checking the global gate (no channel) does not see the email-only suppression
    expect(
      await t.query(api.example.isEligible, { contactHash: "ch" }),
    ).toBe(true);
  });
});

describe("suppression — idempotency & adversarial", () => {
  test("re-suppressing the same (hash, channel) updates in place, does not duplicate", async () => {
    const t = setup();
    await t.mutation(api.example.suppress, {
      contactHash: "dup",
      reason: "bounce",
      channel: "email",
    });
    vi.setSystemTime(2_000);
    await t.mutation(api.example.suppress, {
      contactHash: "dup",
      reason: "complaint",
      channel: "email",
    });
    // .unique() would throw if a duplicate row existed — single row, reason updated
    const hit = await t.query(api.example.isSuppressed, {
      contactHash: "dup",
      channel: "email",
    });
    expect(hit?.reason).toBe("complaint");
    expect(hit?.createdAt).toBe(2_000);
  });

  test("re-recording an opt-in for the same (hash, list) updates in place", async () => {
    const t = setup();
    await t.mutation(api.example.recordOptIn, {
      contactHash: "od",
      source: "checkbox",
      listKey: "news",
    });
    vi.setSystemTime(3_000);
    await t.mutation(api.example.recordOptIn, {
      contactHash: "od",
      source: "double-opt-in",
      listKey: "news",
      proof: { ip: "9.9.9.9" },
    });
    const proof = await t.query(api.example.getOptInProof, {
      contactHash: "od",
      listKey: "news",
    });
    expect(proof?.source).toBe("double-opt-in");
    expect(proof?.proof).toEqual({ ip: "9.9.9.9" });
    expect(proof?.confirmedAt).toBe(3_000);
  });

  test("isSuppressed on an unknown address returns null", async () => {
    const t = setup();
    expect(
      await t.query(api.example.isSuppressed, {
        contactHash: "ghost",
        channel: "email",
      }),
    ).toBeNull();
  });

  test("unsuppress on an address that was never suppressed is a no-op false", async () => {
    const t = setup();
    expect(
      await t.mutation(api.example.unsuppress, {
        contactHash: "ghost",
        channel: "email",
      }),
    ).toBe(false);
  });

  test("unsuppress with no channel clears the global entry only", async () => {
    const t = setup();
    await t.mutation(api.example.suppress, {
      contactHash: "ug",
      reason: "global",
    });
    await t.mutation(api.example.suppress, {
      contactHash: "ug",
      reason: "bounce",
      channel: "email",
    });
    // unsuppress with no channel arg → clears the global row, leaves the email row
    expect(await t.mutation(api.example.unsuppress, { contactHash: "ug" })).toBe(
      true,
    );
    // the global tombstone is gone, but the email-channel suppression remains
    const stillEmail = await t.query(api.example.isSuppressed, {
      contactHash: "ug",
      channel: "email",
    });
    expect(stillEmail?.channel).toBe("email");
    expect(stillEmail?.reason).toBe("bounce");
  });

  test("getOptInProof on an unknown (hash, list) returns null", async () => {
    const t = setup();
    expect(
      await t.query(api.example.getOptInProof, {
        contactHash: "ghost",
        listKey: "news",
      }),
    ).toBeNull();
  });
});

describe("suppression — host proof validator (strict client)", () => {
  test("a valid proof round-trips through the strict client", async () => {
    const t = setup();
    await t.mutation(api.example.recordOptInStrict, {
      contactHash: "s_ok",
      proof: { ip: "5.5.5.5" },
    });
    const proof = await t.query(api.example.getOptInProofStrict, {
      contactHash: "s_ok",
    });
    expect(proof?.proof).toEqual({ ip: "5.5.5.5" });
  });

  test("a proof failing the host validator is rejected before storage", async () => {
    const t = setup();
    await expect(
      t.mutation(api.example.recordOptInStrict, {
        contactHash: "s_bad",
        proof: { ip: 123 },
      }),
    ).rejects.toThrow(/invalid proof/);
    expect(
      await t.query(api.example.getOptInProof, {
        contactHash: "s_bad",
        listKey: "news",
      }),
    ).toBeNull();
  });
});

describe("suppression — mount-safety (independent named mount)", () => {
  test("the same contactHash suppressed in two mounts is independent", async () => {
    const t = setup();
    await t.mutation(api.example.suppress, {
      contactHash: "shared",
      reason: "manual",
      channel: "email",
    });
    // marketing mount has no entry for the same hash
    expect(
      await t.query(api.example.isSuppressedMarketing, {
        contactHash: "shared",
      }),
    ).toBeNull();
    // suppress on the marketing mount; the default mount is unaffected
    await t.mutation(api.example.suppressMarketing, {
      contactHash: "shared",
      reason: "global",
    });
    expect(
      (await t.query(api.example.isSuppressedMarketing, {
        contactHash: "shared",
      }))?.reason,
    ).toBe("global");
    // default mount still only has the email-channel manual entry
    expect(
      (await t.query(api.example.isSuppressed, {
        contactHash: "shared",
        channel: "email",
      }))?.reason,
    ).toBe("manual");
  });
});

describe("suppression — host/component table isolation", () => {
  test("the host's raw contact lives in the host table, separate from the component", async () => {
    const t = setup();
    await t.mutation(api.example.addContact, {
      contactHash: "iso",
      rawEmail: "a@b.com",
    });
    await t.mutation(api.example.suppress, {
      contactHash: "iso",
      reason: "unsubscribe",
      channel: "email",
    });
    // the raw email is readable from the host table; the component never holds it
    expect(
      await t.query(api.example.getContactEmail, { contactHash: "iso" }),
    ).toBe("a@b.com");
    expect(
      await t.query(api.example.isSuppressed, {
        contactHash: "iso",
        channel: "email",
      }),
    ).not.toBeNull();
    // a suppression for a hash with no host contact is fine — fully decoupled
    // (the tombstone survives erasure of the host contact)
    await t.mutation(api.example.suppress, {
      contactHash: "erased",
      reason: "unsubscribe",
      channel: "email",
    });
    expect(
      await t.query(api.example.getContactEmail, { contactHash: "erased" }),
    ).toBeNull();
    expect(
      await t.query(api.example.isSuppressed, {
        contactHash: "erased",
        channel: "email",
      }),
    ).not.toBeNull();
  });
});
