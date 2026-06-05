import { type BridgeTopLevelStatus, type GetNodeDetailsInput, type GetNodeDetailsResult, createOutputMetadata } from "@tiinex/lineage-bridge-core";
import { readEnvelope } from "./readEnvelope";
import { getStructureIndex } from "./getStructureIndex";
import { validateArtifact } from "@tiinex/lineage-bridge-validators";

function deriveNodeDetailsStatus(
  envelopeStatus: BridgeTopLevelStatus,
  validationStatus: BridgeTopLevelStatus,
  partialValidation: boolean,
  complete: boolean
): BridgeTopLevelStatus {
  if (validationStatus === "invalid") {
    return "invalid";
  }
  if (envelopeStatus === "blocked" || validationStatus === "blocked") {
    return "blocked";
  }
  if (envelopeStatus === "unavailable" || validationStatus === "unavailable") {
    return "unavailable";
  }
  if (envelopeStatus === "unsupported" || validationStatus === "unsupported") {
    return "unsupported";
  }
  if (validationStatus === "unknown") {
    return "unknown";
  }
  if (envelopeStatus === "incomplete" || validationStatus === "incomplete" || partialValidation || !complete) {
    return "incomplete";
  }
  return "ok";
}

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
  const complete = envelope.complete && validation.complete;
  return {
    ...createOutputMetadata("getNodeDetails"),
    status: deriveNodeDetailsStatus(
      envelope.status,
      validation.status,
      validation.validationBasis.partialValidation,
      complete
    ),
    nodeId: input.nodeId,
    projectionShapeVersion: 1,
    envelope: envelope.envelope,
    validationFindings: validation.findings,
    validationBasis: validation.validationBasis,
    parent: node.parentEdge,
    originCandidates: node.originCandidates,
    relevantBodySummary: node.summary,
    complete,
    rawReadNeededForNextStep: envelope.rawReadNeededForNextStep || validation.rawReadNeededForNextStep,
    budgets: {
      truncated: index.budgets.truncated || envelope.budgets.truncated || validation.budgets.truncated,
      exhausted: [...new Set([...index.budgets.exhausted, ...envelope.budgets.exhausted, ...validation.budgets.exhausted])]
    }
  };
}