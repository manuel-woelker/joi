use std::{path::PathBuf, sync::Arc};

use joi_error::{JoiResult, joi_error};
use joi_server::{
    command::CommandDescriptor,
    command_handler::CommandHandler,
    command_registry::{CommandProvider, CommandRegistryBuilder},
    data_store::{
        AttributeName, DataStoreQuery, QueryCriterion, SharedDataStore, TableName, Values,
    },
    generated::api::{GitCommit, GitHistoryRequest, GitHistoryResponse},
};

use crate::git::{GitHistory, GixGitHistory};

pub struct GitHistoryCommandProvider;

impl CommandProvider for GitHistoryCommandProvider {
    fn register_commands(
        &self,
        builder: &mut CommandRegistryBuilder,
        data_store: SharedDataStore,
    ) -> JoiResult<()> {
        builder.register(GitHistoryCommand {
            data_store,
            git: Arc::new(GixGitHistory),
        })?;
        builder.require_handlers(&[CommandDescriptor::of::<GitHistoryRequest>()])
    }
}

struct GitHistoryCommand {
    data_store: SharedDataStore,
    git: Arc<dyn GitHistory>,
}

impl CommandHandler for GitHistoryCommand {
    type Command = GitHistoryRequest;

    fn execute(
        &self,
        _context: &joi_server::command_handler::CommandContext,
        request: GitHistoryRequest,
    ) -> JoiResult<GitHistoryResponse> {
        let limit = usize::try_from(request.limit)
            .ok()
            .filter(|limit| (1..=200).contains(limit))
            .ok_or_else(|| joi_error!("history limit must be between 1 and 200"))?;
        let offset = request
            .cursor
            .as_deref()
            .map(str::parse::<usize>)
            .transpose()
            .map_err(|_| joi_error!("invalid history cursor"))?
            .unwrap_or(0);
        let (git_directory, branch) = self.resolve_branch(&request.branch_id)?;
        let commits = self
            .git
            .history(&git_directory, &branch, offset, limit + 1)?;
        let has_more = commits.len() > limit;
        let commits = commits
            .into_iter()
            .take(limit)
            .map(|commit| GitCommit {
                id: commit.id,
                parent_ids: commit.parent_ids,
                message: commit.message,
                author: commit.author,
                authored_at: commit.authored_at,
            })
            .collect();
        Ok(GitHistoryResponse {
            commits,
            next_cursor: has_more.then(|| (offset + limit).to_string()),
        })
    }
}

impl GitHistoryCommand {
    fn resolve_branch(&self, branch_id: &str) -> JoiResult<(PathBuf, String)> {
        let data_store = self
            .data_store
            .lock()
            .map_err(|_| joi_error!("data store lock is poisoned"))?;
        let branch = data_store.query(DataStoreQuery {
            table_name: TableName("repository_branches".into()),
            criterion: QueryCriterion::Equals {
                attribute: AttributeName("id".into()),
                values: vec![branch_id.into()],
            },
            max_results: 1,
            attributes: vec![
                AttributeName("repository_id".into()),
                AttributeName("name".into()),
            ],
        })?;
        let repository_id = first_string(&branch.result_columns[0].values)
            .ok_or_else(|| joi_error!("branch `{branch_id}` does not exist"))?;
        let branch_name = first_string(&branch.result_columns[1].values)
            .ok_or_else(|| joi_error!("branch `{branch_id}` has no name"))?;
        let repository = data_store.query(DataStoreQuery {
            table_name: TableName("repositories".into()),
            criterion: QueryCriterion::Equals {
                attribute: AttributeName("id".into()),
                values: vec![repository_id.into()],
            },
            max_results: 1,
            attributes: vec![AttributeName("path".into())],
        })?;
        let path = first_string(&repository.result_columns[0].values)
            .ok_or_else(|| joi_error!("repository for branch `{branch_id}` does not exist"))?;
        Ok((PathBuf::from(path), branch_name.to_owned()))
    }
}

fn first_string(values: &Values) -> Option<&str> {
    match values {
        Values::String(values) => values.first().map(|value| value.as_str()),
        _ => None,
    }
}
