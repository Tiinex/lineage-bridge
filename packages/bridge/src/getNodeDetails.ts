import { type GetNodeDetailsInput, type GetNodeDetailsResult, createOutputMetadata } from "@tiinex/lineage-bridge-core";
import { readEnvelope } from "./index";
import { getStructureIndex } from "./getStructureIndex";
import { validateArtifact } from "@tiinex/lineage-bridge-validators";

export function getNodeDetails(input: GetNodeDetailsInput): GetNodeDetailsResult {
  const index = getStructureIndex(input);
  const node = index.nodes.find((entry) => entry.nodeId === input.nodeId);
  if (!node) {
    return {
      ...createOutputMetadata("getNodeDetails"),
      status: "unavailable",
      nodeId: input.nodeId,
      projectionShapeVersion: 1,
      validationFindings: [],
      originCandidates: [],
      complete: false,
      rawReadNeededForNextStep: false,
      budgets: index.budgets
    };
  }

  const envelope = readEnvelope({ reference: node.primaryReference, maxArtifactBytes: input.maxArtifactBytes });
  const validation = validateArtifact({ reference: node.primaryReference, maxArtifactBytes: input.maxArtifactBytes });
  return {
    ...createOutputMetadata("getNodeDetails"),
    status: "ok",
    nodeId: input.nodeId,
    projectionShapeVersion: 1,
    envelope: envelope.envelope,
    validationFindings: validation.findings,
    validationBasis: validation.validationBasis,
    parent: node.parentEdge,
    originCandidates: node.originCandidates,
    relevantBodySummary: node.summary,
    complete: envelope.complete && validation.complete,
    rawReadNeededForNextStep: envelope.rawReadNeededForNextStep || validation.rawReadNeededForNextStep,
    budgets: {
      truncated: index.budgets.truncated || envelope.budgets.truncated || validation.budgets.truncated,
      exhausted: [...new Set([...index.budgets.exhausted, ...envelope.budgets.exhausted, ...validation.budgets.exhausted])]
    }
  };
}