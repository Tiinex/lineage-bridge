import path from "node:path";
import { type ContinuityEnvelope, type GetSchemaContractInput, type GetSchemaContractResult, type ResolveArtifactInput, type ResolveArtifactResult, createOutputMetadata } from "@tiinex/lineage-bridge-core";
import { parseContinuityEnvelope, parseSchemaContracts } from "@tiinex/lineage-bridge-parsers";
import { resolveArtifact, resolveArtifactAsync } from "@tiinex/lineage-bridge-sources";

const GITHUB_BLOB_SOURCE_RE = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/iu;

function getSchemaId(reference: ContinuityEnvelope["currentSchema"]): string | undefined {
  return reference?.label ?? reference?.target;
}

function resolveSchemaReference(input: { source: ReturnType<typeof resolveArtifact>["source"]; envelope?: ContinuityEnvelope }): string | undefined {
  const target = input.envelope?.currentSchema?.target?.trim();
  if (!target) {
    return undefined;
  }
  if (/^https?:\/\//iu.test(target)) {
    return target;
  }
  if (input.source.originKind === "local-file" && input.source.normalizedReference) {
    return path.resolve(path.dirname(input.source.normalizedReference), ...target.split("/"));
  }
  const githubMatch = input.source.normalizedReference?.match(GITHUB_BLOB_SOURCE_RE);
  if ((input.source.originKind === "github-blob" || input.source.originKind === "github-raw") && githubMatch && input.source.path && input.source.ref) {
    const owner = githubMatch[1];
    const repo = githubMatch[2];
    const artifactDir = path.posix.dirname(input.source.path);
    const resolvedPath = path.posix.normalize(path.posix.join(artifactDir, target));
    return `https://github.com/${owner}/${repo}/blob/${input.source.ref}/${resolvedPath}`;
  }
  return target;
}

function uniqueItems(items: string[]): string[] {
  return [...new Set(items)];
}

function detectSchemaMutabilityRisk(input: {
  artifact: ReturnType<typeof resolveArtifact>;
  schemaResult?: ReturnType<typeof resolveArtifact>;
}): boolean {
  return input.artifact.source.immutable === true && input.schemaResult?.source.versioned === true && input.schemaResult.source.immutable === false;
}

function createSchemaMutabilityRiskNote(input: {
  artifact: ReturnType<typeof resolveArtifact>;
  schemaResult: ReturnType<typeof resolveArtifact>;
}): string {
  return `Artifact is commit-pinned but the governing schema resolved through a mutable ${input.schemaResult.source.refKind} reference, so schema guidance may drift independently of the artifact.`;
}

function createUnresolvedResult(input: {
  artifact: ReturnType<typeof resolveArtifact>;
  envelope?: ContinuityEnvelope;
  schemaReference?: string;
  schemaResult?: ReturnType<typeof resolveArtifact>;
  extraExhausted?: string[];
}): GetSchemaContractResult {
  return {
    ...createOutputMetadata("getSchemaContract"),
    status: "incomplete",
    contract: {
      schemaId: getSchemaId(input.envelope?.currentSchema),
      validationAuthority: [],
      generationAuthority: [],
      integrityAuthority: [],
      knownCategoryLabels: [],
      requiredGroups: [],
      policyGroups: [],
      schemaSourceReference: input.schemaReference,
      schemaContentHash: input.schemaResult?.artifact.contentHash,
      unresolved: true
    },
    complete: false,
    rawReadNeededForNextStep: true,
    budgets: input.schemaResult
      ? {
          truncated: input.schemaResult.budgets.truncated || input.artifact.budgets.truncated,
          exhausted: [...new Set([...input.artifact.budgets.exhausted, ...input.schemaResult.budgets.exhausted, ...(input.extraExhausted ?? [])])]
        }
      : {
          truncated: input.artifact.budgets.truncated,
          exhausted: [...new Set([...input.artifact.budgets.exhausted, ...(input.extraExhausted ?? [])])]
        }
  };
}

function consumeSchemaFetchNetworkBudget(input?: GetSchemaContractInput["sourceAccess"]): {
  sourceAccess?: GetSchemaContractInput["sourceAccess"];
  schemaBudgetExhausted: boolean;
} {
  if (!input?.network) {
    return { sourceAccess: input, schemaBudgetExhausted: false };
  }
  if ((input.network.maxSchemaFetches ?? 1) <= 0) {
    return { sourceAccess: input, schemaBudgetExhausted: true };
  }
  return {
    schemaBudgetExhausted: false,
    sourceAccess: {
      ...input,
      network: {
        ...input.network,
        maxSchemaFetches: input.network.maxSchemaFetches === undefined ? undefined : Math.max(0, input.network.maxSchemaFetches - 1),
        maxFetches: input.network.maxFetches === undefined ? undefined : Math.max(0, input.network.maxFetches - 1)
      }
    }
  };
}

function createResolvedResult(input: {
  artifact: ReturnType<typeof resolveArtifact>;
  schemaResult: ReturnType<typeof resolveArtifact>;
  includeFullContract?: boolean;
}): GetSchemaContractResult {
  const contracts = parseSchemaContracts(input.schemaResult.source.rawContent!);
  const validationContract = contracts.schemaValidationContract;
  const artifactCreationContract = contracts.artifactCreationContract;
  const validationAuthority = uniqueItems(validationContract?.groups.flatMap((group) => group.categories.filter((category) => category.label === "Validation Authority").flatMap((category) => category.items)) ?? []);
  const generationAuthority = uniqueItems(validationContract?.groups.flatMap((group) => group.categories.filter((category) => category.label === "Generation Authority").flatMap((category) => category.items)) ?? []);
  const integrityAuthority = uniqueItems(validationContract?.groups.flatMap((group) => group.categories.filter((category) => category.label === "Integrity Authority").flatMap((category) => category.items)) ?? []);
  const knownCategoryLabels = uniqueItems(validationContract?.groups.flatMap((group) => group.categories.filter((category) => category.label === "Known Category Labels").flatMap((category) => category.items)) ?? []);
  const requiredGroups = uniqueItems([
    ...(validationContract?.groups.filter((group) => group.categories.some((category) => category.label.startsWith("Required"))).map((group) => group.heading) ?? []),
    ...(artifactCreationContract?.groups.filter((group) => group.categories.some((category) => category.label.startsWith("Required"))).map((group) => group.heading) ?? [])
  ]);
  const policyGroups = uniqueItems([
    ...(validationContract?.groups.filter((group) => group.categories.some((category) => category.label === "Rules")).map((group) => group.heading) ?? []),
    ...(artifactCreationContract?.groups.filter((group) => group.categories.some((category) => category.label === "Rules")).map((group) => group.heading) ?? [])
  ]);

  const schemaMutabilityRisk = detectSchemaMutabilityRisk(input);
  return {
    ...createOutputMetadata("getSchemaContract"),
    compatibilityNotes: schemaMutabilityRisk
      ? [createSchemaMutabilityRiskNote({ artifact: input.artifact, schemaResult: input.schemaResult })]
      : undefined,
    status: "ok",
    contract: {
      schemaId: getSchemaId(parseContinuityEnvelope(input.schemaResult.source.rawContent!).currentSchema),
      validationAuthority,
      generationAuthority,
      integrityAuthority,
      knownCategoryLabels,
      requiredGroups,
      policyGroups,
      schemaSourceReference: input.schemaResult.source.normalizedReference ?? input.schemaResult.source.inputReference,
      schemaContentHash: input.schemaResult.artifact.contentHash,
      unresolved: false
    },
    fullContract: input.includeFullContract ? contracts : undefined,
    complete: true,
    rawReadNeededForNextStep: false,
    budgets: {
      truncated: input.artifact.budgets.truncated || input.schemaResult.budgets.truncated,
      exhausted: [...new Set([...input.artifact.budgets.exhausted, ...input.schemaResult.budgets.exhausted])]
    }
  };
}

export function getSchemaContract(input: GetSchemaContractInput): GetSchemaContractResult {
  const artifact = resolveArtifact({ ...input, includeRawContent: true });
  const envelope = artifact.source.rawContent ? parseContinuityEnvelope(artifact.source.rawContent) : undefined;
  const schemaReference = resolveSchemaReference({ source: artifact.source, envelope });
  const schemaResult = schemaReference
    ? resolveArtifact({ reference: schemaReference, maxArtifactBytes: input.maxArtifactBytes, includeRawContent: true, sourceAccess: input.sourceAccess })
    : undefined;

  if (!schemaResult?.source.rawContent) {
    return createUnresolvedResult({ artifact, envelope, schemaReference, schemaResult });
  }
  return createResolvedResult({ artifact, schemaResult, includeFullContract: input.includeFullContract });
}

export async function getSchemaContractAsync(
  input: GetSchemaContractInput,
  resolveAsync: (input: ResolveArtifactInput) => Promise<ResolveArtifactResult> = resolveArtifactAsync,
  consumeSchemaBudget: (sourceAccess?: GetSchemaContractInput["sourceAccess"]) => { sourceAccess?: GetSchemaContractInput["sourceAccess"]; schemaBudgetExhausted: boolean } = consumeSchemaFetchNetworkBudget
): Promise<GetSchemaContractResult> {
  const artifact = await resolveAsync({ ...input, includeRawContent: true });
  const envelope = artifact.source.rawContent ? parseContinuityEnvelope(artifact.source.rawContent) : undefined;
  const schemaReference = resolveSchemaReference({ source: artifact.source, envelope });
  const schemaBudget = consumeSchemaBudget(input.sourceAccess);
  const schemaResult = schemaReference
    ? schemaBudget.schemaBudgetExhausted
      ? undefined
      : await resolveAsync({ reference: schemaReference, maxArtifactBytes: input.maxArtifactBytes, includeRawContent: true, sourceAccess: schemaBudget.sourceAccess })
    : undefined;

  if (!schemaResult?.source.rawContent) {
    return createUnresolvedResult({ artifact, envelope, schemaReference, schemaResult, extraExhausted: schemaBudget.schemaBudgetExhausted ? ["maxSchemaFetches"] : undefined });
  }

  return createResolvedResult({ artifact, schemaResult, includeFullContract: input.includeFullContract });
}