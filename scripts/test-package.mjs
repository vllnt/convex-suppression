// Package test, run by `pnpm test:package` after `pnpm build`. Packs the package,
// installs the tarball into one throwaway consumer project with the same convex,
// convex-test, vitest, vite and TypeScript versions this repo develops against,
// then checks what a real consumer sees:
//   (a) the tarball ships the built entry points and the docs,
//   (b) every runtime entry point imports in Node,
//   (c) a consumer of every entry point type-checks (nodenext and bundler),
//   (d) `register(t)` mounts the component (default + named mount) next to a
//       host schema with its own table, and a suppress/isEligible round trip
//       works through host functions under Vitest,
//   (e) the shipped docs meet the docs contract (scripts/check-documentation.mjs),
//       and every README and docs/ TypeScript example type-checks against the
//       installed package in a stub Convex host; the README test examples run
//       in a second Vitest run under the README's own vitest.config.mts.
// Each Vitest run asserts how many test files and tests passed, so a config
// that skips a file fails.
// The consumer project is removed at the end, pass or fail.
import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import process from "node:process";

import {
  checkDocumentation,
  convexHost,
  writeHost,
} from "./check-documentation.mjs";

const root = process.cwd();
const { name, pnpm } = JSON.parse(readFileSync("package.json", "utf8"));

/** Installed dev version of a package, as an install spec for the consumer. */
const devSpec = (dependency) => {
  const installed = JSON.parse(
    readFileSync(
      join(root, "node_modules", dependency, "package.json"),
      "utf8",
    ),
  );
  return installed.name === dependency
    ? `${dependency}@${installed.version}`
    : `${dependency}@npm:${installed.name}@${installed.version}`;
};

const consumer = mkdtempSync(join(tmpdir(), "suppression-consumer-"));
const run = (command, arguments_, cwd = consumer) =>
  execFileSync(command, arguments_, { cwd, stdio: "inherit" });
/**
 * Runs `vitest run` with a JSON report and fails unless every test passed and
 * exactly `files` test files (and `tests` tests, when given) ran.
 */
const vitest = (arguments_, expected) => {
  const report = join(consumer, `vitest-report-${String(Date.now())}.json`);
  run("pnpm", [
    "exec",
    "vitest",
    "run",
    ...arguments_,
    "--reporter=default",
    "--reporter=json",
    `--outputFile.json=${report}`,
  ]);
  const result = JSON.parse(readFileSync(report, "utf8"));
  const files = result.testResults.length;
  if (
    files !== expected.files ||
    result.numFailedTests !== 0 ||
    result.numPassedTests !== result.numTotalTests ||
    result.numTotalTests === 0 ||
    (expected.tests !== undefined && result.numTotalTests !== expected.tests)
  ) {
    throw new Error(
      `vitest ${arguments_.join(" ") || "(package test)"}: ran ${String(files)} file(s) and ${String(result.numPassedTests)}/${String(result.numTotalTests)} test(s); expected ${String(expected.files)} file(s)${expected.tests === undefined ? "" : ` and ${String(expected.tests)} test(s)`}`,
    );
  }
};
const write = (path, text) => {
  mkdirSync(dirname(join(consumer, path)), { recursive: true });
  writeFileSync(join(consumer, path), `${text.trim()}\n`);
};

try {
  run("pnpm", ["pack", "--pack-destination", consumer], root);
  const tarball = readdirSync(consumer).find((file) => file.endsWith(".tgz"));
  if (!tarball) throw new Error("pnpm pack produced no tarball");

  // (a) The tarball carries the built entry points and the version-matched docs.
  const packed = new Set(
    execFileSync("tar", ["-tzf", join(consumer, tarball)], { encoding: "utf8" })
      .split("\n")
      .map((path) => path.replace(/^package\//, "")),
  );
  const required = [
    "dist/client/index.js",
    "dist/client/index.d.ts",
    "dist/component/convex.config.js",
    "dist/component/convex.config.d.ts",
    "dist/component/_generated/component.d.ts",
    "src/test.ts",
    "README.md",
    "LICENSE",
    "CHANGELOG.md",
    "llms.txt",
    ...readdirSync(join(root, "docs"))
      .filter((file) => file.endsWith(".md"))
      .map((file) => `docs/${file}`),
  ];
  const missing = required.filter((file) => !packed.has(file));
  if (missing.length > 0) {
    throw new Error(
      `tarball is missing ${missing.join(", ")} (run pnpm build first)`,
    );
  }

  write(
    "package.json",
    JSON.stringify({
      private: true,
      type: "module",
      // Same overrides as this repo; pnpm reads them from package.json.
      pnpm: {
        ignoredBuiltDependencies: ["esbuild"],
        overrides: pnpm.overrides,
      },
    }),
  );
  // Same release-age gate as this repo; pnpm 10 reads it only from this file.
  copyFileSync(
    join(root, "pnpm-workspace.yaml"),
    join(consumer, "pnpm-workspace.yaml"),
  );
  run("pnpm", [
    "add",
    join(consumer, tarball),
    ...[
      "convex",
      "convex-test",
      "vitest",
      "vite",
      "typescript",
      "@edge-runtime/vm",
    ].map(devSpec),
  ]);

  // (b) Every runtime entry point loads in Node.
  run("node", [
    "--input-type=module",
    "--eval",
    `
const client = await import("${name}");
if (typeof client.Suppression !== "function") throw new Error(". has no Suppression");
for (const entry of ["${name}/convex.config", "${name}/convex.config.js"]) {
  const config = await import(entry);
  if (!config.default) throw new Error(entry + " has no default export");
}
`,
  ]);

  // A host app: its own table, two mounts, host functions over the client.
  write(
    "convex/schema.ts",
    `
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  contacts: defineTable({ contactHash: v.string(), rawEmail: v.string() }),
});
`,
  );
  write(
    "convex/convex.config.ts",
    `
import suppression from "${name}/convex.config.js";
import { defineApp } from "convex/server";

const app = defineApp();
app.use(suppression);
app.use(suppression, { name: "marketing" });
export default app;
`,
  );
  // Stub of what \`convex codegen\` writes for this host.
  write(
    "convex/_generated/api.ts",
    `
import type { ComponentApi } from "${name}/_generated/component.js";
import { anyApi, componentsGeneric } from "convex/server";

export const api = anyApi;
export const components = componentsGeneric() as unknown as {
  suppression: ComponentApi<"suppression">;
  marketing: ComponentApi<"marketing">;
};
`,
  );
  write(
    "convex/dnc.ts",
    `
import { Suppression } from "${name}";
import { mutationGeneric, queryGeneric } from "convex/server";
import { v } from "convex/values";
import { components } from "./_generated/api.js";

const dnc = new Suppression(components.suppression);
const marketing = new Suppression(components.marketing);

export const unsubscribe = mutationGeneric({
  args: { contactHash: v.string() },
  returns: v.null(),
  handler: async (ctx, { contactHash }) => {
    await dnc.suppress(ctx, contactHash, "unsubscribe", { channel: "email" });
    return null;
  },
});

export const eligible = queryGeneric({
  args: { contactHash: v.string(), mount: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { contactHash, mount }) =>
    (mount === "marketing" ? marketing : dnc).isEligible(ctx, contactHash, {
      channel: "email",
    }),
});
`,
  );
  write(
    "convex/dnc.test.ts",
    `
/// <reference types="vite/client" />
import { register } from "${name}/test";
import { convexTest } from "convex-test";
import { anyApi } from "convex/server";
import { expect, test } from "vitest";
import schema from "./schema.js";

test("register mounts the component beside a host schema", async () => {
  const t = convexTest(schema, import.meta.glob("./**/*.ts"));
  register(t);
  register(t, "marketing");

  await t.run(async (ctx) => {
    await ctx.db.insert("contacts", { contactHash: "h1", rawEmail: "a@example.com" });
  });
  const eligible = (mount: string) =>
    t.query(anyApi.dnc.eligible, { contactHash: "h1", mount });

  expect(await eligible("suppression")).toBe(true);
  await t.mutation(anyApi.dnc.unsubscribe, { contactHash: "h1" });
  expect(await eligible("suppression")).toBe(false);
  expect(await eligible("marketing")).toBe(true);
});
`,
  );
  // Every entry point, including the type-only ones, from one consumer file.
  write(
    "consumer.ts",
    `
import { Suppression, type SuppressionComponent } from "${name}";
import type { ComponentApi } from "${name}/_generated/component";
import type { ComponentApi as ComponentApiJs } from "${name}/_generated/component.js";
import config from "${name}/convex.config";
import configJs from "${name}/convex.config.js";
import { register } from "${name}/test";

declare const component: ComponentApi;
declare const componentJs: ComponentApiJs;
const client = new Suppression<{ ip: string }>(component, {
  proofValidator: (value) => value as { ip: string },
});
const fromJs: SuppressionComponent = componentJs;
void [client, fromJs, config, configJs, register];
`,
  );
  // This package test's own config, scoped to its own host under convex/.
  write(
    "vitest.config.mts",
    `
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "edge-runtime",
    include: ["convex/**/*.test.ts"],
    server: { deps: { inline: ["convex-test"] } },
  },
});
`,
  );

  // (e) Docs contract on the installed package, then its examples in a stub
  // host under readme/, with the README's vitest.config.mts as readme/'s config.
  const installed = join(consumer, "node_modules", name);
  const examples = checkDocumentation(installed, consumer);
  const vitestConfig = examples.find(
    ({ path }) => path === "vitest.config.mts",
  );
  if (!vitestConfig) {
    throw new Error("README Testing must show a // vitest.config.mts block");
  }
  write("readme/vitest.config.mts", vitestConfig.code);
  const readmeTests = examples.filter(({ path }) =>
    /\.test\.m?ts$/u.test(path),
  );
  if (readmeTests.length === 0) {
    throw new Error(
      "README Testing must show a // convex/<name>.test.ts block",
    );
  }
  const hostExamples = examples.filter((example) => example !== vitestConfig);
  const readmeFiles = writeHost(
    join(consumer, "readme"),
    convexHost(installed, hostExamples),
    hostExamples,
  ).map((file) => join("readme", file));

  // (c) The consumer and host type-check under both module resolutions.
  const files = [
    "consumer.ts",
    "convex/schema.ts",
    "convex/convex.config.ts",
    "convex/_generated/api.ts",
    "convex/dnc.ts",
    "convex/dnc.test.ts",
  ];
  for (const resolution of [
    ["--module", "NodeNext", "--moduleResolution", "NodeNext"],
    ["--module", "ESNext", "--moduleResolution", "Bundler"],
  ]) {
    run("pnpm", [
      "exec",
      "tsc",
      "--noEmit",
      "--strict",
      "--target",
      "ES2022",
      "--types",
      "vite/client",
      ...resolution,
      ...files,
    ]);
  }

  // (e) The docs examples import `./_generated/api` like a Convex app does, so
  // they type-check under Bundler resolution only.
  run("pnpm", [
    "exec",
    "tsc",
    "--noEmit",
    "--strict",
    "--target",
    "ES2022",
    "--module",
    "ESNext",
    "--moduleResolution",
    "Bundler",
    "--types",
    "vite/client",
    ...readmeFiles,
  ]);

  // (d) register + a suppress/isEligible round trip under Vitest, and (e) the
  // README test example.
  vitest([], { files: 1, tests: 1 });
  const readmeRoot = join(consumer, "readme");
  vitest(
    ["--root", readmeRoot, "--config", join(readmeRoot, "vitest.config.mts")],
    {
      files: readmeTests.length,
    },
  );
  console.log(
    "OK    package test: tarball, imports, types, register and docs contract",
  );
} finally {
  rmSync(consumer, { force: true, recursive: true });
}
