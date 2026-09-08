import { relative, sep } from "node:path";

import { parse } from "@babel/parser";
import type { Plugin } from "vite";

interface AstNode {
  readonly type: string;
  readonly start?: number | null;
  readonly loc?: { readonly start: { readonly line: number } } | null;
  readonly [key: string]: unknown;
}

interface Edit {
  readonly offset: number;
  readonly text: string;
}

const registrationMethods = new Set(["registerExtension", "registerExtensionPoint"]);
const registrationCandidate = /(?:\bplugin|\.registerExtension(?:Point)?)\s*\(/;

/** Injects source locations into UI plugin registration object literals. */
export function sourceLocationTransform(repositoryRoot: string): Plugin {
  return {
    name: "joi-plugin-source-locations",
    enforce: "pre",
    transform(code, id) {
      const transformed = injectSourceLocations(code, id, repositoryRoot);
      return transformed === code ? null : { code: transformed, map: null };
    },
  };
}

export function injectSourceLocations(code: string, id: string, repositoryRoot: string): string {
  const cleanId = id.split("?", 1)[0];
  if (!/\.[cm]?[jt]sx?$/.test(cleanId) || cleanId.includes(`${sep}node_modules${sep}`)) return code;
  if (!registrationCandidate.test(code)) return code;

  const ast = parse(code, { sourceType: "module", plugins: ["typescript", "jsx"] }) as unknown as AstNode;
  const file = relative(repositoryRoot, cleanId).split(sep).join("/");
  const edits: Edit[] = [];

  walk(ast, (node) => {
    if (node.type !== "CallExpression") return;
    const callee = asNode(node.callee);
    const argument = Array.isArray(node.arguments) ? asNode(node.arguments[0]) : undefined;
    if (!callee || !argument || argument.type !== "ObjectExpression" || !isRegistration(callee)) return;
    if (hasLocation(argument)) return;

    const line = callee.loc?.start.line;
    if (argument.start === undefined || argument.start === null || line === undefined) return;
    edits.push({
      offset: argument.start + 1,
      text: ` location: { file: ${JSON.stringify(file)}, line: ${line} },`,
    });
  });

  return edits
    .sort((left, right) => right.offset - left.offset)
    .reduce((result, edit) => `${result.slice(0, edit.offset)}${edit.text}${result.slice(edit.offset)}`, code);
}

function isRegistration(callee: AstNode): boolean {
  if (callee.type === "Identifier") return callee.name === "plugin";
  if (callee.type !== "MemberExpression") return false;
  const property = asNode(callee.property);
  return property?.type === "Identifier" && registrationMethods.has(String(property.name));
}

function hasLocation(object: AstNode): boolean {
  if (!Array.isArray(object.properties)) return false;
  return object.properties.some((value) => {
    const property = asNode(value);
    if (property?.type !== "ObjectProperty") return false;
    const key = asNode(property.key);
    return (
      (key?.type === "Identifier" && key.name === "location") ||
      (key?.type === "StringLiteral" && key.value === "location")
    );
  });
}

function walk(value: unknown, visit: (node: AstNode) => void): void {
  if (Array.isArray(value)) {
    for (const child of value) walk(child, visit);
    return;
  }
  const node = asNode(value);
  if (!node) return;
  visit(node);
  for (const [key, child] of Object.entries(node)) {
    if (key !== "loc" && key !== "tokens" && key !== "comments") walk(child, visit);
  }
}

function asNode(value: unknown): AstNode | undefined {
  return value !== null && typeof value === "object" && "type" in value ? (value as AstNode) : undefined;
}
