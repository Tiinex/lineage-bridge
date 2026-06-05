import { type ContinuityEnvelope, type ContinuityOriginSet, type ParsedContractSection } from "@tiinex/lineage-bridge-core";

function createOriginSet(): ContinuityOriginSet {
  return {
    unknownEntries: []
  };
}

export function parseContinuityEnvelope(markdown: string): ContinuityEnvelope {
  const lines = markdown.replace(/\r\n?/gu, "\n").split("\n");
  const envelope: ContinuityEnvelope = {
    parentOrigin: createOriginSet(),
    currentOrigin: createOriginSet(),
    unknownEnvelopeFields: []
  };
  let mode: "root" | "parent" | "current" | "parent-origin" | "current-origin" | "integrity" | undefined;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "# Continuity Context") {
      mode = "root";
      continue;
    }
    if (trimmed === "# Continuity Integrity") {
      mode = "integrity";
      continue;
    }
    if (!mode) {
      continue;
    }
    if (trimmed === "---") {
      mode = undefined;
      continue;
    }
    if (mode === "integrity") {
      const towardsMatch = trimmed.match(/^-\s+Towards:\s+\[(.*?)\]\((.*?)\)$/u);
      if (towardsMatch) {
        envelope.integrity = {
          ...envelope.integrity,
          towards: { label: towardsMatch[1].trim(), target: towardsMatch[2].trim() }
        };
        continue;
      }
      const towardsValueMatch = trimmed.match(/^-\s+Towards:\s+(.*)$/u);
      if (towardsValueMatch) {
        const target = towardsValueMatch[1].trim();
        envelope.integrity = {
          ...envelope.integrity,
          towards: { label: target, target }
        };
        continue;
      }
      const methodMatch = trimmed.match(/^-[ ]+([^\s].*)$/u);
      if (methodMatch && !envelope.integrity?.method) {
        envelope.integrity = { method: methodMatch[1] };
        continue;
      }
      const valueMatch = trimmed.match(/^-\s+Value:\s+(.*)$/u);
      if (valueMatch) {
        envelope.integrity = {
          ...envelope.integrity,
          value: valueMatch[1].trim()
        };
      }
      continue;
    }
    if (trimmed === "- Parent") {
      mode = "parent";
      continue;
    }
    if (trimmed === "- Current") {
      mode = "current";
      continue;
    }
    if (/^(?: {2,}|\t+)-\s+Origin:\s*$/u.test(line)) {
      mode = mode === "parent" ? "parent-origin" : mode === "current" ? "current-origin" : mode;
      continue;
    }
    const linkMatch = trimmed.match(/^-\s+([^:]+):\s+\[(.*?)\]\((.*?)\)$/u);
    const valueMatch = trimmed.match(/^-\s+([^:]+):\s+(.*)$/u);
    if (mode === "root" && linkMatch && linkMatch[1] === "Envelope Schema") {
      envelope.envelopeSchema = { label: linkMatch[2].trim(), target: linkMatch[3].trim() };
      continue;
    }
    if (mode === "parent" && linkMatch) {
      if (linkMatch[1] === "Parent Schema") {
        envelope.parentSchema = { label: linkMatch[2].trim(), target: linkMatch[3].trim() };
        continue;
      }
      if (linkMatch[1] === "Trace" || linkMatch[1] === "Parent Trace") {
        envelope.parentTrace = { label: linkMatch[2].trim(), target: linkMatch[3].trim() };
        continue;
      }
    }
    if (mode === "current" && linkMatch && linkMatch[1] === "Current Schema") {
      envelope.currentSchema = { label: linkMatch[2].trim(), target: linkMatch[3].trim() };
      continue;
    }
    if (mode === "parent-origin" || mode === "current-origin") {
      const originLinkMatch = line.match(/^(?: {4,}|\t{2,})-\s+\[(.*?)\]\((.*?)\)\s*$/u);
      if (originLinkMatch) {
        const originSet = mode === "parent-origin" ? envelope.parentOrigin! : envelope.currentOrigin!;
        const label = originLinkMatch[1].trim();
        const target = originLinkMatch[2].trim();
        if (label === "relative") {
          originSet.relative = target;
        } else if (label === "absolute") {
          originSet.absolute = target;
        } else if (label === "browse + git") {
          originSet.browseGit = target;
        } else {
          originSet.unknownEntries.push({ label, value: target });
        }
        continue;
      }
    }
    if (mode === "parent" && valueMatch?.[1] === "Created At") {
      envelope.parentCreatedAt = valueMatch[2].trim();
      continue;
    }
    if (mode === "current" && valueMatch) {
      if (valueMatch[1] === "Created At") {
        envelope.currentCreatedAt = valueMatch[2].trim();
        continue;
      }
      if (valueMatch[1] === "Summary") {
        envelope.currentSummary = valueMatch[2].trim();
        continue;
      }
    }
    if (valueMatch && (mode === "root" || mode === "parent" || mode === "current")) {
      envelope.unknownEnvelopeFields.push({
        section: mode,
        label: valueMatch[1].trim(),
        value: valueMatch[2].trim()
      });
    }
  }
  return envelope;
}

export function parseContractSection(markdown: string, sectionName: ParsedContractSection["sectionName"]): ParsedContractSection | undefined {
  const lines = markdown.replace(/\r\n?/gu, "\n").split("\n");
  const sectionHeader = `## ${sectionName}`;
  const startIndex = lines.findIndex((line) => line.trim() === sectionHeader);
  if (startIndex < 0) {
    return undefined;
  }
  const result: ParsedContractSection = {
    sectionName,
    groups: [],
    duplicateGroupHeadings: [],
    duplicateNamedDeclarations: [],
    categoriesMissingLists: [],
    unlabeledHyphenListLines: [],
    starBulletLines: [],
    unexpectedContentLines: []
  };
  const seenGroups = new Set<string>();
  let seenNamedDeclarations = new Set<string>();
  let currentGroup: ParsedContractSection["groups"][number] | undefined;
  let currentCategory: ParsedContractSection["groups"][number]["categories"][number] | undefined;

  let currentDeclarationName: string | undefined;
  let currentDeclarationHasNestedFields = false;

  function flushDeclaration(): void {
    if (!currentGroup || !currentDeclarationName || !currentDeclarationHasNestedFields) {
      currentDeclarationName = undefined;
      currentDeclarationHasNestedFields = false;
      return;
    }
    if (seenNamedDeclarations.has(currentDeclarationName)) {
      result.duplicateNamedDeclarations.push({
        groupHeading: currentGroup.heading,
        declarationName: currentDeclarationName
      });
    } else {
      seenNamedDeclarations.add(currentDeclarationName);
    }
    currentDeclarationName = undefined;
    currentDeclarationHasNestedFields = false;
  }

  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index]!;
    const trimmed = line.trim();
    if (trimmed.startsWith("## ")) {
      flushDeclaration();
      break;
    }
    if (!trimmed) {
      continue;
    }
    if (trimmed.startsWith("### ")) {
      flushDeclaration();
      const heading = trimmed.slice(4).trim();
      if (seenGroups.has(heading)) {
        result.duplicateGroupHeadings.push(heading);
      }
      seenGroups.add(heading);
      currentGroup = { heading, categories: [] };
      result.groups.push(currentGroup);
      seenNamedDeclarations = new Set<string>();
      currentCategory = undefined;
      continue;
    }
    if (/^-\s+/u.test(line)) {
      if (!currentCategory) {
        result.unlabeledHyphenListLines.push(trimmed);
        continue;
      }
      flushDeclaration();
      currentDeclarationName = trimmed.slice(2).trim();
      currentCategory.items.push(trimmed.slice(2).trim());
      continue;
    }
    if (/^(?: {2,}|\t+)-\s+/u.test(line)) {
      if (currentDeclarationName) {
        currentDeclarationHasNestedFields = true;
      }
      if (!currentCategory) {
        result.unlabeledHyphenListLines.push(trimmed);
        continue;
      }
      currentCategory.items.push(trimmed.replace(/^(?: {2,}|\t+)-\s+/u, "").trim());
      continue;
    }
    if (trimmed.startsWith("* ")) {
      flushDeclaration();
      result.starBulletLines.push(trimmed);
      continue;
    }
    if (!currentGroup) {
      flushDeclaration();
      result.unexpectedContentLines.push(trimmed);
      continue;
    }
    flushDeclaration();
    if (currentCategory && currentCategory.items.length === 0) {
      result.categoriesMissingLists.push(currentCategory.label);
    }
    currentCategory = { label: trimmed, items: [] };
    currentGroup.categories.push(currentCategory);
  }
  flushDeclaration();
  if (currentCategory && currentCategory.items.length === 0) {
    result.categoriesMissingLists.push(currentCategory.label);
  }
  return result;
}

export function parseSchemaContracts(markdown: string): {
  schemaValidationContract?: ParsedContractSection;
  artifactCreationContract?: ParsedContractSection;
} {
  return {
    schemaValidationContract: parseContractSection(markdown, "Schema Validation Contract"),
    artifactCreationContract: parseContractSection(markdown, "Artifact Creation Contract")
  };
}