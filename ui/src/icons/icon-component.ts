import type { LucideProps } from "lucide-solid";
import type { JSX } from "solid-js";

/** A Lucide icon component that can be stored as UI metadata. */
export type IconComponent = (props: LucideProps) => JSX.Element;
