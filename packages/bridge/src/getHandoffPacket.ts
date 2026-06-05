import {
  type GetHandoffPacketInput,
  type GetHandoffPacketResult,
  createOutputMetadata
} from "@tiinex/lineage-bridge-core";
import { parseContinuityEnvelope } from "@tiinex/lineage-bridge-parsers";
import { resolveArtifact, resolveArtifactAsync } from "@tiinex/lineage-bridge-sources";
import { getLineage, getLineageAsync } from "./getLineage";
import { validateArtifact, validateArtifactAsync } from "@tiinex/lineage-bridge-validators";
import { selectRelevantSlices } from "./selectRelevantSlices";

function deriveConsumerFacingValidationStatus(validation: Awaited<ReturnType<typeof validateArtifactAsync>>): GetHandoffPacketResult["handoff"]["validation"]["status"] {
  if (validation.status !== "ok") {
    return validation.status;
  }
  if (validation.validationBasis.partialValidation || !validation.validationBasis.schemaResolutionComplete) {
    return "incomplete";
  }
  return "ok";
}

function deriveNextAction(input: {
  validationStatus: GetHandoffPacketResult["handoff"]["validation"]["status"];
  lineageStoppedBecause: ReturnType<typeof getLineage>["stoppedBecause"];
  originRecoveryCandidates: string[];
}): string {
  if (input.validationStatus === "invalid") {
    return "Inspect validation findings before continuing work from this artifact.";
  }
  if (input.lineageStoppedBecause === "max-depth") {
    return "Read only the direct parent if continuity context is needed beyond this handoff.";
  }
  if (input.originRecoveryCandidates.length > 0) {
    return "Use origin recovery candidates only if parent traversal must be repaired or recovered.";
  }
  return "Continue from the current artifact and widen only if the next task actually needs broader lineage context.";
}

function deriveDoNotTraverseHints(input: {
  partialValidation: boolean;
  lineageStoppedBecause: ReturnType<typeof getLineage>["stoppedBecause"];
  originRecoveryCandidates: string[];
}): string[] {
  const hints: string[] = [];
  if (input.partialValidation) {
    hints.push("Do not claim full validation beyond the current shared validator coverage.");
  }
  if (input.lineageStoppedBecause === "max-depth") {
    hints.push("Do not traverse beyond the configured parent depth unless the next step truly needs it.");
  }
  if (input.originRecoveryCandidates.length > 0) {
    hints.push("Do not silently choose between origin recovery candidates without an explicit recovery need.");
  }
  return hints;
}

export function getHandoffPacket(input: GetHandoffPacketInput): GetHandoffPacketResult {
  const validation = validateArtifact(input);
  const lineage = getLineage(input);
  const artifact = resolveArtifact({ ...input, includeRawContent: true });
  const envelope = artifact.source.rawContent && !artifact.budgets.truncated
    ? parseContinuityEnvelope(artifact.source.rawContent)
    : undefined;
  const parentNode = lineage.nodes[1];
  const importantFindings = validation.findings.filter((finding) => finding.severity !== "info");
  const consumerFacingValidationStatus = deriveConsumerFacingValidationStatus(validation);
  const nextAction = deriveNextAction({
    validationStatus: consumerFacingValidationStatus,
    lineageStoppedBecause: lineage.stoppedBecause,
    originRecoveryCandidates: lineage.originRecoveryCandidates
  });
  const doNotTraverse = deriveDoNotTraverseHints({
    partialValidation: validation.validationBasis.partialValidation,
    lineageStoppedBecause: lineage.stoppedBecause,
    originRecoveryCandidates: lineage.originRecoveryCandidates
  });
  const relevantSlices = selectRelevantSlices({
    purpose: "handoff",
    summary: envelope?.currentSummary,
    findings: importantFindings.map((finding) => finding.message),
    parentSummary: parentNode?.summary,
    lineageStoppedBecause: lineage.stoppedBecause
  });
  const complete = validation.complete && lineage.complete;
  const status = consumerFacingValidationStatus === "invalid"
    ? "invalid"
    : complete
      ? "ok"
      : "incomplete";

  return {
    ...createOutputMetadata("getHandoffPacket"),
    compatibilityNotes: validation.compatibilityNotes,
    status,
    handoff: {
      handoffShapeVersion: 1,
      artifact: {
        canonicalArtifactId: validation.artifact.canonicalArtifactId,
        origin: validation.source.normalizedReference ?? validation.source.inputReference,
        reference: validation.source.inputReference,
        path: validation.source.path,
        schema: validation.governingSchemaId,
        summary: envelope?.currentSummary,
        contentHash: validation.artifact.contentHash,
        aliases: validation.artifact.aliases
      },
      validation: {
        status: consumerFacingValidationStatus,
        rawValidatorStatus: validation.status,
        basis: validation.validationBasis,
        findings: importantFindings
      },
      continuity: {
        parent: lineage.nodes[0]?.parent || parentNode
          ? {
              canonicalArtifactId: parentNode?.artifact.canonicalArtifactId,
              summary: parentNode?.summary,
              traceTarget: lineage.nodes[0]?.parent?.traceTarget,
              schemaId: parentNode?.schemaId ?? lineage.nodes[0]?.parent?.schemaId
            }
          : undefined,
        originCandidates: lineage.originRecoveryCandidates
      },
      currentLeaf: {
        summary: envelope?.currentSummary,
        nextAction,
        nonGoals: doNotTraverse
      },
      relevantSlices,
      doNotTraverse,
      budgets: {
        truncated: artifact.budgets.truncated || validation.budgets.truncated || lineage.budgets.truncated,
        exhausted: [...new Set([...artifact.budgets.exhausted, ...validation.budgets.exhausted, ...lineage.budgets.exhausted])]
      }
    },
    complete,
    rawReadNeededForNextStep: validation.rawReadNeededForNextStep || lineage.rawReadNeededForNextStep,
    budgets: {
      truncated: artifact.budgets.truncated || validation.budgets.truncated || lineage.budgets.truncated,
      exhausted: [...new Set([...artifact.budgets.exhausted, ...validation.budgets.exhausted, ...lineage.budgets.exhausted])]
    }
  };
}

export async function getHandoffPacketAsync(input: GetHandoffPacketInput): Promise<GetHandoffPacketResult> {
  const validation = await validateArtifactAsync(input);
  const lineage = await getLineageAsync(input);
  const artifact = await resolveArtifactAsync({ ...input, includeRawContent: true });
  const envelope = artifact.source.rawContent && !artifact.budgets.truncated
    ? parseContinuityEnvelope(artifact.source.rawContent)
    : undefined;
  const parentNode = lineage.nodes[1];
  const importantFindings = validation.findings.filter((finding) => finding.severity !== "info");
  const consumerFacingValidationStatus = deriveConsumerFacingValidationStatus(validation);
  const nextAction = deriveNextAction({
    validationStatus: consumerFacingValidationStatus,
    lineageStoppedBecause: lineage.stoppedBecause,
    originRecoveryCandidates: lineage.originRecoveryCandidates
  });
  const doNotTraverse = deriveDoNotTraverseHints({
    partialValidation: validation.validationBasis.partialValidation,
    lineageStoppedBecause: lineage.stoppedBecause,
    originRecoveryCandidates: lineage.originRecoveryCandidates
  });
  const relevantSlices = selectRelevantSlices({
    purpose: "handoff",
    summary: envelope?.currentSummary,
    findings: importantFindings.map((finding) => finding.message),
    parentSummary: parentNode?.summary,
    lineageStoppedBecause: lineage.stoppedBecause
  });
  const complete = validation.complete && lineage.complete;
  const status = consumerFacingValidationStatus === "invalid"
    ? "invalid"
    : complete
      ? "ok"
      : "incomplete";

  return {
    ...createOutputMetadata("getHandoffPacket"),
    compatibilityNotes: validation.compatibilityNotes,
    status,
    handoff: {
      handoffShapeVersion: 1,
      artifact: {
        canonicalArtifactId: validation.artifact.canonicalArtifactId,
        origin: validation.source.normalizedReference ?? validation.source.inputReference,
        reference: validation.source.inputReference,
        path: validation.source.path,
        schema: validation.governingSchemaId,
        summary: envelope?.currentSummary,
        contentHash: validation.artifact.contentHash,
        aliases: validation.artifact.aliases
      },
      validation: {
        status: consumerFacingValidationStatus,
        rawValidatorStatus: validation.status,
        basis: validation.validationBasis,
        findings: importantFindings
      },
      continuity: {
        parent: lineage.nodes[0]?.parent || parentNode
          ? {
              canonicalArtifactId: parentNode?.artifact.canonicalArtifactId,
              summary: parentNode?.summary,
              traceTarget: lineage.nodes[0]?.parent?.traceTarget,
              schemaId: parentNode?.schemaId ?? lineage.nodes[0]?.parent?.schemaId
            }
          : undefined,
        originCandidates: lineage.originRecoveryCandidates
      },
      currentLeaf: {
        summary: envelope?.currentSummary,
        nextAction,
        nonGoals: doNotTraverse
      },
      relevantSlices,
      doNotTraverse,
      budgets: {
        truncated: artifact.budgets.truncated || validation.budgets.truncated || lineage.budgets.truncated,
        exhausted: [...new Set([...artifact.budgets.exhausted, ...validation.budgets.exhausted, ...lineage.budgets.exhausted])]
      }
    },
    complete,
    rawReadNeededForNextStep: validation.rawReadNeededForNextStep || lineage.rawReadNeededForNextStep,
    budgets: {
      truncated: artifact.budgets.truncated || validation.budgets.truncated || lineage.budgets.truncated,
      exhausted: [...new Set([...artifact.budgets.exhausted, ...validation.budgets.exhausted, ...lineage.budgets.exhausted])]
    }
  };
}