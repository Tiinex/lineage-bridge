# Tiinex Lineage Bridge — Milestone 2 DoD

## Purpose

Make the Milestone 1 bridge externally portable and safer at source boundaries.

Milestone 1 proved the local headless bridge scaffold.

Milestone 2 makes the bridge usable when the agent or caller has only an origin reference, especially a GitHub URL, without depending on a sibling local mirror or unsafe local file access.

This milestone is still not a full runtime.

This milestone hardens source access, origin resolution, cache semantics, and agent-facing access discipline.

---

## Implementer Note

Treat Phases 1–5 as the executable Milestone 2 core.

Do not start Phase 6–8 until the source contract, remote GitHub fetch, mutability policy, remote schema resolution, local sandbox, and cache truth are stable and tested.

Phase 6–8 are follow-up surfaces inside Milestone 2. They are not permission to start with CLI polish, instruction-file polish, or broad agent-behavior policy before the source layer is stable.

The agent-preferred bridge-tool path is part of the Milestone 2 done-state, not part of M2 Leaf 1.

The first implementation leaf should be:

```text
M2 Leaf 1:
  Source Contract Upgrade only

Scope:
  source strategy metadata
  remote fetch abstraction
  workspace root config shape
  timeout/retry/budget input shapes
  no real remote fetch yet unless needed for type proof
  no CLI polish
  no instruction files
  no agent access policy yet
```

Stop for review after M2 Leaf 1 before moving into actual remote fetch behavior.

Current progress:

* [x] M2 Leaf 1 completed: source strategy metadata, remote fetch abstraction shape, workspace root config shape, timeout/retry/budget input shapes, and output compatibility are now represented in shared core and current source outputs without starting real remote fetch behavior.
* [x] M2 Leaf 1.1 completed: async source-boundary is now locked through a separate `resolveArtifactAsync` entrypoint, `sourceAccess` now propagates through structure/tree/details/children surfaces, and current source output explicitly reports that workspace policy is not yet enforced.

---

## Starting Point

Assume Milestone 1 is complete as a local scaffold.

Already available:

* shared core result, identity, validation-basis, budget, handoff, and projection shapes
* local file source adapter
* GitHub blob/raw reference parsing through local mirror fallback
* metadata-first `resolveArtifact`
* sanitized public outputs
* partial root/topic/task validation
* validation basis
* lineage traversal
* relevant slices
* handoff packet
* schema contract summaries
* tree/index/details/children/action projections
* global rule that truncated raw source is not parsed as trustworthy envelope state
* thin CLI entry point

Milestone 2 must preserve all Milestone 1 invariants.

---

## M2 Core Scope

Milestone 2 should be implemented in sequence.

Core scope:

* remote GitHub fetch
* GitHub ref mutability policy
* remote schema resolution
* local workspace sandbox
* source/cache identity safety

Follow-up scope inside M2 only after source contract is stable:

* agent access guidance
* CLI option exposure
* optional live integration tests

Do not start with instruction files, CLI polish, or agent behavior policy before the source contract is stable.

---

## Primary Milestone

Create a hardened source-access layer that can:

* [ ] Resolve public GitHub artifact URLs remotely without requiring a local mirror.
* [ ] Preserve local mirror support as an optimization or dev fallback.
* [ ] Sandbox local file access behind explicit workspace roots.
* [ ] Preserve canonical identity across equivalent GitHub blob/raw/source forms.
* [ ] Report source trust, mutability, and versioning consistently.
* [ ] Prevent path traversal from trace-controlled references.
* [ ] Keep exact validation dependent on complete raw source only.
* [ ] Preserve validation basis across remote/local source differences.
* [ ] Expose cache-safe identity without hiding mutable-origin risk.
* [ ] Provide enough bridge-tool output that agents can use a preferred bridge-tool path over raw `.trace.md` reads by the end of Milestone 2.

The final agent-preferred path requirement belongs to the Milestone 2 done-state.

It must not be implemented before the source contract, remote fetch behavior, mutability policy, remote schema resolution, local sandbox, and cache truth are stable.

---

## Non-Goals

* [ ] Do not build a full runtime server.
* [ ] Do not build a full web app.
* [ ] Do not build full schema-driven validators for every Tiinex schema.
* [ ] Do not redesign Milestone 1 output shapes unless a concrete blocker proves it necessary.
* [ ] Do not make GitHub the only possible origin protocol.
* [ ] Do not require network access for local-only use.
* [ ] Do not treat branch URLs as immutable.
* [ ] Do not silently fetch arbitrary local paths from trace content.
* [ ] Do not make `.trace.md` raw reads the normal agent orientation path.
* [ ] Do not move parser, validator, lineage, projection, slice, or handoff logic into CLI, IDE, or transport layers.

---

## Source Adapter V2

The source adapter layer must support multiple source strategies behind one shared contract.

Required source strategies:

* local workspace source
* GitHub remote source
* GitHub local mirror fallback

The caller should not need to know which strategy produced the content except through explicit metadata.

DoD:

* [ ] Source adapter contract remains transport-neutral.
* [ ] GitHub remote fetch is implemented behind `packages/sources`.
* [ ] GitHub local mirror fallback remains clearly identified as local mirror behavior.
* [ ] Local workspace resolution is sandboxed.
* [ ] All source strategies return the same core source shape.
* [ ] Source strategy used is visible in output metadata or source warnings.
* [ ] Source strategy differences do not change parent/origin semantics.
* [ ] Source strategy differences do not bypass raw-source or truncation rules.

---

## Remote GitHub Fetch

Implement remote fetch for public GitHub artifact URLs.

Supported first:

* `https://github.com/{owner}/{repo}/blob/{ref}/{path}`
* `https://raw.githubusercontent.com/{owner}/{repo}/{ref}/{path}`

Optional later:

* GitHub Contents API URLs
* private repositories
* authenticated GitHub requests

Remote GitHub fetch must distinguish:

* commit-pinned refs
* tag refs
* branch refs
* unsupported refs
* not found
* unauthorized
* rate limited
* network failure
* raw source unavailable
* rendered-only availability

DoD:

* [ ] Commit-pinned GitHub blob URLs can be fetched remotely.
* [ ] Commit-pinned GitHub raw URLs can be fetched remotely.
* [ ] Equivalent blob/raw URLs for the same commit/path produce the same immutable source identity.
* [ ] Branch refs are marked mutable.
* [ ] Commit refs are marked immutable.
* [ ] Remote fetch reports source strategy as remote GitHub.
* [ ] Remote fetch does not require a local sibling repo.
* [ ] Remote fetch preserves `rawContent` opt-in behavior.
* [ ] Remote fetch respects `maxArtifactBytes`.
* [ ] Remote fetch reports truncation without allowing exact validation over truncated content.
* [ ] Remote fetch maps GitHub failure modes into structured source statuses.
* [ ] Remote fetch failures do not become artifact validation failures.

---

## GitHub Ref And Mutability Policy

Remote GitHub origin handling must preserve mutability truth.

Rules:

* A full commit SHA ref is immutable.
* A branch ref is mutable.
* A tag ref is versioned but may not be treated as immutable unless the adapter can prove tag immutability.
* A raw URL is not automatically immutable.
* A blob URL is not automatically immutable.
* Mutability comes from the resolved ref, not from URL shape alone.

DoD:

* [ ] Commit SHA refs produce `immutable: true`.
* [ ] Branch refs produce `mutable` or equivalent non-immutable state.
* [ ] Tag refs produce explicit versioned-but-not-proven-immutable state unless proven.
* [ ] Validation basis exposes when artifact is immutable but schema reference is mutable.
* [ ] Handoff packet preserves mutability warnings.
* [ ] Cache identity never treats mutable branch content as immutable-origin cache.
* [ ] Tests cover commit ref versus branch ref behavior.

---

## Schema Resolution Over Remote Origins

When an artifact is loaded from a versioned origin, relative schema links should resolve against the artifact source context.

For GitHub artifacts:

* relative schema links should resolve within the same repository
* commit-pinned artifact refs should prefer the same commit ref for relative schema paths
* branch-based artifact refs should preserve mutable schema risk
* absolute schema links should be resolved as declared
* unresolved schema fetch should produce incomplete validation, not generic failure

Artifact envelope parsing must remain independently useful when schema fetch fails.

A readable artifact with an unreadable or unresolved schema should produce:

* parsed envelope when raw artifact source is complete
* incomplete validation
* schema resolution finding
* validation basis showing unresolved schema source
* no generic artifact failure

DoD:

* [ ] Relative schema paths from GitHub artifacts resolve against the same repo/ref context.
* [ ] Commit-pinned artifact plus relative schema path preserves commit pinning.
* [ ] Branch artifact plus relative schema path is reported as mutable.
* [ ] Absolute schema URLs are resolved as absolute sources.
* [ ] Schema source metadata is included in validation basis.
* [ ] Artifact-pinned/schema-mutable condition is surfaced.
* [ ] Schema fetch failure results in incomplete validation.
* [ ] Schema fetch failure does not erase envelope parsing when raw source is available and complete.
* [ ] Artifact envelope parsing remains separate from schema validation failure.

---

## Local Workspace Sandbox

Local file access must be safe enough for agent-facing tooling.

Local source resolution must be constrained by explicit workspace roots.

Rules:

* local reads are allowed only under configured workspace roots
* relative parent trace resolution must stay inside allowed roots unless explicitly allowed
* path traversal must be rejected
* symlink behavior must be explicit
* absolute paths outside configured roots must be blocked
* trace content must not be able to force arbitrary local file reads

DoD:

* [ ] Source adapter accepts configured workspace roots.
* [ ] Local file reads outside allowed roots are blocked.
* [ ] Parent trace resolution cannot escape allowed roots by `..`.
* [ ] Origin recovery candidates cannot trigger arbitrary local reads.
* [ ] Symlink policy is explicit.
* [ ] Unsafe local path attempts produce structured blocked/unsupported status.
* [ ] Blocked local path attempts do not throw uncaught errors.
* [ ] Tests cover path traversal attempts.
* [ ] Tests cover absolute path outside workspace.
* [ ] Tests cover allowed local workspace reads.

---

## Cache And Conditional Fetch

Milestone 2 should use Milestone 1 cache identity fields without hiding source truth.

Cache behavior must be conservative.

Rules:

* immutable-origin cache may be used for commit-pinned GitHub content
* content cache may be used when content hash is known
* mutable-origin cache must not be treated as immutable
* cached validation must include validation basis
* stale cached source must not be reported as fresh immutable source
* cache use must be visible in output when relevant
* fresh resolution requests must not be hidden by cache

If a caller explicitly requests fresh origin resolution and the origin fetch fails, cached content may be returned only as degraded fallback metadata.

The output must still report:

* fresh fetch failure
* cached content use
* cache age or cache basis when available
* that origin truth was not freshly verified

DoD:

* [ ] Remote GitHub source can produce cache-safe identity.
* [ ] Cache key distinguishes immutable-origin cache from content-only cache.
* [ ] Mutable sources are not cached as immutable origins.
* [ ] Validation basis can show whether cached content was used.
* [ ] Cache metadata does not replace source metadata.
* [ ] Cache miss/fetch failure states are distinct.
* [ ] Fresh fetch failure is still reported when cached fallback content is used.
* [ ] Cached fallback does not claim fresh origin verification.
* [ ] Tests cover immutable-origin cache identity.
* [ ] Tests cover mutable branch non-immutable cache identity.
* [ ] Tests cover fresh fetch failure with cached fallback.

---

## Operational Network Budgets

Remote source access must be bounded.

Budget categories:

* max artifact bytes
* max total fetches
* max schema fetches
* max redirect count
* request timeout
* total operation timeout
* retry count
* cancellation signal where supported

DoD:

* [ ] Remote fetch respects `maxArtifactBytes`.
* [ ] Remote fetch reports truncation.
* [ ] Remote fetch does not parse truncated source as complete.
* [ ] Source adapter respects fetch count budgets.
* [ ] Schema resolution respects schema fetch budgets.
* [ ] Timeouts produce structured network/timeout status.
* [ ] Retry policy is explicit and conservative.
* [ ] Budget exhaustion is distinct from invalid artifact state.
* [ ] Tests cover timeout or simulated timeout.
* [ ] Tests cover fetch budget exhaustion.

---

## Agent Access Guardrails

Agents should prefer bridge tools over raw `.trace.md` reads.

This is not a security boundary by itself.

This guidance is an affordance, not enforcement.

Hard blocking of raw `.trace.md` reads belongs in tool policy, sandbox policy, or runtime permissions, not in instruction text alone.

Milestone 2 should provide soft and/or tool-level guidance that makes the correct path easier.

This section belongs to the Milestone 2 done-state and must not be implemented before Phases 1–5 are stable.

Preferred normal path:

* `readEnvelope`
* `validateArtifact`
* `getLineage`
* `getRelevantSlice`
* `getHandoffPacket`
* `getNodeDetails`

Raw trace reads should be reserved for:

* parser debugging
* checksum boundary debugging
* schema authoring
* validator repair
* exact markdown syntax inspection
* source adapter debugging

DoD:

* [ ] Repo includes a short agent-facing instruction or policy note for `.trace.md` access.
* [ ] The note says bridge tools are preferred for orientation and lineage traversal.
* [ ] The note does not pretend to be a sandbox.
* [ ] Any raw-read override path requires a reason in tool/API surfaces where practical.
* [ ] Bridge outputs include enough handoff/slice detail that raw reads are not needed for normal orientation.
* [ ] The policy does not block legitimate parser/schema/validator debugging.
* [ ] Any future hard block is implemented through tool policy, sandbox policy, or runtime permissions, not instruction text alone.

Suggested future file:

```text
.github/instructions/trace-files.instructions.md
```

Suggested scope:

```yaml
applyTo: "**/*.trace.md"
```

---

## CLI And Test Harness

The CLI remains a thin adapter.

Milestone 2 should improve the CLI only where needed to expose new shared core behavior.

This section belongs to the Milestone 2 follow-up surface and must not be implemented before Phases 1–5 are stable.

DoD:

* [ ] CLI can call remote GitHub fetch through shared source adapter.
* [ ] CLI can pass workspace root configuration for local sandboxing.
* [ ] CLI can pass source budgets.
* [ ] CLI output preserves core output metadata.
* [ ] CLI does not implement source policy itself.
* [ ] CLI does not implement parser/validator/traversal logic.
* [ ] Tests or smoke commands document remote and local source usage.

---

## Testing Strategy

Remote behavior should be testable without relying on live network in every test run.

Use:

* fake fetcher unit tests
* fixture response tests
* optional live integration test
* sandboxed temporary directory tests
* regression tests for all Milestone 1 invariants

DoD:

* [ ] Unit tests use injectable fetcher or equivalent remote-source abstraction.
* [ ] Remote GitHub parsing tests do not require network.
* [ ] Optional live GitHub integration test is clearly marked.
* [ ] Local sandbox tests use temporary directories.
* [ ] Path traversal tests are included.
* [ ] Truncation regression tests still pass.
* [ ] Raw-output sanitation regression tests still pass.
* [ ] Tree/handoff/relevant-slice tests still pass.
* [ ] `npm run build` passes.
* [ ] `npm test` passes.

---

## Implementation Order

### Phase 1 — Source Contract Upgrade

* [x] Define source strategy metadata.
* [x] Define remote fetch abstraction.
* [x] Define workspace root config shape.
* [x] Define timeout/retry/budget inputs.
* [x] Preserve existing output shape compatibility.

### Phase 2 — Remote GitHub Fetch

* [ ] Implement GitHub URL parsing for blob/raw URLs.
* [ ] Implement remote raw fetch.
* [ ] Map GitHub fetch errors to structured statuses.
* [ ] Preserve metadata-first default output.
* [ ] Preserve raw opt-in behavior.
* [ ] Preserve truncation rules.

### Phase 3 — GitHub Identity And Mutability

* [ ] Normalize GitHub references.
* [ ] Compute immutable source identity for commit refs.
* [ ] Mark branch refs as mutable.
* [ ] Preserve alias collapse for equivalent blob/raw commit refs.
* [ ] Preserve alias conflict for divergent refs.
* [ ] Update cache identity behavior for remote source.

### Phase 4 — Remote Schema Resolution

* [ ] Resolve relative schema links from GitHub artifact context.
* [ ] Preserve commit-pinned schema resolution when artifact is commit-pinned.
* [ ] Surface artifact-pinned/schema-mutable risk.
* [ ] Preserve incomplete validation when schema fetch fails.
* [ ] Preserve readable artifact envelope when schema fetch fails and artifact raw source is complete.

### Phase 5 — Local Sandbox

* [ ] Add workspace root allowlist.
* [ ] Block local paths outside allowed roots.
* [ ] Block parent/origin traversal outside allowed roots.
* [ ] Add symlink policy.
* [ ] Add path traversal tests.

### Phase 6 — Agent Access Guardrails

Do not start this phase until Phases 1–5 are stable and reviewed.

* [ ] Add short `.trace.md` access policy note or instruction file.
* [ ] Prefer bridge tools over raw trace reads.
* [ ] Document legitimate raw-read exceptions.
* [ ] Add raw-read override shape only if there is a concrete tool surface for it.
* [ ] Do not present instruction text as enforcement.

### Phase 7 — CLI Exposure

Do not start this phase until Phases 1–5 are stable and reviewed.

* [ ] Expose source strategy/budget/workspace options through CLI.
* [ ] Keep CLI thin.
* [ ] Add CLI smoke examples.

### Phase 8 — Acceptance Tests

Do not start optional live or broad integration tests until Phases 1–5 are stable and reviewed.

* [ ] Remote GitHub URL works without local mirror.
* [ ] Local workspace sandbox blocks unsafe reads.
* [ ] Commit-pinned GitHub artifact produces immutable source identity.
* [ ] Branch GitHub artifact is mutable.
* [ ] Relative schema from commit-pinned GitHub artifact resolves against commit context.
* [ ] Truncated remote raw source is not parsed as complete.
* [ ] Fresh fetch failure with cached fallback remains visible as degraded state.
* [ ] Fresh chat can orient from remote GitHub artifact through bridge tools.

---

## Done Criteria

Milestone 2 is done when:

* [ ] A public commit-pinned GitHub artifact can be resolved remotely without local mirror.
* [ ] A public GitHub raw URL and blob URL for the same commit/path produce equivalent identity.
* [ ] Branch refs are reported as mutable.
* [ ] Commit refs are reported as immutable.
* [ ] Relative schema links resolve correctly from GitHub artifact context.
* [ ] Artifact/schema mutability mismatch is surfaced.
* [ ] Artifact envelope parsing still works when schema fetch fails but artifact raw source is complete.
* [ ] Local file reads are constrained by workspace roots.
* [ ] Path traversal from trace content is blocked.
* [ ] Remote fetch failures are structured and not confused with validation failures.
* [ ] Remote source access respects budgets and truncation rules.
* [ ] Cache identity is safe for immutable, mutable, and unsupported sources.
* [ ] Cached fallback does not mask fresh fetch failure.
* [ ] CLI exposes the new source behavior without owning source logic.
* [ ] Agent-facing guidance prefers bridge tools over raw `.trace.md` reads without claiming to enforce sandboxing.
* [ ] All Milestone 1 regression tests still pass.
* [ ] New Milestone 2 tests pass.

---

## Final Acceptance Test

Start in a clean environment with no local Tiinex docs mirror.

Give the bridge only:

```text
https://github.com/Tiinex/docs/blob/<commit-sha>/.topics/.../artifact.trace.md
```

The bridge must answer, without broad repo traversal or raw manual `.trace.md` inspection:

* what artifact is current
* what canonical artifact id represents it
* whether the GitHub origin is immutable or mutable
* what schema governs it
* whether schema resolution was complete
* whether artifact and schema were resolved from the same immutable context
* whether validation is valid, invalid, incomplete, unknown, unsupported, blocked, or partial
* what validation basis was used
* whether parent traversal is available
* what origin recovery candidates exist
* whether raw source was complete or truncated
* whether cached content was used
* whether origin truth was freshly verified
* what a fresh chat should read next
* what it should not traverse unless needed

If this requires a local sibling repository, Milestone 2 is not done.

---

## Final Instruction To Implementer

Do not build a full runtime yet.

Do not build a web app yet.

Do not expand validators into full schema coverage unless source hardening exposes a concrete blocker.

Milestone 2 is about making the Milestone 1 bridge portable and safer at source boundaries.

The implementation is not complete until remote GitHub fetch, local workspace sandboxing, source mutability truth, cache identity safety, and agent trace-access guidance are represented in shared core or thin documented surfaces.
