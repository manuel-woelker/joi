import { isAbsolute, relative, resolve } from "node:path";

export function containedDiscoveryPath(root: string, path: string): string {
  const absoluteRoot = resolve(root);
  const absolutePath = resolve(absoluteRoot, path);
  const fromRoot = relative(absoluteRoot, absolutePath);
  if (
    fromRoot === ".." ||
    fromRoot.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) ||
    isAbsolute(fromRoot)
  ) {
    throw new Error(`Discovered path escapes its root: ${path}`);
  }
  return absolutePath;
}
