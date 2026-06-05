import path from "node:path";
import { type GetTreeProjectionInput, type GetTreeProjectionResult, type StructureIndexNode, type TreeProjectionNode, createOutputMetadata } from "@tiinex/lineage-bridge-core";
import { getStructureIndex } from "./getStructureIndex";

function resolveParentReference(node: StructureIndexNode): string | undefined {
  const traceTarget = node.parentEdge?.traceTarget?.trim();
  if (!traceTarget) {
    return undefined;
  }
  if (/^https?:\/\//iu.test(traceTarget)) {
    return traceTarget;
  }
  if (/^[A-Za-z]:[\\/]/u.test(node.primaryReference) || node.primaryReference.startsWith("/")) {
    return path.resolve(path.dirname(node.primaryReference), ...traceTarget.split("/"));
  }
  return traceTarget;
}

function severityRank(node: StructureIndexNode): number {
  if (node.validationSummary.aggregateSeverity === "error") {
    return 3;
  }
  if (node.validationSummary.aggregateSeverity === "warning") {
    return 2;
  }
  if (node.validationSummary.aggregateSeverity === "info") {
    return 1;
  }
  return 0;
}

function sortNodes(nodes: TreeProjectionNode[], sortBy: GetTreeProjectionInput["sortBy"]): TreeProjectionNode[] {
  const copy = [...nodes];
  copy.sort((left, right) => {
    if (sortBy === "schema") {
      return (left.schemaId ?? "").localeCompare(right.schemaId ?? "") || left.displayLabel.localeCompare(right.displayLabel);
    }
    if (sortBy === "severity") {
      return severityRank({ validationSummary: { aggregateSeverity: left.aggregateSeverity } } as StructureIndexNode) * -1
        + severityRank({ validationSummary: { aggregateSeverity: right.aggregateSeverity } } as StructureIndexNode) !== 0
        ? severityRank({ validationSummary: { aggregateSeverity: right.aggregateSeverity } } as StructureIndexNode) - severityRank({ validationSummary: { aggregateSeverity: left.aggregateSeverity } } as StructureIndexNode)
        : left.displayLabel.localeCompare(right.displayLabel);
    }
    return left.displayLabel.localeCompare(right.displayLabel);
  });
  return copy;
}

function projectionStatus(nodes: TreeProjectionNode[]): GetTreeProjectionResult["status"] {
  if (nodes.some((node) => node.validationStatus === "invalid")) {
    return "invalid";
  }
  if (nodes.some((node) => node.validationStatus === "blocked")) {
    return "blocked";
  }
  if (nodes.some((node) => node.validationStatus === "unknown")) {
    return "unknown";
  }
  if (nodes.some((node) => node.validationStatus === "incomplete")) {
    return "incomplete";
  }
  return "ok";
}

export function getTreeProjection(input: GetTreeProjectionInput): GetTreeProjectionResult {
  const index = getStructureIndex(input);
  const referenceToNodeId = new Map<string, string>();
  for (const node of index.nodes) {
    for (const reference of node.references) {
      referenceToNodeId.set(reference, node.nodeId);
    }
    referenceToNodeId.set(node.primaryReference, node.nodeId);
  }

  const children = new Map<string, string[]>();
  const projectionNodes: TreeProjectionNode[] = index.nodes.map((node) => {
    const resolvedParentReference = resolveParentReference(node);
    const parentNodeId = resolvedParentReference ? referenceToNodeId.get(resolvedParentReference) : undefined;
    if (parentNodeId) {
      children.set(parentNodeId, [...(children.get(parentNodeId) ?? []), node.nodeId]);
    }
    return {
      projectionShapeVersion: 1,
      nodeId: node.nodeId,
      canonicalArtifactId: node.artifact.canonicalArtifactId,
      parentNodeId,
      childNodeIds: [],
      displayLabel: node.summary ?? path.basename(node.primaryReference),
      sourceAccessStatus: node.sourceAccessStatus,
      rawContentAvailability: node.rawContentAvailability,
      renderedContentAvailability: node.renderedContentAvailability,
      schemaId: node.schemaId,
      validationStatus: node.validationSummary.status,
      aggregateSeverity: node.validationSummary.aggregateSeverity,
      partialValidation: node.validationSummary.partialValidation,
      exactValidationBlocked: node.validationSummary.exactValidationBlocked,
      schemaResolutionComplete: node.validationSummary.schemaResolutionComplete,
      compatibilityNotes: [...node.validationSummary.compatibilityNotes],
      hasMissingParent: Boolean(node.parentEdge?.traceTarget) && !parentNodeId,
      hasOriginRecovery: node.originCandidates.length > 0,
      hasAliasOrDuplicateSignal: node.aliasCollapsed || node.aliasConflict
    };
  });

  for (const node of projectionNodes) {
    node.childNodeIds = [...new Set(children.get(node.nodeId) ?? [])].sort();
  }

  const filterQuery = input.filterQuery?.trim().toLowerCase();
  const filtered = filterQuery
    ? projectionNodes.filter((node) => node.displayLabel.toLowerCase().includes(filterQuery) || (node.schemaId ?? "").toLowerCase().includes(filterQuery))
    : projectionNodes;
  const sorted = sortNodes(filtered, input.sortBy ?? "label");
  const pageSize = input.pageSize ?? sorted.length ?? 1;
  const page = Math.max(1, input.page ?? 1);
  const start = (page - 1) * pageSize;
  const paged = sorted.slice(start, start + pageSize);

  return {
    ...createOutputMetadata("getTreeProjection"),
    compatibilityNotes: [...new Set(filtered.flatMap((node) => node.compatibilityNotes))],
    status: projectionStatus(filtered),
    projectionShapeVersion: 1,
    totalNodes: filtered.length,
    nodes: paged,
    complete: index.complete && start + pageSize >= filtered.length,
    rawReadNeededForNextStep: index.rawReadNeededForNextStep,
    budgets: index.budgets
  };
}