import { type GetNodeChildrenInput, type GetNodeChildrenResult, createOutputMetadata } from "@tiinex/lineage-bridge-core";
import { getTreeProjection } from "./getTreeProjection";

export function getNodeChildren(input: GetNodeChildrenInput): GetNodeChildrenResult {
  const projection = getTreeProjection({
    references: input.references,
    maxArtifactBytes: input.maxArtifactBytes,
    maxArtifacts: input.maxArtifacts,
    sortBy: input.sortBy
  });
  const node = projection.nodes.find((entry) => entry.nodeId === input.nodeId);
  if (!node) {
    return {
      ...createOutputMetadata("getNodeChildren"),
      status: "unavailable",
      nodeId: input.nodeId,
      projectionShapeVersion: 1,
      totalChildren: 0,
      children: [],
      missingOrUnreadableChildren: [],
      complete: false,
      rawReadNeededForNextStep: false,
      budgets: projection.budgets
    };
  }

  const childNodes = projection.nodes.filter((entry) => node.childNodeIds.includes(entry.nodeId));
  const pageSize = input.pageSize ?? childNodes.length ?? 1;
  const page = Math.max(1, input.page ?? 1);
  const start = (page - 1) * pageSize;
  const pagedChildren = childNodes.slice(start, start + pageSize);

  return {
    ...createOutputMetadata("getNodeChildren"),
    status: "ok",
    nodeId: input.nodeId,
    projectionShapeVersion: 1,
    totalChildren: childNodes.length,
    children: pagedChildren,
    missingOrUnreadableChildren: [],
    complete: start + pageSize >= childNodes.length,
    rawReadNeededForNextStep: projection.rawReadNeededForNextStep,
    budgets: projection.budgets
  };
}