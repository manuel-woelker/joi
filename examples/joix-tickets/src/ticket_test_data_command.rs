use joi_error::{JoiResult, joi_error};
use joi_server::{
    command::CommandDescriptor,
    command_handler::{CommandContext, CommandHandler},
    command_registry::{CommandProvider, CommandRegistryBuilder},
    data_store::SharedDataStore,
    generated::api::{GenerateTicketTestDataRequest, GenerateTicketTestDataResponse},
};

use crate::tickets_module::generate_additional_tickets;

const MAX_GENERATED_TICKETS: usize = 100_000;

pub struct TicketTestDataCommandProvider;

impl CommandProvider for TicketTestDataCommandProvider {
    fn register_commands(
        &self,
        builder: &mut CommandRegistryBuilder,
        data_store: SharedDataStore,
    ) -> JoiResult<()> {
        builder.register(GenerateTicketTestDataCommand { data_store })?;
        builder.require_handlers(&[CommandDescriptor::of::<GenerateTicketTestDataRequest>()])
    }
}

struct GenerateTicketTestDataCommand {
    data_store: SharedDataStore,
}

impl CommandHandler for GenerateTicketTestDataCommand {
    type Command = GenerateTicketTestDataRequest;

    fn execute(
        &self,
        _context: &CommandContext,
        request: Self::Command,
    ) -> JoiResult<GenerateTicketTestDataResponse> {
        let count = usize::try_from(request.count)
            .ok()
            .filter(|count| (1..=MAX_GENERATED_TICKETS).contains(count))
            .ok_or_else(|| {
                joi_error!("ticket count must be between 1 and {MAX_GENERATED_TICKETS}")
            })?;
        let mut store = self
            .data_store
            .lock()
            .map_err(|_| joi_error!("data store lock is poisoned"))?;
        let generated = generate_additional_tickets(store.as_mut(), count)?;
        Ok(GenerateTicketTestDataResponse {
            generated: i64::try_from(generated)
                .map_err(|_| joi_error!("generated ticket count is too large"))?,
        })
    }
}
