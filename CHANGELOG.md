# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-06-14

### Added

- First release of `@vllnt/convex-suppression` — the hash-keyed do-not-contact
  suppression list + opt-in proof (GDPR opt-out / CAN-SPAM).
- `suppress(contactHash, reason, { channel? })` adds a `(contactHash, channel)`
  anti-membership tombstone; `reason` is `unsubscribe`/`bounce`/`complaint`/
  `manual`/`global`. Omitting `channel` marks a global all-channel suppression.
- `unsuppress(contactHash, channel?)` removes an entry (a rare, audited
  re-subscribe); returns whether an entry was removed.
- `isSuppressed(contactHash, channel?)` returns the matching suppression (a global
  tombstone matches every channel and wins) or `null`.
- `recordOptIn(contactHash, { listKey?, source, proof? })` records an opt-in proof;
  `getOptInProof(contactHash, listKey?)` fetches it.
- `isEligible(contactHash, { channel?, listKey?, requireOptIn? })` — the single
  send gate: `¬suppressed [∧ confirmed]`. Suppression always blocks; the opt-in
  requirement is per call.
- Hash-keyed: the component stores only the host's opaque `contactHash`, never raw
  PII, so a suppression survives erasure of the subject.
- Idempotent writes: re-suppressing or re-recording an opt-in on its key tuple
  updates in place — a replayed bounce/complaint/confirmation webhook never
  duplicates a row.
- Typed generics: `Suppression<TProof>` with an optional `proofValidator` host
  parser narrowing the opaque stored opt-in `proof` at the client boundary on write
  and read — no `v.any()` dump, no unchecked cast.
- Server-sourced time: every handler stamps `createdAt`/`confirmedAt` from
  `Date.now()` inside the mutation — no caller-supplied clock.
- Mount-safe: correct under multiple `app.use(component, { name })` mounts — each
  instance is a sandboxed, independent do-not-contact list.
