//! Issue tracking API for bugs, tasks, and other work items.

use joi_base::JoiString;

/// Nominal identifier for [`Ticket`].
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TicketId(pub JoiString);

/// A work item representing a bug, task, or issue.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Ticket {
    /// Stable caller-provided identifier.
    pub id: TicketId,
    /// Short summary displayed in ticket lists.
    pub title: JoiString,
    /// Detailed description of the requested work.
    pub description: JoiString,
}

/// Input for [`TicketApi::create`].
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CreateInput {
    /// Complete tickets, including caller-provided IDs.
    pub tickets: Vec<Ticket>,
}

/// Input for [`TicketApi::get`].
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GetInput {
    /// Ticket IDs to retrieve.
    pub ticket_ids: Vec<TicketId>,
}

/// Output from [`TicketApi::get`].
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GetOutput {
    /// Tickets that were found.
    pub tickets: Vec<Ticket>,
}

/// Input for [`TicketApi::update`].
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UpdateInput {
    /// Ticket patches with required IDs.
    pub tickets: Vec<UpdateTicketsItem>,
}

/// Input for [`TicketApi::delete`].
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DeleteInput {
    /// Ticket IDs to delete.
    pub ticket_ids: Vec<TicketId>,
}

/// A work item representing a bug, task, or issue.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UpdateTicketsItem {
    /// Stable caller-provided identifier.
    pub id: TicketId,
    /// Short summary displayed in ticket lists.
    pub title: Option<JoiString>,
    /// Detailed description of the requested work.
    pub description: Option<JoiString>,
}

/// Issue tracking API for bugs, tasks, and other work items.
pub trait TicketApi {
    type Error;

    /// Creates all supplied tickets atomically.
    fn create(&self, input: CreateInput) -> Result<(), Self::Error>;

    /// Returns tickets found for the requested IDs.
    ///
    /// Unknown and duplicate IDs are omitted. Results retain request order.
    fn get(&self, input: GetInput) -> Result<GetOutput, Self::Error>;

    /// Updates all supplied tickets atomically.
    fn update(&self, input: UpdateInput) -> Result<(), Self::Error>;

    /// Deletes all identified tickets atomically.
    fn delete(&self, input: DeleteInput) -> Result<(), Self::Error>;
}
