use std::{collections::HashMap, sync::Arc};

use joi_base::JoiString;
use joi_error::{JoiResult, joi_bail, report};
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use serde_json::Value;

use crate::command::{Command, CommandDescriptor, CommandRequest};

const COMMANDS_LIST_NAME: &str = "commands/list";

type ExecuteCommand = Arc<dyn Fn(Value) -> JoiResult<Value> + Send + Sync>;

struct RegisteredCommand {
    descriptor: CommandDescriptor,
    execute: ExecuteCommand,
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
    pub fn new() -> Self {
        Self::default()
    }

    pub fn register<A>(&mut self, command: A) -> JoiResult<()>
    where
        A: Command + Send + Sync + 'static,
    {
        let descriptor = A::descriptor();
        if !is_valid_command_name(&descriptor.name) {
            joi_bail!("invalid command name `{}`", descriptor.name);
        }
        if descriptor.name == COMMANDS_LIST_NAME || self.commands.contains_key(&descriptor.name) {
            joi_bail!("command `{}` is already registered", descriptor.name);
        }

        self.commands.insert(
            descriptor.name.clone(),
            RegisteredCommand {
                descriptor,
                execute: Arc::new(move |request| {
                    execute_typed::<A::Request>(request, |request| command.execute(request))
                }),
            },
        );
        Ok(())
    }

    pub fn build(mut self) -> CommandRegistry {
        let descriptor = CommandDescriptor {
            name: COMMANDS_LIST_NAME.into(),
            description: "Lists all registered commands".into(),
        };
        let mut commands = self
            .commands
            .values()
            .map(|command| CommandSummary::from(&command.descriptor))
            .chain(std::iter::once(CommandSummary::from(&descriptor)))
            .collect::<Vec<_>>();
        commands.sort_by(|left, right| left.name.cmp(&right.name));
        let commands = Arc::new(commands);
        self.commands.insert(
            descriptor.name.clone(),
            RegisteredCommand {
                descriptor,
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
    pub fn descriptor(&self, name: &str) -> Option<&CommandDescriptor> {
        self.inner
            .commands
            .get(name)
            .map(|command| &command.descriptor)
    }

    pub fn descriptors(&self) -> impl Iterator<Item = &CommandDescriptor> {
        self.inner
            .commands
            .values()
            .map(|command| &command.descriptor)
    }

    pub fn execute(&self, name: &str, request: Value) -> Option<JoiResult<Value>> {
        self.inner
            .commands
            .get(name)
            .map(|command| (command.execute)(request))
    }
}

fn execute_typed<R>(
    request: Value,
    execute: impl FnOnce(R) -> JoiResult<R::Response>,
) -> JoiResult<Value>
where
    R: CommandRequest + DeserializeOwned,
{
    let request = serde_json::from_value::<R>(request).map_err(report)?;
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

impl CommandRequest for CommandsListRequest {
    type Response = CommandsListResponse;
}

#[derive(Clone, Serialize)]
struct CommandSummary {
    name: JoiString,
    description: JoiString,
}

impl From<&CommandDescriptor> for CommandSummary {
    fn from(descriptor: &CommandDescriptor) -> Self {
        Self {
            name: descriptor.name.clone(),
            description: descriptor.description.clone(),
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

    use crate::info_command::InfoCommand;

    use super::CommandRegistryBuilder;

    #[test]
    fn builds_a_cloneable_immutable_registry() {
        let mut builder = CommandRegistryBuilder::new();
        builder.register(InfoCommand::new_empty()).unwrap();

        let original = builder.build();
        let cloned = original.clone();

        assert!(original.descriptor("info").is_some());
        assert!(original.descriptor("commands/list").is_some());
        assert!(cloned.descriptor("info").is_some());
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
}
