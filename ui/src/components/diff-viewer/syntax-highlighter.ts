import { createHighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import bash from "shiki/langs/bash.mjs";
import css from "shiki/langs/css.mjs";
import html from "shiki/langs/html.mjs";
import javascript from "shiki/langs/javascript.mjs";
import json from "shiki/langs/json.mjs";
import markdown from "shiki/langs/markdown.mjs";
import rust from "shiki/langs/rust.mjs";
import toml from "shiki/langs/toml.mjs";
import tsx from "shiki/langs/tsx.mjs";
import typescript from "shiki/langs/typescript.mjs";
import yaml from "shiki/langs/yaml.mjs";
import githubLight from "shiki/themes/github-light.mjs";

export interface SyntaxToken {
  readonly text: string;
  readonly color?: string;
}

const languageByExtension: Readonly<Record<string, string>> = {
  css: "css",
  htm: "html",
  html: "html",
  js: "javascript",
  json: "json",
  jsx: "javascript",
  md: "markdown",
  mjs: "javascript",
  rs: "rust",
  sh: "bash",
  toml: "toml",
  ts: "typescript",
  tsx: "tsx",
  yaml: "yaml",
  yml: "yaml",
};

const highlighter = createHighlighterCore({
  themes: [githubLight],
  langs: [bash, css, html, javascript, json, markdown, rust, toml, tsx, typescript, yaml],
  engine: createJavaScriptRegexEngine(),
});
const cache = new Map<string, Promise<readonly SyntaxToken[]>>();

/** Highlights one source line using a language inferred from its file extension. */
export function highlightLine(path: string, code: string): Promise<readonly SyntaxToken[]> {
  const language = languageForPath(path);
  if (!language || !code) return Promise.resolve([{ text: code }]);
  const key = `${language}\0${code}`;
  let result = cache.get(key);
  if (!result) {
    result = highlighter.then((instance) =>
      (instance.codeToTokens(code, { lang: language, theme: "github-light" }).tokens[0] ?? []).map((token) => ({
        text: token.content,
        color: token.color,
      })),
    );
    cache.set(key, result);
  }
  return result;
}

export function languageForPath(path: string): string | undefined {
  const extension = path.split(".").at(-1)?.toLocaleLowerCase();
  return extension ? languageByExtension[extension] : undefined;
}
