export const BRIDGE_OUTPUT_SCHEMA_V1 = "tiinex.lineage-bridge.result.v1" as const;

export type BridgeToolName = "resolveArtifact" | "readEnvelope" | "validateArtifact" | "getLineage" | "getHandoffPacket" | "getRelevantSlice" | "getSchemaContract" | "getValidationOverlay" | "getAvailableActions" | "getStructureIndex" | "getTreeProjection" | "getNodeDetails" | "getNodeChildren";

export type BridgeTopLevelStatus = "ok" | "invalid" | "unavailable" | "unsupported" | "incomplete" | "blocked";

export type OriginAccessStatus =
  | "readable"
  | "not-found"
  | "unauthorized"
  | "unsupported-origin"
  | "network-failure"
  | "malformed-reference";

export type RawContentAvailability = "available" | "unavailable" | "rendered-only";

export type ExactValidationCapability = "available" | "blocked" | "unknown";

export type OriginMutability = "immutable" | "mutable" | "unknown";

export interface BridgeOutputMetadata {
  bridgeOutputSchema: typeof BRIDGE_OUTPUT_SCHEMA_V1;
  toolName: BridgeToolName;
  toolShapeVersion: 1;
  compatibilityNotes?: string[];
}

export interface OperationalBudgetState {
  truncated: boolean;
  exhausted: string[];
}

export interface ArtifactIdentity {
  canonicalArtifactId?: string;
  immutableSourceIdentity?: string;
  identityFamilyKey?: string;
  aliases: string[];
  identityInputsUsed: string[];
  identityConfidence: "high" | "medium" | "low";
  contentHash?: string;
  provisional: boolean;
}

export interface ResolvedArtifactSource {
  originKind: "github-blob" | "github-raw" | "local-file" | "unsupported";
  inputReference: string;
  normalizedReference?: string;
  path?: string;
  ref?: string;
  versioned: boolean;
  immutable: boolean;
  mutability: OriginMutability;
  accessStatus: OriginAccessStatus;
  rawContentAvailability: RawContentAvailability;
  renderedContentAvailability: boolean;
  exactValidationCapability: ExactValidationCapability;
  exactValidationBlockedBySourceForm: boolean;
  contentHash?: string;
  rawContent?: string;
  rawReadNeededForNextStep: boolean;
  warnings: string[];
}

export interface ContinuityReference {
  label?: string;
  target?: string;
}

export interface ContinuityOriginSet {
  relative?: string;
  absolute?: string;
  browseGit?: string;
  unknownEntries: Array<{ label: string; value: string }>;
}

export interface ContinuityEnvelope {
  envelopeSchema?: ContinuityReference;
  parentSchema?: ContinuityReference;
  parentTrace?: ContinuityReference;
  parentCreatedAt?: string;
  parentOrigin?: ContinuityOriginSet;
  currentSchema?: ContinuityReference;
  currentCreatedAt?: string;
  currentSummary?: string;
  currentOrigin?: ContinuityOriginSet;
  unknownEnvelopeFields: Array<{ section: "root" | "parent" | "current"; label: string; value: string }>;
  integrity?: {
    method?: string;
    towards?: ContinuityReference;
    value?: string;
  };
}

export interface ResolveArtifactResult extends BridgeOutputMetadata {
  status: BridgeTopLevelStatus;
  source: ResolvedArtifactSource;
  artifact: ArtifactIdentity;
  complete: boolean;
  rawReadNeededForNextStep: boolean;
  budgets: OperationalBudgetState;
}

export interface ReadEnvelopeResult extends BridgeOutputMetadata {
  status: BridgeTopLevelStatus;
  source: ResolvedArtifactSource;
  artifact: ArtifactIdentity;
  envelope?: ContinuityEnvelope;
  complete: boolean;
  rawReadNeededForNextStep: boolean;
  budgets: OperationalBudgetState;
}

export type FindingSeverity = "error" | "warning" | "info";

export interface ValidationFinding {
  findingShapeVersion: 1;
  code: string;
  severity: FindingSeverity;
  message: string;
  targetSurface: "artifact" | "envelope" | "integrity" | "schema" | "source";
  sourceAnchor?: string;
  ruleSource?: string;
}

export interface ValidationBasis {
  artifactCanonicalId?: string;
  artifactOriginReference: string;
  artifactContentHash?: string;
  artifactRawSourceStatus: RawContentAvailability;
  governingSchemaId?: string;
  governingSchemaReference?: string;
  governingSchemaContentHash?: string;
  validatorId?: string;
  validatorVersion?: string;
  validationPolicyVersion: string;
  outputShapeVersion: 1;
  schemaResolutionComplete: boolean;
  usedRawSource: boolean;
  exactValidationBlocked: boolean;
  partialValidation: boolean;
}

export interface CompactSchemaContract {
  schemaId?: string;
  validationAuthority: string[];
  generationAuthority: string[];
  integrityAuthority: string[];
  knownCategoryLabels: string[];
  requiredGroups: string[];
  policyGroups: string[];
  schemaSourceReference?: string;
  schemaContentHash?: string;
  unresolved: boolean;
}

export interface ParsedContractGroup {
  heading: string;
  categories: Array<{
    label: string;
    items: string[];
  }>;
}

export interface ParsedContractSection {
  sectionName: "Schema Validation Contract" | "Artifact Creation Contract";
  groups: ParsedContractGroup[];
  duplicateGroupHeadings: string[];
  categoriesMissingLists: string[];
  unlabeledHyphenListLines: string[];
  starBulletLines: string[];
  unexpectedContentLines: string[];
}

export interface CompactHandoffPacket {
  handoffShapeVersion: 1;
  canonicalArtifactId?: string;
  governingSchemaId?: string;
  validationStatus: BridgeTopLevelStatus;
  validationBasis?: ValidationBasis;
  importantFindings: ValidationFinding[];
  parentSummary?: string;
  originCandidates: string[];
  nextSuggestedAction?: string;
  doNotTraverseHints: string[];
}

export interface RelevantSlice {
  label: string;
  whySelected: string;
  excerpt?: string;
}

export type RelevantSlicePurpose =
  | "planner"
  | "implementation"
  | "validation-repair"
  | "schema-review"
  | "handoff"
  | "provenance-inspection"
  | "tree-projection";

export interface HandoffCurrentLeaf {
  summary?: string;
  nextAction?: string;
  nonGoals: string[];
}

export interface HandoffPacketArtifactSummary {
  canonicalArtifactId?: string;
  origin: string;
  reference: string;
  path?: string;
  schema?: string;
  summary?: string;
  contentHash?: string;
  aliases: string[];
}

export interface HandoffPacketContinuitySummary {
  parent?: {
    canonicalArtifactId?: string;
    summary?: string;
    traceTarget?: string;
    schemaId?: string;
  };
  originCandidates: string[];
}

export interface HandoffPacketBody {
  handoffShapeVersion: 1;
  artifact: HandoffPacketArtifactSummary;
  validation: {
    status: BridgeTopLevelStatus;
    rawValidatorStatus: BridgeTopLevelStatus;
    basis: ValidationBasis;
    findings: ValidationFinding[];
  };
  continuity: HandoffPacketContinuitySummary;
  currentLeaf: HandoffCurrentLeaf;
  relevantSlices: RelevantSlice[];
  doNotTraverse: string[];
  budgets: OperationalBudgetState;
}

export interface GetHandoffPacketResult extends BridgeOutputMetadata {
  status: BridgeTopLevelStatus;
  handoff: HandoffPacketBody;
  complete: boolean;
  rawReadNeededForNextStep: boolean;
  budgets: OperationalBudgetState;
}

export interface GetRelevantSliceResult extends BridgeOutputMetadata {
  status: BridgeTopLevelStatus;
  purpose: RelevantSlicePurpose;
  artifact: HandoffPacketArtifactSummary;
  selectedSlices: RelevantSlice[];
  intentionallyExcluded: string[];
  rawContent?: string;
  complete: boolean;
  rawReadNeededForNextStep: boolean;
  budgets: OperationalBudgetState;
}

export interface GetSchemaContractResult extends BridgeOutputMetadata {
  status: BridgeTopLevelStatus;
  contract: CompactSchemaContract;
  fullContract?: {
    schemaValidationContract?: ParsedContractSection;
    artifactCreationContract?: ParsedContractSection;
  };
  complete: boolean;
  rawReadNeededForNextStep: boolean;
  budgets: OperationalBudgetState;
}

export interface GetValidationOverlayResult extends BridgeOutputMetadata {
  status: BridgeTopLevelStatus;
  aggregateSeverity: "none" | FindingSeverity;
  findingCounts: Record<FindingSeverity, number>;
  directValidationState: BridgeTopLevelStatus;
  lineageValidationState?: "complete" | LineageStoppedBecause;
  partialValidation: boolean;
  exactValidationBlocked: boolean;
  schemaResolutionComplete: boolean;
  complete: boolean;
  rawReadNeededForNextStep: boolean;
  budgets: OperationalBudgetState;
}

export interface AvailableAction {
  actionId:
    | "open-artifact"
    | "open-origin"
    | "open-parent"
    | "validate"
    | "copy-handoff"
    | "copy-relevant-slice"
    | "inspect-schema-contract";
  title: string;
  enabled: boolean;
  reason: string;
}

export interface GetAvailableActionsResult extends BridgeOutputMetadata {
  status: BridgeTopLevelStatus;
  actions: AvailableAction[];
  complete: boolean;
  rawReadNeededForNextStep: boolean;
  budgets: OperationalBudgetState;
}

export interface StructureIndexNode {
  nodeId: string;
  artifact: ArtifactIdentity;
  primaryReference: string;
  schemaId?: string;
  summary?: string;
  parentEdge?: {
    traceTarget?: string;
    schemaId?: string;
  };
  originCandidates: string[];
  validationSummary: {
    status: BridgeTopLevelStatus;
    aggregateSeverity: "none" | FindingSeverity;
    findingCounts: Record<FindingSeverity, number>;
    partialValidation: boolean;
    exactValidationBlocked: boolean;
    schemaResolutionComplete: boolean;
    compatibilityNotes: string[];
  };
  aliasCollapsed: boolean;
  aliasConflict: boolean;
  references: string[];
}

export interface GetStructureIndexResult extends BridgeOutputMetadata {
  status: BridgeTopLevelStatus;
  nodes: StructureIndexNode[];
  complete: boolean;
  rawReadNeededForNextStep: boolean;
  budgets: OperationalBudgetState;
}

export interface TreeProjectionNode {
  projectionShapeVersion: 1;
  nodeId: string;
  canonicalArtifactId?: string;
  parentNodeId?: string;
  childNodeIds: string[];
  displayLabel: string;
  schemaId?: string;
  validationStatus: BridgeTopLevelStatus;
  aggregateSeverity: "none" | FindingSeverity;
  partialValidation: boolean;
  exactValidationBlocked: boolean;
  schemaResolutionComplete: boolean;
  compatibilityNotes: string[];
  hasMissingParent: boolean;
  hasOriginRecovery: boolean;
  hasAliasOrDuplicateSignal: boolean;
}

export interface GetTreeProjectionResult extends BridgeOutputMetadata {
  status: BridgeTopLevelStatus;
  projectionShapeVersion: 1;
  totalNodes: number;
  nodes: TreeProjectionNode[];
  complete: boolean;
  rawReadNeededForNextStep: boolean;
  budgets: OperationalBudgetState;
}

export interface GetNodeDetailsResult extends BridgeOutputMetadata {
  status: BridgeTopLevelStatus;
  nodeId: string;
  projectionShapeVersion: 1;
  envelope?: ContinuityEnvelope;
  validationFindings: ValidationFinding[];
  validationBasis?: ValidationBasis;
  parent?: {
    traceTarget?: string;
    schemaId?: string;
  };
  originCandidates: string[];
  relevantBodySummary?: string;
  complete: boolean;
  rawReadNeededForNextStep: boolean;
  budgets: OperationalBudgetState;
}

export interface GetNodeChildrenResult extends BridgeOutputMetadata {
  status: BridgeTopLevelStatus;
  nodeId: string;
  projectionShapeVersion: 1;
  totalChildren: number;
  children: TreeProjectionNode[];
  missingOrUnreadableChildren: string[];
  complete: boolean;
  rawReadNeededForNextStep: boolean;
  budgets: OperationalBudgetState;
}

export interface TreeNodeProjection {
  projectionShapeVersion: 1;
  nodeId: string;
  canonicalArtifactId?: string;
  displayLabel: string;
  schemaId?: string;
  validationStatus?: BridgeTopLevelStatus;
  hasMissingParent: boolean;
  hasOriginRecovery: boolean;
}

export interface ValidateArtifactResult extends BridgeOutputMetadata {
  status: BridgeTopLevelStatus;
  source: ResolvedArtifactSource;
  artifact: ArtifactIdentity;
  governingSchemaId?: string;
  findings: ValidationFinding[];
  validationBasis: ValidationBasis;
  complete: boolean;
  rawReadNeededForNextStep: boolean;
  budgets: OperationalBudgetState;
}

export type LineageStoppedBecause =
  | "complete"
  | "external-parent"
  | "unreadable-parent"
  | "missing-parent"
  | "cycle-detected"
  | "max-depth"
  | "budget-exhausted";

export interface LineageNode {
  depth: number;
  artifact: ArtifactIdentity;
  source: ResolvedArtifactSource;
  schemaId?: string;
  summary?: string;
  parent?: {
    schemaId?: string;
    traceTarget?: string;
    createdAt?: string;
  };
  originCandidates: string[];
}

export interface GetLineageResult extends BridgeOutputMetadata {
  status: BridgeTopLevelStatus;
  artifact: ArtifactIdentity;
  nodes: LineageNode[];
  stoppedBecause: LineageStoppedBecause;
  originRecoveryCandidates: string[];
  complete: boolean;
  rawReadNeededForNextStep: boolean;
  budgets: OperationalBudgetState;
}

export interface ResolveArtifactInput {
  reference: string;
  maxArtifactBytes?: number;
  includeRawContent?: boolean;
}

export interface ReadEnvelopeInput extends ResolveArtifactInput {}

export interface ValidateArtifactInput extends ResolveArtifactInput {}

export interface GetLineageInput extends ResolveArtifactInput {
  maxDepth?: number;
  maxFetches?: number;
}

export interface GetHandoffPacketInput extends GetLineageInput {}

export interface GetRelevantSliceInput extends GetLineageInput {
  purpose: RelevantSlicePurpose;
  includeRawContent?: boolean;
}

export interface GetSchemaContractInput extends ResolveArtifactInput {
  includeFullContract?: boolean;
}

export interface GetValidationOverlayInput extends GetLineageInput {
  includeLineage?: boolean;
}

export interface GetAvailableActionsInput extends GetLineageInput {}

export interface GetStructureIndexInput {
  references: string[];
  maxArtifactBytes?: number;
  maxArtifacts?: number;
}

export interface GetTreeProjectionInput extends GetStructureIndexInput {
  page?: number;
  pageSize?: number;
  filterQuery?: string;
  sortBy?: "label" | "schema" | "severity";
}

export interface GetNodeDetailsInput extends GetStructureIndexInput {
  nodeId: string;
}

export interface GetNodeChildrenInput extends GetTreeProjectionInput {
  nodeId: string;
}

export function createOutputMetadata(toolName: BridgeToolName): BridgeOutputMetadata {
  return {
    bridgeOutputSchema: BRIDGE_OUTPUT_SCHEMA_V1,
    toolName,
    toolShapeVersion: 1
  };
}

export function createValidationBasis(input: Omit<ValidationBasis, "outputShapeVersion">): ValidationBasis {
  return {
    ...input,
    outputShapeVersion: 1
  };
}