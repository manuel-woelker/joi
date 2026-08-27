export interface PluginMetadata {
  name: string;
  description: string;
  extension_points: string[];
  extensions: string[];
}

export interface ExtensionPointMetadata {
  id: string;
  description: string;
  extensions: string[];
}

export interface ExtensionMetadata {
  id: string;
  description: string;
}

export interface PluginsResponse {
  plugins: PluginMetadata[];
  extension_points: ExtensionPointMetadata[];
  extensions: ExtensionMetadata[];
}

export async function loadPlugins(fetcher: typeof fetch = fetch): Promise<PluginsResponse> {
  const response = await fetcher("/api/plugins");
  if (!response.ok) throw new Error(`Plugin metadata request failed with HTTP ${response.status}`);

  const payload: unknown = await response.json();
  if (!isPluginsResponse(payload)) {
    throw new Error("Plugins action returned an invalid response");
  }
  return payload;
}

function isPluginsResponse(value: unknown): value is PluginsResponse {
  if (!isRecord(value)) return false;
  return Array.isArray(value.plugins) && value.plugins.every(isPlugin) &&
    Array.isArray(value.extension_points) && value.extension_points.every(isExtensionPoint) &&
    Array.isArray(value.extensions) && value.extensions.every(isExtension);
}

function isPlugin(value: unknown): value is PluginMetadata {
  return isRecord(value) && hasText(value, "name") && hasText(value, "description") &&
    hasTextArray(value, "extension_points") && hasTextArray(value, "extensions");
}

function isExtensionPoint(value: unknown): value is ExtensionPointMetadata {
  return isRecord(value) && hasText(value, "id") && hasText(value, "description") &&
    hasTextArray(value, "extensions");
}

function isExtension(value: unknown): value is ExtensionMetadata {
  return isRecord(value) && hasText(value, "id") && hasText(value, "description");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function hasText(value: Record<string, unknown>, key: string): boolean {
  return typeof value[key] === "string";
}

function hasTextArray(value: Record<string, unknown>, key: string): boolean {
  return Array.isArray(value[key]) && value[key].every((item) => typeof item === "string");
}
