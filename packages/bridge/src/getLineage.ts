import path from "node:path";
import {
  type ContinuityEnvelope,
  type GetLineageInput,
  type GetLineageResult,
  type LineageNode,
  createOutputMetadata,
  stripRawContentFromSource
} from "@tiinex/lineage-bridge-core";
import { parseContinuityEnvelope } from "@tiinex/lineage-bridge-parsers";
import { resolveArtifact, resolveArtifactAsync } from "@tiinex/lineage-bridge-sources";

const GITHUB_BLOB_SOURCE_RE = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/iu;

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

function buildNode(depth: number, envelope: ContinuityEnvelope, resolved: ReturnType<typeof resolveArtifact>): LineageNode {
  return {
    depth,
    artifact: resolved.artifact,
    source: stripRawContentFromSource(resolved.source),
    schemaId: getSchemaId(envelope.currentSchema),
    summary: envelope.currentSummary,
    parent: envelope.parentTrace || envelope.parentSchema || envelope.parentCreatedAt
      ? {
          schemaId: getSchemaId(envelope.parentSchema),
          traceTarget: envelope.parentTrace?.target,
          createdAt: envelope.parentCreatedAt
        }
      : undefined,
    originCandidates: collectOriginCandidates(envelope.currentOrigin)
  };
}

type ResolvedLike = ReturnType<typeof resolveArtifact>;

function resolveParentReference(
  resolved: ResolvedLike,
  envelope: ContinuityEnvelope
): string | undefined {
  const traceTarget = envelope.parentTrace?.target?.trim();
  if (traceTarget && /^https?:\/\//iu.test(traceTarget)) {
    return traceTarget;
  }
  if (traceTarget && resolved.source.originKind === "local-file" && resolved.source.normalizedReference) {
    return path.resolve(path.dirname(resolved.source.normalizedReference), ...traceTarget.split("/"));
  }
  const githubMatch = resolved.source.normalizedReference?.match(GITHUB_BLOB_SOURCE_RE);
  if (traceTarget && (resolved.source.originKind === "github-blob" || resolved.source.originKind === "github-raw") && githubMatch && resolved.source.path && resolved.source.ref) {
    const owner = githubMatch[1];
    const repo = githubMatch[2];
    const artifactDir = path.posix.dirname(resolved.source.path);
    const resolvedPath = path.posix.normalize(path.posix.join(artifactDir, traceTarget));
    return `https://github.com/${owner}/${repo}/blob/${resolved.source.ref}/${resolvedPath}`;
  }
  if (envelope.parentOrigin?.browseGit) {
    return envelope.parentOrigin.browseGit;
  }
  if (envelope.parentOrigin?.absolute) {
    return envelope.parentOrigin.absolute;
  }
  if (envelope.parentOrigin?.relative && resolved.source.originKind === "local-file" && resolved.source.normalizedReference) {
    return path.resolve(path.dirname(resolved.source.normalizedReference), ...envelope.parentOrigin.relative.split("/"));
  }
  return undefined;
}

export function getLineage(input: GetLineageInput): GetLineageResult {
  const maxDepth = input.maxDepth ?? 8;
  const maxFetches = input.maxFetches ?? 16;
  const maxArtifactBytes = input.maxArtifactBytes ?? 128_000;
  const visited = new Set<string>();
  const nodes: LineageNode[] = [];
  const exhausted: string[] = [];
  let currentReference = input.reference;
  let depth = 0;
  let fetches = 0;
  let lastArtifact: GetLineageResult["artifact"] | undefined;
  let stoppedBecause: GetLineageResult["stoppedBecause"] = "complete";
  let originRecoveryCandidates: string[] = [];
  let rawReadNeededForNextStep = false;
  let truncated = false;

  while (true) {
    if (fetches >= maxFetches) {
      stoppedBecause = "budget-exhausted";
      exhausted.push("maxFetches");
      break;
    }
    const resolved = resolveArtifact({ reference: currentReference, maxArtifactBytes, includeRawContent: true, sourceAccess: input.sourceAccess });
    fetches += 1;
    lastArtifact = resolved.artifact;

    if (resolved.budgets.truncated) {
      truncated = true;
      stoppedBecause = "budget-exhausted";
      exhausted.push("maxArtifactBytes");
      break;
    }

    if (!resolved.source.rawContent) {
      stoppedBecause = nodes.length === 0 ? "unreadable-parent" : "unreadable-parent";
      originRecoveryCandidates = [...new Set(originRecoveryCandidates)];
      rawReadNeededForNextStep = true;
      break;
    }

    const identityKey = resolved.artifact.canonicalArtifactId ?? resolved.source.normalizedReference ?? currentReference;
    if (visited.has(identityKey)) {
      stoppedBecause = "cycle-detected";
      break;
    }
    visited.add(identityKey);

    const envelope = parseContinuityEnvelope(resolved.source.rawContent);
    nodes.push(buildNode(depth, envelope, resolved));
    const parentCandidates = collectOriginCandidates(envelope.parentOrigin);
    originRecoveryCandidates = parentCandidates;

    if (!envelope.parentTrace?.target) {
      stoppedBecause = parentCandidates.length > 0 ? "missing-parent" : "complete";
      break;
    }

    if (depth >= maxDepth) {
      stoppedBecause = "max-depth";
      exhausted.push("maxDepth");
      break;
    }

    const parentReference = resolveParentReference(resolved, envelope);
    if (!parentReference) {
      stoppedBecause = "external-parent";
      break;
    }

    currentReference = parentReference;
    depth += 1;
  }

  const complete = stoppedBecause === "complete";
  return {
    ...createOutputMetadata("getLineage"),
    status: complete ? "ok" : "incomplete",
    artifact: nodes[0]?.artifact ?? lastArtifact ?? resolveArtifact({ reference: input.reference, maxArtifactBytes, sourceAccess: input.sourceAccess }).artifact,
    nodes,
    stoppedBecause,
    originRecoveryCandidates,
    complete,
    rawReadNeededForNextStep,
    budgets: {
      truncated,
      exhausted
    }
  };
}

export async function getLineageAsync(input: GetLineageInput): Promise<GetLineageResult> {
  const maxDepth = input.maxDepth ?? 8;
  const maxFetches = input.maxFetches ?? 16;
  const maxArtifactBytes = input.maxArtifactBytes ?? 128_000;
  const visited = new Set<string>();
  const nodes: LineageNode[] = [];
  const exhausted: string[] = [];
  let currentReference = input.reference;
  let depth = 0;
  let fetches = 0;
  let lastArtifact: GetLineageResult["artifact"] | undefined;
  let stoppedBecause: GetLineageResult["stoppedBecause"] = "complete";
  let originRecoveryCandidates: string[] = [];
  let rawReadNeededForNextStep = false;
  let truncated = false;

  while (true) {
    if (fetches >= maxFetches) {
      stoppedBecause = "budget-exhausted";
      exhausted.push("maxFetches");
      break;
    }
    const resolved = await resolveArtifactAsync({ reference: currentReference, maxArtifactBytes, includeRawContent: true, sourceAccess: input.sourceAccess });
    fetches += 1;
    lastArtifact = resolved.artifact;

    if (resolved.budgets.truncated) {
      truncated = true;
      stoppedBecause = "budget-exhausted";
      exhausted.push("maxArtifactBytes");
      break;
    }

    if (!resolved.source.rawContent) {
      stoppedBecause = "unreadable-parent";
      originRecoveryCandidates = [...new Set(originRecoveryCandidates)];
      rawReadNeededForNextStep = true;
      break;
    }

    const identityKey = resolved.artifact.canonicalArtifactId ?? resolved.source.normalizedReference ?? currentReference;
    if (visited.has(identityKey)) {
      stoppedBecause = "cycle-detected";
      break;
    }
    visited.add(identityKey);

    const envelope = parseContinuityEnvelope(resolved.source.rawContent);
    nodes.push(buildNode(depth, envelope, resolved));
    const parentCandidates = collectOriginCandidates(envelope.parentOrigin);
    originRecoveryCandidates = parentCandidates;

    if (!envelope.parentTrace?.target) {
      stoppedBecause = parentCandidates.length > 0 ? "missing-parent" : "complete";
      break;
    }

    if (depth >= maxDepth) {
      stoppedBecause = "max-depth";
      exhausted.push("maxDepth");
      break;
    }

    const parentReference = resolveParentReference(resolved, envelope);
    if (!parentReference) {
      stoppedBecause = "external-parent";
      break;
    }

    currentReference = parentReference;
    depth += 1;
  }

  const complete = stoppedBecause === "complete";
  return {
    ...createOutputMetadata("getLineage"),
    status: complete ? "ok" : "incomplete",
    artifact: nodes[0]?.artifact ?? lastArtifact ?? (await resolveArtifactAsync({ reference: input.reference, maxArtifactBytes, sourceAccess: input.sourceAccess })).artifact,
    nodes,
    stoppedBecause,
    originRecoveryCandidates,
    complete,
    rawReadNeededForNextStep,
    budgets: {
      truncated,
      exhausted
    }
  };
}