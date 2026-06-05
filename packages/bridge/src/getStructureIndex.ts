import { type ContinuityEnvelope, type GetStructureIndexInput, type GetStructureIndexResult, type StructureIndexNode, createOutputMetadata } from "@tiinex/lineage-bridge-core";
import { parseContinuityEnvelope } from "@tiinex/lineage-bridge-parsers";
import { resolveArtifact } from "@tiinex/lineage-bridge-sources";
import { validateArtifact } from "@tiinex/lineage-bridge-validators";

function getSchemaId(reference: ContinuityEnvelope["currentSchema"] | ContinuityEnvelope["parentSchema"]): string | undefined {
  return reference?.label ?? reference?.target;
}

function collectOriginCandidates(origin: ContinuityEnvelope["parentOrigin"] | ContinuityEnvelope["currentOrigin"]): string[] {
  const values = [
    origin?.relative,
    origin?.absolute,
    origin?.browseGit,
    ...(origin?.unknownEntries.map((entry) => entry.value) ?? [])
  ].filter((value): value is string => typeof value === "string" && value.length > 0);
  return [...new Set(values)];
}

function aggregateSeverity(counts: StructureIndexNode["validationSummary"]["findingCounts"]): StructureIndexNode["validationSummary"]["aggregateSeverity"] {
  if (counts.error > 0) {
    return "error";
  }
  if (counts.warning > 0) {
    return "warning";
  }
  if (counts.info > 0) {
    return "info";
  }
  return "none";
}

export function getStructureIndex(input: GetStructureIndexInput): GetStructureIndexResult {
  const maxArtifacts = input.maxArtifacts ?? 32;
  const exhausted: string[] = [];
  const grouped = new Map<string, StructureIndexNode>();
  const aliasKeys = new Map<string, Set<string>>();
  let rawReadNeededForNextStep = false;
  let truncated = false;

  for (const reference of input.references.slice(0, maxArtifacts)) {
    const resolved = resolveArtifact({ reference, maxArtifactBytes: input.maxArtifactBytes });
    const validation = validateArtifact({ reference, maxArtifactBytes: input.maxArtifactBytes });
    rawReadNeededForNextStep = rawReadNeededForNextStep || validation.rawReadNeededForNextStep;
    truncated = truncated || resolved.budgets.truncated || validation.budgets.truncated;
    const envelope = resolved.source.rawContent ? parseContinuityEnvelope(resolved.source.rawContent) : undefined;
    const nodeId = resolved.artifact.canonicalArtifactId ?? resolved.source.normalizedReference ?? resolved.source.inputReference;
    const aliasKey = resolved.source.normalizedReference ?? resolved.source.path ?? resolved.source.inputReference;
    const findingCounts: StructureIndexNode["validationSummary"]["findingCounts"] = {
      error: validation.findings.filter((finding) => finding.severity === "error").length,
      warning: validation.findings.filter((finding) => finding.severity === "warning").length,
      info: validation.findings.filter((finding) => finding.severity === "info").length
    };
    const existing = grouped.get(nodeId);
    if (existing) {
      existing.aliasCollapsed = true;
      existing.references = [...new Set([...existing.references, reference])];
      existing.artifact.aliases = [...new Set([...existing.artifact.aliases, ...(resolved.artifact.aliases ?? []), reference])];
    } else {
      grouped.set(nodeId, {
        nodeId,
        artifact: {
          ...resolved.artifact,
          aliases: [...new Set([...(resolved.artifact.aliases ?? []), reference])]
        },
        primaryReference: reference,
        schemaId: getSchemaId(envelope?.currentSchema),
        summary: envelope?.currentSummary,
        parentEdge: envelope?.parentTrace || envelope?.parentSchema
          ? {
              traceTarget: envelope.parentTrace?.target,
              schemaId: getSchemaId(envelope.parentSchema)
            }
          : undefined,
        originCandidates: collectOriginCandidates(envelope?.currentOrigin),
        validationSummary: {
          status: validation.status,
          aggregateSeverity: aggregateSeverity(findingCounts),
          findingCounts,
          exactValidationBlocked: validation.validationBasis.exactValidationBlocked
        },
        aliasCollapsed: false,
        aliasConflict: false,
        references: [reference]
      });
    }
    const seenForAlias = aliasKeys.get(aliasKey) ?? new Set<string>();
    seenForAlias.add(nodeId);
    aliasKeys.set(aliasKey, seenForAlias);
  }

  for (const [aliasKey, nodeIds] of aliasKeys.entries()) {
    if (nodeIds.size <= 1) {
      continue;
    }
    for (const nodeId of nodeIds) {
      const node = grouped.get(nodeId);
      if (!node) {
        continue;
      }
      node.aliasConflict = true;
      node.artifact.aliases = [...new Set([...node.artifact.aliases, aliasKey])];
    }
  }

  if (input.references.length > maxArtifacts) {
    exhausted.push("maxArtifacts");
  }

  return {
    ...createOutputMetadata("getStructureIndex"),
    status: "ok",
    nodes: [...grouped.values()],
    complete: exhausted.length === 0,
    rawReadNeededForNextStep,
    budgets: {
      truncated,
      exhausted
    }
  };
}