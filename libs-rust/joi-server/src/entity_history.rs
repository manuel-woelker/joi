use joi_error::{JoiResult, joi_bail, joi_error, report};

use crate::{
    command_handler::{CommandContext, CommandHandler},
    data_store::{SharedDataStore, TableName},
    generated::api::{EntityHistoryRequest, EntityHistoryResponse, HistoryEntry},
    key_value_store::KeyValueStore,
    mutation_contributor::{EntityMutation, MutationContext, MutationContributor, MutationEntries},
};

/// Opt-in contributor that stores history in one auxiliary bucket per table.
pub struct HistoryContributor {
    tables: Vec<TableName>,
}

impl HistoryContributor {
    /// Enables auditing for the given entity tables.
    pub fn new(tables: Vec<TableName>) -> Self {
        Self { tables }
    }
}

/// Reserved, non-queryable namespace for an entity table's audit trail.
pub fn history_table(table: &TableName) -> TableName {
    TableName(format!("history_{}", table.0).into())
}

fn validate_id(id: &str) -> JoiResult<()> {
    let parsed = ksuid::Ksuid::from_base62(id).map_err(report)?;
    if parsed.to_base62() != id {
        joi_bail!("history IDs must be canonical KSUIDs");
    }
    Ok(())
}

impl MutationContributor for HistoryContributor {
    fn applies_to(&self, table: &TableName) -> bool {
        self.tables.contains(table)
    }
    fn buckets(&self) -> Vec<TableName> {
        self.tables.iter().map(history_table).collect()
    }
    fn provides_history(&self, table: &TableName) -> bool {
        self.applies_to(table)
    }
    fn contribute(
        &self,
        context: &MutationContext,
        mutations: &[EntityMutation],
        entries: &mut MutationEntries,
    ) -> JoiResult<()> {
        for mutation in mutations {
            validate_id(&mutation.entity_id)?;
            let entry = HistoryEntry {
                id: ksuid::Ksuid::generate().to_base62(),
                userid: context.userid().to_owned(),
                timestamp: context.timestamp().to_owned(),
                entity_id: mutation.entity_id.to_string(),
                r#type: mutation.operation.clone(),
                changes: mutation.changes.clone(),
            };
            entries.add_json(
                history_table(&mutation.table),
                format!("{}:{}", entry.entity_id, entry.id).into_bytes(),
                &entry,
            )?;
        }
        Ok(())
    }
}

pub(crate) fn read_history(
    store: &dyn KeyValueStore,
    table: &TableName,
    request: EntityHistoryRequest,
) -> JoiResult<EntityHistoryResponse> {
    validate_id(&request.entity_id)?;
    if let Some(cursor) = &request.cursor {
        validate_id(cursor)?;
    }
    let limit = request.limit.unwrap_or(50).clamp(1, 200) as usize;
    let start = format!("{}:", request.entity_id).into_bytes();
    let mut end = start.clone();
    *end.last_mut().expect("prefix includes colon") += 1;
    let before = request
        .cursor
        .map(|cursor| format!("{}:{cursor}", request.entity_id).into_bytes());
    let rows = store.query_range_page(
        &history_table(table),
        start.as_slice()..end.as_slice(),
        before.as_deref(),
        limit + 1,
    )?;
    let has_more = rows.len() > limit;
    let entries = rows
        .into_iter()
        .take(limit)
        .map(|row| serde_json::from_slice::<HistoryEntry>(&row.value).map_err(report))
        .collect::<JoiResult<Vec<_>>>()?;
    let next_cursor = has_more.then(|| entries.last().expect("nonempty page").id.clone());
    Ok(EntityHistoryResponse {
        enabled: true,
        entries,
        next_cursor,
    })
}

/// Authenticated read access to retained entity history.
pub struct EntityHistoryCommand {
    store: SharedDataStore,
}
impl EntityHistoryCommand {
    /// Creates the command with the shared, authoritative datastore.
    pub fn new(store: SharedDataStore) -> Self {
        Self { store }
    }
}
impl CommandHandler for EntityHistoryCommand {
    type Command = EntityHistoryRequest;
    fn execute(
        &self,
        context: &CommandContext,
        request: Self::Command,
    ) -> JoiResult<EntityHistoryResponse> {
        context.require_user()?;
        self.store
            .lock()
            .map_err(|_| joi_error!("data store lock is poisoned"))?
            .history(request)
    }
}
