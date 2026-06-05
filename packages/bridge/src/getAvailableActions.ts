import { type AvailableAction, type GetAvailableActionsInput, type GetAvailableActionsResult, createOutputMetadata } from "@tiinex/lineage-bridge-core";
import { getLineage } from "./getLineage";
import { validateArtifact } from "@tiinex/lineage-bridge-validators";
import { getSchemaContract } from "./getSchemaContract";

function action(actionId: AvailableAction["actionId"], title: string, enabled: boolean, reason: string): AvailableAction {
  return { actionId, title, enabled, reason };
}

function deriveAvailableActionsStatus(input: {
  validation: ReturnType<typeof validateArtifact>;
  lineage: ReturnType<typeof getLineage>;
  schemaContract: ReturnType<typeof getSchemaContract>;
}): GetAvailableActionsResult["status"] {
  if (input.validation.status !== "ok") {
    return input.validation.status;
  }
  if (!input.lineage.complete || input.schemaContract.contract.unresolved) {
    return "incomplete";
  }
  if (input.validation.validationBasis.partialValidation || !input.validation.validationBasis.schemaResolutionComplete) {
    return "incomplete";
  }
  return "ok";
}

export function getAvailableActions(input: GetAvailableActionsInput): GetAvailableActionsResult {
  const validation = validateArtifact(input);
  const lineage = getLineage(input);
  const schemaContract = getSchemaContract({ reference: input.reference, maxArtifactBytes: input.maxArtifactBytes });
  const hasParent = Boolean(lineage.nodes[0]?.parent?.traceTarget);
  const rawReadable = !validation.rawReadNeededForNextStep;

  const actions: AvailableAction[] = [
    action("open-artifact", "Open Artifact", true, "The current artifact is the primary working surface."),
    action("open-origin", "Open Origin", true, "Origin access is always a valid receiver action when grounding matters."),
    action("open-parent", "Open Parent", hasParent, hasParent ? "The artifact declares a direct parent trace." : "No direct parent trace is declared."),
    action("validate", "Validate", true, "Validation is always available through shared core."),
    action("copy-handoff", "Copy Handoff", rawReadable, rawReadable ? "A compact handoff packet can be generated from current shared core state." : "Raw source must be readable before a trustworthy handoff can be generated."),
    action("copy-relevant-slice", "Copy Relevant Slice", rawReadable, rawReadable ? "Relevant slices can be selected without widening to the full artifact body." : "Raw source must be readable before a bounded relevant slice can be selected."),
    action("inspect-schema-contract", "Inspect Schema Contract", !schemaContract.contract.unresolved, schemaContract.contract.unresolved ? "The governing schema could not be resolved yet." : "The governing schema contract is readable through shared core.")
  ];

  return {
    ...createOutputMetadata("getAvailableActions"),
    compatibilityNotes: [...(validation.compatibilityNotes ?? [])],
    status: deriveAvailableActionsStatus({ validation, lineage, schemaContract }),
    actions,
    complete: validation.complete && lineage.complete && !schemaContract.contract.unresolved,
    rawReadNeededForNextStep: validation.rawReadNeededForNextStep || lineage.rawReadNeededForNextStep || schemaContract.rawReadNeededForNextStep,
    budgets: {
      truncated: validation.budgets.truncated || lineage.budgets.truncated || schemaContract.budgets.truncated,
      exhausted: [...new Set([...validation.budgets.exhausted, ...lineage.budgets.exhausted, ...schemaContract.budgets.exhausted])]
    }
  };
}