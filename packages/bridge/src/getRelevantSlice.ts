import { type GetRelevantSliceInput, type GetRelevantSliceResult, createOutputMetadata } from "@tiinex/lineage-bridge-core";
import { parseContinuityEnvelope } from "@tiinex/lineage-bridge-parsers";
import { resolveArtifact, resolveArtifactAsync } from "@tiinex/lineage-bridge-sources";
import { validateArtifact, validateArtifactAsync } from "@tiinex/lineage-bridge-validators";
import { getLineage, getLineageAsync } from "./getLineage";
import { getIntentionallyExcluded, selectRelevantSlices } from "./selectRelevantSlices";
import { createAsyncBridgeOperationContext } from "./asyncOperationContext";

function deriveConsumerFacingSliceStatus(input: {
  rawReadable: boolean;
  selectedSliceCount: number;
  validation: Awaited<ReturnType<typeof validateArtifactAsync>>;
}): GetRelevantSliceResult["status"] {
  if (!input.rawReadable) {
    return input.validation.status;
  }
  if (input.validation.status !== "ok") {
    return input.validation.status;
  }
  if (input.selectedSliceCount === 0) {
    return "incomplete";
  }
  if (input.validation.validationBasis.partialValidation || !input.validation.validationBasis.schemaResolutionComplete) {
    return "incomplete";
  }
  return "ok";
}

export function getRelevantSlice(input: GetRelevantSliceInput): GetRelevantSliceResult {
  const resolved = resolveArtifact({ ...input, includeRawContent: true });
  const validation = validateArtifact(input);
  const lineage = getLineage(input);
  const envelope = resolved.source.rawContent && !resolved.budgets.truncated
    ? parseContinuityEnvelope(resolved.source.rawContent)
    : undefined;
  const importantFindings = validation.findings.filter((finding) => finding.severity !== "info");
  const selectedSlices = selectRelevantSlices({
    purpose: input.purpose,
    summary: envelope?.currentSummary,
    findings: importantFindings.map((finding) => finding.message),
    parentSummary: lineage.nodes[1]?.summary,
    lineageStoppedBecause: lineage.stoppedBecause
  });
  const status = deriveConsumerFacingSliceStatus({
    rawReadable: Boolean(resolved.source.rawContent) && !resolved.budgets.truncated,
    selectedSliceCount: selectedSlices.length,
    validation
  });
  const complete = Boolean(resolved.source.rawContent) && !resolved.budgets.truncated && validation.complete && selectedSlices.length > 0;

  return {
    ...createOutputMetadata("getRelevantSlice"),
    compatibilityNotes: [...(validation.compatibilityNotes ?? [])],
    status,
    purpose: input.purpose,
    artifact: {
      canonicalArtifactId: resolved.artifact.canonicalArtifactId,
      origin: resolved.source.normalizedReference ?? resolved.source.inputReference,
      reference: resolved.source.inputReference,
      path: resolved.source.path,
      schema: validation.governingSchemaId,
      summary: envelope?.currentSummary,
      contentHash: resolved.artifact.contentHash,
      aliases: resolved.artifact.aliases
    },
    selectedSlices,
    directValidationState: validation.status,
    partialValidation: validation.validationBasis.partialValidation,
    exactValidationBlocked: validation.validationBasis.exactValidationBlocked,
    schemaResolutionComplete: validation.validationBasis.schemaResolutionComplete,
    intentionallyExcluded: getIntentionallyExcluded({
      purpose: input.purpose,
      includeRawContent: Boolean(input.includeRawContent)
    }),
    rawContent: input.includeRawContent ? resolved.source.rawContent : undefined,
    complete,
    rawReadNeededForNextStep: !resolved.source.rawContent || validation.rawReadNeededForNextStep || lineage.rawReadNeededForNextStep,
    budgets: {
      truncated: resolved.budgets.truncated || validation.budgets.truncated || lineage.budgets.truncated,
      exhausted: [...new Set([...resolved.budgets.exhausted, ...validation.budgets.exhausted, ...lineage.budgets.exhausted])]
    }
  };
}

export async function getRelevantSliceAsync(input: GetRelevantSliceInput): Promise<GetRelevantSliceResult> {
  const operation = createAsyncBridgeOperationContext(input.sourceAccess);
  const resolved = await operation.resolve({ ...input, includeRawContent: true });
  const validation = await validateArtifactAsync(input, operation.resolve, operation.consumeSchemaBudget);
  const lineage = await getLineageAsync(input, operation.resolve);
  const envelope = resolved.source.rawContent && !resolved.budgets.truncated
    ? parseContinuityEnvelope(resolved.source.rawContent)
    : undefined;
  const importantFindings = validation.findings.filter((finding) => finding.severity !== "info");
  const selectedSlices = selectRelevantSlices({
    purpose: input.purpose,
    summary: envelope?.currentSummary,
    findings: importantFindings.map((finding) => finding.message),
    parentSummary: lineage.nodes[1]?.summary,
    lineageStoppedBecause: lineage.stoppedBecause
  });
  const status = deriveConsumerFacingSliceStatus({
    rawReadable: Boolean(resolved.source.rawContent) && !resolved.budgets.truncated,
    selectedSliceCount: selectedSlices.length,
    validation
  });
  const complete = Boolean(resolved.source.rawContent) && !resolved.budgets.truncated && validation.complete && selectedSlices.length > 0;

  return {
    ...createOutputMetadata("getRelevantSlice"),
    compatibilityNotes: [...(validation.compatibilityNotes ?? [])],
    status,
    purpose: input.purpose,
    artifact: {
      canonicalArtifactId: resolved.artifact.canonicalArtifactId,
      origin: resolved.source.normalizedReference ?? resolved.source.inputReference,
      reference: resolved.source.inputReference,
      path: resolved.source.path,
      schema: validation.governingSchemaId,
      summary: envelope?.currentSummary,
      contentHash: resolved.artifact.contentHash,
      aliases: resolved.artifact.aliases
    },
    selectedSlices,
    directValidationState: validation.status,
    partialValidation: validation.validationBasis.partialValidation,
    exactValidationBlocked: validation.validationBasis.exactValidationBlocked,
    schemaResolutionComplete: validation.validationBasis.schemaResolutionComplete,
    intentionallyExcluded: getIntentionallyExcluded({
      purpose: input.purpose,
      includeRawContent: Boolean(input.includeRawContent)
    }),
    rawContent: input.includeRawContent ? resolved.source.rawContent : undefined,
    complete,
    rawReadNeededForNextStep: !resolved.source.rawContent || validation.rawReadNeededForNextStep || lineage.rawReadNeededForNextStep,
    budgets: {
      truncated: resolved.budgets.truncated || validation.budgets.truncated || lineage.budgets.truncated,
      exhausted: [...new Set([...resolved.budgets.exhausted, ...validation.budgets.exhausted, ...lineage.budgets.exhausted])]
    }
  };
}