use std::{collections::HashMap, sync::Arc};

use joi_base::JoiString;
use joi_error::{JoiResult, joi_bail, report};
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use serde_json::Value;

use crate::command::{Command, CommandDescriptor};
use crate::command_handler::CommandHandler;

const COMMANDS_LIST_NAME: &str = "commands/list";

type ExecuteCommand = Arc<dyn Fn(Value) -> JoiResult<Value> + Send + Sync>;

struct RegisteredCommand {
    info: CommandInfo,
    execute: ExecuteCommand,
}

#[derive(Clone)]
/// Metadata exposed for a registered command.
pub struct CommandInfo {
    /// Stable command name used for dispatch.
    pub name: JoiString,
    /// Human-readable command description.
    pub description: JoiString,
}

/// Stores typed commands without coupling registration to a transport.
#[derive(Clone)]
pub struct CommandRegistry {
    inner: Arc<CommandRegistryInner>,
}

struct CommandRegistryInner {
    commands: HashMap<JoiString, RegisteredCommand>,
}

/// Collects commands before producing an immutable [`CommandRegistry`].
#[derive(Default)]
pub struct CommandRegistryBuilder {
    commands: HashMap<JoiString, RegisteredCommand>,
}

impl CommandRegistryBuilder {
    /// Creates an empty command registry builder.
    pub fn new() -> Self {
        Self::default()
    }

    /// Registers a typed handler.
    ///
    /// Command names must consist of non-empty slash-separated segments containing
    /// ASCII letters, digits, hyphens, or underscores. Duplicate names are rejected.
    pub fn register<H>(&mut self, handler: H) -> JoiResult<()>
    where
        H: CommandHandler + Send + Sync + 'static,
        H::Command: DeserializeOwned + Send + 'static,
        <H::Command as Command>::Response: Serialize,
    {
        let info = CommandInfo {
            name: H::Command::NAME.into(),
            description: H::Command::DESCRIPTION.into(),
        };
        if !is_valid_command_name(&info.name) {
            joi_bail!("invalid command name `{}`", info.name);
        }
        if info.name == COMMANDS_LIST_NAME || self.commands.contains_key(&info.name) {
            joi_bail!("command `{}` is already registered", info.name);
        }

        self.commands.insert(
            info.name.clone(),
            RegisteredCommand {
                info,
                execute: Arc::new(move |request| {
                    execute_typed::<H::Command>(request, |request| handler.execute(request))
                }),
            },
        );
        Ok(())
    }

    /// Verifies that generated declarations have matching registered handlers.
    pub fn require_handlers(&self, command_descriptors: &[CommandDescriptor]) -> JoiResult<()> {
        let mut missing = command_descriptors
            .iter()
            .filter(|command| !self.commands.contains_key(command.name))
            .map(|command| command.name)
            .collect::<Vec<_>>();
        missing.sort_unstable();
        if !missing.is_empty() {
            joi_bail!(
                "commands have no registered handlers: {}",
                missing.join(", ")
            );
        }
        for command in command_descriptors {
            if self.commands[command.name].info.description != command.description {
                joi_bail!(
                    "command `{}` handler description does not match its declaration",
                    command.name
                );
            }
        }
        Ok(())
    }

    /// Produces an immutable, cheaply cloneable registry.
    ///
    /// The built registry also contains the built-in `commands/list` command.
    pub fn build(mut self) -> CommandRegistry {
        let info = CommandInfo {
            name: COMMANDS_LIST_NAME.into(),
            description: "Lists all registered commands".into(),
        };
        let mut commands = self
            .commands
            .values()
            .map(|command| CommandSummary::from(&command.info))
            .chain(std::iter::once(CommandSummary::from(&info)))
            .collect::<Vec<_>>();
        commands.sort_by(|left, right| left.name.cmp(&right.name));
        let commands = Arc::new(commands);
        self.commands.insert(
            info.name.clone(),
            RegisteredCommand {
                info,
                execute: Arc::new(move |request| {
                    execute_typed::<CommandsListRequest>(request, |_| {
                        Ok(CommandsListResponse {
                            commands: commands.as_ref().clone(),
                        })
                    })
                }),
            },
        );

        CommandRegistry {
            inner: Arc::new(CommandRegistryInner {
                commands: self.commands,
            }),
        }
    }
}

impl CommandRegistry {
    /// Returns metadata for a command with the given name.
    pub fn command_info(&self, name: &str) -> Option<&CommandInfo> {
        self.inner.commands.get(name).map(|command| &command.info)
    }

    /// Iterates over all command metadata in unspecified order.
    pub fn commands_info(&self) -> impl Iterator<Item = &CommandInfo> {
        self.inner.commands.values().map(|command| &command.info)
    }

    /// Executes a command with a JSON request.
    ///
    /// Returns [`None`] when the command is not registered. The inner result reports
    /// request deserialization, handler, or response serialization failures.
    pub fn execute(&self, name: &str, request: Value) -> Option<JoiResult<Value>> {
        self.inner
            .commands
            .get(name)
            .map(|command| (command.execute)(request))
    }
}

fn execute_typed<C>(
    request: Value,
    execute: impl FnOnce(C) -> JoiResult<C::Response>,
) -> JoiResult<Value>
where
    C: Command + DeserializeOwned,
    C::Response: Serialize,
{
    let request = serde_json::from_value::<C>(request).map_err(report)?;
    let response = execute(request)?;
    serde_json::to_value(response).map_err(report)
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct CommandsListRequest {}

#[derive(Serialize)]
struct CommandsListResponse {
    commands: Vec<CommandSummary>,
}

impl Command for CommandsListRequest {
    const NAME: &'static str = COMMANDS_LIST_NAME;
    const DESCRIPTION: &'static str = "Lists all registered commands";
    type Response = CommandsListResponse;
}

#[derive(Clone, Serialize)]
struct CommandSummary {
    name: JoiString,
    description: JoiString,
}

impl From<&CommandInfo> for CommandSummary {
    fn from(info: &CommandInfo) -> Self {
        Self {
            name: info.name.clone(),
            description: info.description.clone(),
        }
    }
}

fn is_valid_command_name(name: &str) -> bool {
    name.split('/').all(|segment| {
        !segment.is_empty()
            && segment
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
    })
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use crate::generated::api::COMMAND_DESCRIPTORS;
    use crate::info_command::InfoCommand;

    use super::CommandRegistryBuilder;

    #[test]
    fn builds_a_cloneable_immutable_registry() {
        let mut builder = CommandRegistryBuilder::new();
        builder.register(InfoCommand::new_empty()).unwrap();

        let original = builder.build();
        let cloned = original.clone();

        assert!(original.command_info("info").is_some());
        assert!(original.command_info("commands/list").is_some());
        assert!(cloned.command_info("info").is_some());
    }

    #[test]
    fn built_in_command_lists_the_registry_snapshot_in_name_order() {
        let mut builder = CommandRegistryBuilder::new();
        builder.register(InfoCommand::new_empty()).unwrap();
        let registry = builder.build();

        let response = registry
            .execute("commands/list", json!({}))
            .unwrap()
            .unwrap();

        assert_eq!(
            response,
            json!({
                "commands": [
                    {
                        "name": "commands/list",
                        "description": "Lists all registered commands"
                    },
                    {
                        "name": "info",
                        "description": "Retrieves application information"
                    }
                ]
            })
        );
    }

    #[test]
    fn reports_commands_without_registered_handlers() {
        let builder = CommandRegistryBuilder::new();

        let error = builder.require_handlers(COMMAND_DESCRIPTORS).unwrap_err();

        assert_eq!(
            error.to_string(),
            "commands have no registered handlers: query, user-info"
        );
    }
}
