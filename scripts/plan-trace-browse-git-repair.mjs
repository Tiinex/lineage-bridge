import { existsSync, readdirSync, statSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";

const TRACE_FILE_SUFFIX = ".trace.md";
const ORIGIN_ENTRY_RE = /^(\s*)-\s+\[(relative|absolute|browse \+ git)\]\((.*?)\)\s*$/u;

function printUsage() {
  console.error("Usage: node scripts/plan-trace-browse-git-repair.mjs <trace-or-directory> [moreTargets...] [--apply]");
}

function parseArgs(argv) {
  const targets = [];
  let apply = false;
  for (const value of argv) {
    if (value === "--apply") {
      apply = true;
      continue;
    }
    targets.push(path.resolve(value));
  }
  if (targets.length === 0) {
    throw new Error("At least one trace file or directory target is required.");
  }
  return { targets, apply };
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

function resolveGitRoot(startPath) {
  let currentPath = path.resolve(startPath);
  while (true) {
    if (existsSync(path.join(currentPath, ".git"))) {
      return currentPath;
    }
    const parentPath = path.dirname(currentPath);
    if (parentPath === currentPath) {
      return undefined;
    }
    currentPath = parentPath;
  }
}

function normalizeGitHubBrowseBaseUrl(remoteUrl) {
  const trimmed = typeof remoteUrl === "string" ? remoteUrl.trim() : "";
  if (!trimmed) {
    return undefined;
  }
  const sshMatch = trimmed.match(/^git@github\.com:(.+?)(?:\.git)?$/iu);
  if (sshMatch) {
    return `https://github.com/${sshMatch[1]}`;
  }
  const httpsMatch = trimmed.match(/^https:\/\/github\.com\/(.+?)(?:\.git)?$/iu);
  if (httpsMatch) {
    return `https://github.com/${httpsMatch[1]}`;
  }
  return undefined;
}

function parseGitHubPermalink(reference) {
  const trimmed = typeof reference === "string" ? reference.trim() : "";
  if (!trimmed) {
    return undefined;
  }
  const match = trimmed.match(/^https:\/\/github\.com\/([^/]+\/[^/]+)\/blob\/([0-9a-f]{7,40})\/(.+)$/iu);
  if (!match) {
    return undefined;
  }
  return {
    repoSlug: match[1],
    revision: match[2],
    relativePath: decodeURIComponent(match[3])
  };
}

function gitPathExistsAtRevision(repoRoot, revision, relativePath) {
  try {
    execFileSync("git", ["-C", repoRoot, "cat-file", "-e", `${revision}:${relativePath}`], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function collectOriginGroups(lines) {
  const groups = [];
  let index = 0;
  while (index < lines.length) {
    const currentMatch = lines[index].match(ORIGIN_ENTRY_RE);
    if (!currentMatch) {
      index += 1;
      continue;
    }
    const indent = currentMatch[1];
    const entries = [];
    while (index < lines.length) {
      const match = lines[index].match(ORIGIN_ENTRY_RE);
      if (!match || match[1] !== indent) {
        break;
      }
      entries.push({
        lineIndex: index,
        indent,
        kind: match[2],
        target: match[3]
      });
      index += 1;
    }
    groups.push({ indent, entries });
  }
  return groups;
}

function normalizePath(candidatePath) {
  return process.platform === "win32"
    ? path.resolve(candidatePath).toLowerCase()
    : path.resolve(candidatePath);
}

function getRepoInfoForPath(targetPath, repoCache) {
  const repoRoot = resolveGitRoot(path.dirname(targetPath));
  if (!repoRoot) {
    return undefined;
  }
  if (repoCache.has(repoRoot)) {
    return repoCache.get(repoRoot);
  }
  const remoteUrl = execFileSync("git", ["-C", repoRoot, "config", "--get", "remote.origin.url"], { encoding: "utf8" }).trim();
  const headRevision = execFileSync("git", ["-C", repoRoot, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const browseBaseUrl = normalizeGitHubBrowseBaseUrl(remoteUrl);
  const repoInfo = { repoRoot, remoteUrl, headRevision, browseBaseUrl };
  repoCache.set(repoRoot, repoInfo);
  return repoInfo;
}

function inspectOriginGroup(filePath, group, repoCache) {
  const relativeEntry = group.entries.find((entry) => entry.kind === "relative");
  const absoluteEntry = group.entries.find((entry) => entry.kind === "absolute");
  const browseGitEntry = group.entries.find((entry) => entry.kind === "browse + git");
  if (!relativeEntry && !absoluteEntry) {
    return { status: "insufficient-local-target", group };
  }

  const resolvedRelativePath = relativeEntry
    ? path.resolve(path.dirname(filePath), relativeEntry.target)
    : undefined;
  const resolvedAbsolutePath = absoluteEntry
    ? path.resolve(absoluteEntry.target.replace(/\//gu, path.sep))
    : undefined;

  if (resolvedRelativePath && resolvedAbsolutePath && normalizePath(resolvedRelativePath) !== normalizePath(resolvedAbsolutePath)) {
    return {
      status: "relative-absolute-conflict",
      group,
      resolvedRelativePath,
      resolvedAbsolutePath
    };
  }

  const resolvedTargetPath = resolvedRelativePath ?? resolvedAbsolutePath;
  if (!resolvedTargetPath || !existsSync(resolvedTargetPath)) {
    return {
      status: "unreadable-target",
      group,
      resolvedTargetPath
    };
  }

  const repoInfo = getRepoInfoForPath(resolvedTargetPath, repoCache);
  if (!repoInfo) {
    return {
      status: "repo-root-unresolved",
      group,
      resolvedTargetPath
    };
  }
  if (!repoInfo.browseBaseUrl) {
    return {
      status: "unsupported-remote",
      group,
      resolvedTargetPath,
      repoRoot: repoInfo.repoRoot,
      remoteUrl: repoInfo.remoteUrl
    };
  }

  const relativePathFromRepoRoot = path.relative(repoInfo.repoRoot, resolvedTargetPath).replace(/\\/gu, "/");
  if (!gitPathExistsAtRevision(repoInfo.repoRoot, repoInfo.headRevision, relativePathFromRepoRoot)) {
    return {
      status: "target-not-at-head",
      group,
      resolvedTargetPath,
      repoRoot: repoInfo.repoRoot,
      relativePathFromRepoRoot
    };
  }

  const suggestedBrowseGit = `${repoInfo.browseBaseUrl}/blob/${repoInfo.headRevision}/${relativePathFromRepoRoot}`;
  if (!browseGitEntry) {
    return {
      status: "missing-browse-git",
      group,
      resolvedTargetPath,
      repoRoot: repoInfo.repoRoot,
      suggestedBrowseGit
    };
  }

  const parsedPermalink = parseGitHubPermalink(browseGitEntry.target);
  if (!parsedPermalink) {
    return {
      status: "invalid-browse-git",
      group,
      resolvedTargetPath,
      repoRoot: repoInfo.repoRoot,
      suggestedBrowseGit,
      currentBrowseGit: browseGitEntry.target
    };
  }

  const expectedRepoSlug = repoInfo.browseBaseUrl.replace(/^https:\/\/github\.com\//u, "");
  if (parsedPermalink.repoSlug !== expectedRepoSlug || parsedPermalink.relativePath !== relativePathFromRepoRoot) {
    return {
      status: "browse-git-conflict",
      group,
      resolvedTargetPath,
      repoRoot: repoInfo.repoRoot,
      suggestedBrowseGit,
      currentBrowseGit: browseGitEntry.target
    };
  }

  if (browseGitEntry.target !== suggestedBrowseGit) {
    return {
      status: "stale-browse-git",
      group,
      resolvedTargetPath,
      repoRoot: repoInfo.repoRoot,
      suggestedBrowseGit,
      currentBrowseGit: browseGitEntry.target
    };
  }

  return {
    status: "current",
    group,
    resolvedTargetPath,
    repoRoot: repoInfo.repoRoot,
    suggestedBrowseGit,
    currentBrowseGit: browseGitEntry.target
  };
}

async function inspectTraceFile(filePath, repoCache) {
  const markdown = await readFile(filePath, "utf8");
  const lines = markdown.split(/\r?\n/u);
  const originGroups = collectOriginGroups(lines).map((group) => inspectOriginGroup(filePath, group, repoCache));
  return {
    filePath,
    originalMarkdown: markdown,
    originGroups,
    hasRepairCandidate: originGroups.some((group) => group.status === "missing-browse-git" || group.status === "stale-browse-git" || group.status === "invalid-browse-git")
  };
}

function applyRepairs(inspectedFile) {
  const lines = inspectedFile.originalMarkdown.split(/\r?\n/u);
  const repairs = [];
  let offset = 0;
  for (const group of inspectedFile.originGroups) {
    if (!(group.status === "missing-browse-git" || group.status === "stale-browse-git" || group.status === "invalid-browse-git")) {
      continue;
    }
    const browseGitEntry = group.group.entries.find((entry) => entry.kind === "browse + git");
    const absoluteEntry = group.group.entries.find((entry) => entry.kind === "absolute");
    const relativeEntry = group.group.entries.find((entry) => entry.kind === "relative");
    const insertAfterEntry = absoluteEntry ?? relativeEntry;
    if (!insertAfterEntry || !group.suggestedBrowseGit) {
      continue;
    }
    const newLine = `${group.group.indent}- [browse + git](${group.suggestedBrowseGit})`;
    if (browseGitEntry) {
      const lineIndex = browseGitEntry.lineIndex + offset;
      lines[lineIndex] = newLine;
      repairs.push({
        type: "replace",
        lineNumber: lineIndex + 1,
        from: browseGitEntry.target,
        to: group.suggestedBrowseGit
      });
      continue;
    }
    const insertionIndex = insertAfterEntry.lineIndex + offset + 1;
    lines.splice(insertionIndex, 0, newLine);
    offset += 1;
    repairs.push({
      type: "insert",
      lineNumber: insertionIndex + 1,
      to: group.suggestedBrowseGit
    });
  }
  return {
    filePath: inspectedFile.filePath,
    changed: repairs.length > 0,
    repairs,
    updatedMarkdown: lines.join("\n")
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

  const traceFiles = [...new Set(parsed.targets.flatMap((target) => collectTraceFiles(target)))].sort();
  const repoCache = new Map();
  const inspected = await Promise.all(traceFiles.map((filePath) => inspectTraceFile(filePath, repoCache)));
  const result = {
    tool: "plan-trace-browse-git-repair",
    mode: parsed.apply ? "apply" : "dry-run",
    inspectedFileCount: inspected.length,
    candidateFileCount: inspected.filter((entry) => entry.hasRepairCandidate).length,
    files: inspected.filter((entry) => entry.originGroups.length > 0)
  };

  if (parsed.apply) {
    const applied = [];
    for (const inspectedFile of inspected) {
      const repair = applyRepairs(inspectedFile);
      if (repair.changed) {
        await writeFile(repair.filePath, repair.updatedMarkdown, "utf8");
      }
      applied.push({
        filePath: repair.filePath,
        changed: repair.changed,
        repairs: repair.repairs
      });
    }
    process.stdout.write(`${JSON.stringify({ ...result, applied }, null, 2)}\n`);
    return;
  }

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

await main();