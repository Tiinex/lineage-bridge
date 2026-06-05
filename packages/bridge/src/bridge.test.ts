import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { getAvailableActions, getHandoffPacket, getLineage, getNodeChildren, getNodeDetails, getRelevantSlice, getSchemaContract, getStructureIndex, getTreeProjection, getValidationOverlay, parseContinuityEnvelope, readEnvelope, resolveArtifact, validateArtifact } from "./index";
import { parseContractSection } from "@tiinex/lineage-bridge-parsers";
import { classifyAliasFamilies, getAliasFamilyKey } from "./aliasFamilies";

test("resolveArtifact reads a local Tiinex artifact", () => {
  const reference = path.resolve(__dirname, "..", "..", "..", "..", "docs", ".topics", "kickstarter", "001.trace.md");
  const result = resolveArtifact({ reference });
  assert.equal(result.status, "ok");
  assert.equal(result.source.sourceStrategy, "local-workspace");
  assert.equal(result.source.trustLevel, "workspace-local");
  assert.equal(result.source.refKind, "not-applicable");
  assert.equal(result.source.accessStatus, "readable");
  assert.equal(result.source.rawContentAvailability, "available");
  assert.equal(result.source.rawContent, undefined);
  assert.equal(result.rawReadNeededForNextStep, true);
  assert.ok(result.artifact.canonicalArtifactId);
  assert.deepEqual(result.artifact.cacheIdentity, {
    cacheable: true,
    cacheKey: `sha256:${result.artifact.contentHash}`,
    cacheScope: "content",
    reason: "Only content-scoped caching is safe because the source identity is mutable or provisional."
  });
  assert.ok(result.compatibilityNotes?.includes("Raw source is omitted by default; request includeRawContent to access bounded raw content."));
  assert.ok(result.source.warnings.every((warning) => !warning.includes("local-mirror")));
});

test("resolveArtifact returns bounded raw content only when explicitly requested", () => {
  const reference = path.resolve(__dirname, "..", "..", "..", "..", "docs", ".topics", "kickstarter", "001.trace.md");
  const result = resolveArtifact({ reference, includeRawContent: true });
  assert.equal(result.status, "ok");
  assert.equal(typeof result.source.rawContent, "string");
  assert.equal(result.rawReadNeededForNextStep, false);
});

test("resolveArtifact accepts the M2 source contract upgrade inputs without changing current scaffold behavior", () => {
  const reference = path.resolve(__dirname, "..", "..", "..", "..", "docs", ".topics", "kickstarter", "001.trace.md");
  const result = resolveArtifact({
    reference,
    sourceAccess: {
      workspace: {
        roots: [path.resolve(__dirname, "..", "..", "..", "..", "docs")],
        symlinkPolicy: "within-workspace"
      },
      preferredGitHubStrategy: "remote",
      freshOriginResolution: true,
      network: {
        maxFetches: 4,
        maxSchemaFetches: 2,
        maxRedirects: 3,
        requestTimeoutMs: 1500,
        totalTimeoutMs: 5000,
        retryCount: 1
      },
      remoteFetcher: async () => ({ ok: false, status: 501, errorCode: "network-failure" })
    }
  });
  assert.equal(result.status, "ok");
  assert.equal(result.source.sourceStrategy, "local-workspace");
  assert.ok(result.compatibilityNotes?.includes("Workspace access policy shape is accepted but is not enforced until the local sandbox phase."));
  assert.ok(result.compatibilityNotes?.includes("Remote GitHub fetch contract is declared but current resolution still uses the existing local mirror path."));
  assert.ok(result.compatibilityNotes?.includes("Remote network budget shapes are accepted for future source strategies but are not enforced by the current local scaffold."));
  assert.ok(result.compatibilityNotes?.includes("Fresh origin resolution preference is declared but is not enforced before remote fetch and cache phases are implemented."));
});

test("resolveArtifact collapses equivalent GitHub blob and raw references onto the same canonical artifact id", () => {
  const revision = "291c00f4aaba1e1ba5a0c3479c078070a83c060e";
  const relativePath = ".topics/educational/memes/work/remote/001.trace.md";
  const blobReference = `https://github.com/Tiinex/docs/blob/${revision}/${relativePath}`;
  const rawReference = `https://raw.githubusercontent.com/Tiinex/docs/${revision}/${relativePath}`;
  const blobResult = resolveArtifact({ reference: blobReference });
  const rawResult = resolveArtifact({ reference: rawReference });
  assert.equal(blobResult.status, "ok");
  assert.equal(rawResult.status, "ok");
  assert.equal(blobResult.source.sourceStrategy, "github-local-mirror");
  assert.equal(blobResult.source.trustLevel, "local-mirror");
  assert.equal(blobResult.source.refKind, "commit");
  assert.equal(blobResult.artifact.canonicalArtifactId, rawResult.artifact.canonicalArtifactId);
  assert.equal(blobResult.artifact.cacheIdentity.cacheable, true);
  assert.equal(blobResult.artifact.cacheIdentity.cacheScope, "immutable-origin");
  assert.equal(blobResult.artifact.cacheIdentity.cacheKey, blobResult.artifact.canonicalArtifactId);
  assert.equal(rawResult.artifact.cacheIdentity.cacheKey, rawResult.artifact.canonicalArtifactId);
  assert.deepEqual(blobResult.artifact.identityInputsUsed, ["immutableSourceIdentity", "contentHash"]);
  assert.deepEqual(rawResult.artifact.identityInputsUsed, ["immutableSourceIdentity", "contentHash"]);
  assert.equal(blobResult.artifact.immutableSourceIdentity, rawResult.artifact.immutableSourceIdentity);
});

test("resolveArtifact marks unsupported references as not cache-safe", () => {
  const result = resolveArtifact({ reference: "https://example.com/not-supported.trace.md" });
  assert.equal(result.status, "unsupported");
  assert.deepEqual(result.artifact.cacheIdentity, {
    cacheable: false,
    cacheScope: "none",
    reason: "No stable cache identity can be derived from this artifact reference."
  });
});

test("classifyAliasFamilies marks divergent node ids in one alias family as conflict", () => {
  const classification = classifyAliasFamilies([
    { nodeId: "node-a", aliasFamilyKey: "github:tiinex/docs:.topics/example.md", alias: "https://github.com/Tiinex/docs/blob/abc/.topics/example.md" },
    { nodeId: "node-b", aliasFamilyKey: "github:tiinex/docs:.topics/example.md", alias: "https://raw.githubusercontent.com/Tiinex/docs/def/.topics/example.md" }
  ]);
  assert.equal(classification.conflictNodeIds.has("node-a"), true);
  assert.equal(classification.conflictNodeIds.has("node-b"), true);
  assert.equal(classification.collapsedNodeIds.has("node-a"), false);
});

test("getAliasFamilyKey prefers identity family key when available", () => {
  const resolved = resolveArtifact({ reference: "https://github.com/Tiinex/docs/blob/291c00f4aaba1e1ba5a0c3479c078070a83c060e/.topics/educational/memes/work/remote/001.trace.md" });
  assert.equal(getAliasFamilyKey({ artifact: resolved.artifact, source: resolved.source }), resolved.artifact.identityFamilyKey);
});

test("readEnvelope parses continuity envelope from a local Tiinex artifact", () => {
  const reference = path.resolve(__dirname, "..", "..", "..", "..", "docs", ".topics", "kickstarter", "001.trace.md");
  const result = readEnvelope({ reference });
  assert.equal(result.status, "ok");
  assert.equal(result.source.rawContent, undefined);
  assert.equal(result.envelope?.currentSchema?.label, "tiinex.pointer.v1");
  assert.equal(result.envelope?.integrity?.method, "sha256-base64url-c14n-v1");
  assert.ok(result.envelope?.currentOrigin?.browseGit?.includes("github.com/Tiinex/.github/blob/"));
});

test("readEnvelope does not parse truncated raw source", () => {
  const reference = path.resolve(__dirname, "..", "..", "..", "..", "docs", ".topics", "educational", "001.trace.md");
  const result = readEnvelope({ reference, maxArtifactBytes: 128 });
  assert.equal(result.status, "incomplete");
  assert.equal(result.envelope, undefined);
  assert.equal(result.budgets.truncated, true);
});

test("parseContinuityEnvelope stops at the first body boundary and supports plain Towards values", () => {
  const envelope = parseContinuityEnvelope(`# Continuity Context
- Envelope Schema: [tiinex.root.v1](schema)
- Current
  - Current Schema: [tiinex.topic.v1](topic)
  - Created At: 2026-06-05T00:00:00Z
  - Summary: Before body
# Continuity Integrity
- sha256-base64url-c14n-v1
- Towards: self
- Value: abc123
---
- Summary: Should not overwrite
`);
  assert.equal(envelope.currentSummary, "Before body");
  assert.equal(envelope.integrity?.towards?.target, "self");
  assert.equal(envelope.unknownEnvelopeFields.some((entry) => entry.value.includes("Should not overwrite")), false);
});

test("validateArtifact returns ok for a known topic artifact", () => {
  const reference = path.resolve(__dirname, "..", "..", "..", "..", "docs", ".topics", "educational", "001.trace.md");
  const result = validateArtifact({ reference });
  assert.equal(result.status, "ok");
  assert.equal(result.source.rawContent, undefined);
  assert.equal(result.governingSchemaId, "tiinex.topic.v1");
  assert.equal(result.validationBasis.usedRawSource, true);
});

test("validateArtifact returns ok for a known task artifact", () => {
  const reference = path.resolve(__dirname, "..", "..", "..", "..", "docs", ".topics", "educational", "memes", "work", "remote", "001-1-echo-cloud-handoff.trace.md");
  const result = validateArtifact({ reference });
  assert.equal(result.status, "ok");
  assert.equal(result.source.rawContent, undefined);
  assert.equal(result.governingSchemaId, "tiinex.task.v1");
  assert.equal(result.validationBasis.partialValidation, true);
  assert.ok(result.compatibilityNotes?.includes("initial validator coverage: continuity envelope plus minimal body-shape rules only"));
});

test("validateArtifact returns invalid when a topic artifact has no readable topic-state section", () => {
  const reference = path.resolve(__dirname, "..", "src", "fixtures", "invalid-topic-no-state-section.trace.md");
  const result = validateArtifact({ reference });
  assert.equal(result.status, "invalid");
  assert.ok(result.findings.some((finding) => finding.code === "tiinex.topic.v1-body-orientation-missing"));
});

test("validateArtifact returns invalid when a task artifact has no readable completion signal", () => {
  const reference = path.resolve(__dirname, "..", "src", "fixtures", "invalid-task-missing-completion.trace.md");
  const result = validateArtifact({ reference });
  assert.equal(result.status, "invalid");
  assert.ok(result.findings.some((finding) => finding.code === "tiinex.task.v1-completion-signal-missing"));
});

test("validateArtifact does not claim exact validation when raw source is truncated by budget", () => {
  const reference = path.resolve(__dirname, "..", "..", "..", "..", "docs", ".topics", "educational", "001.trace.md");
  const result = validateArtifact({ reference, maxArtifactBytes: 128 });
  assert.equal(result.status, "incomplete");
  assert.equal(result.validationBasis.usedRawSource, false);
  assert.equal(result.validationBasis.exactValidationBlocked, true);
  assert.equal(result.budgets.truncated, true);
  assert.ok(result.findings.some((finding) => finding.code === "raw-source-truncated"));
});

test("validateArtifact returns unknown when the artifact schema is readable but unsupported", () => {
  const reference = path.resolve(__dirname, "..", "src", "fixtures", "unknown-schema.trace.md");
  const result = validateArtifact({ reference });
  assert.equal(result.status, "unknown");
  assert.equal(result.governingSchemaId, "tiinex.decision.v1");
  assert.ok(result.findings.some((finding) => finding.code === "validator-unavailable-for-schema"));
});

test("getLineage returns a bounded parent chain without conflating parent and origin", () => {
  const reference = path.resolve(__dirname, "..", "..", "..", "..", "docs", ".topics", "educational", "memes", "work", "remote", "001-1-echo-cloud-handoff.trace.md");
  const result = getLineage({ reference, maxDepth: 1 });
  assert.equal(result.status, "incomplete");
  assert.equal(result.stoppedBecause, "max-depth");
  assert.equal(result.nodes.length, 2);
  assert.equal(result.nodes[0]?.source.rawContent, undefined);
  assert.equal(result.nodes[1]?.source.rawContent, undefined);
  assert.equal(result.nodes[0]?.parent?.traceTarget, "001.trace.md");
  assert.ok(result.nodes[0]?.originCandidates.every((candidate) => candidate !== result.nodes[0]?.parent?.traceTarget));
  assert.ok(result.originRecoveryCandidates.some((candidate) => candidate.includes("../001.trace.md") || candidate.includes("/work/001.trace.md")));
});

test("getLineage detects cycles in local lineage traversal", () => {
  const reference = path.resolve(__dirname, "..", "src", "fixtures", "cycle-a.trace.md");
  const result = getLineage({ reference, maxDepth: 8 });
  assert.equal(result.status, "incomplete");
  assert.equal(result.stoppedBecause, "cycle-detected");
  assert.equal(result.nodes.length, 2);
  assert.equal(result.nodes[0]?.summary, "Cycle A");
  assert.equal(result.nodes[1]?.summary, "Cycle B");
});

test("getLineage does not parse lineage state from truncated raw source", () => {
  const reference = path.resolve(__dirname, "..", "..", "..", "..", "docs", ".topics", "educational", "001.trace.md");
  const result = getLineage({ reference, maxArtifactBytes: 128 });
  assert.equal(result.status, "incomplete");
  assert.equal(result.stoppedBecause, "budget-exhausted");
  assert.equal(result.nodes.length, 0);
  assert.equal(result.budgets.truncated, true);
  assert.ok(result.budgets.exhausted.includes("maxArtifactBytes"));
});

test("getHandoffPacket returns a compact packet for a fresh chat", () => {
  const reference = path.resolve(__dirname, "..", "..", "..", "..", "docs", ".topics", "educational", "memes", "work", "remote", "001-1-echo-cloud-handoff.trace.md");
  const result = getHandoffPacket({ reference, maxDepth: 1 });
  assert.equal(result.status, "incomplete");
  assert.equal(result.handoff.handoffShapeVersion, 1);
  assert.equal(result.handoff.artifact.schema, "tiinex.task.v1");
  assert.equal(result.handoff.validation.basis.governingSchemaId, "tiinex.task.v1");
  assert.equal(result.handoff.validation.status, "incomplete");
  assert.equal(result.handoff.validation.rawValidatorStatus, "ok");
  assert.equal(result.handoff.continuity.parent?.traceTarget, "001.trace.md");
  assert.ok(result.handoff.relevantSlices.some((slice) => slice.label === "current-summary"));
  assert.ok(result.handoff.doNotTraverse.length > 0);
});

test("getHandoffPacket does not claim full validation when exact validation is blocked by truncation", () => {
  const reference = path.resolve(__dirname, "..", "..", "..", "..", "docs", ".topics", "educational", "001.trace.md");
  const result = getHandoffPacket({ reference, maxArtifactBytes: 128 });
  assert.equal(result.status, "incomplete");
  assert.equal(result.handoff.validation.status, "incomplete");
  assert.equal(result.handoff.validation.rawValidatorStatus, "incomplete");
  assert.equal(result.handoff.validation.basis.exactValidationBlocked, true);
  assert.equal(result.handoff.validation.basis.usedRawSource, false);
  assert.equal(result.handoff.budgets.truncated, true);
  assert.equal(result.handoff.artifact.summary, undefined);
  assert.equal(result.handoff.currentLeaf.summary, undefined);
  assert.equal(result.handoff.relevantSlices.some((slice) => slice.label === "current-summary"), false);
  assert.ok(result.handoff.validation.findings.some((finding) => finding.code === "raw-source-truncated"));
});

test("getRelevantSlice returns bounded handoff-oriented slices without raw body by default", () => {
  const reference = path.resolve(__dirname, "..", "..", "..", "..", "docs", ".topics", "educational", "memes", "work", "remote", "001-1-echo-cloud-handoff.trace.md");
  const result = getRelevantSlice({ reference, purpose: "handoff", maxDepth: 1 });
  assert.equal(result.status, "incomplete");
  assert.equal(result.purpose, "handoff");
  assert.equal(result.directValidationState, "ok");
  assert.equal(result.partialValidation, true);
  assert.equal(result.exactValidationBlocked, false);
  assert.equal(result.schemaResolutionComplete, true);
  assert.ok(result.compatibilityNotes?.includes("initial validator coverage: continuity envelope plus minimal body-shape rules only"));
  assert.ok(result.selectedSlices.some((slice) => slice.label === "current-summary"));
  assert.ok(result.intentionallyExcluded.includes("full raw artifact body"));
  assert.equal(result.rawContent, undefined);
});

test("getRelevantSlice does not select summary slices from truncated raw source", () => {
  const reference = path.resolve(__dirname, "..", "..", "..", "..", "docs", ".topics", "educational", "001.trace.md");
  const result = getRelevantSlice({ reference, purpose: "handoff", maxArtifactBytes: 128 });
  assert.equal(result.status, "incomplete");
  assert.equal(result.artifact.summary, undefined);
  assert.equal(result.selectedSlices.some((slice) => slice.label === "current-summary"), false);
  assert.equal(result.budgets.truncated, true);
});

test("getSchemaContract reads authority surfaces from the root schema", () => {
  const reference = path.resolve(__dirname, "..", "..", "..", "..", "docs", ".topics", ".schemas", "tiinex.root.v1.schema.md");
  const result = getSchemaContract({ reference });
  assert.equal(result.status, "ok");
  assert.equal(result.contract.schemaId, "tiinex.root.v1");
  assert.ok(result.contract.validationAuthority.includes("Schema Validation Contract"));
  assert.ok(result.contract.generationAuthority.includes("Artifact Creation Contract"));
  assert.ok(result.contract.integrityAuthority.includes("Continuity Integrity"));
  assert.ok(result.contract.knownCategoryLabels.includes("Rules"));
});

test("getSchemaContract resolves the governing schema from a task artifact", () => {
  const reference = path.resolve(__dirname, "..", "..", "..", "..", "docs", ".topics", "educational", "memes", "work", "remote", "001-1-echo-cloud-handoff.trace.md");
  const result = getSchemaContract({ reference, includeFullContract: true });
  assert.equal(result.status, "ok");
  assert.equal(result.contract.schemaId, "tiinex.task.v1");
  assert.equal(result.contract.unresolved, false);
  assert.ok(result.contract.schemaSourceReference?.includes("tiinex.task.v1.schema.md"));
  assert.ok(result.fullContract?.schemaValidationContract);
});

test("parseContractSection detects duplicate group headings and named declarations", () => {
  const section = parseContractSection(`## Schema Validation Contract

### Contract Category Extension
Required When

- a descendant schema introduces a contract category label.

Entry Shape

- Named Declaration

Declarations

- New Category
  - Base Concept: Category Label
  - Interpretation: first declaration
- New Category
  - Base Concept: Category Label
  - Interpretation: duplicate declaration

### Contract Category Extension
Rules

- repeated group heading
`, "Schema Validation Contract");

  assert.ok(section);
  assert.deepEqual(section?.duplicateGroupHeadings, ["Contract Category Extension"]);
  assert.deepEqual(section?.duplicateNamedDeclarations, [{
    groupHeading: "Contract Category Extension",
    declarationName: "New Category"
  }]);
});

test("getValidationOverlay returns a UI-neutral validation summary", () => {
  const reference = path.resolve(__dirname, "..", "..", "..", "..", "docs", ".topics", "educational", "memes", "work", "remote", "001-1-echo-cloud-handoff.trace.md");
  const result = getValidationOverlay({ reference, maxDepth: 1 });
  assert.equal(result.status, "incomplete");
  assert.equal(result.aggregateSeverity, "warning");
  assert.equal(result.findingCounts.error, 0);
  assert.equal(result.findingCounts.warning, 0);
  assert.equal(result.directValidationState, "ok");
  assert.equal(result.lineageValidationState, "max-depth");
  assert.equal(result.partialValidation, true);
  assert.equal(result.exactValidationBlocked, false);
  assert.equal(result.schemaResolutionComplete, true);
  assert.ok(result.compatibilityNotes?.includes("initial validator coverage: continuity envelope plus minimal body-shape rules only"));
});

test("getStructureIndex and tree projection preserve unknown validation status separately from incomplete", () => {
  const reference = path.resolve(__dirname, "..", "src", "fixtures", "unknown-schema.trace.md");
  const index = getStructureIndex({ references: [reference] });
  const tree = getTreeProjection({ references: [reference] });
  assert.equal(index.status, "unknown");
  assert.equal(index.nodes[0]?.validationSummary.status, "unknown");
  assert.equal(tree.status, "unknown");
  assert.equal(tree.nodes[0]?.validationStatus, "unknown");
});

test("getAvailableActions returns transport-neutral actions from core policy", () => {
  const reference = path.resolve(__dirname, "..", "..", "..", "..", "docs", ".topics", "educational", "memes", "work", "remote", "001-1-echo-cloud-handoff.trace.md");
  const result = getAvailableActions({ reference, maxDepth: 1 });
  assert.equal(result.status, "incomplete");
  assert.equal(result.complete, false);
  assert.ok(result.actions.some((entry) => entry.actionId === "open-parent" && entry.enabled));
  assert.ok(result.actions.some((entry) => entry.actionId === "validate" && entry.enabled));
  assert.ok(result.actions.some((entry) => entry.actionId === "copy-handoff" && entry.enabled));
  assert.ok(result.actions.some((entry) => entry.actionId === "copy-relevant-slice" && entry.enabled));
  assert.ok(result.actions.some((entry) => entry.actionId === "inspect-schema-contract" && entry.enabled));
  assert.equal(result.actions.some((entry) => entry.title.includes("Repair")), false);
});

test("getAvailableActions degrades status when artifact access is blocked", () => {
  const reference = "https://github.com/Tiinex/not-a-real-local-mirror/blob/1234567/docs/example.trace.md";
  const result = getAvailableActions({ reference, maxDepth: 1 });
  assert.equal(result.status, "blocked");
  assert.equal(result.complete, false);
  assert.equal(result.actions.some((entry) => entry.actionId === "copy-handoff" && entry.enabled), false);
  assert.equal(result.actions.some((entry) => entry.actionId === "copy-relevant-slice" && entry.enabled), false);
});

test("getStructureIndex returns a bounded deduped index with parent and validation summaries", () => {
  const artifactA = path.resolve(__dirname, "..", "..", "..", "..", "docs", ".topics", "educational", "memes", "work", "remote", "001-1-echo-cloud-handoff.trace.md");
  const artifactB = path.resolve(__dirname, "..", "..", "..", "..", "docs", ".topics", "educational", "memes", "work", "remote", "001.trace.md");
  const result = getStructureIndex({ references: [artifactA, artifactB, artifactA], maxArtifacts: 8 });
  assert.equal(result.status, "incomplete");
  assert.equal(result.nodes.length, 2);
  const taskNode = result.nodes.find((node) => node.schemaId === "tiinex.task.v1");
  assert.ok(taskNode);
  assert.equal(taskNode?.aliasCollapsed, true);
  assert.equal(taskNode?.validationSummary.status, "incomplete");
  assert.equal(taskNode?.validationSummary.aggregateSeverity, "warning");
  assert.equal(taskNode?.validationSummary.partialValidation, true);
  assert.equal(taskNode?.validationSummary.schemaResolutionComplete, true);
  assert.equal(taskNode?.parentEdge?.traceTarget, "001.trace.md");
  assert.ok(Array.isArray(taskNode?.originCandidates));
});

test("getStructureIndex collapses equivalent GitHub blob and raw references when identity evidence matches", () => {
  const revision = "291c00f4aaba1e1ba5a0c3479c078070a83c060e";
  const relativePath = ".topics/educational/memes/work/remote/001.trace.md";
  const blobReference = `https://github.com/Tiinex/docs/blob/${revision}/${relativePath}`;
  const rawReference = `https://raw.githubusercontent.com/Tiinex/docs/${revision}/${relativePath}`;
  const result = getStructureIndex({ references: [blobReference, rawReference] });
  assert.equal(result.nodes.length, 1);
  assert.equal(result.nodes[0]?.aliasCollapsed, true);
  assert.equal(result.nodes[0]?.aliasConflict, false);
  assert.equal(result.nodes[0]?.references.length, 2);
  assert.ok(result.nodes[0]?.artifact.aliases.includes(blobReference));
  assert.ok(result.nodes[0]?.artifact.aliases.includes(rawReference));
});

test("getStructureIndex marks alias conflict when similar GitHub aliases point at different revisions", () => {
  const relativePath = ".topics/educational/memes/work/remote/001.trace.md";
  const firstReference = `https://github.com/Tiinex/docs/blob/291c00f4aaba1e1ba5a0c3479c078070a83c060e/${relativePath}`;
  const secondReference = `https://raw.githubusercontent.com/Tiinex/docs/f76e424f7e5e0628efe04226a5ed97425a1301cb/${relativePath}`;
  const result = getStructureIndex({ references: [firstReference, secondReference] });
  assert.equal(result.nodes.length, 2);
  assert.equal(result.nodes.every((node) => node.aliasConflict), true);
  assert.equal(result.nodes.some((node) => node.aliasCollapsed), false);
});

test("getStructureIndex does not project parent or schema state from truncated raw source", () => {
  const reference = path.resolve(__dirname, "..", "..", "..", "..", "docs", ".topics", "educational", "001.trace.md");
  const result = getStructureIndex({ references: [reference], maxArtifactBytes: 128 });
  assert.equal(result.status, "incomplete");
  assert.equal(result.budgets.truncated, true);
  assert.equal(result.nodes[0]?.schemaId, undefined);
  assert.equal(result.nodes[0]?.parentEdge, undefined);
  assert.deepEqual(result.nodes[0]?.originCandidates, []);
  assert.equal(result.nodes[0]?.validationSummary.status, "incomplete");
  assert.equal(result.nodes[0]?.validationSummary.exactValidationBlocked, true);
});

test("getTreeProjection returns stable UI-neutral nodes with parent-child links", () => {
  const artifactA = path.resolve(__dirname, "..", "..", "..", "..", "docs", ".topics", "educational", "memes", "work", "remote", "001-1-echo-cloud-handoff.trace.md");
  const artifactB = path.resolve(__dirname, "..", "..", "..", "..", "docs", ".topics", "educational", "memes", "work", "remote", "001.trace.md");
  const result = getTreeProjection({ references: [artifactA, artifactB], sortBy: "label" });
  assert.equal(result.status, "incomplete");
  assert.equal(result.projectionShapeVersion, 1);
  assert.equal(result.totalNodes, 2);
  const topicNode = result.nodes.find((node) => node.schemaId === "tiinex.topic.v1");
  const taskNode = result.nodes.find((node) => node.schemaId === "tiinex.task.v1");
  assert.ok(topicNode);
  assert.ok(taskNode);
  assert.equal(taskNode?.parentNodeId, topicNode?.nodeId);
  assert.ok(topicNode?.childNodeIds.includes(taskNode!.nodeId));
  assert.equal(taskNode?.partialValidation, true);
  assert.equal(taskNode?.schemaResolutionComplete, true);
  assert.equal(taskNode?.hasMissingParent, false);
  assert.equal(taskNode?.hasOriginRecovery, true);
});

test("getNodeDetails returns lazy node details without raw body by default", () => {
  const artifactA = path.resolve(__dirname, "..", "..", "..", "..", "docs", ".topics", "educational", "memes", "work", "remote", "001-1-echo-cloud-handoff.trace.md");
  const artifactB = path.resolve(__dirname, "..", "..", "..", "..", "docs", ".topics", "educational", "memes", "work", "remote", "001.trace.md");
  const projection = getTreeProjection({ references: [artifactA, artifactB] });
  const taskNode = projection.nodes.find((node) => node.schemaId === "tiinex.task.v1");
  assert.ok(taskNode);
  const result = getNodeDetails({ references: [artifactA, artifactB], nodeId: taskNode!.nodeId });
  assert.equal(result.status, "incomplete");
  assert.equal(result.envelope?.currentSchema?.label, "tiinex.task.v1");
  assert.equal(result.validationBasis?.governingSchemaId, "tiinex.task.v1");
  assert.equal(result.relevantBodySummary?.includes("Task"), true);
});

test("getNodeChildren returns direct children with pagination support", () => {
  const artifactA = path.resolve(__dirname, "..", "..", "..", "..", "docs", ".topics", "educational", "memes", "work", "remote", "001-1-echo-cloud-handoff.trace.md");
  const artifactB = path.resolve(__dirname, "..", "..", "..", "..", "docs", ".topics", "educational", "memes", "work", "remote", "001.trace.md");
  const projection = getTreeProjection({ references: [artifactA, artifactB] });
  const topicNode = projection.nodes.find((node) => node.schemaId === "tiinex.topic.v1");
  assert.ok(topicNode);
  const result = getNodeChildren({ references: [artifactA, artifactB], nodeId: topicNode!.nodeId, page: 1, pageSize: 1 });
  assert.equal(result.status, "incomplete");
  assert.equal(result.totalChildren, 1);
  assert.equal(result.children.length, 1);
  assert.equal(result.children[0]?.schemaId, "tiinex.task.v1");
  assert.deepEqual(result.missingOrUnreadableChildren, []);
});

test("tree view UX can orient entirely from projection outputs without owning core behavior", () => {
  const artifactA = path.resolve(__dirname, "..", "..", "..", "..", "docs", ".topics", "educational", "memes", "work", "remote", "001-1-echo-cloud-handoff.trace.md");
  const artifactB = path.resolve(__dirname, "..", "..", "..", "..", "docs", ".topics", "educational", "memes", "work", "remote", "001.trace.md");

  const tree = getTreeProjection({ references: [artifactA, artifactB], sortBy: "label" });
  assert.equal(tree.status, "incomplete");
  assert.equal(tree.projectionShapeVersion, 1);
  assert.equal(tree.totalNodes, 2);

  const topicNode = tree.nodes.find((node) => node.schemaId === "tiinex.topic.v1");
  const taskNode = tree.nodes.find((node) => node.schemaId === "tiinex.task.v1");
  assert.ok(topicNode);
  assert.ok(taskNode);
  assert.equal(taskNode?.parentNodeId, topicNode?.nodeId);
  assert.equal(topicNode?.childNodeIds.includes(taskNode!.nodeId), true);
  assert.equal(taskNode?.hasOriginRecovery, true);
  assert.equal(taskNode?.partialValidation, true);

  const details = getNodeDetails({ references: [artifactA, artifactB], nodeId: taskNode!.nodeId });
  assert.equal(details.status, "incomplete");
  assert.equal(details.envelope?.currentSchema?.label, "tiinex.task.v1");
  assert.equal(details.validationBasis?.governingSchemaId, "tiinex.task.v1");
  assert.equal(typeof details.relevantBodySummary, "string");

  const children = getNodeChildren({ references: [artifactA, artifactB], nodeId: topicNode!.nodeId, page: 1, pageSize: 10 });
  assert.equal(children.status, "incomplete");
  assert.equal(children.totalChildren, 1);
  assert.equal(children.children[0]?.nodeId, taskNode?.nodeId);

  const actions = getAvailableActions({ reference: artifactA, maxDepth: 1 });
  assert.equal(actions.status, "incomplete");
  assert.equal(actions.actions.some((entry) => entry.actionId === "open-parent" && entry.enabled), true);
  assert.equal(actions.actions.some((entry) => entry.actionId === "copy-handoff" && entry.enabled), true);
  assert.equal(actions.actions.some((entry) => entry.actionId === "copy-relevant-slice" && entry.enabled), true);
});

test("getNodeChildren still resolves a node that would be excluded by paginating the tree projection first", () => {
  const artifactA = path.resolve(__dirname, "..", "..", "..", "..", "docs", ".topics", "educational", "memes", "work", "remote", "001-1-echo-cloud-handoff.trace.md");
  const artifactB = path.resolve(__dirname, "..", "..", "..", "..", "docs", ".topics", "educational", "memes", "work", "remote", "001.trace.md");
  const fullProjection = getTreeProjection({ references: [artifactA, artifactB], sortBy: "label" });
  const parentNode = fullProjection.nodes.find((node) => node.childNodeIds.length > 0);
  assert.ok(parentNode);
  const excludingPage = [1, 2].find((page) => !getTreeProjection({ references: [artifactA, artifactB], sortBy: "label", page, pageSize: 1 }).nodes.some((node) => node.nodeId === parentNode!.nodeId));
  assert.ok(excludingPage);
  const result = getNodeChildren({ references: [artifactA, artifactB], nodeId: parentNode!.nodeId, page: excludingPage, pageSize: 1, sortBy: "label" });
  assert.equal(result.status, "incomplete");
  assert.equal(result.totalChildren, 1);
});

test("resolveArtifact is explicit when a GitHub reference is not available through the local mirror", () => {
  const result = resolveArtifact({ reference: "https://github.com/Tiinex/not-a-real-local-mirror/blob/1234567/docs/example.trace.md" });
  assert.equal(result.status, "blocked");
  assert.ok(result.compatibilityNotes?.includes("GitHub references are currently resolved via a local mirror, not by remote fetch."));
  assert.ok(result.source.warnings.includes("github-reference-requires-local-mirror"));
  assert.ok(result.source.warnings.includes("raw-content-not-remotely-fetched"));
});

test("tree projection preserves readability state separately from validation state", () => {
  const reference = "https://github.com/Tiinex/not-a-real-local-mirror/blob/1234567/docs/example.trace.md";
  const index = getStructureIndex({ references: [reference] });
  const tree = getTreeProjection({ references: [reference] });

  assert.equal(index.status, "blocked");
  assert.equal(index.nodes[0]?.sourceAccessStatus, "not-found");
  assert.equal(index.nodes[0]?.rawContentAvailability, "rendered-only");
  assert.equal(index.nodes[0]?.renderedContentAvailability, true);

  assert.equal(tree.status, "blocked");
  assert.equal(tree.nodes[0]?.validationStatus, "blocked");
  assert.equal(tree.nodes[0]?.sourceAccessStatus, "not-found");
  assert.equal(tree.nodes[0]?.rawContentAvailability, "rendered-only");
  assert.equal(tree.nodes[0]?.renderedContentAvailability, true);
});

test("getNodeDetails degrades status when validation is blocked or partial", () => {
  const blockedReference = "https://github.com/Tiinex/not-a-real-local-mirror/blob/1234567/docs/example.trace.md";
  const blockedProjection = getTreeProjection({ references: [blockedReference] });
  const blockedNode = blockedProjection.nodes[0];
  assert.ok(blockedNode);

  const blockedDetails = getNodeDetails({ references: [blockedReference], nodeId: blockedNode!.nodeId });
  assert.equal(blockedDetails.status, "blocked");

  const partialReference = path.resolve(__dirname, "..", "..", "..", "..", "docs", ".topics", "educational", "memes", "work", "remote", "001-1-echo-cloud-handoff.trace.md");
  const partialProjection = getTreeProjection({ references: [partialReference] });
  const partialNode = partialProjection.nodes[0];
  assert.ok(partialNode);

  const partialDetails = getNodeDetails({ references: [partialReference], nodeId: partialNode!.nodeId });
  assert.equal(partialDetails.status, "incomplete");
});