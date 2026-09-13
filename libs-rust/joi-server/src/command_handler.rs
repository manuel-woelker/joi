use joi_base::JoiString;
use joi_error::JoiResult;

use crate::command::Command;

/// Authenticated user information available while executing a command.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CommandUser {
    /// Stable user identifier.
    pub id: JoiString,
    /// Login name shown with user-authored changes.
    pub username: JoiString,
}

/// Transport-provided information associated with one command invocation.
#[derive(Clone, Debug, Default)]
pub struct CommandContext {
    /// Authenticated user, or [`None`] for anonymous and CLI invocations.
    pub user: Option<CommandUser>,
}

impl CommandContext {
    /// Returns the authenticated user or fails when the invocation is anonymous.
    pub fn require_user(&self) -> JoiResult<&CommandUser> {
        self.user
            .as_ref()
            .ok_or_else(|| joi_error::joi_error!("login required"))
    }
}

/// Executes a command described by its [`Command`] implementation.
pub trait CommandHandler {
    /// Request and response declaration handled by this implementation.
    type Command: Command;

    /// Executes one typed command request.
    fn execute(
        &self,
        context: &CommandContext,
        command: Self::Command,
    ) -> JoiResult<<Self::Command as Command>::Response>;
}
