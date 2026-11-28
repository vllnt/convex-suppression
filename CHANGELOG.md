# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.1] - Unreleased

### Added

- The npm package now ships `docs/*.md`, `CHANGELOG.md` and `llms.txt`, so
  coding agents can read docs that match the installed version from
  `node_modules/@vllnt/convex-suppression/`. `llms.txt` links to bundled files
  with `./` paths. A test fails when a required file is missing from the
  tarball.

### Changed

- Removed the `by_hash` index; it was unused and a prefix of `by_hash_channel`.
  One less index entry written per suppression and less index storage. No
  migration is needed; the next deploy drops the index.
- Release automation: pinned actions, least-privilege permissions, npm trusted
  publishing with provenance; `@latest` is published only from a `vX.Y.Z` tag on
  `main`.
- Every push to `main` that touches the package or its shipped docs publishes a
  `@canary` build; the opt-in repository-variable gate is removed.
- The README install command now installs the stable release.

### Fixed

- `suppress` and `recordOptIn` now throw
  `ConvexError({ code: "INVALID_ARGUMENT", field })` for an empty `contactHash`,
  `channel`, `listKey` or `source`. `isEligible` previously answered `true` for
  an empty `contactHash` or `channel`; it now answers `false`, so the send gate
  fails closed. Documented that keys are matched exactly (no case, whitespace or
  plus-address normalization; the host normalizes). **Upgrade note:** a
  `suppress` or `recordOptIn` call that passed an empty string for one of these
  fields succeeded in 0.1.0 and now throws; check for empty values before
  calling. Omitting `channel` or `listKey` (global entry) is unaffected.
- The `./test` entry now type-checks for consumers using
  `moduleResolution: nodenext` (relative imports use `.js`; Vite client types
  are referenced). The README documents the `convex-test` and `vitest`
  requirement.
- `register(t)` from `./test` now accepts the host app's
  `convexTest(hostSchema)`; it was typed against the component's own schema, so
  any host schema with its own tables failed with TS2345. Types only; no runtime
  change.
- The `proofValidator` example in the `Suppression` JSDoc passed
  `v.object(...).parse`, which Convex validators do not have; it now shows a
  host parser `(unknown) => TProof`.

### Documentation

- README rewritten in the shared @vllnt layout: For coding agents, When to use,
  Install, Quick start, API (one row per export), Common tasks, Errors and
  fixes, Limits and gotchas, Compatibility, Testing, Security, Related
  packages, Contributing, Links, License and the vllnt footer. Badges moved to
  the end.
- `docs/API.md` checked against the code: one section per export and per
  `Suppression` method, the tables and indexes, and newly documented behavior:
  `"*"` as a `channel` or `listKey` targets the global entry, `reason:
  "global"` does not make an entry global, recording an opt-in again without
  `proof` removes the stored proof, the `proofValidator` return value is what
  is stored, an empty `channel` in `isSuppressed` checks only the global
  entry, and a `proofValidator` error from `recordOptIn` is thrown
  synchronously.
- `llms.txt` now has the package summary, When to use, a link to the errors
  table and the shared Ecosystem block.
- New `package.json` description and keywords, shared by the README and
  `llms.txt`.
- TSDoc summaries on every public export, and
  `@see https://oss.vllnt.com/packages/convex-suppression` on `Suppression`.
  Comment-only: `dist` changes only in comments and source maps.
- `pnpm test:package` now runs a docs contract test
  (`scripts/check-documentation.mjs`) on the installed tarball, and type-checks
  every README and `docs/API.md` TypeScript example against it; the README test
  example runs under Vitest.

## [0.1.0] - 2026-09-01

### Added

- First release of `@vllnt/convex-suppression` — the hash-keyed do-not-contact
  suppression list + opt-in proof (GDPR opt-out / CAN-SPAM).
- `suppress(contactHash, reason, { channel? })` adds a `(contactHash, channel)`
  anti-membership tombstone; `reason` is `unsubscribe`/`bounce`/`complaint`/
  `manual`/`global`. Omitting `channel` marks a global all-channel suppression.
- `unsuppress(contactHash, channel?)` removes an entry (a rare, audited
  re-subscribe); returns whether an entry was removed.
- `isSuppressed(contactHash, channel?)` returns the matching suppression (a
  global tombstone matches every channel and wins) or `null`.
- `recordOptIn(contactHash, { listKey?, source, proof? })` records an opt-in
  proof; `getOptInProof(contactHash, listKey?)` fetches it.
- `isEligible(contactHash, { channel?, listKey?, requireOptIn? })` — the single
  send gate: `¬suppressed [∧ confirmed]`. Suppression always blocks; the opt-in
  requirement is per call.
- Hash-keyed: the component stores only the host's opaque `contactHash`, never
  raw PII, so a suppression survives erasure of the subject.
- Idempotent writes: re-suppressing or re-recording an opt-in on its key tuple
  updates in place — a replayed bounce/complaint/confirmation webhook never
  duplicates a row.
- Typed generics: `Suppression<TProof>` with an optional `proofValidator` host
  parser narrowing the opaque stored opt-in `proof` at the client boundary on
  write and read — no `v.any()` dump, no unchecked cast.
- Server-sourced time: every handler stamps `createdAt`/`confirmedAt` from
  `Date.now()` inside the mutation — no caller-supplied clock.
- Mount-safe: correct under multiple `app.use(component, { name })` mounts —
  each instance is a sandboxed, independent do-not-contact list.

### Changed

- Treat Convex `_generated` output as CLI-owned, exclude it from formatting, and
  expose a dedicated codegen script.
- Refresh all direct dependencies to their latest compatible releases for canary
  validation.
- Require `convex@^1.45.0` and update `convex-test` to `^0.0.56`.
