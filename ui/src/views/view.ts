import type { Component } from "solid-js";
import type { IconComponent } from "../icons/icon-component";

export interface ApplicationView {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly section: string;
  readonly icon?: IconComponent;
  readonly content: Component;
  readonly commands?: Component;
}
