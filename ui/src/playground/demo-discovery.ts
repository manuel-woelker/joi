import type { ComponentDemoModule } from "./demo";
import { collectDemoLibrary } from "./demo-library";

const demoModules = import.meta.glob<ComponentDemoModule>("../**/*.demo.tsx", { eager: true });

export const demoLibrary = collectDemoLibrary(demoModules);
