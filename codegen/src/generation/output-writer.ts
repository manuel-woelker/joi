import { mkdir, readFile, rename, rmdir, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

import type { GeneratedFile } from "./generated-file.ts";

const manifestName = ".joi-codegen-manifest.json";

interface OutputManifest {
  readonly files: readonly string[];
}

export type OutputMode = "check" | "generate";

export async function synchronizeOutput(
  outputRoot: string,
  files: readonly GeneratedFile[],
  mode: OutputMode,
): Promise<readonly string[]> {
  const expected = new Map<string, string>();
  for (const file of files) {
    const path = validateRelativePath(outputRoot, file.relativePath);
    if (expected.has(path)) throw new Error(`Duplicate generated output: ${file.relativePath}`);
    expected.set(path, file.contents);
  }

  const previous = await readManifest(outputRoot);
  const stale = previous.files.filter((path) => !expected.has(resolve(outputRoot, path)));
  const issues: string[] = [];

  for (const [path, contents] of expected) {
    const existing = await readOptional(path);
    if (existing !== contents)
      issues.push(`${existing === undefined ? "missing" : "stale"}: ${relative(process.cwd(), path)}`);
  }
  for (const path of stale) issues.push(`unexpected: ${relative(process.cwd(), resolve(outputRoot, path))}`);
  if (previous.missing) issues.push(`missing: ${relative(process.cwd(), resolve(outputRoot, manifestName))}`);

  if (mode === "check") return Object.freeze(issues);

  await mkdir(outputRoot, { recursive: true });
  for (const [path, contents] of expected) {
    if ((await readOptional(path)) === contents) continue;
    await mkdir(dirname(path), { recursive: true });
    await atomicWrite(path, contents);
  }
  for (const path of stale) await removeOptional(resolve(outputRoot, path));
  const manifest: OutputManifest = {
    files: [...expected.keys()].map((path) => relative(outputRoot, path)).sort(),
  };
  await atomicWrite(resolve(outputRoot, manifestName), `${JSON.stringify(manifest, null, 2)}\n`);
  return Object.freeze(issues);
}

export async function removeGeneratedOutput(outputRoot: string): Promise<readonly string[]> {
  const manifest = await readManifest(outputRoot);
  if (manifest.missing) return Object.freeze([]);

  const removed: string[] = [];
  for (const path of manifest.files) {
    const absolutePath = validateRelativePath(outputRoot, path);
    if (await removeOptional(absolutePath)) removed.push(path);
  }
  await removeOptional(resolve(outputRoot, manifestName));
  await removeEmptyDirectories(outputRoot, manifest.files);
  return Object.freeze(removed.sort());
}

function validateRelativePath(root: string, path: string): string {
  if (path.length === 0 || isAbsolute(path)) throw new Error(`Generated path must be relative: ${path}`);
  const absoluteRoot = resolve(root);
  const absolutePath = resolve(absoluteRoot, path);
  const fromRoot = relative(absoluteRoot, absolutePath);
  if (fromRoot === ".." || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) {
    throw new Error(`Generated path escapes output root: ${path}`);
  }
  return absolutePath;
}

async function readManifest(root: string): Promise<OutputManifest & { readonly missing: boolean }> {
  const source = await readOptional(resolve(root, manifestName));
  if (source === undefined) return { files: [], missing: true };
  const parsed: unknown = JSON.parse(source);
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("files" in parsed) ||
    !Array.isArray(parsed.files) ||
    !parsed.files.every((value) => typeof value === "string")
  ) {
    throw new Error(`${resolve(root, manifestName)} is not a valid generated-file manifest`);
  }
  for (const path of parsed.files) validateRelativePath(root, path);
  return { files: parsed.files, missing: false };
}

async function readOptional(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return undefined;
    throw error;
  }
}

async function removeOptional(path: string): Promise<boolean> {
  try {
    if ((await stat(path)).isFile()) {
      await unlink(path);
      return true;
    }
  } catch (error) {
    if (!isNodeError(error) || error.code !== "ENOENT") throw error;
  }
  return false;
}

async function removeEmptyDirectories(root: string, paths: readonly string[]): Promise<void> {
  const directories = new Set(paths.map((path) => dirname(resolve(root, path))));
  directories.add(resolve(root));
  for (const directory of [...directories].sort((left, right) => right.length - left.length)) {
    try {
      await rmdir(directory);
    } catch (error) {
      if (!isNodeError(error) || (error.code !== "ENOENT" && error.code !== "ENOTEMPTY")) throw error;
    }
  }
}

async function atomicWrite(path: string, contents: string): Promise<void> {
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporary, contents, "utf8");
  await rename(temporary, path);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
