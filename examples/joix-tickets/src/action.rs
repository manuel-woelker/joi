pub struct ActionDescriptor {
    pub name: String,
    pub description: String,
}

pub trait ActionRequest {
    type Response;
}

pub trait Action {
    type Request: ActionRequest;

    fn descriptor() -> ActionDescriptor;

    fn execute(request: Self::Request) -> <Self::Request as ActionRequest>::Response;
}
