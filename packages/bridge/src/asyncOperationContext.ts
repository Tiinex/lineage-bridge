import { type RemoteFetchRequest, type RemoteFetchResponse, type ResolveArtifactInput, type ResolveArtifactResult, type SourceAccessOptions } from "@tiinex/lineage-bridge-core";
import { defaultRemoteFetcher, resolveArtifactAsync } from "@tiinex/lineage-bridge-sources";

export type AsyncArtifactResolver = (input: ResolveArtifactInput) => Promise<ResolveArtifactResult>;

export type SchemaBudgetConsumer = (sourceAccess?: SourceAccessOptions) => {
  sourceAccess?: SourceAccessOptions;
  schemaBudgetExhausted: boolean;
};

function isRemoteResolution(input: ResolveArtifactInput): boolean {
  return /^https?:\/\//iu.test(input.reference) && input.sourceAccess?.preferredGitHubStrategy !== "local-mirror";
}

function createCacheKey(input: ResolveArtifactInput): string {
  return JSON.stringify({
    reference: input.reference,
    maxArtifactBytes: input.maxArtifactBytes ?? 128_000,
    includeRawContent: input.includeRawContent ?? false
  });
}

export function createAsyncBridgeOperationContext(sourceAccess?: SourceAccessOptions): {
  resolve: AsyncArtifactResolver;
  consumeSchemaBudget: SchemaBudgetConsumer;
} {
  const cache = new Map<string, Promise<ResolveArtifactResult>>();
  let remainingFetches = sourceAccess?.network?.maxFetches;
  let remainingSchemaFetches = sourceAccess?.network?.maxSchemaFetches;
  const operationStartedAt = Date.now();

  const baseRemoteFetcher = sourceAccess?.remoteFetcher ?? defaultRemoteFetcher;
  const operationRemoteFetcher = async (request: RemoteFetchRequest): Promise<RemoteFetchResponse> => {
        const totalTimeoutMs = sourceAccess?.network?.totalTimeoutMs;
        if (typeof totalTimeoutMs === "number" && totalTimeoutMs > 0 && Date.now() - operationStartedAt >= totalTimeoutMs) {
          return { ok: false, status: 0, errorCode: "timeout" };
        }
        if (remainingFetches !== undefined && remainingFetches <= 0) {
          return { ok: false, status: 0, errorCode: "timeout" };
        }
        if (remainingFetches !== undefined) {
          remainingFetches -= 1;
        }
        return baseRemoteFetcher(request);
      };

  const resolve: AsyncArtifactResolver = async (input) => {
    const cacheKey = createCacheKey(input);
    const cached = cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const nextInput: ResolveArtifactInput = {
      ...input,
      sourceAccess: input.sourceAccess
        ? {
            ...input.sourceAccess,
            network: input.sourceAccess.network
              ? {
                  ...input.sourceAccess.network,
                  maxFetches: isRemoteResolution(input) ? remainingFetches : input.sourceAccess.network.maxFetches
                }
              : input.sourceAccess.network
          }
        : input.sourceAccess
    };

    if (nextInput.sourceAccess) {
      nextInput.sourceAccess = {
        ...nextInput.sourceAccess,
        remoteFetcher: operationRemoteFetcher
      };
    }

    const pending = resolveArtifactAsync(nextInput);
    cache.set(cacheKey, pending);
    return pending;
  };

  const consumeSchemaBudget: SchemaBudgetConsumer = (inputSourceAccess) => {
    const activeSourceAccess = inputSourceAccess ?? sourceAccess;
    if (!activeSourceAccess?.network) {
      return { sourceAccess: activeSourceAccess, schemaBudgetExhausted: false };
    }
    if ((remainingSchemaFetches ?? 1) <= 0) {
      return { sourceAccess: activeSourceAccess, schemaBudgetExhausted: true };
    }
    if (remainingSchemaFetches !== undefined) {
      remainingSchemaFetches -= 1;
    }
    return {
      schemaBudgetExhausted: false,
      sourceAccess: {
        ...activeSourceAccess,
        network: {
          ...activeSourceAccess.network,
          maxSchemaFetches: remainingSchemaFetches,
          maxFetches: remainingFetches
        }
      }
    };
  };

  return { resolve, consumeSchemaBudget };
}