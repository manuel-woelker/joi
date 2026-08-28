import type { PluginRegistry } from "../../registry";
import { ExtensionPointsMetadata, PluginsMetadata } from "../backend/PluginMetadataDebugContributions";
import type { PluginsResponse } from "../backend/plugins-api";

export function UiPluginsDebugContribution(props: { pluginRegistry: PluginRegistry }) {
  return <PluginsMetadata metadata={toDebugMetadata(props.pluginRegistry)} />;
}

export function UiExtensionPointsDebugContribution(props: { pluginRegistry: PluginRegistry }) {
  return <ExtensionPointsMetadata metadata={toDebugMetadata(props.pluginRegistry)} />;
}

function toDebugMetadata(registry: PluginRegistry): PluginsResponse {
  const metadata = registry.metadata();
  return {
    plugins: metadata.plugins.map((plugin) => ({
      name: plugin.name,
      description: plugin.description,
      extension_points: [...plugin.extensionPoints],
      extensions: [...plugin.extensions],
    })),
    extension_points: metadata.extensionPoints.map((point) => ({
      id: point.id,
      description: point.description,
      extensions: [...point.extensions],
    })),
    extensions: metadata.extensions.map((extension) => ({ ...extension })),
  };
}
