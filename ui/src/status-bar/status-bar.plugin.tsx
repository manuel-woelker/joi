import { DebugTools } from "../plugins/debug/core/DebugTools";
import { plugin } from "../plugins/registry";
import { pluginRegistryServiceKey } from "../plugins/plugin-registry-service";
import { REVISION } from "../revision";
import { statusBarContributions } from "./contribution";
import styles from "./StatusBar.module.css";

function JoiContribution() {
  return <span>Joi</span>;
}

function RevisionContribution() {
  return <span class={styles.revision}>{REVISION}</span>;
}

function BuiltWithContribution() {
  return <span>Built with SolidJS</span>;
}

export default plugin({
  name: "status-bar",
  description: "Core status bar contributions",
  requires: { pluginRegistryService: pluginRegistryServiceKey },
  registerExtensionPoints(context) {
    context.registerExtensionPoint({ point: statusBarContributions });
  },
  registerExtensions(context) {
    context.registerExtension({
      point: statusBarContributions,
      id: "joi-status",
      description: "Displays the Joi application name",
      value: { id: "joi-status", order: -100, content: JoiContribution },
    });
    context.registerExtension({
      point: statusBarContributions,
      id: "revision-status",
      description: "Displays the current application revision",
      value: { id: "revision-status", order: -90, content: RevisionContribution },
    });
    context.registerExtension({
      point: statusBarContributions,
      id: "built-with-status",
      description: "Displays the UI technology",
      value: { id: "built-with-status", order: 10, content: BuiltWithContribution },
    });
    context.registerExtension({
      point: statusBarContributions,
      id: "debug-status",
      description: "Provides access to debug tools",
      value: {
        id: "debug-status",
        order: 20,
        content: () => <DebugTools registry={context.services.pluginRegistryService} />,
      },
    });
  },
});
