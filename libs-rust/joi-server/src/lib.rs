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
/// Code-generated command declarations.
pub mod generated;
/// Application information collection and command handling.
pub mod info_command;
/// Generic data mutation command handling.
pub mod mutate_command;
/// Plugin inventory command handling.
pub mod plugins_command;
/// Generic data query command handling.
pub mod query_command;
/// Runtime assembly, CLI dispatch, and HTTP server startup.
pub mod server;
/// SQLite implementation of the generic data-store contract.
pub mod sqlite_data_store;
/// User identity, login sessions, and authentication commands.
pub mod user_session_command;

pub use server::{ServerConfig, application_main, run};
