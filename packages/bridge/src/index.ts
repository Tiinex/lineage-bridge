import { type ReadEnvelopeInput, type ReadEnvelopeResult, createOutputMetadata } from "@tiinex/lineage-bridge-core";
import { parseContinuityEnvelope } from "@tiinex/lineage-bridge-parsers";
import { resolveArtifact } from "@tiinex/lineage-bridge-sources";
import { validateArtifact } from "@tiinex/lineage-bridge-validators";
import { getLineage } from "./getLineage";
import { getHandoffPacket } from "./getHandoffPacket";
import { getRelevantSlice } from "./getRelevantSlice";
import { getSchemaContract } from "./getSchemaContract";
import { getValidationOverlay } from "./getValidationOverlay";
import { getAvailableActions } from "./getAvailableActions";
import { getStructureIndex } from "./getStructureIndex";
import { getTreeProjection } from "./getTreeProjection";
import { getNodeDetails } from "./getNodeDetails";
import { getNodeChildren } from "./getNodeChildren";

export { resolveArtifact } from "@tiinex/lineage-bridge-sources";
export { parseContinuityEnvelope } from "@tiinex/lineage-bridge-parsers";
export { validateArtifact } from "@tiinex/lineage-bridge-validators";
export { getLineage } from "./getLineage";
export { getHandoffPacket } from "./getHandoffPacket";
export { getRelevantSlice } from "./getRelevantSlice";
export { getSchemaContract } from "./getSchemaContract";
export { getValidationOverlay } from "./getValidationOverlay";
export { getAvailableActions } from "./getAvailableActions";
export { getStructureIndex } from "./getStructureIndex";
export { getTreeProjection } from "./getTreeProjection";
export { getNodeDetails } from "./getNodeDetails";
export { getNodeChildren } from "./getNodeChildren";
export * from "@tiinex/lineage-bridge-core";

export function readEnvelope(input: ReadEnvelopeInput): ReadEnvelopeResult {
  const resolved = resolveArtifact({ ...input, includeRawContent: true });
  if (!resolved.source.rawContent) {
    return {
      ...createOutputMetadata("readEnvelope"),
      status: resolved.status,
      source: resolved.source,
      artifact: resolved.artifact,
      complete: false,
      rawReadNeededForNextStep: true,
      budgets: resolved.budgets
    };
  }
  return {
    ...createOutputMetadata("readEnvelope"),
    status: "ok",
    source: resolved.source,
    artifact: resolved.artifact,
    envelope: parseContinuityEnvelope(resolved.source.rawContent),
    complete: resolved.complete,
    rawReadNeededForNextStep: false,
    budgets: resolved.budgets
  };
}