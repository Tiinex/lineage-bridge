import { type ContinuityEnvelope, type GetStructureIndexInput, type GetStructureIndexResult, type StructureIndexNode, createOutputMetadata } from "@tiinex/lineage-bridge-core";
import { parseContinuityEnvelope } from "@tiinex/lineage-bridge-parsers";
import { resolveArtifact } from "@tiinex/lineage-bridge-sources";
import { validateArtifact } from "@tiinex/lineage-bridge-validators";
import { applyAliasFamilyClassification, classifyAliasFamilies, getAliasFamilyKey, type AliasFamilyEntry } from "./aliasFamilies";

function deriveSurfaceValidationStatus(validation: ReturnType<typeof validateArtifact>): StructureIndexNode["validationSummary"]["status"] {
  if (validation.status !== "ok") {
    return validation.status;
  }
  if (validation.validationBasis.partialValidation || !validation.validationBasis.schemaResolutionComplete) {
    return "incomplete";
  }
  return "ok";
}

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

function collectRecoveryCandidates(envelope: ContinuityEnvelope | undefined): string[] {
  return [...new Set([...collectOriginCandidates(envelope?.parentOrigin), ...collectOriginCandidates(envelope?.currentOrigin)])];
}

function aggregateSeverity(counts: StructureIndexNode["validationSummary"]["findingCounts"], validation: ReturnType<typeof validateArtifact>): StructureIndexNode["validationSummary"]["aggregateSeverity"] {
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

export function getStructureIndex(input: GetStructureIndexInput): GetStructureIndexResult {
  const maxArtifacts = input.maxArtifacts ?? 32;
  const exhausted: string[] = [];
  const grouped = new Map<string, StructureIndexNode>();
  const aliasEntries: AliasFamilyEntry[] = [];
  let rawReadNeededForNextStep = false;
  let truncated = false;
  const compatibilityNotes = new Set<string>();

  for (const reference of input.references.slice(0, maxArtifacts)) {
    const resolved = resolveArtifact({ reference, maxArtifactBytes: input.maxArtifactBytes, includeRawContent: true, sourceAccess: input.sourceAccess });
    const validation = validateArtifact({ reference, maxArtifactBytes: input.maxArtifactBytes, sourceAccess: input.sourceAccess });
    rawReadNeededForNextStep = rawReadNeededForNextStep || validation.rawReadNeededForNextStep;
    truncated = truncated || resolved.budgets.truncated || validation.budgets.truncated;
    const envelope = resolved.source.rawContent && !resolved.budgets.truncated
      ? parseContinuityEnvelope(resolved.source.rawContent)
      : undefined;
    const nodeId = resolved.artifact.canonicalArtifactId ?? resolved.source.normalizedReference ?? resolved.source.inputReference;
    const aliasFamilyKey = getAliasFamilyKey({ artifact: resolved.artifact, source: resolved.source });
    const findingCounts: StructureIndexNode["validationSummary"]["findingCounts"] = {
      error: validation.findings.filter((finding) => finding.severity === "error").length,
      warning: validation.findings.filter((finding) => finding.severity === "warning").length,
      info: validation.findings.filter((finding) => finding.severity === "info").length
    };
    const surfaceStatus = deriveSurfaceValidationStatus(validation);
    for (const note of validation.compatibilityNotes ?? []) {
      compatibilityNotes.add(note);
    }
    const existing = grouped.get(nodeId);
    if (existing) {
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
        sourceAccessStatus: resolved.source.accessStatus,
        rawContentAvailability: resolved.source.rawContentAvailability,
        renderedContentAvailability: resolved.source.renderedContentAvailability,
        schemaId: getSchemaId(envelope?.currentSchema),
        summary: envelope?.currentSummary,
        parentEdge: envelope?.parentTrace || envelope?.parentSchema
          ? {
              traceTarget: envelope.parentTrace?.target,
              schemaId: getSchemaId(envelope.parentSchema)
            }
          : undefined,
        originCandidates: collectRecoveryCandidates(envelope),
        validationSummary: {
          status: surfaceStatus,
          aggregateSeverity: aggregateSeverity(findingCounts, validation),
          findingCounts,
          partialValidation: validation.validationBasis.partialValidation,
          exactValidationBlocked: validation.validationBasis.exactValidationBlocked,
          schemaResolutionComplete: validation.validationBasis.schemaResolutionComplete,
          compatibilityNotes: [...(validation.compatibilityNotes ?? [])]
        },
        aliasCollapsed: false,
        aliasConflict: false,
        references: [reference]
      });
    }
    aliasEntries.push({
      nodeId,
      aliasFamilyKey,
      alias: resolved.source.normalizedReference ?? resolved.source.path ?? resolved.source.inputReference
    });
  }

  applyAliasFamilyClassification([...grouped.values()], classifyAliasFamilies(aliasEntries));

  if (input.references.length > maxArtifacts) {
    exhausted.push("maxArtifacts");
  }

  return {
    ...createOutputMetadata("getStructureIndex"),
    compatibilityNotes: [...compatibilityNotes],
    status: [...grouped.values()].some((node) => node.validationSummary.status === "invalid")
      ? "invalid"
      : [...grouped.values()].some((node) => node.validationSummary.status === "blocked")
        ? "blocked"
        : [...grouped.values()].some((node) => node.validationSummary.status === "unknown")
          ? "unknown"
        : [...grouped.values()].some((node) => node.validationSummary.status === "incomplete")
          ? "incomplete"
          : "ok",
    nodes: [...grouped.values()],
    complete: exhausted.length === 0,
    rawReadNeededForNextStep,
    budgets: {
      truncated,
      exhausted
    }
  };
}