import type { PluginRegistryAccess } from "../../registry";
import { ExtensionPointsMetadata, PluginsMetadata } from "../backend/PluginMetadataDebugContributions";
import type { PluginsResponse } from "../backend/plugins-api";

export function UiPluginsDebugContribution(props: { pluginRegistry: PluginRegistryAccess }) {
  return <PluginsMetadata metadata={toDebugMetadata(props.pluginRegistry)} />;
}

export function UiExtensionPointsDebugContribution(props: { pluginRegistry: PluginRegistryAccess }) {
  return <ExtensionPointsMetadata metadata={toDebugMetadata(props.pluginRegistry)} />;
}

function toDebugMetadata(registry: PluginRegistryAccess): PluginsResponse {
  const metadata = registry.metadata();
  return {
    plugins: metadata.plugins.map((plugin) => ({
      name: plugin.name,
      description: plugin.description,
      file: plugin.location?.file,
      line: plugin.location?.line,
      extension_points: [...plugin.extensionPoints],
      extensions: [...plugin.extensions],
    })),
    extension_points: metadata.extensionPoints.map((point) => ({
      id: point.id,
      description: point.description,
      file: point.location?.file,
      line: point.location?.line,
      extensions: [...point.extensions],
    })),
    extensions: metadata.extensions.map((extension) => ({
      id: extension.id,
      description: extension.description,
      file: extension.location?.file,
      line: extension.location?.line,
    })),
  };
}
