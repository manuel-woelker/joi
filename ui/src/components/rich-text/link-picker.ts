/** One internal link that can be inserted into a rich-text document. */
export interface LinkCandidate {
  readonly reference: string;
  readonly label: string;
  readonly href: string;
  readonly description?: string;
}

export interface LinkSearchResult {
  readonly entries: readonly LinkCandidate[];
  readonly errors: readonly string[];
}

/** Domain-agnostic operations used only when an internal link picker is open. */
export interface LinkPickerSource {
  search(query: string, signal: AbortSignal, onUpdate?: (result: LinkSearchResult) => void): Promise<LinkSearchResult>;
  resolve(references: readonly string[], signal: AbortSignal): Promise<readonly (LinkCandidate | undefined)[]>;
}
