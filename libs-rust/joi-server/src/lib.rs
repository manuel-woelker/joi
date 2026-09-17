//! Reusable server runtime for JOI applications.
//!
//! The crate supplies the application-independent command, plugin, persistence,
//! authentication, CLI, and HTTP infrastructure used by JOI servers. Applications
//! configure the runtime through [`ServerConfig`] and contribute domain behavior
//! through [`joi_plugin::Plugin`] values.

#![warn(missing_docs)]

/// Static command declarations shared by handlers and generated inventories.
pub mod command;
/// Type-safe command handler contracts.
pub mod command_handler;
/// Registration and runtime dispatch of commands.
pub mod command_registry;
/// Axum transport for registered commands.
pub mod command_service;
/// Generic table descriptions, queries, and mutations.
pub mod data_store;
/// Opaque entities and the primary entity-storage contract.
pub mod entity_store;
/// Code-generated command declarations.
pub mod generated;
/// Application information collection and command handling.
pub mod info_command;
/// Application model inspection command handling.
pub mod model_info_command;
/// Generic data mutation command handling.
pub mod mutate_command;
/// Plugin inventory command handling.
pub mod plugins_command;
/// Generic data query command handling.
pub mod query_command;
/// redb implementation of binary entity storage.
pub mod redb_entity_store;
/// Search and aggregation contracts implemented independently from entity storage.
pub mod search_index;
/// Runtime assembly, CLI dispatch, and HTTP server startup.
pub mod server;
/// Coordinator that keeps entity storage and the search index synchronized.
pub mod storage;
/// Tantivy implementation of entity search and aggregation.
pub mod tantivy_search_index;
/// User identity, login sessions, and authentication commands.
pub mod user_session_command;

pub use server::{ServerConfig, application_main, run};
