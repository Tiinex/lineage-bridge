import { existsSync, readdirSync, statSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const TRACE_FILE_SUFFIX = ".trace.md";
const DOCS_SCHEMA_LINK_RE = /^(https:\/\/github\.com\/Tiinex\/docs\/blob\/([^/]+)\/(\.topics\/\.schemas\/[^)\s]+\.schema\.md))$/u;
const SCHEMA_FIELD_RE = /^\s*-\s+(Envelope Schema|Parent Schema|Current Schema):\s+\[[^\]]+\]\(([^)]+)\)\s*$/u;

function printUsage() {
  console.error("Usage: node scripts/plan-trace-schema-link-repair.mjs <trace-or-directory> [moreTargets...] [--docs-root <path>] [--apply]");
}

function parseArgs(argv) {
  const targets = [];
  let docsRoot = path.resolve(__dirname, "..", "..", "docs");
  let apply = false;

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--apply") {
      apply = true;
      continue;
    }
    if (value === "--docs-root") {
      const nextValue = argv[index + 1];
      if (!nextValue) {
        throw new Error("Missing value for --docs-root");
      }
      docsRoot = path.resolve(nextValue);
      index += 1;
      continue;
    }
    targets.push(path.resolve(value));
  }

  if (targets.length === 0) {
    throw new Error("At least one trace file or directory target is required.");
  }

  return { targets, docsRoot, apply };
}

function collectTraceFiles(targetPath) {
  const stats = statSync(targetPath);
  if (stats.isFile()) {
    return targetPath.endsWith(TRACE_FILE_SUFFIX) ? [targetPath] : [];
  }
  if (!stats.isDirectory()) {
    return [];
  }

  const collected = [];
  for (const entry of readdirSync(targetPath, { withFileTypes: true })) {
    const entryPath = path.join(targetPath, entry.name);
    if (entry.isDirectory()) {
      collected.push(...collectTraceFiles(entryPath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(TRACE_FILE_SUFFIX)) {
      collected.push(entryPath);
    }
  }
  return collected;
}

function getDocsHeadCommit(docsRoot) {
  return execFileSync("git", ["-C", docsRoot, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
}

function findSchemaOrigins(lines) {
  const results = [];
  let currentSection = "";
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const headingMatch = line.match(/^\s*-\s+(Envelope Schema|Parent Schema|Current Schema):\s+/u);
    if (headingMatch) {
      currentSection = headingMatch[1];
    }
    const originMatch = line.match(/^\s*-\s+\[relative\]\(([^)]+\.schema\.md)\)\s*$/u);
    if (originMatch) {
      results.push({ lineNumber: index + 1, relativeTarget: originMatch[1], nearbySection: currentSection || undefined });
    }
  }
  return results;
}

async function probeReferenceReachability(reference, cache) {
  if (cache.has(reference)) {
    return cache.get(reference);
  }

  const probePromise = fetch(reference, {
    method: "GET",
    redirect: "follow"
  }).then((response) => ({
    ok: response.ok,
    status: response.status
  })).catch((error) => ({
    ok: false,
    status: 0,
    error: error instanceof Error ? error.message : String(error)
  }));

  cache.set(reference, probePromise);
  return probePromise;
}

async function inspectTraceFile(filePath, docsRoot, docsHeadCommit, reachabilityCache) {
  const markdown = await readFile(filePath, "utf8");
  const lines = markdown.split(/\r?\n/u);
  const relativeOrigins = findSchemaOrigins(lines);
  const schemaLinks = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = line.match(SCHEMA_FIELD_RE);
    if (!match) {
      continue;
    }
    const field = match[1];
    const reference = match[2];
    const docsMatch = reference.match(DOCS_SCHEMA_LINK_RE);
    if (!docsMatch) {
      continue;
    }

    const currentCommit = docsMatch[2];
    const schemaRelativePath = docsMatch[3];
    const localSchemaPath = path.join(docsRoot, ...schemaRelativePath.split("/"));
    const schemaExistsAtHead = existsSync(localSchemaPath);
    const reachability = await probeReferenceReachability(reference, reachabilityCache);
    const suggestedReference = schemaExistsAtHead
      ? `https://github.com/Tiinex/docs/blob/${docsHeadCommit}/${schemaRelativePath}`
      : undefined;
    const matchingRelativeOrigins = relativeOrigins.filter((entry) => path.posix.normalize(entry.relativeTarget) === path.posix.normalize(path.posix.relative(path.posix.dirname(filePath.replace(/\\/gu, "/")), localSchemaPath.replace(/\\/gu, "/"))));

    schemaLinks.push({
      field,
      lineNumber: index + 1,
      currentReference: reference,
      currentCommit,
      reachability,
      schemaRelativePath,
      schemaExistsAtDocsHead: schemaExistsAtHead,
      suggestedReference,
      status: currentCommit === docsHeadCommit
        ? "current"
        : reachability.ok
          ? "pinned-reachable"
          : schemaExistsAtHead
            ? "candidate-rewrite"
            : "unresolved",
      matchingRelativeOrigins
    });
  }

  return {
    filePath,
    originalMarkdown: markdown,
    schemaLinks,
    hasRewriteCandidate: schemaLinks.some((entry) => entry.status === "candidate-rewrite")
  };
}

function applyRewritePlan(inspectedFile) {
  let updatedMarkdown = inspectedFile.originalMarkdown;
  const appliedRewrites = [];

  for (const schemaLink of inspectedFile.schemaLinks) {
    if (schemaLink.status !== "candidate-rewrite" || !schemaLink.suggestedReference) {
      continue;
    }
    updatedMarkdown = updatedMarkdown.replace(schemaLink.currentReference, schemaLink.suggestedReference);
    appliedRewrites.push({
      field: schemaLink.field,
      lineNumber: schemaLink.lineNumber,
      from: schemaLink.currentReference,
      to: schemaLink.suggestedReference
    });
  }

  return {
    filePath: inspectedFile.filePath,
    changed: appliedRewrites.length > 0,
    appliedRewrites,
    updatedMarkdown
  };
}

async function main() {
  let parsed;
  try {
    parsed = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    printUsage();
    process.exitCode = 1;
    return;
  }

  const docsHeadCommit = getDocsHeadCommit(parsed.docsRoot);
  const traceFiles = [...new Set(parsed.targets.flatMap((target) => collectTraceFiles(target)))].sort();
  const reachabilityCache = new Map();
  const inspected = await Promise.all(traceFiles.map((filePath) => inspectTraceFile(filePath, parsed.docsRoot, docsHeadCommit, reachabilityCache)));

  const result = {
    tool: "plan-trace-schema-link-repair",
    mode: parsed.apply ? "apply" : "dry-run",
    docsRoot: parsed.docsRoot,
    docsHeadCommit,
    inspectedFileCount: inspected.length,
    candidateFileCount: inspected.filter((entry) => entry.hasRewriteCandidate).length,
    files: inspected.filter((entry) => entry.schemaLinks.length > 0)
  };

  if (parsed.apply) {
    const applied = [];
    for (const inspectedFile of inspected) {
      const rewrite = applyRewritePlan(inspectedFile);
      if (rewrite.changed) {
        await writeFile(rewrite.filePath, rewrite.updatedMarkdown, "utf8");
      }
      applied.push({
        filePath: rewrite.filePath,
        changed: rewrite.changed,
        appliedRewrites: rewrite.appliedRewrites
      });
    }
    process.stdout.write(`${JSON.stringify({
      ...result,
      applied
    }, null, 2)}\n`);
    return;
  }

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

await main();