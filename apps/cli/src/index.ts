import {
  getHandoffPacket,
  getHandoffPacketAsync,
  getLineage,
  getLineageAsync,
  getRelevantSlice,
  getRelevantSliceAsync,
  getSchemaContract,
  getSchemaContractAsync,
  getValidationOverlay,
  getAvailableActions,
  getAvailableActionsAsync,
  getStructureIndex,
  getTreeProjection,
  getNodeDetails,
  getNodeChildren,
  readEnvelope,
  resolveArtifact,
  resolveArtifactAsync,
  validateArtifact,
  validateArtifactAsync,
  type BridgeToolName,
  type SourceAccessOptions
} from "@tiinex/lineage-bridge-bridge";
import { readFileSync } from "node:fs";

type ToolHandler = (input: unknown) => unknown | Promise<unknown>;

const TOOL_HANDLERS = {
  resolveArtifact: (input) => resolveArtifact(input as Parameters<typeof resolveArtifact>[0]),
  resolveArtifactAsync: (input) => resolveArtifactAsync(input as Parameters<typeof resolveArtifactAsync>[0]),
  readEnvelope: (input) => readEnvelope(input as Parameters<typeof readEnvelope>[0]),
  validateArtifact: (input) => validateArtifact(input as Parameters<typeof validateArtifact>[0]),
  validateArtifactAsync: (input) => validateArtifactAsync(input as Parameters<typeof validateArtifactAsync>[0]),
  getLineage: (input) => getLineage(input as Parameters<typeof getLineage>[0]),
  getLineageAsync: (input) => getLineageAsync(input as Parameters<typeof getLineageAsync>[0]),
  getHandoffPacket: (input) => getHandoffPacket(input as Parameters<typeof getHandoffPacket>[0]),
  getHandoffPacketAsync: (input) => getHandoffPacketAsync(input as Parameters<typeof getHandoffPacketAsync>[0]),
  getRelevantSlice: (input) => getRelevantSlice(input as Parameters<typeof getRelevantSlice>[0]),
  getRelevantSliceAsync: (input) => getRelevantSliceAsync(input as Parameters<typeof getRelevantSliceAsync>[0]),
  getSchemaContract: (input) => getSchemaContract(input as Parameters<typeof getSchemaContract>[0]),
  getSchemaContractAsync: (input) => getSchemaContractAsync(input as Parameters<typeof getSchemaContractAsync>[0]),
  getValidationOverlay: (input) => getValidationOverlay(input as Parameters<typeof getValidationOverlay>[0]),
  getAvailableActions: (input) => getAvailableActions(input as Parameters<typeof getAvailableActions>[0]),
  getAvailableActionsAsync: (input) => getAvailableActionsAsync(input as Parameters<typeof getAvailableActionsAsync>[0]),
  getStructureIndex: (input) => getStructureIndex(input as Parameters<typeof getStructureIndex>[0]),
  getTreeProjection: (input) => getTreeProjection(input as Parameters<typeof getTreeProjection>[0]),
  getNodeDetails: (input) => getNodeDetails(input as Parameters<typeof getNodeDetails>[0]),
  getNodeChildren: (input) => getNodeChildren(input as Parameters<typeof getNodeChildren>[0])
} satisfies Record<string, ToolHandler>;

type CliToolName = keyof typeof TOOL_HANDLERS;

type ParsedCliFlags = {
  sourceAccess?: SourceAccessOptions;
};

function ensureSourceAccess(target: ParsedCliFlags): SourceAccessOptions {
  target.sourceAccess ??= {};
  return target.sourceAccess;
}

function ensureWorkspaceOptions(target: ParsedCliFlags): NonNullable<SourceAccessOptions["workspace"]> {
  const sourceAccess = ensureSourceAccess(target);
  sourceAccess.workspace ??= { roots: [] };
  return sourceAccess.workspace;
}

function ensureNetworkOptions(target: ParsedCliFlags): NonNullable<SourceAccessOptions["network"]> {
  const sourceAccess = ensureSourceAccess(target);
  sourceAccess.network ??= {};
  return sourceAccess.network;
}

function readFlagValue(args: string[], index: number, flagName: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${flagName}`);
  }
  return value;
}

function parseIntegerFlag(value: string, flagName: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Invalid integer for ${flagName}: ${value}`);
  }
  return parsed;
}

function parseCliFlags(args: string[]): ParsedCliFlags {
  const parsed: ParsedCliFlags = {};
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    switch (flag) {
      case "--preferred-github-strategy":
        ensureSourceAccess(parsed).preferredGitHubStrategy = readFlagValue(args, index, flag) as SourceAccessOptions["preferredGitHubStrategy"];
        index += 1;
        break;
      case "--fresh-origin-resolution":
        ensureSourceAccess(parsed).freshOriginResolution = true;
        break;
      case "--workspace-root":
        ensureWorkspaceOptions(parsed).roots.push(readFlagValue(args, index, flag));
        index += 1;
        break;
      case "--allow-outside-roots":
        ensureWorkspaceOptions(parsed).allowOutsideRoots = true;
        break;
      case "--symlink-policy":
        ensureWorkspaceOptions(parsed).symlinkPolicy = readFlagValue(args, index, flag) as NonNullable<SourceAccessOptions["workspace"]>["symlinkPolicy"];
        index += 1;
        break;
      case "--max-fetches":
        ensureNetworkOptions(parsed).maxFetches = parseIntegerFlag(readFlagValue(args, index, flag), flag);
        index += 1;
        break;
      case "--max-schema-fetches":
        ensureNetworkOptions(parsed).maxSchemaFetches = parseIntegerFlag(readFlagValue(args, index, flag), flag);
        index += 1;
        break;
      case "--max-redirects":
        ensureNetworkOptions(parsed).maxRedirects = parseIntegerFlag(readFlagValue(args, index, flag), flag);
        index += 1;
        break;
      case "--request-timeout-ms":
        ensureNetworkOptions(parsed).requestTimeoutMs = parseIntegerFlag(readFlagValue(args, index, flag), flag);
        index += 1;
        break;
      case "--total-timeout-ms":
        ensureNetworkOptions(parsed).totalTimeoutMs = parseIntegerFlag(readFlagValue(args, index, flag), flag);
        index += 1;
        break;
      case "--retry-count":
        ensureNetworkOptions(parsed).retryCount = parseIntegerFlag(readFlagValue(args, index, flag), flag);
        index += 1;
        break;
      default:
        throw new Error(`Unknown flag: ${flag}`);
    }
  }
  return parsed;
}

function mergeSourceAccess(base: unknown, overrides: SourceAccessOptions | undefined): SourceAccessOptions | undefined {
  const baseSourceAccess = base && typeof base === "object" && !Array.isArray(base) ? (base as { sourceAccess?: SourceAccessOptions }).sourceAccess : undefined;
  if (!baseSourceAccess && !overrides) {
    return undefined;
  }
  return {
    ...baseSourceAccess,
    ...overrides,
    workspace: {
      ...baseSourceAccess?.workspace,
      ...overrides?.workspace,
      roots: overrides?.workspace?.roots ?? baseSourceAccess?.workspace?.roots ?? []
    },
    network: {
      ...baseSourceAccess?.network,
      ...overrides?.network
    }
  };
}

function applyCliFlagsToInput(input: unknown, flags: ParsedCliFlags): unknown {
  if (!flags.sourceAccess) {
    return input;
  }
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("CLI source flags require a JSON object input.");
  }
  return {
    ...(input as Record<string, unknown>),
    sourceAccess: mergeSourceAccess(input, flags.sourceAccess)
  };
}

function printUsage(): void {
  process.stderr.write("Usage: node apps/cli/dist/index.js <toolName> <jsonInput> [sourceFlags]\n");
  process.stderr.write(`Available tools: ${Object.keys(TOOL_HANDLERS).join(", ")}\n`);
  process.stderr.write("Source flags: --preferred-github-strategy <auto|remote|local-mirror> --fresh-origin-resolution --workspace-root <path> --allow-outside-roots --symlink-policy <follow|error|within-workspace> --max-fetches <n> --max-schema-fetches <n> --max-redirects <n> --request-timeout-ms <n> --total-timeout-ms <n> --retry-count <n>\n");
  process.stderr.write("Smoke examples:\n");
  process.stderr.write("  node apps/cli/dist/index.js resolveArtifact @.cli-smoke.json --workspace-root c:/Users/micro/Documents/Repos/Tiinex/docs --symlink-policy within-workspace\n");
  process.stderr.write("  node apps/cli/dist/index.js getAvailableActionsAsync @.cli-smoke.remote.json --preferred-github-strategy remote --max-fetches 2 --max-schema-fetches 1 --retry-count 1\n");
}

function normalizeJsonArgument(value: string): string {
  let trimmed = value.trim();
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    trimmed = trimmed.slice(1, -1);
  }
  if (trimmed.startsWith("@")) {
    return readFileSync(trimmed.slice(1), "utf8");
  }
  return trimmed;
}

async function main(): Promise<number> {
  const [, , toolName, jsonInput, ...flagArgs] = process.argv;
  if (!toolName || !jsonInput) {
    printUsage();
    return 1;
  }
  if (!(toolName in TOOL_HANDLERS)) {
    process.stderr.write(`Unknown tool: ${toolName}\n`);
    printUsage();
    return 1;
  }
  let parsedInput: unknown;
  try {
    parsedInput = JSON.parse(normalizeJsonArgument(jsonInput));
  } catch (error) {
    process.stderr.write(`Invalid JSON input: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
  try {
    parsedInput = applyCliFlagsToInput(parsedInput, parseCliFlags(flagArgs));
  } catch (error) {
    process.stderr.write(`Invalid CLI flags: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
  const result = await TOOL_HANDLERS[toolName as CliToolName](parsedInput);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return 0;
}

void main().then((code) => {
  process.exitCode = code;
});