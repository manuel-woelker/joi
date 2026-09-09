use std::any::TypeId;

/// Describes a command request and its corresponding response type.
pub trait Command: 'static {
    const NAME: &'static str;
    const DESCRIPTION: &'static str;
    type Response: 'static;
}

/// Runtime metadata for a statically described [`Command`].
#[derive(Debug, Clone, Copy)]
pub struct CommandDescriptor {
    pub name: &'static str,
    pub description: &'static str,
    request_type_id: fn() -> TypeId,
    response_type_id: fn() -> TypeId,
}

impl CommandDescriptor {
    pub const fn of<C: Command>() -> Self {
        Self {
            name: C::NAME,
            description: C::DESCRIPTION,
            request_type_id: type_id::<C>,
            response_type_id: type_id::<C::Response>,
        }
    }

    pub fn request_type_id(self) -> TypeId {
        (self.request_type_id)()
    }

    pub fn response_type_id(self) -> TypeId {
        (self.response_type_id)()
    }
}

fn type_id<T: 'static>() -> TypeId {
    TypeId::of::<T>()
}

#[cfg(test)]
mod tests {
    use std::any::TypeId;

    use super::{Command, CommandDescriptor};

    struct ExampleCommand;

    impl Command for ExampleCommand {
        const NAME: &'static str = "example";
        const DESCRIPTION: &'static str = "An example command";
        type Response = String;
    }

    #[test]
    fn describes_commands_at_runtime() {
        let command_descriptor = CommandDescriptor::of::<ExampleCommand>();

        assert_eq!(command_descriptor.name, "example");
        assert_eq!(command_descriptor.description, "An example command");
        assert_eq!(
            command_descriptor.request_type_id(),
            TypeId::of::<ExampleCommand>()
        );
        assert_eq!(
            command_descriptor.response_type_id(),
            TypeId::of::<String>()
        );
    }
}
