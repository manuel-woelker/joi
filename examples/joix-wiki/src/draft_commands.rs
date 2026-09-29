use joi_error::{JoiResult, joi_bail, joi_error};
use joi_server::{
    command::CommandDescriptor,
    command_handler::{CommandContext, CommandHandler},
    command_registry::{CommandProvider, CommandRegistryBuilder},
    data_store::{
        AttributeColumn, AttributeName, DataStore, DataStoreDeleteMutation,
        DataStoreInsertMutation, DataStoreMutation, DataStoreMutationStep, DataStoreQuery,
        DataStoreUpdateMutation, QueryCriterion, SharedDataStore, TableName, Values,
    },
    generated::api::{
        WikiDraftRequest, WikiDraftResponse, WikiPublishRequest, WikiPublishResponse,
    },
    mutation_contributor::MutationContext,
};

const PAGES: &str = "wikipages";
const DRAFTS: &str = "wikipage_drafts";

pub struct WikiDraftCommandProvider;

impl CommandProvider for WikiDraftCommandProvider {
    fn register_commands(
        &self,
        builder: &mut CommandRegistryBuilder,
        data_store: SharedDataStore,
    ) -> JoiResult<()> {
        builder.register(ReadWikiDraft {
            store: data_store.clone(),
        })?;
        builder.register(PublishWikiDraft { store: data_store })?;
        builder.require_handlers(&[
            CommandDescriptor::of::<WikiDraftRequest>(),
            CommandDescriptor::of::<WikiPublishRequest>(),
        ])
    }
}

struct ReadWikiDraft {
    store: SharedDataStore,
}
struct PublishWikiDraft {
    store: SharedDataStore,
}

impl CommandHandler for ReadWikiDraft {
    type Command = WikiDraftRequest;

    fn execute(
        &self,
        context: &CommandContext,
        request: WikiDraftRequest,
    ) -> JoiResult<WikiDraftResponse> {
        context.require_user()?;
        let mut store = self
            .store
            .lock()
            .map_err(|_| joi_error!("data store lock is poisoned"))?;
        if let Some(draft) = read_page(store.as_ref(), DRAFTS, &request.id)? {
            return Ok(draft);
        }
        let published = read_page(store.as_ref(), PAGES, &request.id)?
            .ok_or_else(|| joi_error!("wiki page `{}` does not exist", request.id))?;
        if !request.create {
            return Ok(WikiDraftResponse {
                exists: false,
                id: request.id,
                title: String::new(),
                content: String::new(),
            });
        }
        store.mutate(
            &MutationContext::for_user(context.user.as_ref()),
            DataStoreMutation {
                steps: vec![DataStoreMutationStep::Insert(DataStoreInsertMutation {
                    table_name: TableName(DRAFTS.into()),
                    columns: vec![
                        strings("id", &request.id),
                        strings("title", &published.title),
                        strings("content", &published.content),
                    ],
                })],
                return_entities: false,
            },
        )?;
        Ok(WikiDraftResponse {
            exists: true,
            ..published
        })
    }
}

impl CommandHandler for PublishWikiDraft {
    type Command = WikiPublishRequest;

    fn execute(
        &self,
        context: &CommandContext,
        request: WikiPublishRequest,
    ) -> JoiResult<WikiPublishResponse> {
        context.require_user()?;
        let mut store = self
            .store
            .lock()
            .map_err(|_| joi_error!("data store lock is poisoned"))?;
        let draft = read_page(store.as_ref(), DRAFTS, &request.id)?
            .ok_or_else(|| joi_error!("wiki draft `{}` does not exist", request.id))?;
        if draft.title.trim().is_empty() {
            joi_bail!("wiki page title must not be empty");
        }
        if read_page(store.as_ref(), PAGES, &request.id)?.is_none() {
            joi_bail!("wiki page `{}` does not exist", request.id);
        }
        let context = MutationContext::for_user(context.user.as_ref());
        store.mutate(
            &context,
            DataStoreMutation {
                steps: vec![DataStoreMutationStep::Update(DataStoreUpdateMutation {
                    table_name: TableName(PAGES.into()),
                    ids: vec![request.id.clone().into()],
                    columns: vec![
                        strings("title", &draft.title),
                        strings("content", &draft.content),
                    ],
                })],
                return_entities: false,
            },
        )?;
        store.mutate(
            &context,
            DataStoreMutation {
                steps: vec![DataStoreMutationStep::Delete(DataStoreDeleteMutation {
                    table_name: TableName(DRAFTS.into()),
                    ids: vec![request.id.into()],
                })],
                return_entities: false,
            },
        )?;
        Ok(WikiPublishResponse {
            title: draft.title,
            content: draft.content,
        })
    }
}

fn read_page(store: &dyn DataStore, table: &str, id: &str) -> JoiResult<Option<WikiDraftResponse>> {
    let result = store.query(DataStoreQuery {
        table_name: TableName(table.into()),
        criterion: QueryCriterion::Equals {
            attribute: AttributeName("id".into()),
            values: vec![id.into()],
        },
        sorting: Vec::new(),
        max_results: 2,
        attributes: ["id", "title", "content"]
            .map(|name| AttributeName(name.into()))
            .to_vec(),
    })?;
    if result.number_of_hits > 1 {
        joi_bail!("duplicate wiki page ID `{id}`");
    }
    if result.number_of_hits == 0 {
        return Ok(None);
    }
    let string = |index: usize| -> JoiResult<String> {
        match &result.result_columns[index].values {
            Values::String(values) => values
                .first()
                .map(ToString::to_string)
                .ok_or_else(|| joi_error!("wiki page has an invalid value")),
            _ => Err(joi_error!("wiki page has an invalid value")),
        }
    };
    Ok(Some(WikiDraftResponse {
        exists: true,
        id: string(0)?,
        title: string(1)?,
        content: string(2)?,
    }))
}

fn strings(attribute: &str, value: &str) -> AttributeColumn {
    AttributeColumn {
        attribute: AttributeName(attribute.into()),
        values: Values::String(vec![value.into()]),
    }
}
