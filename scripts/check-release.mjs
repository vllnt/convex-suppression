// Release guard, run by `pnpm lint`. Fails when the publish workflow loses an
// invariant (tag-only @latest, provenance, no npm token, no bump-and-push), or
// when CHANGELOG.md does not hold exactly one section for the package.json
// version that the "Verify release tag" step would read release notes from.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const packageText = readFileSync("package.json", "utf8");
const workflow = readFileSync(".github/workflows/publish.yml", "utf8");
const contributing = readFileSync("CONTRIBUTING.md", "utf8");
const changelog = readFileSync("CHANGELOG.md", "utf8");

assert.doesNotMatch(
  packageText,
  /"(?:alpha|release|prepublishOnly|canary:first)"\s*:|npm publish/u,
  "package.json must not publish: releases run only in publish.yml",
);
assert.doesNotMatch(
  workflow,
  /inputs\.bump|git commit|git push origin main/u,
  "publish.yml must not bump versions or push to main",
);
assert.match(
  workflow,
  /tags: \["v\*\.\*\.\*"\]/u,
  "publish.yml must trigger stable releases on vX.Y.Z tags",
);
assert.match(
  workflow,
  /github\.ref == 'refs\/heads\/main'/u,
  "publish.yml must publish canaries only from main",
);
assert.match(
  workflow,
  /--provenance/u,
  "publish.yml must publish with provenance",
);
assert.match(
  workflow,
  /cancel-in-progress: false/u,
  "publish.yml must not cancel an in-progress publish",
);
assert.doesNotMatch(
  workflow,
  /_authToken\s*=|NPM_TOKEN/u,
  "publish.yml must use trusted publishing, not an npm token",
);
assert.doesNotMatch(
  contributing,
  /pnpm (?:alpha|release)|for patch\/minor\/major/u,
  "CONTRIBUTING.md must not document local release commands",
);

const { version } = JSON.parse(packageText);
assert.match(
  version,
  /^\d+\.\d+\.\d+$/u,
  `package.json version ${version} is not a stable semver`,
);
const headings = changelog.split("\n").filter((line) => line.startsWith("## "));
const current = headings.filter((line) => line.startsWith(`## [${version}]`));
assert.equal(
  current.length,
  1,
  `CHANGELOG.md must have exactly one "## [${version}]" heading, found ${current.length}`,
);
assert.deepEqual(
  headings.filter((line) => /^## \[Unreleased\]/iu.test(line)),
  [],
  `CHANGELOG.md must not have a "## [Unreleased]" heading; put the notes under "## [${version}]"`,
);
