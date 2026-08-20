use serde::{Serialize, de::DeserializeOwned};

pub struct ActionDescriptor {
    pub name: String,
    pub description: String,
}

pub trait ActionRequest {
    type Response: Serialize;
}

pub trait Action {
    type Request: ActionRequest + DeserializeOwned + Send + 'static;

    fn descriptor() -> ActionDescriptor;

    fn execute(request: Self::Request) -> <Self::Request as ActionRequest>::Response;
}
