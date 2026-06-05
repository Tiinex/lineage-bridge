import {
  getHandoffPacket,
  getLineage,
  getRelevantSlice,
  getSchemaContract,
  getValidationOverlay,
  getAvailableActions,
  getStructureIndex,
  getTreeProjection,
  getNodeDetails,
  getNodeChildren,
  readEnvelope,
  resolveArtifact,
  validateArtifact,
  type BridgeToolName
} from "@tiinex/lineage-bridge-bridge";
import { readFileSync } from "node:fs";

type ToolHandler = (input: unknown) => unknown;

const TOOL_HANDLERS: Record<BridgeToolName, ToolHandler> = {
  resolveArtifact: (input) => resolveArtifact(input as Parameters<typeof resolveArtifact>[0]),
  readEnvelope: (input) => readEnvelope(input as Parameters<typeof readEnvelope>[0]),
  validateArtifact: (input) => validateArtifact(input as Parameters<typeof validateArtifact>[0]),
  getLineage: (input) => getLineage(input as Parameters<typeof getLineage>[0]),
  getHandoffPacket: (input) => getHandoffPacket(input as Parameters<typeof getHandoffPacket>[0]),
  getRelevantSlice: (input) => getRelevantSlice(input as Parameters<typeof getRelevantSlice>[0]),
  getSchemaContract: (input) => getSchemaContract(input as Parameters<typeof getSchemaContract>[0]),
  getValidationOverlay: (input) => getValidationOverlay(input as Parameters<typeof getValidationOverlay>[0]),
  getAvailableActions: (input) => getAvailableActions(input as Parameters<typeof getAvailableActions>[0]),
  getStructureIndex: (input) => getStructureIndex(input as Parameters<typeof getStructureIndex>[0]),
  getTreeProjection: (input) => getTreeProjection(input as Parameters<typeof getTreeProjection>[0]),
  getNodeDetails: (input) => getNodeDetails(input as Parameters<typeof getNodeDetails>[0]),
  getNodeChildren: (input) => getNodeChildren(input as Parameters<typeof getNodeChildren>[0])
};

function printUsage(): void {
  process.stderr.write("Usage: node apps/cli/dist/index.js <toolName> <jsonInput>\n");
  process.stderr.write(`Available tools: ${Object.keys(TOOL_HANDLERS).join(", ")}\n`);
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

function main(): number {
  const [, , toolName, jsonInput] = process.argv;
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
  const result = TOOL_HANDLERS[toolName as BridgeToolName](parsedInput);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return 0;
}

process.exitCode = main();