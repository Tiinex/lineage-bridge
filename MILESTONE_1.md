# Tiinex Lineage Bridge — Milestone 1 DoD

## Purpose

Build the first model-agnostic tooling bridge for Tiinex lineage artifacts.

The bridge must let an agent, native chat, runtime, CLI, VSCode extension, web app, or future service retrieve bounded, validated Tiinex context without manually traversing the repository or reading raw lineage files by default.

This milestone is not a full runtime.

This milestone is the shared tooling surface that a future runtime can use.

---

## Current Starting Point

Assume the following already exists and should be reused where practical:

* Tiinex root schema shape exists.
* Root validator exists and is usable enough to build against.
* Topic and task schema validators exist or are close enough to use as early child-schema targets.
* A VSCode tree view exists and is useful as UX reference.
* Existing PoC/runtime code may contain useful parser, validator, lineage, tree view, checksum, and projection pieces.
* Existing PoC/runtime code may also contain old assumptions that must not become new architecture.

The goal is not to rewrite everything.

The goal is to extract the right core boundary so future tools do not repeat the old coupling mistakes.

---

## Primary Milestone

Create a shared headless core that can:

* [ ] Resolve a Tiinex artifact from an origin.
* [ ] Read its continuity envelope.
* [ ] Identify its governing schema.
* [ ] Validate it with available validators.
* [ ] Report validation basis.
* [ ] Distinguish raw-source validation from rendered-only access.
* [ ] Produce canonical artifact identity and alias data.
* [ ] Distinguish parent traversal from origin recovery.
* [ ] Return bounded lineage context.
* [ ] Return relevant slices instead of full raw files.
* [ ] Return a handoff packet that a fresh chat can use.
* [ ] Provide projections that UI surfaces can render without owning lineage logic.

---

## Repo Target

Preferred repo name:

```text
Tiinex/lineage-bridge
```

The repo name is intentionally not `runtime`.

This milestone builds bridge tooling first. A full runtime may be built later on top of the same shared core.

---

## Design Principle

Core owns behavior.

Entry points expose behavior.

Entry points must not fork behavior.

The architecture should follow this direction:

```text
source adapter
→ shared core
→ tool functions
→ projections
→ entry points
```

Allowed entry points may include:

* VSCode extension agent tools
* CLI
* MCP server
* HTTP API
* web app

No entry point is required only for its own sake.

An entry point is acceptable only when it exposes shared core behavior without duplicating parsing, validation, traversal, slicing, repair planning, projection, or handoff logic.

---

## Non-Goals

* [ ] Do not build a full web app in this milestone.
* [ ] Do not build a full runtime server in this milestone.
* [ ] Do not define agent roles in this milestone.
* [ ] Do not make VSCode the runtime core.
* [ ] Do not make GitHub a protocol requirement.
* [ ] Do not require hidden chat context for correctness.
* [ ] Do not require an agent to manually inspect raw `.trace.md` files during normal operation.
* [ ] Do not create a mega-tool that returns everything.
* [ ] Do not port the old PoC as architecture.
* [ ] Do not redesign the root schema unless implementation exposes a concrete blocker.
* [ ] Do not make editor UX, diagnostics UI, or agent identity part of the core contract.
* [ ] Do not place parser, validator, lineage, projection, or handoff logic inside an entry point layer.
* [ ] Do not treat a rendered markdown view as equivalent to raw source.

---

## Provenance Alignment

The bridge should be grounded in established provenance concepts where useful.

Use external provenance models as reference points, not as required storage formats.

Conceptual references:

* W3C PROV for entity, activity, agent, usage, generation, derivation, and attribution concepts.
* RO-Crate for self-described artifact/package thinking.
* OpenLineage and Marquez for service/API/UI separation.
* MCP for future agent/tool transport patterns.

Do not adopt these formats as Tiinex canonical storage:

* RDF
* JSON-LD
* OpenLineage job/run/dataset model
* Marquez backend assumptions

Tiinex remains markdown-first.

The bridge may map Tiinex concepts toward provenance vocabulary internally when helpful, but it must preserve Tiinex semantics:

* `Parent` means continuity lineage.
* `Origin` means grounding, provenance, recovery, or versioned source candidate.
* Parent and Origin must never be conflated.

DoD:

* [ ] The implementation preserves Tiinex `Parent` and `Origin` as separate concepts.
* [ ] The implementation does not require RDF, JSON-LD, OpenLineage, or Marquez formats.
* [ ] The implementation does not make provenance vocabulary override Tiinex root semantics.
* [ ] Any provenance mapping is internal or optional, not canonical storage.

---

## Repository Layout

Use a structure that prevents the IDE surface from becoming the runtime core.

Suggested layout:

```text
packages/
  core/
  parsers/
  validators/
  sources/
  projections/
  handoff/
  repairs/

ides/
  vscode/

apps/
  cli/
  server/
```

Expected ownership:

```text
packages/core
  shared types, artifact identity, result shapes, finding shapes, budgets, output versions

packages/parsers
  universal envelope parser, contract parser, integrity parser

packages/validators
  root/topic/task validators and shared validation policy

packages/sources
  origin/source adapters such as GitHub first, local later

packages/projections
  tree projection, structure index, validation overlay, node details

packages/handoff
  compact handoff packets and relevant slice outputs

packages/repairs
  repair planners later; no mutation in milestone 1 unless explicitly scoped

ides/vscode
  thin VSCode surface only

apps/cli
  optional thin entry point

apps/server
  later thin HTTP entry point
```

DoD:

* [ ] Shared behavior lives under packages, not under `ides/vscode`.
* [ ] VSCode code is a thin entry point or adapter.
* [ ] Parser logic is not duplicated inside VSCode.
* [ ] Validator logic is not duplicated inside VSCode.
* [ ] Traversal logic is not duplicated inside VSCode.
* [ ] Tree projection logic is not duplicated inside VSCode.
* [ ] Handoff generation is not duplicated inside VSCode.
* [ ] Output versioning is owned by shared core.
* [ ] Operational budgets are owned by shared core.
* [ ] Repair planning is separate from validation.

---

## Migration Rule From Existing PoC

Use existing `ai-provenance` code as reference and incubator, not as architecture source.

Extract clean reusable logic.

Do not copy VSCode/runtime coupling into the new core.

Expected extraction candidates:

* envelope parser
* contract parser
* integrity checksum logic
* root validator
* topic validator
* task validator
* lineage traversal primitives
* tree view UX ideas
* validation finding shapes
* source resolution helpers
* canonical identity helpers if present

Do not preserve these as core architecture:

* VSCode command handlers as runtime logic
* UI-specific schema policy
* hardcoded tree view action tables as source of truth
* duplicate parsers for the same envelope
* evidence-specific assumptions as generic provenance assumptions
* local filesystem assumptions as protocol assumptions
* rendered markdown as validation source
* transport-specific result shapes as core output contracts

DoD:

* [ ] Existing useful logic is identified before reimplementation.
* [ ] Extracted logic is moved behind shared core boundaries.
* [ ] Existing VSCode-specific coupling is not copied into core packages.
* [ ] The new bridge can be consumed by `ai-provenance` later.
* [ ] `ai-provenance` remains a consumer or reference, not the new runtime center.

---

## Source And Origin Model

The bridge must not assume GitHub as a protocol requirement.

Minimum input:

* a readable Tiinex trace artifact from an origin

Preferred input:

* a readable Tiinex trace artifact from a versioned origin

GitHub may be the first implemented source adapter, but the source adapter contract must support other origins later.

Every resolved origin should report:

* origin kind
* original reference
* normalized reference if available
* resolved repository or container if available
* path if available
* ref if available
* whether the origin is versioned
* whether the origin is immutable
* content hash if available
* access status
* raw content availability
* rendered content availability
* whether exact validation is possible
* whether exact validation is blocked by source form
* whether the content came from rendered view or raw source

Validation requiring exact syntax must use raw content, not rendered markdown.

DoD:

* [ ] A readable trace artifact can be resolved from an origin.
* [ ] GitHub can be used as the first practical adapter.
* [ ] GitHub is not assumed by shared core types.
* [ ] Source adapter output reports versioning status.
* [ ] Source adapter output reports mutability status.
* [ ] Source adapter output reports content hash when available.
* [ ] Source adapter output reports raw content availability.
* [ ] Source adapter output reports rendered-only access when raw source is unavailable.
* [ ] Source adapter output reports exact-validation capability.
* [ ] Syntax validation uses raw content.
* [ ] Rendered markdown is never used for exact syntax validation.

---

## Source Adapter Status

A source adapter must distinguish these states:

* readable
* not found
* unauthorized
* unsupported origin
* network failure
* malformed reference
* readable but mutable
* readable and versioned
* readable and immutable
* content hash unavailable
* rendered-only readable
* raw source unavailable
* exact validation blocked by source form

Unavailable, invalid, and unknown must never be collapsed into the same state.

DoD:

* [ ] `not found` is distinct from `unauthorized`.
* [ ] `unauthorized` is distinct from `network failure`.
* [ ] `unsupported origin` is distinct from `malformed reference`.
* [ ] `readable but mutable` is distinct from `readable and immutable`.
* [ ] `rendered-only readable` is distinct from raw source readability.
* [ ] `exact validation blocked by source form` is represented explicitly.
* [ ] `content hash unavailable` is represented explicitly.
* [ ] A tool failure is distinct from artifact validation failure.

---

## Canonical Artifact Identity And Aliases

The bridge must identify the same artifact consistently when reached through different origin forms.

This is required for:

* validation
* handoff
* cache
* dedupe
* tree projection
* lineage traversal
* alias collapse

Do not identify artifacts by summary, filename, or schema alone.

Canonical identity should consider:

* origin kind
* normalized origin reference
* path
* ref or version
* content hash when available
* immutable source identity when available

Each resolved artifact should report:

* canonical artifact id
* identity inputs used
* identity confidence
* aliases
* content hash if available
* whether aliases resolve to the same content
* whether alias collapse was performed
* whether identity is provisional because the origin is mutable or hash is unavailable

DoD:

* [ ] Same artifact reached through GitHub URL, raw URL, tuple, or equivalent supported references can be deduped when identity evidence matches.
* [ ] Different content reached through similar aliases is not silently collapsed.
* [ ] Mutable origins produce provisional identity unless stronger evidence exists.
* [ ] Content hash participates in identity when available.
* [ ] Tree projection uses canonical artifact id, not raw input reference, as node identity.
* [ ] Handoff packet includes canonical artifact id.
* [ ] Cache keys use canonical identity when available.
* [ ] Alias conflicts produce warning or explicit ambiguity state.
* [ ] Alias collapse rules live in shared core, not in entry points.

---

## Validation Basis

A validation result must say what it was validated against.

A plain `valid` or `invalid` result is insufficient unless the validation basis is known.

Validation basis should include:

* artifact canonical id
* artifact origin reference
* artifact content hash when available
* artifact raw source status
* governing schema id
* governing schema origin/reference
* governing schema ref/version when available
* governing schema content hash when available
* validator package name or module id
* validator version or implementation revision when available
* validation policy version when available
* output shape version
* whether schema resolution was complete
* whether validation used raw source
* whether exact validation was blocked or partial
* timestamp or retrieval time when useful

Default output should include a compact validation basis.

Detailed output may include full validation basis.

DoD:

* [ ] `validateArtifact` includes validation basis.
* [ ] `getHandoffPacket` includes compact validation basis.
* [ ] Validation basis identifies artifact source and schema source.
* [ ] Validation basis identifies raw source use.
* [ ] Validation basis identifies schema resolution completeness.
* [ ] Validation basis identifies validator version or implementation revision when available.
* [ ] Validation basis identifies output shape version.
* [ ] Two validation outputs can be compared to see whether they used the same basis.
* [ ] Validation basis distinguishes artifact pinned but schema mutable.
* [ ] Validation basis distinguishes complete validation from partial validation.

---

## Raw Source Requirements

Raw source is required for exact syntax validation.

Rendered markdown may be useful for display, but it must not be treated as sufficient for syntax validation.

Exact validation includes:

* bullet marker validation
* heading matching
* machine contract syntax
* continuity envelope syntax
* integrity footer shape
* checksum boundaries
* any rule that depends on original markdown text

If only rendered content is available, the bridge may still provide limited parsing or display, but validation must be reported as partial or blocked.

DoD:

* [ ] Raw source requirement is enforced by validators that need exact syntax.
* [ ] Rendered-only readable artifacts do not receive full exact-valid status.
* [ ] Tool output reports exact validation blocked when raw source is unavailable.
* [ ] Handoff packet does not claim full validation when exact validation is blocked.
* [ ] Tree projection can show rendered-only/readability state separately from validation state.
* [ ] Entry points cannot override raw-source requirements.

---

## Operational Budgets

The bridge must be bounded operationally, not only in presentation.

Budgets should be configurable, but defaults must exist.

Default budget categories:

* max artifact bytes fetched per artifact
* max total bytes returned per tool response
* max parent traversal depth
* max origin candidates resolved per artifact
* max fetches per tool call
* max schema fetches per validation
* max parse time or timeout
* max traversal time or timeout
* cancellation support for long-running operations

Initial values may be conservative and adjusted later.

The exact default values may be decided during implementation, but the shape must exist in v0.

Tool outputs should report when a budget was reached.

DoD:

* [ ] Shared core defines operational budget shape.
* [ ] Source adapters respect fetch limits where practical.
* [ ] Traversal respects depth and fetch limits.
* [ ] Slice/handoff outputs respect response-size limits.
* [ ] Tool outputs report budget exhaustion explicitly.
* [ ] Budget exhaustion is distinct from invalid artifact state.
* [ ] Long-running operations can be cancelled or interrupted where supported.
* [ ] Entry points may pass budget overrides but must not bypass core limits silently.

---

## Output Versioning And Compatibility

Tool outputs are contracts.

Every tool output should include output shape metadata.

Required output metadata:

* bridge output schema id
* tool name
* tool shape version
* core package version or implementation revision when available
* compatibility notes when output is partial or degraded

Suggested shape:

```json
{
  "bridgeOutputSchema": "tiinex.lineage-bridge.result.v1",
  "toolName": "validateArtifact",
  "toolShapeVersion": 1,
  "status": "ok"
}
```

Shape changes must be intentional.

Entry points must not invent incompatible result shapes for the same tool.

DoD:

* [ ] Every public tool output includes bridge output schema id.
* [ ] Every public tool output includes tool name.
* [ ] Every public tool output includes tool shape version.
* [ ] Entry points preserve core output metadata.
* [ ] Shape changes require version update.
* [ ] Handoff packet includes handoff shape version.
* [ ] Tree projection includes projection shape version.
* [ ] Validation findings include finding shape version or are covered by output schema version.
* [ ] Compatibility rules live in shared core, not transport wrappers.

---

## Core Tool Surface

Implement multiple small tool functions over shared core logic.

Do not implement one mega-tool.

### `resolveArtifact`

Resolves an artifact reference.

Input examples:

* GitHub URL
* raw URL
* repo/path/ref tuple
* local path later
* future origin reference later

Returns:

* output shape metadata
* artifact identity
* canonical artifact id
* aliases
* origin status
* raw content availability
* rendered content availability
* exact validation capability
* versioning guarantees
* mutability
* content hash if available
* normalized reference when available

DoD:

* [ ] Resolves a supported origin reference.
* [ ] Returns structured origin metadata.
* [ ] Returns canonical identity data.
* [ ] Returns structured access status.
* [ ] Returns exact-validation capability.
* [ ] Does not validate lineage by itself.
* [ ] Does not return full body unless explicitly requested.

### `readEnvelope`

Returns only the continuity envelope.

Must separate:

* Envelope Schema
* Current
* Parent
* Trace
* Origin
* Created At
* Summary
* Continuity Integrity footer metadata when available

DoD:

* [ ] Parses envelope without child schema.
* [ ] Separates `Parent` from `Origin`.
* [ ] Separates `Trace` from `Origin`.
* [ ] Returns integrity metadata when present.
* [ ] Preserves unknown envelope fields.
* [ ] Includes canonical artifact id.
* [ ] Includes output shape metadata.
* [ ] Does not return full body unless explicitly requested.

### `validateArtifact`

Runs available validation against the artifact.

Returns structured findings.

Each finding should include:

* code
* severity
* message
* target surface
* source anchor when possible
* schema or rule source when possible
* validation basis when relevant

DoD:

* [ ] Runs available validator for root artifacts.
* [ ] Runs available validator for topic artifacts.
* [ ] Runs available validator for task artifacts.
* [ ] Returns structured findings.
* [ ] Returns validation basis.
* [ ] Distinguishes failed validation from failed tool call.
* [ ] Returns incomplete validation state when schema cannot be resolved.
* [ ] Returns exact-validation blocked state when raw source is unavailable.
* [ ] Does not mutate the artifact.

### `getLineage`

Returns bounded lineage.

Must support:

* depth limit
* cycle detection
* parent traversal
* origin recovery candidates
* explicit stopped reason
* canonical identity and alias collapse

Must distinguish:

* complete lineage
* external parent
* unreadable parent
* missing parent
* cycle detected
* max depth reached
* origin recovery available
* budget exhausted

DoD:

* [ ] Traverses direct parent chain.
* [ ] Preserves origin recovery candidates.
* [ ] Detects cycles.
* [ ] Enforces depth limit.
* [ ] Enforces fetch budget.
* [ ] Returns stopped reason.
* [ ] Uses canonical artifact identity for dedupe.
* [ ] Does not conflate parent and origin.
* [ ] Does not silently choose between divergent origin candidates.

### `getSchemaContract`

Returns the governing schema contract or compact schema-contract summary.

Must identify:

* validation authority
* generation authority
* integrity authority
* known category labels when available
* required groups when available
* policy groups when available
* schema source/reference
* schema content hash when available
* unresolved schema state when schema cannot be fetched

DoD:

* [ ] Returns compact schema contract summary by default.
* [ ] Can return full contract when explicitly requested.
* [ ] Identifies authority surfaces.
* [ ] Identifies schema source and schema content hash when available.
* [ ] Identifies unresolved schema state.
* [ ] Does not infer requirements from prose outside the contract.

### `getRelevantSlice`

Returns only the slice relevant to a stated purpose.

Input should include a purpose such as:

* planner
* implementation
* validation repair
* schema review
* handoff
* provenance inspection
* tree projection

Returns:

* selected slices
* why each slice was selected
* what was intentionally excluded
* whether raw read is required for next step
* output shape metadata

DoD:

* [ ] Returns bounded slices.
* [ ] Explains why slices were selected.
* [ ] Explains what was excluded.
* [ ] Does not return full raw artifact by default.
* [ ] Can request raw content explicitly when needed.
* [ ] Reports if slice was truncated due to budget.

### `getHandoffPacket`

Returns bounded context for a fresh chat or agent session.

Must include:

* output shape metadata
* current artifact
* canonical artifact id
* governing schema
* validation status
* compact validation basis
* important findings
* parent summary
* origin candidates
* current leaf summary if inferable
* relevant artifacts
* next suggested action
* do-not-traverse hints

DoD:

* [ ] Produces compact handoff packet.
* [ ] Includes current artifact identity.
* [ ] Includes canonical artifact id.
* [ ] Includes governing schema.
* [ ] Includes validation status.
* [ ] Includes compact validation basis.
* [ ] Includes parent and origin separately.
* [ ] Includes relevant slices or references.
* [ ] Includes do-not-traverse hints.
* [ ] Avoids full raw body by default.
* [ ] Does not claim full validation when exact validation is blocked.

---

## Tree Projection Surface

The bridge must support tree view UX without making the tree view own runtime logic.

The tree view should render projections from shared core.

Do not let the VSCode tree view scan, parse, validate, or decide schema-policy by itself.

Required projection tools or equivalent functions:

* `getStructureIndex`
* `getTreeProjection`
* `getNodeDetails`
* `getNodeChildren`
* `getValidationOverlay`
* `getAvailableActions`

### `getStructureIndex`

Builds a structure index over a bounded source scope.

DoD:

* [ ] Indexes artifacts from a source adapter.
* [ ] Uses canonical artifact identity.
* [ ] Collapses aliases when identity evidence matches.
* [ ] Preserves alias conflict state when identity evidence diverges.
* [ ] Includes artifact identity.
* [ ] Includes schema identity when available.
* [ ] Includes parent edge when available.
* [ ] Includes origin candidates when available.
* [ ] Includes validation summary when available.
* [ ] Does not require reading full bodies for every node by default.
* [ ] Respects operational budgets.

### `getTreeProjection`

Returns a UI-neutral tree projection.

DoD:

* [ ] Returns stable node IDs.
* [ ] Stable node IDs derive from canonical artifact identity.
* [ ] Returns parent/child relationships.
* [ ] Returns display labels.
* [ ] Returns schema badges or schema IDs.
* [ ] Returns validation status badges.
* [ ] Returns missing-parent indicators.
* [ ] Returns origin-recovery indicators.
* [ ] Returns alias/duplicate indicators when relevant.
* [ ] Supports pagination.
* [ ] Supports filtering.
* [ ] Supports sorting.
* [ ] Is not VSCode-specific.
* [ ] Includes projection shape version.

### `getNodeDetails`

Returns lazy details for a selected node.

DoD:

* [ ] Returns envelope details.
* [ ] Returns validation findings.
* [ ] Returns validation basis.
* [ ] Returns parent/origin details.
* [ ] Returns relevant body summary when available.
* [ ] Does not return full raw body by default.

### `getNodeChildren`

Returns children for a node.

DoD:

* [ ] Returns direct children.
* [ ] Supports pagination.
* [ ] Handles missing or unreadable children explicitly.
* [ ] Does not infer children from filename alone when stronger lineage data exists.
* [ ] Uses canonical identity to avoid duplicate children.

### `getValidationOverlay`

Returns validation status suitable for UI overlay.

DoD:

* [ ] Returns aggregate severity.
* [ ] Returns finding counts by severity.
* [ ] Returns direct validation state.
* [ ] Returns lineage validation state when available.
* [ ] Returns exact-validation blocked state when relevant.
* [ ] Does not include UI-specific rendering assumptions.

### `getAvailableActions`

Returns available actions from core policy, not hardcoded UI tables.

Possible actions:

* open artifact
* open origin
* open parent
* validate
* copy handoff
* copy relevant slice
* inspect schema contract
* plan repair later

DoD:

* [ ] Available actions are derived from artifact state and core policy.
* [ ] VSCode does not own schema action policy.
* [ ] Actions are transport-neutral descriptions.
* [ ] Mutation actions are excluded unless repair/executor scope is explicitly added later.

---

## Parser Levels

Do not build one giant parser.

Use three parser levels.

### Level 1 — Universal Root Parser

Required for every artifact.

Must parse:

* continuity envelope
* Current
* Parent
* Trace
* Origin
* Created At
* Summary
* Continuity Integrity footer

This parser must work even when the child schema is unknown or unavailable.

DoD:

* [ ] Parses root-level envelope for any artifact.
* [ ] Parses continuity integrity footer.
* [ ] Preserves unknown fields.
* [ ] Works without child schema.
* [ ] Does not guess schema-specific payload.
* [ ] Reports raw-source requirement when exact parsing is needed.

### Level 2 — Contract Parser

Required for schema artifacts.

Must parse:

* Schema Validation Contract
* Artifact Creation Contract when present
* contract groups
* category labels
* hyphen list items
* named declarations
* duplicate groups
* duplicate declarations
* missing category lists
* star bullets in machine-authoritative surfaces
* unexpected content inside machine contracts

DoD:

* [ ] Parses Schema Validation Contract.
* [ ] Parses Artifact Creation Contract when present.
* [ ] Detects duplicate groups.
* [ ] Detects duplicate declarations.
* [ ] Detects missing category lists.
* [ ] Detects star bullets in machine-authoritative surfaces.
* [ ] Detects unexpected machine contract content.
* [ ] Preserves unknown declared categories.
* [ ] Blocks exact contract validation when raw source is unavailable.

### Level 3 — Schema-Specific Payload Parsers

Build these only when a tool actually needs data from that schema.

Initial schema-specific parsers should focus on:

* `tiinex.root.v1`
* `tiinex.topic.v1`
* `tiinex.task.v1`

Do not build payload parsers for every schema in v0.

A validator may validate more schemas than payload tooling understands deeply.

Unsupported schema payloads must be preserved, not guessed.

DoD:

* [ ] Root payload parser extracts policy groups needed by bridge.
* [ ] Topic payload parser extracts title/current read/next sections only when needed.
* [ ] Task payload parser extracts objective/done criteria/scope/dependencies only when needed.
* [ ] Unsupported schema payloads are preserved.
* [ ] Unsupported schema payloads are not guessed.
* [ ] Tool output can say payload parser is unavailable while envelope and validation still work.

---

## Validator Ownership

Validators belong in shared core packages, not IDE-specific code.

Expected location:

```text
packages/validators
```

Validator responsibilities:

* detect contract violations
* judge severity according to schema/root policy
* return structured findings
* report validation basis
* avoid mutation
* avoid UI assumptions

Validator non-responsibilities:

* repair planning
* applying edits
* rendering UI
* choosing agent behavior
* hiding unresolved state

DoD:

* [ ] Root validator lives behind shared package boundary.
* [ ] Topic validator lives behind shared package boundary.
* [ ] Task validator lives behind shared package boundary.
* [ ] Validators return structured findings.
* [ ] Validators return validation basis.
* [ ] Validators report exact-validation blocked state when raw source is unavailable.
* [ ] Validators do not apply fixes.
* [ ] Validators do not depend on VSCode APIs.
* [ ] Validators do not render UI.
* [ ] Validators can be consumed by more than one entry point.

---

## Repair And Problem Solver Boundary

Do not mix judgment with mutation.

Use separate layers:

```text
validator
  detects and judges

repair planner
  proposes possible fixes

executor
  applies fixes
```

Milestone 1 does not require repair planning.

If repair planning is added later, place it behind a separate package boundary:

```text
packages/repairs
```

DoD:

* [ ] Validators do not propose broad rewrites as part of validation.
* [ ] Validators do not apply edits.
* [ ] Repair planners are separate from validators.
* [ ] Executors are separate from repair planners.
* [ ] Mutation is not part of milestone 1 unless explicitly scoped later.

---

## Schema Respectability Gate

The bridge should help test whether Tiinex schemas can be respected by external implementers.

A schema is more respectable when:

* its machine-readable contract is sufficient for another implementer to build compatible validation behavior
* its hidden policy is minimized
* its validation, generation, and integrity authority surfaces are explicit
* its parent/origin semantics are clear
* its unknown handling is explicit
* its matching and normalization behavior is explicit
* its cardinality rules are explicit
* its examples do not replace contract rules
* its validators do not rely on private repo knowledge
* its validation basis can be reported

The bridge should not assume schemas are perfect.

The bridge should expose where implementation still depends on hardcoded policy.

DoD:

* [ ] Bridge output can identify when schema resolution is incomplete.
* [ ] Bridge output can identify when validator behavior depends on hardcoded policy.
* [ ] Bridge output can identify unsupported schema payloads.
* [ ] Bridge output does not pretend incomplete validation is complete.
* [ ] Bridge output does not infer schema rules from prose-only text.
* [ ] Bridge output reports validation basis enough to compare validation results.

---

## Required Edge Cases

The implementation must explicitly handle these cases.

### Mutable Origin

* [ ] A readable origin may still be mutable.
* [ ] Mutable origin must not be treated as immutable.
* [ ] Branch URLs, latest URLs, or ordinary web URLs must not be treated as equivalent to commit-pinned or content-addressed origins.

### Parent Broken, Origin Recoverable

* [ ] Parent traversal may fail while Origin recovery candidates still exist.
* [ ] This must be represented as partial/incomplete lineage with recovery candidates.
* [ ] This must not be represented as a generic failure.

### Divergent Origin Candidates

* [ ] Multiple origin candidates may resolve to different content.
* [ ] The bridge must not silently choose one.
* [ ] Divergent origin candidates should produce a finding or explicit warning state.

### Readable But Wrong Artifact

Distinguish:

* [ ] file exists but is not markdown
* [ ] markdown exists but has no continuity envelope
* [ ] envelope exists but schema is unknown
* [ ] schema known but artifact invalid
* [ ] schema unresolved but envelope parse succeeded

### Schema Unresolved

* [ ] Envelope parsing must still work if the child schema is missing.
* [ ] Validation status should become incomplete, not impossible.
* [ ] The response must say which schema could not be resolved.

### Artifact Pinned, Schema Mutable

* [ ] The artifact origin may be immutable while schema references are mutable.
* [ ] This is a portability risk and should be surfaced.
* [ ] Validation basis must expose this condition.

### Cycles And Depth Limits

* [ ] Parent chains may contain cycles.
* [ ] Parent chains may exceed configured depth.
* [ ] Both must return structured stopped reasons.

### Renderer Drift

* [ ] Rendered markdown must not be used for syntax validation.
* [ ] Raw source must be used when bullet markers, headings, or exact syntax matter.
* [ ] Rendered-only access blocks exact validation.

### Private Or Auth-Locked Origins

Distinguish:

* [ ] unauthorized
* [ ] not found
* [ ] unsupported
* [ ] network failure

### Unsafe Local Paths

If local origins are added later:

* [ ] resolve paths safely
* [ ] prevent path traversal from trace content
* [ ] avoid reading arbitrary local files through malicious artifact references

### Large Artifacts

* [ ] Default output must be bounded.
* [ ] Full body content is opt-in.
* [ ] Slices are preferred over full files.
* [ ] Budget exhaustion is reported explicitly.

### Duplicate Identity

Do not identify artifacts by summary, filename, or schema alone.

Use a combination of:

* [ ] canonical artifact id
* [ ] origin reference
* [ ] path
* [ ] version/ref
* [ ] content hash when available
* [ ] alias list when available

### Timestamp Drift

Do not conflate:

* [ ] envelope `Created At`
* [ ] source modified time
* [ ] commit time
* [ ] retrieval time

### Integrity Target Ambiguity

When validating continuity integrity, report:

* [ ] method
* [ ] declared target
* [ ] actual target used
* [ ] whether target was self or external
* [ ] what content boundary was hashed
* [ ] checksum status

---

## Output Requirements

All tool outputs must be JSON-compatible.

Every output should include:

* bridge output schema id
* tool name
* tool shape version
* status
* source
* provenance
* input reference
* normalized reference when available
* canonical artifact id when applicable
* warnings or findings when available
* whether output is complete or partial
* whether raw read is needed for the next step
* whether exact validation is blocked
* budget status when relevant

Every output must distinguish:

* valid
* invalid
* unknown
* unavailable
* incomplete
* unsupported
* blocked
* partial

DoD:

* [ ] Outputs are JSON-compatible.
* [ ] Outputs include output shape metadata.
* [ ] Outputs include source/provenance.
* [ ] Outputs include status.
* [ ] Outputs include canonical identity when applicable.
* [ ] Outputs distinguish complete from partial.
* [ ] Outputs distinguish invalid from unavailable.
* [ ] Outputs distinguish unknown from unsupported.
* [ ] Outputs distinguish blocked from invalid.
* [ ] Outputs include raw-read-needed signal when relevant.
* [ ] Outputs include budget status when relevant.
* [ ] Outputs are bounded by default.

---

## Handoff Packet Requirements

A handoff packet must be compact enough for a fresh chat.

It should answer:

* What artifact is current?
* What schema governs it?
* Is it valid?
* What was the validation basis?
* What findings matter now?
* What parent does it continue from?
* What origin links are recovery/provenance candidates?
* What is the current leaf or best inferred work state?
* What should the next agent or chat read next?
* What should it avoid traversing unless needed?

Minimum conceptual shape:

```json
{
  "bridgeOutputSchema": "tiinex.lineage-bridge.result.v1",
  "toolName": "getHandoffPacket",
  "toolShapeVersion": 1,
  "status": "ok",
  "artifact": {
    "canonicalArtifactId": "",
    "origin": "",
    "reference": "",
    "path": "",
    "schema": "",
    "summary": "",
    "contentHash": "",
    "aliases": []
  },
  "validation": {
    "status": "valid",
    "basis": {
      "artifactContentHash": "",
      "schemaId": "",
      "schemaReference": "",
      "schemaContentHash": "",
      "validatorVersion": "",
      "schemaResolutionComplete": true,
      "rawSourceUsed": true,
      "exactValidationBlocked": false
    },
    "findings": []
  },
  "continuity": {
    "parent": null,
    "originCandidates": []
  },
  "currentLeaf": {
    "summary": "",
    "nextAction": "",
    "nonGoals": []
  },
  "relevantSlices": [],
  "doNotTraverse": [],
  "budgets": {
    "truncated": false,
    "exhausted": []
  }
}
```

DoD:

* [ ] Handoff packet is compact.
* [ ] Handoff packet includes output shape metadata.
* [ ] Handoff packet includes current artifact.
* [ ] Handoff packet includes canonical artifact id.
* [ ] Handoff packet includes governing schema.
* [ ] Handoff packet includes validation status.
* [ ] Handoff packet includes compact validation basis.
* [ ] Handoff packet includes findings when relevant.
* [ ] Handoff packet separates parent and origin.
* [ ] Handoff packet includes relevant slices.
* [ ] Handoff packet includes do-not-traverse hints.
* [ ] Handoff packet includes budget/truncation state.
* [ ] Handoff packet does not require hidden chat context.
* [ ] Handoff packet does not claim full validation when exact validation is blocked.

---

## Context Budget Requirements

The bridge is successful only if it reduces model context load.

DoD:

* [ ] Default outputs are compact.
* [ ] Full files are not returned by default.
* [ ] Parent traversal is depth-limited by default.
* [ ] Schema contracts are summarized by default unless full contract is requested.
* [ ] Tool responses prefer anchors, findings, and selected slices over raw content.
* [ ] A model should not need broad repo search to orient itself.
* [ ] A fresh chat can orient from handoff packet plus targeted tool calls.
* [ ] Tool responses report truncation or budget exhaustion.

---

## Transport Requirements

The bridge core must be transport-neutral.

At least one entry point must expose the shared core.

A second entry point should be possible without duplicating core behavior.

Allowed future entry points:

* VSCode tool surface
* CLI
* MCP
* HTTP
* web app

Entry points must not implement their own parsing, validation, lineage traversal, projection, slicing, repair planning, or handoff generation.

Entry points may format shared core output for their surface.

DoD:

* [ ] At least one entry point exposes shared core.
* [ ] Entry point code is thin.
* [ ] A second entry point can be added without duplicating core logic.
* [ ] Entry point output may be surface-specific, but behavior remains core-owned.
* [ ] Entry points preserve output shape metadata.
* [ ] No entry point becomes runtime source of truth.

---

## Implementation Order

### Phase 1 — Core Boundaries

* [ ] Create shared core package or module boundary.
* [ ] Define source adapter interface.
* [ ] Define artifact identity shape.
* [ ] Define canonical artifact identity and alias shape.
* [ ] Define common result/status shape.
* [ ] Define output version metadata shape.
* [ ] Define finding shape.
* [ ] Define validation basis shape.
* [ ] Define operational budget shape.
* [ ] Define handoff packet shape.
* [ ] Define projection output shape.

### Phase 2 — First Source Adapter

* [ ] Implement first practical origin adapter.
* [ ] GitHub may be used first.
* [ ] The adapter contract must not assume GitHub.
* [ ] Adapter reports versioning.
* [ ] Adapter reports mutability.
* [ ] Adapter reports content hash when available.
* [ ] Adapter reports access status.
* [ ] Adapter reports raw content availability.
* [ ] Adapter reports rendered-only access when raw content is unavailable.
* [ ] Adapter reports exact-validation capability.

### Phase 3 — Universal Parsing

* [ ] Implement or extract universal root parser.
* [ ] Parse envelope without requiring child schema.
* [ ] Parse continuity integrity footer.
* [ ] Preserve unknown fields.
* [ ] Do not guess unsupported schema payloads.
* [ ] Require raw source for exact syntax parsing.

### Phase 4 — Contract Parsing

* [ ] Implement or extract contract parser.
* [ ] Parse Schema Validation Contract.
* [ ] Parse Artifact Creation Contract when present.
* [ ] Detect duplicate groups and declarations.
* [ ] Detect missing category lists.
* [ ] Detect star bullets in machine-authoritative surfaces.
* [ ] Detect unexpected machine contract content.
* [ ] Block exact contract validation when raw source is unavailable.

### Phase 5 — Validation Service

* [ ] Run root validator.
* [ ] Run topic validator.
* [ ] Run task validator.
* [ ] Return structured findings.
* [ ] Return validation basis.
* [ ] Return incomplete validation when schema is unavailable.
* [ ] Return blocked validation when raw source is unavailable.
* [ ] Distinguish tool failure from validation failure.
* [ ] Keep validator mutation-free.

### Phase 6 — Canonical Identity And Cache Basis

* [ ] Compute canonical artifact id.
* [ ] Track aliases.
* [ ] Detect alias conflicts.
* [ ] Use content hash when available.
* [ ] Represent provisional identity for mutable origins.
* [ ] Provide cache-safe identity fields.

### Phase 7 — Lineage Traversal

* [ ] Traverse parent chain.
* [ ] Preserve origin recovery candidates.
* [ ] Detect cycles.
* [ ] Enforce depth limits.
* [ ] Enforce fetch budgets.
* [ ] Return stopped reason.
* [ ] Do not conflate parent and origin.
* [ ] Use canonical identity for dedupe.

### Phase 8 — Projections

* [ ] Implement structure index.
* [ ] Implement tree projection.
* [ ] Implement node details.
* [ ] Implement node children.
* [ ] Implement validation overlay.
* [ ] Implement available actions from core policy.
* [ ] Keep projections UI-neutral.
* [ ] Include output shape version in projections.

### Phase 9 — Slices And Handoff

* [ ] Implement relevant slice selection.
* [ ] Implement compact handoff packet.
* [ ] Include do-not-traverse hints.
* [ ] Include validation state.
* [ ] Include validation basis.
* [ ] Include canonical artifact id.
* [ ] Include next-read recommendation.
* [ ] Include budget/truncation state.

### Phase 10 — Thin Entry Point

* [ ] Expose at least one entry point over the shared core.
* [ ] Keep entry point logic thin.
* [ ] Preserve output shape metadata.
* [ ] Do not duplicate parser, validator, traversal, projection, slice, or handoff logic.
* [ ] Demonstrate that another entry point could reuse the same core.

---

## Done Criteria

This milestone is done when:

* [ ] A readable origin artifact can be resolved.
* [ ] A continuity envelope can be read without returning the full body.
* [ ] Canonical artifact identity is produced.
* [ ] Alias collapse works when identity evidence matches.
* [ ] Alias conflicts are represented explicitly.
* [ ] Root/topic/task artifacts can be validated through shared core.
* [ ] Validation basis is returned.
* [ ] Findings are structured and bounded.
* [ ] Parent and Origin are represented separately.
* [ ] A bounded parent chain can be returned.
* [ ] Origin recovery candidates can be returned.
* [ ] Mutable versus immutable origins are reported.
* [ ] Raw content is used for syntax validation.
* [ ] Rendered-only access blocks exact validation.
* [ ] Unknown, unavailable, invalid, unsupported, blocked, and incomplete states are distinct.
* [ ] Full artifact body is opt-in.
* [ ] Operational budgets exist and are reported when reached.
* [ ] Output shape metadata exists on public tool outputs.
* [ ] A compact handoff packet can orient a fresh chat.
* [ ] Tree view UX can be built from projection output without owning core behavior.
* [ ] At least one thin entry point exposes the shared core.
* [ ] No entry point owns parser, validator, traversal, projection, slice, or handoff logic.
* [ ] Existing PoC code is used only where it can be extracted cleanly.

---

## Final Acceptance Test

Start a fresh chat with no prior Tiinex context.

Give it only:

* one artifact target
* access to the bridge tooling

The chat must answer:

* what artifact is current
* what canonical artifact id represents it
* what schema governs it
* whether it is valid
* what validation basis was used
* whether exact validation was complete, partial, or blocked
* what parent it continues from
* what origins are recovery/provenance candidates
* whether any aliases or origin candidates conflict
* what the current work leaf appears to be
* what it should read next
* what it should avoid traversing unless needed

If the chat needs broad repo traversal or raw `.trace.md` inspection for normal orientation, the milestone is not done.

---

## Final Instruction To Implementer

Do not build a new runtime yet.

Do not build a web app yet.

Do not redesign the schema system unless a concrete implementation blocker proves the current contract insufficient.

Build the bridge core that lets future runtimes, tools, entry points, UIs, and agents consume validated Tiinex lineage context without hidden state.

The implementation is not complete until validation basis, raw-source exact-validation blocking, canonical artifact identity, output versioning, and operational budgets are represented in shared core.
