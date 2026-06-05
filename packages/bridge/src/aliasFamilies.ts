import { type ArtifactIdentity, type ResolvedArtifactSource, type StructureIndexNode } from "@tiinex/lineage-bridge-core";

export interface AliasFamilyEntry {
  nodeId: string;
  aliasFamilyKey: string;
  alias: string;
}

export function getAliasFamilyKey(input: {
  artifact: ArtifactIdentity;
  source: ResolvedArtifactSource;
}): string {
  return input.artifact.identityFamilyKey
    ?? input.artifact.immutableSourceIdentity
    ?? input.source.normalizedReference
    ?? input.source.path
    ?? input.source.inputReference;
}

export function classifyAliasFamilies(entries: AliasFamilyEntry[]): {
  collapsedNodeIds: Set<string>;
  conflictNodeIds: Set<string>;
} {
  const families = new Map<string, Set<string>>();
  for (const entry of entries) {
    const nodeIds = families.get(entry.aliasFamilyKey) ?? new Set<string>();
    nodeIds.add(entry.nodeId);
    families.set(entry.aliasFamilyKey, nodeIds);
  }

  const collapsedNodeIds = new Set<string>();
  const conflictNodeIds = new Set<string>();
  for (const nodeIds of families.values()) {
    if (nodeIds.size === 1) {
      continue;
    }
    for (const nodeId of nodeIds) {
      conflictNodeIds.add(nodeId);
    }
  }

  const entryCountsByNodeId = new Map<string, number>();
  for (const entry of entries) {
    entryCountsByNodeId.set(entry.nodeId, (entryCountsByNodeId.get(entry.nodeId) ?? 0) + 1);
  }
  for (const [nodeId, entryCount] of entryCountsByNodeId.entries()) {
    if (entryCount > 1) {
      collapsedNodeIds.add(nodeId);
    }
  }

  return {
    collapsedNodeIds,
    conflictNodeIds
  };
}

export function applyAliasFamilyClassification(nodes: StructureIndexNode[], classification: ReturnType<typeof classifyAliasFamilies>): void {
  for (const node of nodes) {
    if (classification.collapsedNodeIds.has(node.nodeId)) {
      node.aliasCollapsed = true;
    }
    if (classification.conflictNodeIds.has(node.nodeId)) {
      node.aliasConflict = true;
    }
  }
}