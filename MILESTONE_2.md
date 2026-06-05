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

Current GitHub ref policy for the present M2 state:

* full 40-character SHA refs are the only refs currently treated as immutable commit refs
* non-commit refs, including short SHA and tag-like refs, are currently treated as mutable branch-like refs until explicit tag resolution exists

Current progress:

* [x] M2 Leaf 1 completed: source strategy metadata, remote fetch abstraction shape, workspace root config shape, timeout/retry/budget input shapes, and output compatibility are now represented in shared core and current source outputs without starting real remote fetch behavior.
* [x] M2 Leaf 1.1 completed: async source-boundary is now locked through a separate `resolveArtifactAsync` entrypoint, `sourceAccess` now propagates through structure/tree/details/children surfaces, and current source output explicitly reports that workspace policy is not yet enforced.
* [x] M2 Leaf 2 completed: `resolveArtifactAsync` now performs minimal real remote GitHub fetch for commit-pinned blob/raw URLs, preserves metadata-first default plus raw opt-in and truncation rules, collapses equivalent blob/raw commit refs to the same immutable identity, and maps remote failures to structured source status through fake-fetcher coverage.
* [x] M2 Leaf 3 completed: GitHub references now normalize onto a canonical blob-form reference, commit refs remain immutable with immutable-origin cache identity, and non-commit GitHub refs are reported as mutable branch refs with content-scoped cache identity in both local-mirror and remote source paths.
* [x] M2 Leaf 4 completed: async schema contract and validator surfaces now resolve schema targets against local or GitHub artifact context, preserve commit-pinned remote schema resolution through the async source path, and return truthful incomplete validation when the governing schema cannot actually be fetched.
* [x] M2 Leaf 4.1 completed: async schema contract and validator surfaces now explicitly surface artifact-pinned versus schema-mutable risk, so a commit-pinned artifact that resolves its governing schema through a mutable branch reference stays visibly degraded instead of reading as fully stable.
* [x] M2 Leaf 5 completed: direct local artifact reads now enforce configured workspace roots, local reads outside allowed roots can be blocked or explicitly allowed, and lineage plus action surfaces now carry the same workspace policy through parent traversal so path traversal outside the root is no longer silently followed.
* [x] M2 Leaf 5.1 completed: local sandbox symlink policy now has executable host-side coverage, including strict link blocking and within-workspace blocking when a linked path resolves outside the allowed root.
* [x] M2 Leaf 5.2 completed: milestone truth has been resynced to current test-backed progress, full 40-character SHA is now the only immutable commit form, and all other GitHub refs are explicitly treated as mutable branch-like refs until tag resolution exists.
* [x] M2 Leaf 5.3 completed: fresh remote GitHub resolution can now degrade to explicit cached fallback when the fresh fetch fails, source output keeps the fresh-failure warning visible, and validation basis now reports cached-content use plus lack of fresh origin verification.
* [x] M2 Leaf 5.4 completed: remote source access now enforces `maxFetches` before issuing remote GitHub fetches, async schema resolution consumes `maxSchemaFetches`, and budget exhaustion now surfaces as explicit blocked/incomplete budget state instead of silently proceeding as if another remote fetch were free.
* [x] M2 Leaf 5.5 completed: remote retry policy is now explicit and conservative, retrying only timeout and network-failure cases within remaining fetch budget, while rate-limited and other non-retryable failures stop immediately; simulated timeout coverage is now part of the regression suite.

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

* [x] Resolve public GitHub artifact URLs remotely without requiring a local mirror.
* [x] Preserve local mirror support as an optimization or dev fallback.
* [x] Sandbox local file access behind explicit workspace roots.
* [x] Preserve canonical identity across equivalent GitHub blob/raw/source forms.
* [x] Report source trust, mutability, and versioning consistently.
* [x] Prevent path traversal from trace-controlled references.
* [x] Keep exact validation dependent on complete raw source only.
* [x] Preserve validation basis across remote/local source differences.
* [x] Expose cache-safe identity without hiding mutable-origin risk.
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

* [x] Source adapter contract remains transport-neutral.
* [x] GitHub remote fetch is implemented behind `packages/sources`.
* [x] GitHub local mirror fallback remains clearly identified as local mirror behavior.
* [x] Local workspace resolution is sandboxed.
* [x] All source strategies return the same core source shape.
* [x] Source strategy used is visible in output metadata or source warnings.
* [x] Source strategy differences do not change parent/origin semantics.
* [x] Source strategy differences do not bypass raw-source or truncation rules.

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

* [x] Commit-pinned GitHub blob URLs can be fetched remotely.
* [x] Commit-pinned GitHub raw URLs can be fetched remotely.
* [x] Equivalent blob/raw URLs for the same commit/path produce the same immutable source identity.
* [x] Branch refs are marked mutable.
* [x] Commit refs are marked immutable.
* [x] Remote fetch reports source strategy as remote GitHub.
* [x] Remote fetch does not require a local sibling repo.
* [x] Remote fetch preserves `rawContent` opt-in behavior.
* [x] Remote fetch respects `maxArtifactBytes`.
* [ ] Remote fetch reports truncation without allowing exact validation over truncated content.
* [x] Remote fetch maps GitHub failure modes into structured source statuses.
* [x] Remote fetch failures do not become artifact validation failures.

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

* [x] Commit SHA refs produce `immutable: true`.
* [x] Branch refs produce `mutable` or equivalent non-immutable state.
* [ ] Tag refs produce explicit versioned-but-not-proven-immutable state unless proven.
* [x] Validation basis exposes when artifact is immutable but schema reference is mutable.
* [ ] Handoff packet preserves mutability warnings.
* [x] Cache identity never treats mutable branch content as immutable-origin cache.
* [x] Tests cover commit ref versus branch ref behavior.

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

* [x] Relative schema paths from GitHub artifacts resolve against the same repo/ref context.
* [x] Commit-pinned artifact plus relative schema path preserves commit pinning.
* [ ] Branch artifact plus relative schema path is reported as mutable.
* [x] Absolute schema URLs are resolved as absolute sources.
* [x] Schema source metadata is included in validation basis.
* [x] Artifact-pinned/schema-mutable condition is surfaced.
* [x] Schema fetch failure results in incomplete validation.
* [x] Schema fetch failure does not erase envelope parsing when raw source is available and complete.
* [x] Artifact envelope parsing remains separate from schema validation failure.

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

* [x] Source adapter accepts configured workspace roots.
* [x] Local file reads outside allowed roots are blocked.
* [x] Parent trace resolution cannot escape allowed roots by `..`.
* [ ] Origin recovery candidates cannot trigger arbitrary local reads.
* [x] Symlink policy is explicit.
* [x] Unsafe local path attempts produce structured blocked/unsupported status.
* [x] Blocked local path attempts do not throw uncaught errors.
* [x] Tests cover path traversal attempts.
* [x] Tests cover absolute path outside workspace.
* [x] Tests cover allowed local workspace reads.

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

* [x] Remote GitHub source can produce cache-safe identity.
* [x] Cache key distinguishes immutable-origin cache from content-only cache.
* [x] Mutable sources are not cached as immutable origins.
* [x] Validation basis can show whether cached content was used.
* [x] Cache metadata does not replace source metadata.
* [x] Cache miss/fetch failure states are distinct.
* [x] Fresh fetch failure is still reported when cached fallback content is used.
* [x] Cached fallback does not claim fresh origin verification.
* [x] Tests cover immutable-origin cache identity.
* [x] Tests cover mutable branch non-immutable cache identity.
* [x] Tests cover fresh fetch failure with cached fallback.

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

* [x] Remote fetch respects `maxArtifactBytes`.
* [x] Remote fetch reports truncation.
* [ ] Remote fetch does not parse truncated source as complete.
* [x] Source adapter respects fetch count budgets.
* [x] Schema resolution respects schema fetch budgets.
* [x] Timeouts produce structured network/timeout status.
* [x] Retry policy is explicit and conservative.
* [x] Budget exhaustion is distinct from invalid artifact state.
* [x] Tests cover timeout or simulated timeout.
* [x] Tests cover fetch budget exhaustion.

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

* [x] Unit tests use injectable fetcher or equivalent remote-source abstraction.
* [x] Remote GitHub parsing tests do not require network.
* [ ] Optional live GitHub integration test is clearly marked.
* [x] Local sandbox tests use temporary directories.
* [x] Path traversal tests are included.
* [x] Truncation regression tests still pass.
* [x] Raw-output sanitation regression tests still pass.
* [x] Tree/handoff/relevant-slice tests still pass.
* [x] `npm run build` passes.
* [x] `npm test` passes.

---

## Implementation Order

### Phase 1 — Source Contract Upgrade

* [x] Define source strategy metadata.
* [x] Define remote fetch abstraction.
* [x] Define workspace root config shape.
* [x] Define timeout/retry/budget inputs.
* [x] Preserve existing output shape compatibility.

### Phase 2 — Remote GitHub Fetch

* [x] Implement GitHub URL parsing for blob/raw URLs.
* [x] Implement remote raw fetch.
* [x] Map GitHub fetch errors to structured statuses.
* [x] Preserve metadata-first default output.
* [x] Preserve raw opt-in behavior.
* [x] Preserve truncation rules.

### Phase 3 — GitHub Identity And Mutability

* [x] Normalize GitHub references.
* [x] Compute immutable source identity for commit refs.
* [x] Mark branch refs as mutable.
* [x] Preserve alias collapse for equivalent blob/raw commit refs.
* [x] Preserve alias conflict for divergent refs.
* [x] Update cache identity behavior for remote source.

### Phase 4 — Remote Schema Resolution

* [x] Resolve relative schema links from GitHub artifact context.
* [x] Preserve commit-pinned schema resolution when artifact is commit-pinned.
* [x] Surface artifact-pinned/schema-mutable risk.
* [x] Preserve incomplete validation when schema fetch fails.
* [x] Preserve readable artifact envelope when schema fetch fails and artifact raw source is complete.

### Phase 5 — Local Sandbox

* [x] Add workspace root allowlist.
* [x] Block local paths outside allowed roots.
* [x] Block parent/origin traversal outside allowed roots.
* [x] Add symlink policy.
* [x] Add path traversal tests.

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

* [x] Remote GitHub URL works without local mirror.
* [x] Local workspace sandbox blocks unsafe reads.
* [x] Commit-pinned GitHub artifact produces immutable source identity.
* [x] Branch GitHub artifact is mutable.
* [x] Relative schema from commit-pinned GitHub artifact resolves against commit context.
* [x] Truncated remote raw source is not parsed as complete.
* [x] Fresh fetch failure with cached fallback remains visible as degraded state.
* [ ] Fresh chat can orient from remote GitHub artifact through bridge tools.

---

## Done Criteria

Milestone 2 is done when:

* [x] A public commit-pinned GitHub artifact can be resolved remotely without local mirror.
* [x] A public GitHub raw URL and blob URL for the same commit/path produce equivalent identity.
* [x] Branch refs are reported as mutable.
* [x] Commit refs are reported as immutable.
* [x] Relative schema links resolve correctly from GitHub artifact context.
* [x] Artifact/schema mutability mismatch is surfaced.
* [x] Artifact envelope parsing still works when schema fetch fails but artifact raw source is complete.
* [x] Local file reads are constrained by workspace roots.
* [x] Path traversal from trace content is blocked.
* [x] Remote fetch failures are structured and not confused with validation failures.
* [ ] Remote source access respects budgets and truncation rules.
* [x] Cache identity is safe for immutable, mutable, and unsupported sources.
* [x] Cached fallback does not mask fresh fetch failure.
* [ ] CLI exposes the new source behavior without owning source logic.
* [ ] Agent-facing guidance prefers bridge tools over raw `.trace.md` reads without claiming to enforce sandboxing.
* [x] All Milestone 1 regression tests still pass.
* [x] New Milestone 2 tests pass.

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
