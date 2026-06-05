import path from "node:path";
import { type ContinuityEnvelope, type GetSchemaContractInput, type GetSchemaContractResult, createOutputMetadata } from "@tiinex/lineage-bridge-core";
import { parseContinuityEnvelope, parseSchemaContracts } from "@tiinex/lineage-bridge-parsers";
import { resolveArtifact } from "@tiinex/lineage-bridge-sources";

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
  return target;
}

function uniqueItems(items: string[]): string[] {
  return [...new Set(items)];
}

export function getSchemaContract(input: GetSchemaContractInput): GetSchemaContractResult {
  const artifact = resolveArtifact(input);
  const envelope = artifact.source.rawContent ? parseContinuityEnvelope(artifact.source.rawContent) : undefined;
  const schemaReference = resolveSchemaReference({ source: artifact.source, envelope });
  const schemaResult = schemaReference ? resolveArtifact({ reference: schemaReference, maxArtifactBytes: input.maxArtifactBytes }) : undefined;

  if (!schemaResult?.source.rawContent) {
    return {
      ...createOutputMetadata("getSchemaContract"),
      status: "incomplete",
      contract: {
        schemaId: getSchemaId(envelope?.currentSchema),
        validationAuthority: [],
        generationAuthority: [],
        integrityAuthority: [],
        knownCategoryLabels: [],
        requiredGroups: [],
        policyGroups: [],
        schemaSourceReference: schemaReference,
        schemaContentHash: schemaResult?.artifact.contentHash,
        unresolved: true
      },
      complete: false,
      rawReadNeededForNextStep: true,
      budgets: schemaResult?.budgets ?? artifact.budgets
    };
  }

  const contracts = parseSchemaContracts(schemaResult.source.rawContent);
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

  return {
    ...createOutputMetadata("getSchemaContract"),
    status: "ok",
    contract: {
      schemaId: getSchemaId(parseContinuityEnvelope(schemaResult.source.rawContent).currentSchema),
      validationAuthority,
      generationAuthority,
      integrityAuthority,
      knownCategoryLabels,
      requiredGroups,
      policyGroups,
      schemaSourceReference: schemaResult.source.normalizedReference ?? schemaResult.source.inputReference,
      schemaContentHash: schemaResult.artifact.contentHash,
      unresolved: false
    },
    fullContract: input.includeFullContract ? contracts : undefined,
    complete: true,
    rawReadNeededForNextStep: false,
    budgets: {
      truncated: artifact.budgets.truncated || schemaResult.budgets.truncated,
      exhausted: [...new Set([...artifact.budgets.exhausted, ...schemaResult.budgets.exhausted])]
    }
  };
}