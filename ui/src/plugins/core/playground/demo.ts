import type { JSX } from "solid-js";

export interface ComponentScenario {
  readonly name: string;
  readonly description?: string;
  readonly render: () => JSX.Element;
}

export interface ComponentDemo {
  readonly name: string;
  readonly description: string;
  readonly scenarios: readonly ComponentScenario[];
}

export interface ComponentDemoModule {
  readonly default: ComponentDemo;
}

export interface PlaygroundDemo extends ComponentDemo {
  readonly id: string;
  readonly sourcePath: string;
}
