import { createHash } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import {
  type ArtifactIdentity,
  type BridgeTopLevelStatus,
  type ExactValidationCapability,
  type OriginAccessStatus,
  type RawContentAvailability,
  type RemoteFetchRequest,
  type RemoteFetchResponse,
  type ResolveArtifactInput,
  type ResolveArtifactResult,
  type ResolvedArtifactSource,
  createOutputMetadata
} from "@tiinex/lineage-bridge-core";

const GITHUB_BLOB_RE = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/(blob)\/([^/]+)\/(.+)$/iu;
const GITHUB_RAW_RE = /^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/(.+)$/iu;
const GITHUB_COMMIT_RE = /^[0-9a-f]{40}$/iu;

interface ParsedGitHubReference {
  owner: string;
  repo: string;
  revision: string;
  relativePath: string;
  refKind: "commit" | "branch";
  originKind: "github-blob" | "github-raw";
  normalizedReference: string;
  immutableSourceIdentity?: string;
  identityFamilyKey: string;
  rawFetchUrl: string;
  renderedContentAvailability: boolean;
  immutable: boolean;
  mutability: "immutable" | "mutable";
}

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

function classifyGitHubRefKind(revision: string): "commit" | "branch" {
  return GITHUB_COMMIT_RE.test(revision) ? "commit" : "branch";
}

function getGitHubRefBoundaryNotes(parsed: ParsedGitHubReference): string[] {
  if (parsed.refKind === "commit") {
    return [];
  }
  return ["Non-commit GitHub refs are currently treated as mutable branch-like refs until explicit tag resolution exists."];
}

function parseGitHubReference(reference: string): ParsedGitHubReference | undefined {
  const blobMatch = reference.match(GITHUB_BLOB_RE);
  const rawMatch = reference.match(GITHUB_RAW_RE);
  if (!blobMatch && !rawMatch) {
    return undefined;
  }

  const owner = blobMatch ? blobMatch[1] : rawMatch![1];
  const repo = blobMatch ? blobMatch[2] : rawMatch![2];
  const revision = blobMatch ? blobMatch[4] : rawMatch![3];
  const relativePath = blobMatch ? blobMatch[5] : rawMatch![4];
  const originKind = blobMatch ? "github-blob" : "github-raw";
  const refKind = classifyGitHubRefKind(revision);
  const immutable = refKind === "commit";

  return {
    owner,
    repo,
    revision,
    relativePath,
    refKind,
    originKind,
    normalizedReference: `https://github.com/${owner}/${repo}/blob/${revision}/${relativePath}`,
    immutableSourceIdentity: immutable ? createGitHubImmutableIdentity(owner, repo, revision, relativePath) : undefined,
    identityFamilyKey: createGitHubIdentityFamilyKey(owner, repo, relativePath),
    rawFetchUrl: `https://raw.githubusercontent.com/${owner}/${repo}/${revision}/${relativePath}`,
    renderedContentAvailability: originKind === "github-blob",
    immutable,
    mutability: immutable ? "immutable" : "mutable"
  };
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
    cachedContentUsed: partial.cachedContentUsed,
    cacheBasis: partial.cacheBasis,
    cacheTimestamp: partial.cacheTimestamp,
    freshOriginVerified: partial.freshOriginVerified,
    rawContent: partial.rawContent,
    rawReadNeededForNextStep: partial.rawReadNeededForNextStep ?? false,
    warnings: partial.warnings ?? []
  };
}

function getContractUpgradeNotes(input: ResolveArtifactInput, activeGitHubStrategy: "scaffold" | "remote" = "scaffold"): string[] {
  const notes: string[] = [];
  if (input.sourceAccess?.workspace) {
    notes.push("Workspace access policy is enforced for direct local artifact reads; broader local traversal hardening remains part of the sandbox phase.");
  }
  if (activeGitHubStrategy === "scaffold" && (input.sourceAccess?.preferredGitHubStrategy === "remote" || input.sourceAccess?.remoteFetcher)) {
    notes.push("Remote GitHub fetch contract is declared but current resolution still uses the existing local mirror path.");
  }
  if (input.sourceAccess?.network && activeGitHubStrategy === "scaffold") {
    notes.push("Remote network budget shapes are accepted for future source strategies but are not enforced by the current local scaffold.");
  }
  if (input.sourceAccess?.freshOriginResolution && activeGitHubStrategy === "scaffold") {
    notes.push("Fresh origin resolution preference is only enforced in remote GitHub fetch flows; current scaffold paths still use their existing local behavior.");
  }
  return notes;
}

function buildCachedFallbackResult(input: {
  request: ResolveArtifactInput;
  parsed: ParsedGitHubReference;
  maxArtifactBytes: number;
  failure: { status: BridgeTopLevelStatus; accessStatus: OriginAccessStatus; warning: string };
  contractNotes: string[];
  refBoundaryNotes: string[];
}): ResolveArtifactResult | undefined {
  const cachedFallback = input.request.sourceAccess?.cachedArtifactFallback;
  if (!input.request.sourceAccess?.freshOriginResolution || !cachedFallback?.rawContent) {
    return undefined;
  }

  const rawContent = cachedFallback.rawContent;
  const truncated = Buffer.byteLength(rawContent, "utf8") > input.maxArtifactBytes;
  const boundedContent = truncated ? rawContent.slice(0, input.maxArtifactBytes) : rawContent;
  const outputRawContent = input.request.includeRawContent ? boundedContent : undefined;
  const outputTruncated = input.request.includeRawContent ? truncated : false;
  const contentHash = computeContentHash(rawContent);

  return {
    ...createOutputMetadata("resolveArtifact"),
    compatibilityNotes: [
      `Fresh origin fetch failed (${input.failure.warning}); cached fallback content is being used without fresh origin verification.`,
      ...(!input.request.includeRawContent ? ["Raw source is omitted by default; request includeRawContent to access bounded raw content."] : []),
      ...input.refBoundaryNotes,
      ...input.contractNotes,
      ...(cachedFallback.cacheBasis ? [`Cached fallback basis: ${cachedFallback.cacheBasis}.`] : [])
    ],
    status: "ok",
    source: okSource({
      sourceStrategy: "github-remote",
      trustLevel: "remote-public",
      refKind: input.parsed.refKind,
      workspacePolicyEnforced: false,
      originKind: input.parsed.originKind,
      inputReference: input.request.reference,
      normalizedReference: input.parsed.normalizedReference,
      path: input.parsed.relativePath,
      ref: input.parsed.revision,
      versioned: true,
      immutable: input.parsed.immutable,
      mutability: input.parsed.mutability,
      accessStatus: input.failure.accessStatus,
      rawContentAvailability: "available",
      renderedContentAvailability: input.parsed.renderedContentAvailability,
      exactValidationCapability: "available",
      exactValidationBlockedBySourceForm: false,
      rawContent: outputRawContent,
      contentHash,
      cachedContentUsed: true,
      cacheBasis: cachedFallback.cacheBasis,
      cacheTimestamp: cachedFallback.cachedAt,
      freshOriginVerified: false,
      rawReadNeededForNextStep: !input.request.includeRawContent,
      warnings: [input.failure.warning, "cached-fallback-used", "fresh-origin-unverified", ...(outputTruncated ? ["artifact-bytes-truncated"] : [])]
    }),
    artifact: createIdentity({
      normalizedReference: input.parsed.normalizedReference,
      immutableSourceIdentity: input.parsed.immutableSourceIdentity,
      identityFamilyKey: input.parsed.identityFamilyKey,
      contentHash,
      provisional: false
    }),
    complete: !outputTruncated,
    rawReadNeededForNextStep: !input.request.includeRawContent,
    budgets: {
      truncated: outputTruncated,
      exhausted: outputTruncated ? ["maxArtifactBytes"] : []
    }
  };
}

function buildRemoteBudgetExhaustedResult(input: {
  request: ResolveArtifactInput;
  parsed: ParsedGitHubReference;
  exhaustedKey: "maxFetches";
  warning: string;
  contractNotes: string[];
  refBoundaryNotes: string[];
}): ResolveArtifactResult {
  return {
    ...createOutputMetadata("resolveArtifact"),
    compatibilityNotes: [...input.refBoundaryNotes, ...input.contractNotes],
    status: "blocked",
    source: okSource({
      sourceStrategy: "github-remote",
      trustLevel: "remote-public",
      refKind: input.parsed.refKind,
      workspacePolicyEnforced: false,
      originKind: input.parsed.originKind,
      inputReference: input.request.reference,
      normalizedReference: input.parsed.normalizedReference,
      path: input.parsed.relativePath,
      ref: input.parsed.revision,
      versioned: true,
      immutable: input.parsed.immutable,
      mutability: input.parsed.mutability,
      accessStatus: "network-failure",
      rawContentAvailability: input.parsed.renderedContentAvailability ? "rendered-only" : "unavailable",
      renderedContentAvailability: input.parsed.renderedContentAvailability,
      exactValidationCapability: "blocked",
      exactValidationBlockedBySourceForm: true,
      freshOriginVerified: false,
      rawReadNeededForNextStep: true,
      warnings: [input.warning]
    }),
    artifact: createIdentity({
      normalizedReference: input.parsed.normalizedReference,
      immutableSourceIdentity: input.parsed.immutableSourceIdentity,
      identityFamilyKey: input.parsed.identityFamilyKey,
      provisional: false
    }),
    complete: false,
    rawReadNeededForNextStep: true,
    budgets: { truncated: false, exhausted: [input.exhaustedKey] }
  };
}

function isWithinRoot(candidatePath: string, rootPath: string): boolean {
  const normalizedCandidate = path.resolve(candidatePath);
  const normalizedRoot = path.resolve(rootPath);
  return normalizedCandidate === normalizedRoot || normalizedCandidate.startsWith(`${normalizedRoot}${path.sep}`);
}

function evaluateWorkspaceAccess(input: ResolveArtifactInput, normalizedPath: string): {
  blocked: boolean;
  accessStatus?: OriginAccessStatus;
  warning?: string;
  workspacePolicyEnforced: boolean;
} {
  const workspace = input.sourceAccess?.workspace;
  if (!workspace) {
    return { blocked: false, workspacePolicyEnforced: false };
  }

  const roots = workspace.roots.map((root) => path.resolve(root));
  const allowOutsideRoots = workspace.allowOutsideRoots === true;
  const pathWithinRoots = roots.some((root) => isWithinRoot(normalizedPath, root));
  if (!pathWithinRoots && !allowOutsideRoots) {
    return {
      blocked: true,
      accessStatus: "unauthorized",
      warning: "workspace-root-blocked",
      workspacePolicyEnforced: true
    };
  }

  if (!workspace.symlinkPolicy || workspace.symlinkPolicy === "follow") {
    return { blocked: false, workspacePolicyEnforced: true };
  }

  try {
    const resolvedRealPath = realpathSync(normalizedPath);
    const usesSymlink = path.resolve(resolvedRealPath) !== normalizedPath;
    if (workspace.symlinkPolicy === "error" && usesSymlink) {
      return {
        blocked: true,
        accessStatus: "unauthorized",
        warning: "workspace-symlink-blocked",
        workspacePolicyEnforced: true
      };
    }
    if (workspace.symlinkPolicy === "within-workspace") {
      const realPathWithinRoots = roots.some((root) => isWithinRoot(resolvedRealPath, root));
      if (!realPathWithinRoots && !allowOutsideRoots) {
        return {
          blocked: true,
          accessStatus: "unauthorized",
          warning: "workspace-symlink-outside-root-blocked",
          workspacePolicyEnforced: true
        };
      }
    }
  } catch {
    return { blocked: false, workspacePolicyEnforced: true };
  }

  return { blocked: false, workspacePolicyEnforced: true };
}

function mapRemoteFailure(response: RemoteFetchResponse): { status: BridgeTopLevelStatus; accessStatus: OriginAccessStatus; warning: string } {
  if (response.errorCode === "not-found" || response.status === 404) {
    return { status: "unavailable", accessStatus: "not-found", warning: "github-remote-not-found" };
  }
  if (response.errorCode === "unauthorized" || response.status === 401 || response.status === 403) {
    return { status: "blocked", accessStatus: "unauthorized", warning: "github-remote-unauthorized" };
  }
  if (response.errorCode === "timeout") {
    return { status: "blocked", accessStatus: "network-failure", warning: "github-remote-timeout" };
  }
  if (response.errorCode === "rate-limited" || response.status === 429) {
    return { status: "blocked", accessStatus: "network-failure", warning: "github-remote-rate-limited" };
  }
  return { status: "blocked", accessStatus: "network-failure", warning: "github-remote-network-failure" };
}

function shouldRetryRemoteResponse(response: RemoteFetchResponse): boolean {
  return response.ok !== true && (response.errorCode === "timeout" || response.errorCode === "network-failure");
}

export async function defaultRemoteFetcher(request: RemoteFetchRequest): Promise<RemoteFetchResponse> {
  const controller = new AbortController();
  const timeoutMs = request.timeoutMs;
  const timeoutHandle = typeof timeoutMs === "number" && timeoutMs > 0
    ? setTimeout(() => controller.abort(), timeoutMs)
    : undefined;

  try {
    const response = await fetch(request.url, {
      headers: request.headers,
      redirect: "follow",
      signal: controller.signal
    });
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });
    return {
      ok: response.ok,
      status: response.status,
      bodyText: await response.text(),
      finalUrl: response.url,
      headers,
      errorCode: response.ok
        ? undefined
        : response.status === 404
          ? "not-found"
          : response.status === 401 || response.status === 403
            ? "unauthorized"
            : response.status === 429
              ? "rate-limited"
              : undefined
    };
  } catch (error) {
    const isAbort = error instanceof Error && error.name === "AbortError";
    return {
      ok: false,
      status: 0,
      errorCode: isAbort ? "timeout" : "network-failure"
    };
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

function resolveLocalFile(input: ResolveArtifactInput, maxArtifactBytes: number): ResolveArtifactResult {
  const { reference, includeRawContent } = input;
  const normalizedPath = path.resolve(reference);
  const contractNotes = getContractUpgradeNotes(input);
  const workspaceAccess = evaluateWorkspaceAccess(input, normalizedPath);
  if (workspaceAccess.blocked) {
    const source = okSource({
      sourceStrategy: "local-workspace",
      trustLevel: "workspace-local",
      refKind: "not-applicable",
      workspacePolicyEnforced: workspaceAccess.workspacePolicyEnforced,
      originKind: "local-file",
      inputReference: reference,
      normalizedReference: normalizedPath,
      path: normalizedPath,
      versioned: false,
      immutable: false,
      mutability: "mutable",
      accessStatus: workspaceAccess.accessStatus ?? "unauthorized",
      rawContentAvailability: "unavailable",
      renderedContentAvailability: false,
      exactValidationCapability: "blocked",
      exactValidationBlockedBySourceForm: true,
      rawReadNeededForNextStep: true,
      warnings: workspaceAccess.warning ? [workspaceAccess.warning] : []
    });
    return {
      ...createOutputMetadata("resolveArtifact"),
      compatibilityNotes: contractNotes.length > 0 ? contractNotes : undefined,
      status: "blocked",
      source,
      artifact: createIdentity({ normalizedReference: normalizedPath, identityFamilyKey: normalizedPath, provisional: true }),
      complete: false,
      rawReadNeededForNextStep: true,
      budgets: { truncated: false, exhausted: [] }
    };
  }
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
      workspacePolicyEnforced: workspaceAccess.workspacePolicyEnforced,
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
      workspacePolicyEnforced: workspaceAccess.workspacePolicyEnforced,
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
  const parsed = parseGitHubReference(reference);
  if (!parsed) {
    return undefined;
  }
  const localRepoCandidate = path.resolve(path.dirname(process.cwd()), parsed.repo);
  const localFileCandidate = path.resolve(localRepoCandidate, ...parsed.relativePath.split("/"));
  const contractNotes = getContractUpgradeNotes(input);
  const refBoundaryNotes = getGitHubRefBoundaryNotes(parsed);
  try {
    const rawContent = readFileSync(localFileCandidate, "utf8");
    const truncated = Buffer.byteLength(rawContent, "utf8") > maxArtifactBytes;
    const boundedContent = truncated ? rawContent.slice(0, maxArtifactBytes) : rawContent;
    const outputRawContent = includeRawContent ? boundedContent : undefined;
    const outputTruncated = includeRawContent ? truncated : false;
    const contentHash = computeContentHash(rawContent);
    const rawAvailability: RawContentAvailability = "available";
    const exactValidationCapability: ExactValidationCapability = "available";
    const source = okSource({
      sourceStrategy: "github-local-mirror",
      trustLevel: "local-mirror",
      refKind: parsed.refKind,
      workspacePolicyEnforced: false,
      originKind: parsed.originKind,
      inputReference: reference,
      normalizedReference: parsed.normalizedReference,
      path: parsed.relativePath,
      ref: parsed.revision,
      versioned: true,
      immutable: parsed.immutable,
      mutability: parsed.mutability,
      accessStatus: "readable",
      rawContentAvailability: rawAvailability,
      renderedContentAvailability: parsed.renderedContentAvailability,
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
        ...refBoundaryNotes,
        ...contractNotes
      ],
      status: "ok",
      source,
      artifact: createIdentity({ normalizedReference: parsed.normalizedReference, immutableSourceIdentity: parsed.immutableSourceIdentity, identityFamilyKey: parsed.identityFamilyKey, contentHash, provisional: false }),
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
      refKind: parsed.refKind,
      workspacePolicyEnforced: false,
      originKind: parsed.originKind,
      inputReference: reference,
      normalizedReference: parsed.normalizedReference,
      path: parsed.relativePath,
      ref: parsed.revision,
      versioned: true,
      immutable: parsed.immutable,
      mutability: parsed.mutability,
      accessStatus: "not-found",
      rawContentAvailability: parsed.renderedContentAvailability ? "rendered-only" : "unavailable",
      renderedContentAvailability: parsed.renderedContentAvailability,
      exactValidationCapability: "blocked",
      exactValidationBlockedBySourceForm: true,
      rawReadNeededForNextStep: true,
      warnings: ["github-reference-requires-local-mirror", "raw-content-not-remotely-fetched"]
    });
    return {
      ...createOutputMetadata("resolveArtifact"),
      compatibilityNotes: ["GitHub references are currently resolved via a local mirror, not by remote fetch.", ...refBoundaryNotes, ...contractNotes],
      status: "blocked",
      source,
      artifact: createIdentity({ normalizedReference: parsed.normalizedReference, immutableSourceIdentity: parsed.immutableSourceIdentity, identityFamilyKey: parsed.identityFamilyKey, provisional: false }),
      complete: false,
      rawReadNeededForNextStep: true,
      budgets: { truncated: false, exhausted: [] }
    };
  }
}

async function resolveGitHubReferenceRemotely(input: ResolveArtifactInput, maxArtifactBytes: number): Promise<ResolveArtifactResult | undefined> {
  const parsed = parseGitHubReference(input.reference);
  if (!parsed) {
    return undefined;
  }

  const remoteFetcher = input.sourceAccess?.remoteFetcher ?? defaultRemoteFetcher;
  const refBoundaryNotes = getGitHubRefBoundaryNotes(parsed);
  const contractNotes = getContractUpgradeNotes(input, "remote");
  const availableFetches = input.sourceAccess?.network?.maxFetches ?? 1;
  const maxAttempts = Math.min(Math.max(1, (input.sourceAccess?.network?.retryCount ?? 0) + 1), Math.max(0, availableFetches));
  if (availableFetches <= 0) {
    return buildRemoteBudgetExhaustedResult({
      request: input,
      parsed,
      exhaustedKey: "maxFetches",
      warning: "github-remote-fetch-budget-exhausted",
      contractNotes,
      refBoundaryNotes
    });
  }
  let response: RemoteFetchResponse | undefined;
  let attemptCount = 0;
  while (attemptCount < maxAttempts) {
    attemptCount += 1;
    response = await remoteFetcher({
      url: parsed.rawFetchUrl,
      timeoutMs: input.sourceAccess?.network?.requestTimeoutMs,
      headers: {
        accept: "text/plain, text/markdown;q=0.9, */*;q=0.1"
      }
    });
    if (!shouldRetryRemoteResponse(response) || attemptCount >= maxAttempts) {
      break;
    }
  }

  if (!response) {
    return buildRemoteBudgetExhaustedResult({
      request: input,
      parsed,
      exhaustedKey: "maxFetches",
      warning: "github-remote-fetch-budget-exhausted",
      contractNotes,
      refBoundaryNotes
    });
  }

  if (!response.ok || typeof response.bodyText !== "string") {
    const failure = mapRemoteFailure(response);
    const cachedFallbackResult = buildCachedFallbackResult({
      request: input,
      parsed,
      maxArtifactBytes,
      failure,
      contractNotes,
      refBoundaryNotes
    });
    if (cachedFallbackResult) {
      return cachedFallbackResult;
    }
    const exhausted = attemptCount >= availableFetches && shouldRetryRemoteResponse(response) && (input.sourceAccess?.network?.retryCount ?? 0) + 1 > availableFetches
      ? ["maxFetches"]
      : [];
    return {
      ...createOutputMetadata("resolveArtifact"),
      compatibilityNotes: [...refBoundaryNotes, ...contractNotes].length > 0 ? [...refBoundaryNotes, ...contractNotes] : undefined,
      status: failure.status,
      source: okSource({
        sourceStrategy: "github-remote",
        trustLevel: "remote-public",
        refKind: parsed.refKind,
        workspacePolicyEnforced: false,
        originKind: parsed.originKind,
        inputReference: input.reference,
        normalizedReference: parsed.normalizedReference,
        path: parsed.relativePath,
        ref: parsed.revision,
        versioned: true,
        immutable: parsed.immutable,
        mutability: parsed.mutability,
        accessStatus: failure.accessStatus,
        rawContentAvailability: parsed.renderedContentAvailability ? "rendered-only" : "unavailable",
        renderedContentAvailability: parsed.renderedContentAvailability,
        exactValidationCapability: "blocked",
        exactValidationBlockedBySourceForm: true,
        rawReadNeededForNextStep: true,
        warnings: exhausted.length > 0 ? [failure.warning, "github-remote-fetch-budget-exhausted"] : [failure.warning]
      }),
      artifact: createIdentity({
        normalizedReference: parsed.normalizedReference,
        immutableSourceIdentity: parsed.immutableSourceIdentity,
        identityFamilyKey: parsed.identityFamilyKey,
        provisional: false
      }),
      complete: false,
      rawReadNeededForNextStep: true,
      budgets: { truncated: false, exhausted }
    };
  }

  const rawContent = response.bodyText;
  const truncated = Buffer.byteLength(rawContent, "utf8") > maxArtifactBytes;
  const boundedContent = truncated ? rawContent.slice(0, maxArtifactBytes) : rawContent;
  const outputRawContent = input.includeRawContent ? boundedContent : undefined;
  const outputTruncated = input.includeRawContent ? truncated : false;
  const contentHash = computeContentHash(rawContent);

  return {
    ...createOutputMetadata("resolveArtifact"),
    compatibilityNotes: [
      ...(!input.includeRawContent ? ["Raw source is omitted by default; request includeRawContent to access bounded raw content."] : []),
      ...refBoundaryNotes,
      ...contractNotes
    ].length > 0
      ? [
          ...(!input.includeRawContent ? ["Raw source is omitted by default; request includeRawContent to access bounded raw content."] : []),
          ...refBoundaryNotes,
          ...contractNotes
        ]
      : undefined,
    status: "ok",
    source: okSource({
      sourceStrategy: "github-remote",
      trustLevel: "remote-public",
      refKind: parsed.refKind,
      workspacePolicyEnforced: false,
      originKind: parsed.originKind,
      inputReference: input.reference,
      normalizedReference: parsed.normalizedReference,
      path: parsed.relativePath,
      ref: parsed.revision,
      versioned: true,
      immutable: parsed.immutable,
      mutability: parsed.mutability,
      accessStatus: "readable",
      rawContentAvailability: "available",
      renderedContentAvailability: parsed.renderedContentAvailability,
      exactValidationCapability: "available",
      exactValidationBlockedBySourceForm: false,
      rawContent: outputRawContent,
      contentHash,
      cachedContentUsed: false,
      freshOriginVerified: true,
      rawReadNeededForNextStep: !input.includeRawContent,
      warnings: outputTruncated ? ["artifact-bytes-truncated"] : []
    }),
    artifact: createIdentity({
      normalizedReference: parsed.normalizedReference,
      immutableSourceIdentity: parsed.immutableSourceIdentity,
      identityFamilyKey: parsed.identityFamilyKey,
      contentHash,
      provisional: false
    }),
    complete: !outputTruncated,
    rawReadNeededForNextStep: !input.includeRawContent,
    budgets: {
      truncated: outputTruncated,
      exhausted: outputTruncated ? ["maxArtifactBytes"] : []
    }
  };
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
  if (input.sourceAccess?.preferredGitHubStrategy !== "local-mirror") {
    const remoteGitHubResult = await resolveGitHubReferenceRemotely(input, input.maxArtifactBytes ?? 128_000);
    if (remoteGitHubResult) {
      return remoteGitHubResult;
    }
  }
  return resolveArtifact(input);
}