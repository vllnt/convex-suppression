import { expect, test } from "vitest";
import schema from "./schema.js";

test("suppressions keeps only the by_hash_channel index; its prefix serves per-hash scans", () => {
  const indexes = schema.tables.suppressions[" indexes"]().map((index) => index.indexDescriptor);
  expect(indexes).toEqual(["by_hash_channel"]);
});
