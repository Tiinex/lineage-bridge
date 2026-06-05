import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  type ArtifactIdentity,
  type ExactValidationCapability,
  type OriginAccessStatus,
  type RawContentAvailability,
  type ResolveArtifactInput,
  type ResolveArtifactResult,
  type ResolvedArtifactSource,
  createOutputMetadata
} from "@tiinex/lineage-bridge-core";

const GITHUB_BLOB_RE = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/(blob)\/([0-9a-f]{7,40})\/(.+)$/iu;
const GITHUB_RAW_RE = /^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([0-9a-f]{7,40})\/(.+)$/iu;

function computeContentHash(rawContent: string): string {
  return createHash("sha256").update(rawContent, "utf8").digest("base64url");
}

function createIdentity(input: {
  normalizedReference?: string;
  immutableSourceIdentity?: string;
  identityFamilyKey?: string;
  contentHash?: string;
  provisional: boolean;
}): ArtifactIdentity {
  const identityAnchor = input.immutableSourceIdentity ?? input.normalizedReference;
  const canonicalArtifactId = identityAnchor && input.contentHash
    ? `sha256:${input.contentHash}:${identityAnchor}`
    : identityAnchor;

  const cacheIdentity = input.immutableSourceIdentity
    ? {
        cacheable: true,
        cacheKey: canonicalArtifactId ?? input.immutableSourceIdentity,
        cacheScope: "immutable-origin" as const,
        reason: input.contentHash
          ? "Immutable source identity and content hash make this artifact safe to cache by canonical identity."
          : "Immutable source identity makes this artifact safe to cache by origin even when content hash is unavailable."
      }
    : input.contentHash
      ? {
          cacheable: true,
          cacheKey: `sha256:${input.contentHash}`,
          cacheScope: "content" as const,
          reason: "Only content-scoped caching is safe because the source identity is mutable or provisional."
        }
      : input.normalizedReference
        ? {
            cacheable: false,
            cacheScope: "mutable-origin" as const,
            reason: "Mutable or provisional origin identity without content hash is not cache-safe."
          }
        : {
            cacheable: false,
            cacheScope: "none" as const,
            reason: "No stable cache identity can be derived from this artifact reference."
          };

  return {
    canonicalArtifactId,
    immutableSourceIdentity: input.immutableSourceIdentity,
    identityFamilyKey: input.identityFamilyKey,
    cacheIdentity,
    aliases: input.normalizedReference ? [input.normalizedReference] : [],
    identityInputsUsed: [
      ...(input.immutableSourceIdentity ? ["immutableSourceIdentity"] : []),
      ...(!input.immutableSourceIdentity && input.normalizedReference ? ["normalizedReference"] : []),
      ...(input.contentHash ? ["contentHash"] : [])
    ],
    identityConfidence: input.contentHash && identityAnchor ? "high" : identityAnchor ? "medium" : "low",
    contentHash: input.contentHash,
    provisional: input.provisional
  };
}

function createGitHubImmutableIdentity(owner: string, repo: string, revision: string, relativePath: string): string {
  return `github:${owner.toLowerCase()}/${repo.toLowerCase()}@${revision}:${relativePath}`;
}

function createGitHubIdentityFamilyKey(owner: string, repo: string, relativePath: string): string {
  return `github:${owner.toLowerCase()}/${repo.toLowerCase()}:${relativePath}`;
}

function okSource(partial: Partial<ResolvedArtifactSource>): ResolvedArtifactSource {
  return {
    sourceStrategy: partial.sourceStrategy ?? "unsupported",
    trustLevel: partial.trustLevel ?? "unknown",
    refKind: partial.refKind ?? "unknown",
    workspacePolicyEnforced: partial.workspacePolicyEnforced ?? false,
    originKind: partial.originKind ?? "unsupported",
    inputReference: partial.inputReference ?? "",
    normalizedReference: partial.normalizedReference,
    path: partial.path,
    ref: partial.ref,
    versioned: partial.versioned ?? false,
    immutable: partial.immutable ?? false,
    mutability: partial.mutability ?? "unknown",
    accessStatus: partial.accessStatus ?? "unsupported-origin",
    rawContentAvailability: partial.rawContentAvailability ?? "unavailable",
    renderedContentAvailability: partial.renderedContentAvailability ?? false,
    exactValidationCapability: partial.exactValidationCapability ?? "unknown",
    exactValidationBlockedBySourceForm: partial.exactValidationBlockedBySourceForm ?? false,
    contentHash: partial.contentHash,
    rawContent: partial.rawContent,
    rawReadNeededForNextStep: partial.rawReadNeededForNextStep ?? false,
    warnings: partial.warnings ?? []
  };
}

function getContractUpgradeNotes(input: ResolveArtifactInput): string[] {
  const notes: string[] = [];
  if (input.sourceAccess?.workspace) {
    notes.push("Workspace access policy shape is accepted but is not enforced until the local sandbox phase.");
  }
  if (input.sourceAccess?.preferredGitHubStrategy === "remote" || input.sourceAccess?.remoteFetcher) {
    notes.push("Remote GitHub fetch contract is declared but current resolution still uses the existing local mirror path.");
  }
  if (input.sourceAccess?.network) {
    notes.push("Remote network budget shapes are accepted for future source strategies but are not enforced by the current local scaffold.");
  }
  if (input.sourceAccess?.freshOriginResolution) {
    notes.push("Fresh origin resolution preference is declared but is not enforced before remote fetch and cache phases are implemented.");
  }
  return notes;
}

function resolveLocalFile(input: ResolveArtifactInput, maxArtifactBytes: number): ResolveArtifactResult {
  const { reference, includeRawContent } = input;
  const normalizedPath = path.resolve(reference);
  const contractNotes = getContractUpgradeNotes(input);
  try {
    const rawContent = readFileSync(normalizedPath, "utf8");
    const truncated = Buffer.byteLength(rawContent, "utf8") > maxArtifactBytes;
    const boundedContent = truncated ? rawContent.slice(0, maxArtifactBytes) : rawContent;
    const outputRawContent = includeRawContent ? boundedContent : undefined;
    const outputTruncated = includeRawContent ? truncated : false;
    const contentHash = computeContentHash(rawContent);
    const source = okSource({
      sourceStrategy: "local-workspace",
      trustLevel: "workspace-local",
      refKind: "not-applicable",
      workspacePolicyEnforced: false,
      originKind: "local-file",
      inputReference: reference,
      normalizedReference: normalizedPath,
      path: normalizedPath,
      versioned: false,
      immutable: false,
      mutability: "mutable",
      accessStatus: "readable",
      rawContentAvailability: "available",
      renderedContentAvailability: false,
      exactValidationCapability: "available",
      exactValidationBlockedBySourceForm: false,
      rawContent: outputRawContent,
      contentHash,
      rawReadNeededForNextStep: !includeRawContent,
      warnings: outputTruncated ? ["artifact-bytes-truncated"] : []
    });
    return {
      ...createOutputMetadata("resolveArtifact"),
      compatibilityNotes: [
        ...(!includeRawContent ? ["Raw source is omitted by default; request includeRawContent to access bounded raw content."] : []),
        ...contractNotes
      ].length > 0
        ? [
            ...(!includeRawContent ? ["Raw source is omitted by default; request includeRawContent to access bounded raw content."] : []),
            ...contractNotes
          ]
        : undefined,
      status: "ok",
      source,
      artifact: createIdentity({ normalizedReference: normalizedPath, identityFamilyKey: normalizedPath, contentHash, provisional: true }),
      complete: !outputTruncated,
      rawReadNeededForNextStep: !includeRawContent,
      budgets: {
        truncated: outputTruncated,
        exhausted: outputTruncated ? ["maxArtifactBytes"] : []
      }
    };
  } catch {
    const source = okSource({
      sourceStrategy: "local-workspace",
      trustLevel: "workspace-local",
      refKind: "not-applicable",
      workspacePolicyEnforced: false,
      originKind: "local-file",
      inputReference: reference,
      normalizedReference: normalizedPath,
      path: normalizedPath,
      accessStatus: "not-found",
      rawContentAvailability: "unavailable",
      renderedContentAvailability: false,
      exactValidationCapability: "blocked",
      exactValidationBlockedBySourceForm: true,
      rawReadNeededForNextStep: true
    });
    return {
      ...createOutputMetadata("resolveArtifact"),
      compatibilityNotes: contractNotes.length > 0 ? contractNotes : undefined,
      status: "unavailable",
      source,
      artifact: createIdentity({ normalizedReference: normalizedPath, identityFamilyKey: normalizedPath, provisional: true }),
      complete: false,
      rawReadNeededForNextStep: true,
      budgets: { truncated: false, exhausted: [] }
    };
  }
}

function resolveGitHubReference(input: ResolveArtifactInput, maxArtifactBytes: number): ResolveArtifactResult | undefined {
  const { reference, includeRawContent } = input;
  const blobMatch = reference.match(GITHUB_BLOB_RE);
  const rawMatch = reference.match(GITHUB_RAW_RE);
  if (!blobMatch && !rawMatch) {
    return undefined;
  }
  const owner = blobMatch ? blobMatch[1] : rawMatch![1];
  const repo = blobMatch ? blobMatch[2] : rawMatch![2];
  const maybeBlob = blobMatch ? blobMatch[3] : undefined;
  const revision = blobMatch ? blobMatch[4] : rawMatch![3];
  const relativePath = blobMatch ? blobMatch[5] : rawMatch![4];
  const normalizedReference = blobMatch
    ? `https://github.com/${owner}/${repo}/blob/${revision}/${relativePath}`
    : `https://raw.githubusercontent.com/${owner}/${repo}/${revision}/${relativePath}`;
  const immutableSourceIdentity = createGitHubImmutableIdentity(owner, repo, revision, relativePath);
  const identityFamilyKey = createGitHubIdentityFamilyKey(owner, repo, relativePath);
  const localRepoCandidate = path.resolve(path.dirname(process.cwd()), repo);
  const localFileCandidate = path.resolve(localRepoCandidate, ...relativePath.split("/"));
  const contractNotes = getContractUpgradeNotes(input);
  try {
    const rawContent = readFileSync(localFileCandidate, "utf8");
    const truncated = Buffer.byteLength(rawContent, "utf8") > maxArtifactBytes;
    const boundedContent = truncated ? rawContent.slice(0, maxArtifactBytes) : rawContent;
    const outputRawContent = includeRawContent ? boundedContent : undefined;
    const outputTruncated = includeRawContent ? truncated : false;
    const contentHash = computeContentHash(rawContent);
    const rawAvailability: RawContentAvailability = maybeBlob === "blob" ? "available" : "available";
    const exactValidationCapability: ExactValidationCapability = "available";
    const source = okSource({
      sourceStrategy: "github-local-mirror",
      trustLevel: "local-mirror",
      refKind: "commit",
      workspacePolicyEnforced: false,
      originKind: blobMatch ? "github-blob" : "github-raw",
      inputReference: reference,
      normalizedReference,
      path: relativePath,
      ref: revision,
      versioned: true,
      immutable: true,
      mutability: "immutable",
      accessStatus: "readable",
      rawContentAvailability: rawAvailability,
      renderedContentAvailability: Boolean(blobMatch),
      exactValidationCapability,
      exactValidationBlockedBySourceForm: false,
      rawContent: outputRawContent,
      contentHash,
      rawReadNeededForNextStep: !includeRawContent,
      warnings: outputTruncated ? ["artifact-bytes-truncated"] : []
    });
    return {
      ...createOutputMetadata("resolveArtifact"),
      compatibilityNotes: [
        "GitHub references are currently resolved via a local mirror, not by remote fetch.",
        ...(!includeRawContent ? ["Raw source is omitted by default; request includeRawContent to access bounded raw content."] : []),
        ...contractNotes
      ],
      status: "ok",
      source,
      artifact: createIdentity({ normalizedReference, immutableSourceIdentity, identityFamilyKey, contentHash, provisional: false }),
      complete: !outputTruncated,
      rawReadNeededForNextStep: !includeRawContent,
      budgets: {
        truncated: outputTruncated,
        exhausted: outputTruncated ? ["maxArtifactBytes"] : []
      }
    };
  } catch {
    const source = okSource({
      sourceStrategy: "github-local-mirror",
      trustLevel: "local-mirror",
      refKind: "commit",
      workspacePolicyEnforced: false,
      originKind: blobMatch ? "github-blob" : "github-raw",
      inputReference: reference,
      normalizedReference,
      path: relativePath,
      ref: revision,
      versioned: true,
      immutable: true,
      mutability: "immutable",
      accessStatus: "not-found",
      rawContentAvailability: blobMatch ? "rendered-only" : "unavailable",
      renderedContentAvailability: Boolean(blobMatch),
      exactValidationCapability: "blocked",
      exactValidationBlockedBySourceForm: true,
      rawReadNeededForNextStep: true,
      warnings: ["github-reference-requires-local-mirror", "raw-content-not-remotely-fetched"]
    });
    return {
      ...createOutputMetadata("resolveArtifact"),
      compatibilityNotes: ["GitHub references are currently resolved via a local mirror, not by remote fetch.", ...contractNotes],
      status: "blocked",
      source,
      artifact: createIdentity({ normalizedReference, immutableSourceIdentity, identityFamilyKey, provisional: false }),
      complete: false,
      rawReadNeededForNextStep: true,
      budgets: { truncated: false, exhausted: [] }
    };
  }
}

export function resolveArtifact(input: ResolveArtifactInput): ResolveArtifactResult {
  const maxArtifactBytes = input.maxArtifactBytes ?? 128_000;
  const githubResult = resolveGitHubReference(input, maxArtifactBytes);
  if (githubResult) {
    return githubResult;
  }
  if (/^https?:\/\//iu.test(input.reference)) {
    const contractNotes = getContractUpgradeNotes(input);
    return {
      ...createOutputMetadata("resolveArtifact"),
      compatibilityNotes: contractNotes.length > 0 ? contractNotes : undefined,
      status: "unsupported",
      source: okSource({
        sourceStrategy: "unsupported",
        trustLevel: "unknown",
        refKind: "unknown",
        workspacePolicyEnforced: false,
        originKind: "unsupported",
        inputReference: input.reference,
        accessStatus: "unsupported-origin",
        rawContentAvailability: "unavailable",
        renderedContentAvailability: false,
        exactValidationCapability: "unknown",
        exactValidationBlockedBySourceForm: false,
        rawReadNeededForNextStep: true
      }),
      artifact: createIdentity({ provisional: true }),
      complete: false,
      rawReadNeededForNextStep: true,
      budgets: { truncated: false, exhausted: [] }
    };
  }
  return resolveLocalFile(input, maxArtifactBytes);
}

export async function resolveArtifactAsync(input: ResolveArtifactInput): Promise<ResolveArtifactResult> {
  return resolveArtifact(input);
}