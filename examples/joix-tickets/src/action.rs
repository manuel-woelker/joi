use joi_base::JoiString;
use joi_error::JoiResult;
use serde::{Serialize, de::DeserializeOwned};

#[derive(Clone)]
pub struct ActionDescriptor {
    pub name: JoiString,
    pub description: JoiString,
}

pub trait ActionRequest {
    type Response: Serialize;
}

pub trait Action {
    type Request: ActionRequest + DeserializeOwned + Send + 'static;

    fn descriptor() -> ActionDescriptor;

    fn execute(
        &self,
        request: Self::Request,
    ) -> JoiResult<<Self::Request as ActionRequest>::Response>;
}
