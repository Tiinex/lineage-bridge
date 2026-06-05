import { type RelevantSlice, type RelevantSlicePurpose } from "@tiinex/lineage-bridge-core";

export function selectRelevantSlices(input: {
  purpose: RelevantSlicePurpose;
  summary?: string;
  findings: string[];
  parentSummary?: string;
  lineageStoppedBecause?: string;
}): RelevantSlice[] {
  const slices: RelevantSlice[] = [];
  const includeSummary = input.purpose !== "schema-review";
  const includeParentSummary = input.purpose === "handoff"
    || input.purpose === "planner"
    || input.purpose === "implementation"
    || input.purpose === "provenance-inspection";
  const includeFindings = input.purpose !== "implementation";

  if (includeSummary && input.summary) {
    slices.push({
      label: "current-summary",
      whySelected: "This is the smallest current-leaf orientation slice.",
      excerpt: input.summary
    });
  }
  if (includeFindings && input.findings.length > 0) {
    slices.push({
      label: "important-findings",
      whySelected: input.purpose === "validation-repair"
        ? "These findings define the repair surface directly."
        : "These findings change what a fresh reader can trust immediately.",
      excerpt: input.findings.join(" | ")
    });
  }
  if (includeParentSummary && input.parentSummary) {
    slices.push({
      label: "direct-parent-summary",
      whySelected: "This keeps continuity local without widening to the full parent chain.",
      excerpt: input.parentSummary
    });
  }
  if ((input.purpose === "handoff" || input.purpose === "provenance-inspection") && input.lineageStoppedBecause && input.lineageStoppedBecause !== "complete") {
    slices.push({
      label: "lineage-stop",
      whySelected: "This shows exactly why the current lineage view is bounded or incomplete.",
      excerpt: input.lineageStoppedBecause
    });
  }
  return slices;
}

export function getIntentionallyExcluded(input: {
  purpose: RelevantSlicePurpose;
  includeRawContent: boolean;
}): string[] {
  return [
    ...(!input.includeRawContent ? ["full raw artifact body"] : []),
    ...(input.purpose !== "provenance-inspection" ? ["full parent chain"] : []),
    ...(input.purpose !== "schema-review" ? ["full schema contract"] : []),
    "unrelated sibling artifacts"
  ];
}