import {
  type ContinuityEnvelope,
  type ValidateArtifactInput,
  type ValidateArtifactResult,
  type ValidationFinding,
  createOutputMetadata,
  createValidationBasis
} from "@tiinex/lineage-bridge-core";
import { parseContinuityEnvelope } from "@tiinex/lineage-bridge-parsers";
import { resolveArtifact } from "@tiinex/lineage-bridge-sources";

type SupportedSchemaId = "tiinex.root.v1" | "tiinex.topic.v1" | "tiinex.task.v1";

interface ValidatorSpec {
  validatorId: string;
  validatorVersion: string;
  expectedCurrentSchema: SupportedSchemaId;
  expectedEnvelopeSchema: "tiinex.root.v1";
}

const VALIDATORS: Record<SupportedSchemaId, ValidatorSpec> = {
  "tiinex.root.v1": {
    validatorId: "@tiinex/lineage-bridge-validators/root-envelope-v1",
    validatorVersion: "0.1.0",
    expectedCurrentSchema: "tiinex.root.v1",
    expectedEnvelopeSchema: "tiinex.root.v1"
  },
  "tiinex.topic.v1": {
    validatorId: "@tiinex/lineage-bridge-validators/topic-envelope-v1",
    validatorVersion: "0.1.0",
    expectedCurrentSchema: "tiinex.topic.v1",
    expectedEnvelopeSchema: "tiinex.root.v1"
  },
  "tiinex.task.v1": {
    validatorId: "@tiinex/lineage-bridge-validators/task-envelope-v1",
    validatorVersion: "0.1.0",
    expectedCurrentSchema: "tiinex.task.v1",
    expectedEnvelopeSchema: "tiinex.root.v1"
  }
};

function createFinding(partial: Omit<ValidationFinding, "findingShapeVersion">): ValidationFinding {
  return {
    findingShapeVersion: 1,
    ...partial
  };
}

function getSchemaId(reference: ContinuityEnvelope["currentSchema"] | ContinuityEnvelope["envelopeSchema"]): string | undefined {
  return reference?.label ?? reference?.target;
}

function validateEnvelopeCommon(envelope: ContinuityEnvelope): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  if (!envelope.currentCreatedAt) {
    findings.push(createFinding({
      code: "continuity-current-created-at-missing",
      severity: "error",
      message: "Current Created At is required by the continuity envelope.",
      targetSurface: "envelope",
      ruleSource: "Milestone 1 / ReadEnvelope"
    }));
  }
  return findings;
}

function validateSchemaShape(envelope: ContinuityEnvelope, spec: ValidatorSpec): ValidationFinding[] {
  const findings = validateEnvelopeCommon(envelope);
  const currentSchemaId = getSchemaId(envelope.currentSchema);
  const envelopeSchemaId = getSchemaId(envelope.envelopeSchema);
  if (currentSchemaId !== spec.expectedCurrentSchema) {
    findings.push(createFinding({
      code: `${spec.expectedCurrentSchema}-current-schema-mismatch`,
      severity: "error",
      message: `Expected Current Schema ${spec.expectedCurrentSchema}.`,
      targetSurface: "schema",
      ruleSource: spec.validatorId
    }));
  }
  if (envelopeSchemaId !== spec.expectedEnvelopeSchema) {
    findings.push(createFinding({
      code: `${spec.expectedCurrentSchema}-envelope-schema-mismatch`,
      severity: "error",
      message: `Expected Envelope Schema ${spec.expectedEnvelopeSchema}.`,
      targetSurface: "schema",
      ruleSource: spec.validatorId
    }));
  }
  return findings;
}

function asSupportedSchemaId(schemaId: string | undefined): SupportedSchemaId | undefined {
  if (schemaId === "tiinex.root.v1" || schemaId === "tiinex.topic.v1" || schemaId === "tiinex.task.v1") {
    return schemaId;
  }
  return undefined;
}

export function validateArtifact(input: ValidateArtifactInput): ValidateArtifactResult {
  const resolved = resolveArtifact(input);
  const compatibilityNotes = ["initial validator coverage: continuity envelope only"];
  if (!resolved.source.rawContent) {
    return {
      ...createOutputMetadata("validateArtifact"),
      compatibilityNotes,
      status: resolved.status === "blocked" ? "blocked" : "incomplete",
      source: resolved.source,
      artifact: resolved.artifact,
      findings: [createFinding({
        code: "raw-source-unavailable",
        severity: "warning",
        message: "Exact validation is blocked because raw source is unavailable.",
        targetSurface: "source",
        ruleSource: "Milestone 1 / Raw Source Requirements"
      })],
      validationBasis: createValidationBasis({
        artifactCanonicalId: resolved.artifact.canonicalArtifactId,
        artifactOriginReference: resolved.source.inputReference,
        artifactContentHash: resolved.artifact.contentHash,
        artifactRawSourceStatus: resolved.source.rawContentAvailability,
        governingSchemaId: undefined,
        governingSchemaReference: undefined,
        governingSchemaContentHash: undefined,
        validatorId: undefined,
        validatorVersion: undefined,
        validationPolicyVersion: "0.1.0",
        schemaResolutionComplete: false,
        usedRawSource: false,
        exactValidationBlocked: true,
        partialValidation: true
      }),
      complete: false,
      rawReadNeededForNextStep: true,
      budgets: resolved.budgets
    };
  }

  const envelope = parseContinuityEnvelope(resolved.source.rawContent);
  const governingSchemaId = asSupportedSchemaId(getSchemaId(envelope.currentSchema));
  if (!governingSchemaId) {
    return {
      ...createOutputMetadata("validateArtifact"),
      compatibilityNotes,
      status: "incomplete",
      source: resolved.source,
      artifact: resolved.artifact,
      governingSchemaId: getSchemaId(envelope.currentSchema),
      findings: [createFinding({
        code: "validator-unavailable-for-schema",
        severity: "warning",
        message: "No shared validator is implemented yet for this governing schema.",
        targetSurface: "schema",
        sourceAnchor: envelope.currentSchema?.target,
        ruleSource: "Milestone 1 / ValidateArtifact"
      })],
      validationBasis: createValidationBasis({
        artifactCanonicalId: resolved.artifact.canonicalArtifactId,
        artifactOriginReference: resolved.source.inputReference,
        artifactContentHash: resolved.artifact.contentHash,
        artifactRawSourceStatus: resolved.source.rawContentAvailability,
        governingSchemaId: getSchemaId(envelope.currentSchema),
        governingSchemaReference: envelope.currentSchema?.target,
        governingSchemaContentHash: undefined,
        validatorId: undefined,
        validatorVersion: undefined,
        validationPolicyVersion: "0.1.0",
        schemaResolutionComplete: Boolean(envelope.currentSchema),
        usedRawSource: true,
        exactValidationBlocked: false,
        partialValidation: true
      }),
      complete: false,
      rawReadNeededForNextStep: false,
      budgets: resolved.budgets
    };
  }

  const spec = VALIDATORS[governingSchemaId];
  const findings = validateSchemaShape(envelope, spec);
  return {
    ...createOutputMetadata("validateArtifact"),
    compatibilityNotes,
    status: findings.some((finding) => finding.severity === "error") ? "invalid" : "ok",
    source: resolved.source,
    artifact: resolved.artifact,
    governingSchemaId,
    findings,
    validationBasis: createValidationBasis({
      artifactCanonicalId: resolved.artifact.canonicalArtifactId,
      artifactOriginReference: resolved.source.inputReference,
      artifactContentHash: resolved.artifact.contentHash,
      artifactRawSourceStatus: resolved.source.rawContentAvailability,
      governingSchemaId,
      governingSchemaReference: envelope.currentSchema?.target,
      governingSchemaContentHash: undefined,
      validatorId: spec.validatorId,
      validatorVersion: spec.validatorVersion,
      validationPolicyVersion: "0.1.0",
      schemaResolutionComplete: Boolean(envelope.currentSchema),
      usedRawSource: true,
      exactValidationBlocked: false,
      partialValidation: true
    }),
    complete: findings.length === 0,
    rawReadNeededForNextStep: false,
    budgets: resolved.budgets
  };
}