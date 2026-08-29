import type { Component } from "solid-js";

export interface ApplicationView {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly section: string;
  readonly content: Component;
  readonly actions?: Component;
}
