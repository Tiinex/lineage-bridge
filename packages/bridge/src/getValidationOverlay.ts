import { type GetValidationOverlayInput, type GetValidationOverlayResult, createOutputMetadata } from "@tiinex/lineage-bridge-core";
import { validateArtifact } from "@tiinex/lineage-bridge-validators";
import { getLineage } from "./getLineage";

function deriveSurfaceValidationState(validation: ReturnType<typeof validateArtifact>): GetValidationOverlayResult["status"] {
  if (validation.status !== "ok") {
    return validation.status;
  }
  if (validation.validationBasis.partialValidation || !validation.validationBasis.schemaResolutionComplete) {
    return "incomplete";
  }
  return "ok";
}

function getAggregateSeverity(counts: GetValidationOverlayResult["findingCounts"], validation: ReturnType<typeof validateArtifact>): GetValidationOverlayResult["aggregateSeverity"] {
  if (counts.error > 0) {
    return "error";
  }
  if (counts.warning > 0) {
    return "warning";
  }
  if (counts.info > 0) {
    return "info";
  }
  if (validation.validationBasis.partialValidation || !validation.validationBasis.schemaResolutionComplete || (validation.compatibilityNotes?.length ?? 0) > 0) {
    return "warning";
  }
  return "none";
}

export function getValidationOverlay(input: GetValidationOverlayInput): GetValidationOverlayResult {
  const validation = validateArtifact(input);
  const lineage = input.includeLineage === false ? undefined : getLineage(input);
  const findingCounts: GetValidationOverlayResult["findingCounts"] = {
    error: validation.findings.filter((finding) => finding.severity === "error").length,
    warning: validation.findings.filter((finding) => finding.severity === "warning").length,
    info: validation.findings.filter((finding) => finding.severity === "info").length
  };

  return {
    ...createOutputMetadata("getValidationOverlay"),
    compatibilityNotes: [...(validation.compatibilityNotes ?? [])],
    status: deriveSurfaceValidationState(validation),
    aggregateSeverity: getAggregateSeverity(findingCounts, validation),
    findingCounts,
    directValidationState: validation.status,
    lineageValidationState: lineage ? (lineage.complete ? "complete" : lineage.stoppedBecause) : undefined,
    partialValidation: validation.validationBasis.partialValidation,
    exactValidationBlocked: validation.validationBasis.exactValidationBlocked,
    schemaResolutionComplete: validation.validationBasis.schemaResolutionComplete,
    complete: validation.complete && (lineage ? lineage.complete : true),
    rawReadNeededForNextStep: validation.rawReadNeededForNextStep || Boolean(lineage?.rawReadNeededForNextStep),
    budgets: {
      truncated: validation.budgets.truncated || Boolean(lineage?.budgets.truncated),
      exhausted: [...new Set([...validation.budgets.exhausted, ...(lineage?.budgets.exhausted ?? [])])]
    }
  };
}