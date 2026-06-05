import { type GetRelevantSliceInput, type GetRelevantSliceResult, createOutputMetadata } from "@tiinex/lineage-bridge-core";
import { parseContinuityEnvelope } from "@tiinex/lineage-bridge-parsers";
import { resolveArtifact } from "@tiinex/lineage-bridge-sources";
import { validateArtifact } from "@tiinex/lineage-bridge-validators";
import { getLineage } from "./getLineage";
import { getIntentionallyExcluded, selectRelevantSlices } from "./selectRelevantSlices";

export function getRelevantSlice(input: GetRelevantSliceInput): GetRelevantSliceResult {
  const resolved = resolveArtifact({ ...input, includeRawContent: true });
  const validation = validateArtifact(input);
  const lineage = getLineage(input);
  const envelope = resolved.source.rawContent ? parseContinuityEnvelope(resolved.source.rawContent) : undefined;
  const importantFindings = validation.findings.filter((finding) => finding.severity !== "info");
  const selectedSlices = selectRelevantSlices({
    purpose: input.purpose,
    summary: envelope?.currentSummary,
    findings: importantFindings.map((finding) => finding.message),
    parentSummary: lineage.nodes[1]?.summary,
    lineageStoppedBecause: lineage.stoppedBecause
  });
  const complete = Boolean(resolved.source.rawContent) && validation.complete && selectedSlices.length > 0;

  return {
    ...createOutputMetadata("getRelevantSlice"),
    status: resolved.source.rawContent ? "ok" : validation.status,
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