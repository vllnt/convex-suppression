// @vitest-environment node
// The npm tarball must carry the version-matched docs coding agents read from
// node_modules, and nothing contributor-only. Uses `npm pack --dry-run`, so it
// needs no build and does not check `dist/`.
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { posix } from "node:path";
import { describe, expect, it } from "vitest";

const [pack] = JSON.parse(
  execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  }),
);
const packed = new Set(pack.files.map((file) => file.path));

const docs = readdirSync("docs")
  .filter((name) => name.endsWith(".md"))
  .map((name) => `docs/${name}`);
const required = [
  "package.json",
  "README.md",
  "LICENSE",
  "CHANGELOG.md",
  "llms.txt",
  "src/client/index.ts",
  "src/test.ts",
  ...docs,
];
const forbidden =
  /(?:^|\/)(?:AGENTS|CLAUDE|CONTRIBUTING|ROADMAP|RELEASING|RELEASE_NOTES|ANALYSIS)\.md$|^(?:\.claude|\.github|example|scripts|tests?|coverage|specs?)\/|\.(?:test|spec)\.[cm]?[jt]sx?$/i;

describe("npm tarball", () => {
  it.each(required)("ships %s", (file) => {
    expect(packed.has(file)).toBe(true);
  });

  it("ships no contributor files, tests or specs", () => {
    expect([...packed].filter((file) => forbidden.test(file))).toEqual([]);
  });

  it("resolves every relative llms.txt link inside the tarball", () => {
    const index = readFileSync("llms.txt", "utf8");
    const local = [...index.matchAll(/\]\(([^)]+)\)/g)]
      .map(([, target]) => target)
      .filter((target) => !/^(?:https?:|#)/.test(target));
    expect(local.length).toBeGreaterThan(0);
    for (const target of local) {
      expect(target).toMatch(/^\.\//);
      expect(packed.has(posix.normalize(target.split("#")[0]))).toBe(true);
    }
  });
});
