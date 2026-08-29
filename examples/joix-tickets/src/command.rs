use joi_base::JoiString;
use joi_error::JoiResult;
use serde::{Serialize, de::DeserializeOwned};

#[derive(Clone)]
pub struct CommandDescriptor {
    pub name: JoiString,
    pub description: JoiString,
}

pub trait CommandRequest {
    type Response: Serialize;
}

pub trait Command {
    type Request: CommandRequest + DeserializeOwned + Send + 'static;

    fn descriptor() -> CommandDescriptor;

    fn execute(
        &self,
        request: Self::Request,
    ) -> JoiResult<<Self::Request as CommandRequest>::Response>;
}
