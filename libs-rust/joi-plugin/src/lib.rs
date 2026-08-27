//! Typed in-process plugin and extension registration.
//!
//! Plugins register extension-point traits and boxed implementations through a
//! scoped [`PluginContext`]. A [`PluginRegistryBuilder`] commits each plugin
//! atomically, then produces an immutable [`PluginRegistry`] with typed,
//! borrowed access to its extensions.

mod extension_collection;
mod plugin;
mod plugin_context;
mod plugin_registry;

pub use plugin::{ExtensionInfo, ExtensionPointInfo, Plugin, PluginInfo, plugin};
pub use plugin_context::PluginContext;
pub use plugin_registry::{PluginRegistry, PluginRegistryBuilder};
