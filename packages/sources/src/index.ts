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
  return {
    canonicalArtifactId: identityAnchor && input.contentHash
      ? `sha256:${input.contentHash}:${identityAnchor}`
      : identityAnchor,
    immutableSourceIdentity: input.immutableSourceIdentity,
    identityFamilyKey: input.identityFamilyKey,
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

function resolveLocalFile(reference: string, maxArtifactBytes: number): ResolveArtifactResult {
  const normalizedPath = path.resolve(reference);
  try {
    const rawContent = readFileSync(normalizedPath, "utf8");
    const truncated = Buffer.byteLength(rawContent, "utf8") > maxArtifactBytes;
    const boundedContent = truncated ? rawContent.slice(0, maxArtifactBytes) : rawContent;
    const contentHash = computeContentHash(rawContent);
    const source = okSource({
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
      rawContent: boundedContent,
      contentHash,
      rawReadNeededForNextStep: false,
      warnings: truncated ? ["artifact-bytes-truncated"] : []
    });
    return {
      ...createOutputMetadata("resolveArtifact"),
      status: "ok",
      source,
      artifact: createIdentity({ normalizedReference: normalizedPath, identityFamilyKey: normalizedPath, contentHash, provisional: true }),
      complete: !truncated,
      rawReadNeededForNextStep: false,
      budgets: {
        truncated,
        exhausted: truncated ? ["maxArtifactBytes"] : []
      }
    };
  } catch {
    const source = okSource({
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
      status: "unavailable",
      source,
      artifact: createIdentity({ normalizedReference: normalizedPath, identityFamilyKey: normalizedPath, provisional: true }),
      complete: false,
      rawReadNeededForNextStep: true,
      budgets: { truncated: false, exhausted: [] }
    };
  }
}

function resolveGitHubReference(reference: string, maxArtifactBytes: number): ResolveArtifactResult | undefined {
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
  try {
    const rawContent = readFileSync(localFileCandidate, "utf8");
    const truncated = Buffer.byteLength(rawContent, "utf8") > maxArtifactBytes;
    const boundedContent = truncated ? rawContent.slice(0, maxArtifactBytes) : rawContent;
    const contentHash = computeContentHash(rawContent);
    const rawAvailability: RawContentAvailability = maybeBlob === "blob" ? "available" : "available";
    const exactValidationCapability: ExactValidationCapability = "available";
    const source = okSource({
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
      rawContent: boundedContent,
      contentHash,
      rawReadNeededForNextStep: false,
      warnings: truncated ? ["artifact-bytes-truncated"] : []
    });
    return {
      ...createOutputMetadata("resolveArtifact"),
      compatibilityNotes: ["GitHub references are currently resolved via a local mirror, not by remote fetch."],
      status: "ok",
      source,
      artifact: createIdentity({ normalizedReference, immutableSourceIdentity, identityFamilyKey, contentHash, provisional: false }),
      complete: !truncated,
      rawReadNeededForNextStep: false,
      budgets: {
        truncated,
        exhausted: truncated ? ["maxArtifactBytes"] : []
      }
    };
  } catch {
    const source = okSource({
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
      compatibilityNotes: ["GitHub references are currently resolved via a local mirror, not by remote fetch."],
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
  const githubResult = resolveGitHubReference(input.reference, maxArtifactBytes);
  if (githubResult) {
    return githubResult;
  }
  if (/^https?:\/\//iu.test(input.reference)) {
    return {
      ...createOutputMetadata("resolveArtifact"),
      status: "unsupported",
      source: okSource({
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
  return resolveLocalFile(input.reference, maxArtifactBytes);
}