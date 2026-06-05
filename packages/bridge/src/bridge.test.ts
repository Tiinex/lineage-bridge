import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { getAvailableActions, getHandoffPacket, getLineage, getNodeChildren, getNodeDetails, getRelevantSlice, getSchemaContract, getStructureIndex, getTreeProjection, getValidationOverlay, readEnvelope, resolveArtifact, validateArtifact } from "./index";

test("resolveArtifact reads a local Tiinex artifact", () => {
  const reference = path.resolve(__dirname, "..", "..", "..", "..", "docs", ".topics", "kickstarter", "001.trace.md");
  const result = resolveArtifact({ reference });
  assert.equal(result.status, "ok");
  assert.equal(result.source.accessStatus, "readable");
  assert.equal(result.source.rawContentAvailability, "available");
  assert.ok(result.artifact.canonicalArtifactId);
});

test("readEnvelope parses continuity envelope from a local Tiinex artifact", () => {
  const reference = path.resolve(__dirname, "..", "..", "..", "..", "docs", ".topics", "kickstarter", "001.trace.md");
  const result = readEnvelope({ reference });
  assert.equal(result.status, "ok");
  assert.equal(result.envelope?.currentSchema?.label, "tiinex.pointer.v1");
  assert.equal(result.envelope?.integrity?.method, "sha256-base64url-c14n-v1");
  assert.ok(result.envelope?.currentOrigin?.browseGit?.includes("github.com/Tiinex/.github/blob/"));
});

test("validateArtifact returns ok for a known topic artifact", () => {
  const reference = path.resolve(__dirname, "..", "..", "..", "..", "docs", ".topics", "educational", "001.trace.md");
  const result = validateArtifact({ reference });
  assert.equal(result.status, "ok");
  assert.equal(result.governingSchemaId, "tiinex.topic.v1");
  assert.equal(result.validationBasis.usedRawSource, true);
});

test("validateArtifact returns ok for a known task artifact", () => {
  const reference = path.resolve(__dirname, "..", "..", "..", "..", "docs", ".topics", "educational", "memes", "work", "remote", "001-1-echo-cloud-handoff.trace.md");
  const result = validateArtifact({ reference });
  assert.equal(result.status, "ok");
  assert.equal(result.governingSchemaId, "tiinex.task.v1");
  assert.equal(result.validationBasis.partialValidation, true);
});

test("getLineage returns a bounded parent chain without conflating parent and origin", () => {
  const reference = path.resolve(__dirname, "..", "..", "..", "..", "docs", ".topics", "educational", "memes", "work", "remote", "001-1-echo-cloud-handoff.trace.md");
  const result = getLineage({ reference, maxDepth: 1 });
  assert.equal(result.status, "incomplete");
  assert.equal(result.stoppedBecause, "max-depth");
  assert.equal(result.nodes.length, 2);
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

test("getHandoffPacket returns a compact packet for a fresh chat", () => {
  const reference = path.resolve(__dirname, "..", "..", "..", "..", "docs", ".topics", "educational", "memes", "work", "remote", "001-1-echo-cloud-handoff.trace.md");
  const result = getHandoffPacket({ reference, maxDepth: 1 });
  assert.equal(result.status, "incomplete");
  assert.equal(result.handoff.handoffShapeVersion, 1);
  assert.equal(result.handoff.artifact.schema, "tiinex.task.v1");
  assert.equal(result.handoff.validation.basis.governingSchemaId, "tiinex.task.v1");
  assert.equal(result.handoff.continuity.parent?.traceTarget, "001.trace.md");
  assert.ok(result.handoff.relevantSlices.some((slice) => slice.label === "current-summary"));
  assert.ok(result.handoff.doNotTraverse.length > 0);
});

test("getRelevantSlice returns bounded handoff-oriented slices without raw body by default", () => {
  const reference = path.resolve(__dirname, "..", "..", "..", "..", "docs", ".topics", "educational", "memes", "work", "remote", "001-1-echo-cloud-handoff.trace.md");
  const result = getRelevantSlice({ reference, purpose: "handoff", maxDepth: 1 });
  assert.equal(result.status, "ok");
  assert.equal(result.purpose, "handoff");
  assert.ok(result.selectedSlices.some((slice) => slice.label === "current-summary"));
  assert.ok(result.intentionallyExcluded.includes("full raw artifact body"));
  assert.equal(result.rawContent, undefined);
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

test("getValidationOverlay returns a UI-neutral validation summary", () => {
  const reference = path.resolve(__dirname, "..", "..", "..", "..", "docs", ".topics", "educational", "memes", "work", "remote", "001-1-echo-cloud-handoff.trace.md");
  const result = getValidationOverlay({ reference, maxDepth: 1 });
  assert.equal(result.status, "ok");
  assert.equal(result.aggregateSeverity, "none");
  assert.equal(result.findingCounts.error, 0);
  assert.equal(result.findingCounts.warning, 0);
  assert.equal(result.directValidationState, "ok");
  assert.equal(result.lineageValidationState, "max-depth");
  assert.equal(result.exactValidationBlocked, false);
});

test("getAvailableActions returns transport-neutral actions from core policy", () => {
  const reference = path.resolve(__dirname, "..", "..", "..", "..", "docs", ".topics", "educational", "memes", "work", "remote", "001-1-echo-cloud-handoff.trace.md");
  const result = getAvailableActions({ reference, maxDepth: 1 });
  assert.equal(result.status, "ok");
  assert.ok(result.actions.some((entry) => entry.actionId === "open-parent" && entry.enabled));
  assert.ok(result.actions.some((entry) => entry.actionId === "validate" && entry.enabled));
  assert.ok(result.actions.some((entry) => entry.actionId === "copy-handoff" && entry.enabled));
  assert.ok(result.actions.some((entry) => entry.actionId === "copy-relevant-slice" && entry.enabled));
  assert.ok(result.actions.some((entry) => entry.actionId === "inspect-schema-contract" && entry.enabled));
  assert.equal(result.actions.some((entry) => entry.title.includes("Repair")), false);
});

test("getStructureIndex returns a bounded deduped index with parent and validation summaries", () => {
  const artifactA = path.resolve(__dirname, "..", "..", "..", "..", "docs", ".topics", "educational", "memes", "work", "remote", "001-1-echo-cloud-handoff.trace.md");
  const artifactB = path.resolve(__dirname, "..", "..", "..", "..", "docs", ".topics", "educational", "memes", "work", "remote", "001.trace.md");
  const result = getStructureIndex({ references: [artifactA, artifactB, artifactA], maxArtifacts: 8 });
  assert.equal(result.status, "ok");
  assert.equal(result.nodes.length, 2);
  const taskNode = result.nodes.find((node) => node.schemaId === "tiinex.task.v1");
  assert.ok(taskNode);
  assert.equal(taskNode?.aliasCollapsed, true);
  assert.equal(taskNode?.validationSummary.status, "ok");
  assert.equal(taskNode?.validationSummary.aggregateSeverity, "none");
  assert.equal(taskNode?.parentEdge?.traceTarget, "001.trace.md");
  assert.ok(Array.isArray(taskNode?.originCandidates));
});

test("getTreeProjection returns stable UI-neutral nodes with parent-child links", () => {
  const artifactA = path.resolve(__dirname, "..", "..", "..", "..", "docs", ".topics", "educational", "memes", "work", "remote", "001-1-echo-cloud-handoff.trace.md");
  const artifactB = path.resolve(__dirname, "..", "..", "..", "..", "docs", ".topics", "educational", "memes", "work", "remote", "001.trace.md");
  const result = getTreeProjection({ references: [artifactA, artifactB], sortBy: "label" });
  assert.equal(result.status, "ok");
  assert.equal(result.projectionShapeVersion, 1);
  assert.equal(result.totalNodes, 2);
  const topicNode = result.nodes.find((node) => node.schemaId === "tiinex.topic.v1");
  const taskNode = result.nodes.find((node) => node.schemaId === "tiinex.task.v1");
  assert.ok(topicNode);
  assert.ok(taskNode);
  assert.equal(taskNode?.parentNodeId, topicNode?.nodeId);
  assert.ok(topicNode?.childNodeIds.includes(taskNode!.nodeId));
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
  assert.equal(result.status, "ok");
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
  assert.equal(result.status, "ok");
  assert.equal(result.totalChildren, 1);
  assert.equal(result.children.length, 1);
  assert.equal(result.children[0]?.schemaId, "tiinex.task.v1");
  assert.deepEqual(result.missingOrUnreadableChildren, []);
});