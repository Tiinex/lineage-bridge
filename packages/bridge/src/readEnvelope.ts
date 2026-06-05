import { type ReadEnvelopeInput, type ReadEnvelopeResult, createOutputMetadata, stripRawContentFromSource } from "@tiinex/lineage-bridge-core";
import { parseContinuityEnvelope } from "@tiinex/lineage-bridge-parsers";
import { resolveArtifact } from "@tiinex/lineage-bridge-sources";

export function readEnvelope(input: ReadEnvelopeInput): ReadEnvelopeResult {
  const resolved = resolveArtifact({ ...input, includeRawContent: true });
  const source = stripRawContentFromSource(resolved.source);
  if (!resolved.source.rawContent) {
    return {
      ...createOutputMetadata("readEnvelope"),
      status: resolved.status,
      source,
      artifact: resolved.artifact,
      complete: false,
      rawReadNeededForNextStep: true,
      budgets: resolved.budgets
    };
  }

  return {
    ...createOutputMetadata("readEnvelope"),
    status: "ok",
    source,
    artifact: resolved.artifact,
    envelope: parseContinuityEnvelope(resolved.source.rawContent),
    complete: resolved.complete,
    rawReadNeededForNextStep: false,
    budgets: resolved.budgets
  };
}