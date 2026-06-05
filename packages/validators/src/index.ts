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

interface ParsedBodyShape {
  firstHeading?: { level: number; text: string };
  headings: string[];
  proseParagraphs: string[];
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

function parseBodyShape(markdown: string): ParsedBodyShape {
  const lines = markdown.replace(/\r\n?/gu, "\n").split("\n");
  const bodyLines: string[] = [];
  let inBody = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "# Continuity Context") {
      inBody = false;
      continue;
    }
    if (trimmed === "# Continuity Integrity") {
      break;
    }
    if (trimmed === "---") {
      inBody = !inBody;
      continue;
    }
    if (inBody) {
      bodyLines.push(line);
    }
  }

  const headings: string[] = [];
  const proseParagraphs: string[] = [];
  let firstHeading: ParsedBodyShape["firstHeading"];
  let currentParagraph: string[] = [];

  function flushParagraph(): void {
    if (currentParagraph.length === 0) {
      return;
    }
    proseParagraphs.push(currentParagraph.join(" ").trim());
    currentParagraph = [];
  }

  for (const line of bodyLines) {
    const trimmed = line.trim();
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/u);
    if (!trimmed) {
      flushParagraph();
      continue;
    }
    if (headingMatch) {
      flushParagraph();
      const heading = { level: headingMatch[1].length, text: headingMatch[2].trim() };
      firstHeading ??= heading;
      headings.push(heading.text);
      continue;
    }
    if (/^[-*]\s+/u.test(trimmed)) {
      flushParagraph();
      continue;
    }
    currentParagraph.push(trimmed);
  }
  flushParagraph();

  return { firstHeading, headings, proseParagraphs };
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
  if (!envelope.integrity?.method) {
    findings.push(createFinding({
      code: "continuity-integrity-method-missing",
      severity: "error",
      message: "Continuity Integrity must declare a method.",
      targetSurface: "integrity",
      ruleSource: "Milestone 1 / Root Integrity"
    }));
  }
  if (!envelope.integrity?.value) {
    findings.push(createFinding({
      code: "continuity-integrity-value-missing",
      severity: "error",
      message: "Continuity Integrity must declare a value.",
      targetSurface: "integrity",
      ruleSource: "Milestone 1 / Root Integrity"
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

function validateBodyCommon(rawContent: string, schemaId: SupportedSchemaId, validatorId: string): ValidationFinding[] {
  const body = parseBodyShape(rawContent);
  const findings: ValidationFinding[] = [];
  if (!body.firstHeading || body.firstHeading.level !== 1) {
    findings.push(createFinding({
      code: `${schemaId}-body-heading-missing`,
      severity: "error",
      message: "Artifact body must begin with a first-level human-readable heading after the continuity envelope.",
      targetSurface: "artifact",
      ruleSource: validatorId
    }));
  }
  if (body.proseParagraphs.length === 0) {
    findings.push(createFinding({
      code: `${schemaId}-body-prose-missing`,
      severity: "error",
      message: "Artifact body must include readable prose, not only headings or list fragments.",
      targetSurface: "artifact",
      ruleSource: validatorId
    }));
  }
  return findings;
}

function hasHeadingLike(headings: string[], patterns: RegExp[]): boolean {
  return headings.some((heading) => patterns.some((pattern) => pattern.test(heading)));
}

function validateSchemaBody(rawContent: string, schemaId: SupportedSchemaId, spec: ValidatorSpec): ValidationFinding[] {
  const body = parseBodyShape(rawContent);
  const findings = validateBodyCommon(rawContent, schemaId, spec.validatorId);
  if (schemaId === "tiinex.topic.v1") {
    if (!hasHeadingLike(body.headings, [/^Current Read$/u, /^Design Direction$/u, /^Next (Artifacts|Steps)$/u, /^Open Questions$/u, /^Risks$/u])) {
      findings.push(createFinding({
        code: "tiinex.topic.v1-body-orientation-missing",
        severity: "error",
        message: "Topic artifacts must expose at least one readable topic-state section such as Current Read, Design Direction, Risks, Open Questions, or Next Artifacts/Steps.",
        targetSurface: "artifact",
        ruleSource: spec.validatorId
      }));
    }
  }
  if (schemaId === "tiinex.task.v1") {
    if (!hasHeadingLike(body.headings, [/^Objective$/u, /^Requested Work$/u])) {
      findings.push(createFinding({
        code: "tiinex.task.v1-objective-missing",
        severity: "error",
        message: "Task artifacts must expose a readable work section such as Objective or Requested Work.",
        targetSurface: "artifact",
        ruleSource: spec.validatorId
      }));
    }
    if (!hasHeadingLike(body.headings, [/^Done Criteria$/u, /^Acceptance Criteria$/u])) {
      findings.push(createFinding({
        code: "tiinex.task.v1-completion-signal-missing",
        severity: "error",
        message: "Task artifacts must expose a readable completion signal such as Done Criteria or Acceptance Criteria.",
        targetSurface: "artifact",
        ruleSource: spec.validatorId
      }));
    }
    if (!hasHeadingLike(body.headings, [/^Scope$/u, /^Constraints?$/u, /^Boundaries$/u, /^Non-Goals$/u])) {
      findings.push(createFinding({
        code: "tiinex.task.v1-boundary-signal-missing",
        severity: "error",
        message: "Task artifacts must expose a readable boundary section such as Scope, Constraints, Boundaries, or Non-Goals.",
        targetSurface: "artifact",
        ruleSource: spec.validatorId
      }));
    }
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
  const resolved = resolveArtifact({ ...input, includeRawContent: true });
  const compatibilityNotes = ["initial validator coverage: continuity envelope plus minimal body-shape rules only"];
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
  const findings = [
    ...validateSchemaShape(envelope, spec),
    ...validateSchemaBody(resolved.source.rawContent, governingSchemaId, spec)
  ];
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