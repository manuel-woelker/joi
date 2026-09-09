use joi_error::JoiResult;

use crate::command::Command;

/// Executes a command described by its [`Command`] implementation.
pub trait CommandHandler {
    type Command: Command;

    fn execute(&self, command: Self::Command) -> JoiResult<<Self::Command as Command>::Response>;
}
