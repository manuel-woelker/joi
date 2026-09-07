use joi_error::JoiResult;

use crate::generated::api::Command;

/// Executes a command described by its [`Command`] implementation.
pub trait CommandHandler {
    type Command: Command;

    fn execute(&self, command: Self::Command) -> JoiResult<<Self::Command as Command>::Response>;
}
