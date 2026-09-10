use joi_error::JoiResult;

use crate::command::Command;

/// Executes a command described by its [`Command`] implementation.
pub trait CommandHandler {
    /// Request and response declaration handled by this implementation.
    type Command: Command;

    /// Executes one typed command request.
    fn execute(&self, command: Self::Command) -> JoiResult<<Self::Command as Command>::Response>;
}
