use crate::data_store::{
    AttributeName, ColumnDataType, ColumnDescription, TableDescription, TableDescriptionProvider,
    TableName,
};
use crate::module::{Module, ModuleInfo};

/// Contributes the table used to persist tickets.
pub struct TicketTableDescriptionProvider;

impl TableDescriptionProvider for TicketTableDescriptionProvider {
    fn table_description(&self) -> TableDescription {
        TableDescription {
            name: TableName("tickets".into()),
            columns: vec![
                ticket_column("id", "Unique ticket identifier"),
                ticket_column("title", "Short summary of the ticket"),
                ticket_column("description", "Detailed ticket description"),
                ticket_column("status", "Current workflow status"),
            ],
        }
    }
}

fn ticket_column(name: &'static str, description: &'static str) -> ColumnDescription {
    ColumnDescription {
        name: AttributeName(name.into()),
        description: description.into(),
        data_type: ColumnDataType::String,
    }
}

#[derive(Default)]
pub struct TicketsModule {}

impl Module for TicketsModule {
    fn info(&self) -> ModuleInfo {
        ModuleInfo {
            name: "tickets".into(),
            description: "Basic ticket module".into(),
            version: env!("CARGO_PKG_VERSION").into(),
        }
    }
}

#[cfg(test)]
mod tests {
    use crate::data_store::{ColumnDataType, TableDescriptionProvider};

    use super::TicketTableDescriptionProvider;

    #[test]
    fn describes_the_ticket_table() {
        let table = TicketTableDescriptionProvider.table_description();

        assert_eq!(table.name.0, "tickets");
        assert_eq!(
            table
                .columns
                .iter()
                .map(|column| column.name.0.as_str())
                .collect::<Vec<_>>(),
            ["id", "title", "description", "status"]
        );
        assert!(
            table
                .columns
                .iter()
                .all(|column| column.data_type == ColumnDataType::String)
        );
    }
}
