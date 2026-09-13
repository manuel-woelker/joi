use std::{path::PathBuf, sync::Arc};

use joi_error::{JoiResult, joi_error};
use joi_server::{
    command::CommandDescriptor,
    command_handler::CommandHandler,
    command_registry::{CommandProvider, CommandRegistryBuilder},
    data_store::{
        AttributeColumn, AttributeName, ColumnDataType, ColumnDescription, DataStoreInsertMutation,
        DataStoreMutation, DataStoreMutationStep, DataStoreQuery, QueryCriterion, SharedDataStore,
        TableDescription, TableDescriptionProvider, TableName, Values,
    },
    generated::api::{CommitStatus, GitCommitDetails, GitCommitRequest},
};

use crate::git::{GitHistory, GixGitHistory};

pub struct CommitTableDescriptionProvider;

impl TableDescriptionProvider for CommitTableDescriptionProvider {
    fn table_description(&self) -> TableDescription {
        TableDescription {
            name: TableName("codevette_commits".into()),
            discoverable: false,
            columns: [
                ("commit_id", "Full Git object ID"),
                ("repository_id", "Owning repository ID"),
                ("parent_ids", "JSON encoded parent commit IDs"),
                ("message", "Complete commit message"),
                ("author", "Commit author"),
                ("authored_at", "RFC 3339 author date"),
                ("files_changed", "Changed text-file count"),
                ("lines_added", "Added text-line count"),
                ("lines_deleted", "Deleted text-line count"),
                ("patch", "Text-only unified patch"),
                ("status", "Review workflow status"),
            ]
            .into_iter()
            .map(|(name, description)| ColumnDescription {
                name: AttributeName(name.into()),
                description: description.into(),
                data_type: if matches!(name, "files_changed" | "lines_added" | "lines_deleted") {
                    ColumnDataType::Int
                } else {
                    ColumnDataType::String
                },
                optional: false,
                references: None,
            })
            .collect(),
        }
    }
}

pub struct GitCommitCommandProvider;
impl CommandProvider for GitCommitCommandProvider {
    fn register_commands(
        &self,
        builder: &mut CommandRegistryBuilder,
        data_store: SharedDataStore,
    ) -> JoiResult<()> {
        builder.register(GitCommitCommand {
            data_store,
            git: Arc::new(GixGitHistory),
        })?;
        builder.require_handlers(&[CommandDescriptor::of::<GitCommitRequest>()])
    }
}

struct GitCommitCommand {
    data_store: SharedDataStore,
    git: Arc<dyn GitHistory>,
}

impl CommandHandler for GitCommitCommand {
    type Command = GitCommitRequest;
    fn execute(
        &self,
        _context: &joi_server::command_handler::CommandContext,
        request: GitCommitRequest,
    ) -> JoiResult<GitCommitDetails> {
        let (repository_id, git_directory) = self.resolve_repository(&request.branch_id)?;
        if let Some(details) = self.cached(&request.commit_id)? {
            return Ok(details);
        }
        let details = self
            .git
            .commit_details(&git_directory, &request.commit_id)?;
        let response = GitCommitDetails {
            id: details.commit.id.clone(),
            parent_ids: details.commit.parent_ids.clone(),
            message: details.commit.message.clone(),
            author: details.commit.author.clone(),
            authored_at: details.commit.authored_at.clone(),
            files_changed: details.files_changed as i64,
            lines_added: details.lines_added as i64,
            lines_deleted: details.lines_deleted as i64,
            status: CommitStatus::Open,
            patch: details.patch.clone(),
        };
        self.store(&repository_id, &response)?;
        Ok(response)
    }
}

impl GitCommitCommand {
    fn resolve_repository(&self, branch_id: &str) -> JoiResult<(String, PathBuf)> {
        let store = self
            .data_store
            .lock()
            .map_err(|_| joi_error!("data store lock is poisoned"))?;
        let branch = store.query(DataStoreQuery {
            table_name: TableName("repository_branches".into()),
            criterion: QueryCriterion::Equals {
                attribute: AttributeName("id".into()),
                values: vec![branch_id.into()],
            },
            max_results: 1,
            attributes: vec![AttributeName("repository_id".into())],
        })?;
        let repository_id = string_at(&branch.result_columns[0].values, 0)
            .ok_or_else(|| joi_error!("branch `{branch_id}` does not exist"))?
            .to_owned();
        let repository = store.query(DataStoreQuery {
            table_name: TableName("repositories".into()),
            criterion: QueryCriterion::Equals {
                attribute: AttributeName("id".into()),
                values: vec![repository_id.as_str().into()],
            },
            max_results: 1,
            attributes: vec![AttributeName("path".into())],
        })?;
        let path = string_at(&repository.result_columns[0].values, 0)
            .ok_or_else(|| joi_error!("repository for branch `{branch_id}` does not exist"))?;
        Ok((repository_id, PathBuf::from(path)))
    }

    fn cached(&self, id: &str) -> JoiResult<Option<GitCommitDetails>> {
        let store = self
            .data_store
            .lock()
            .map_err(|_| joi_error!("data store lock is poisoned"))?;
        let attributes = [
            "parent_ids",
            "message",
            "author",
            "authored_at",
            "files_changed",
            "lines_added",
            "lines_deleted",
            "status",
            "patch",
        ];
        let result = store.query(DataStoreQuery {
            table_name: TableName("codevette_commits".into()),
            criterion: QueryCriterion::Equals {
                attribute: AttributeName("commit_id".into()),
                values: vec![id.into()],
            },
            max_results: 1,
            attributes: attributes.map(|value| AttributeName(value.into())).to_vec(),
        })?;
        if result.number_of_hits == 0 {
            return Ok(None);
        }
        let s = |index: usize| {
            string_at(&result.result_columns[index].values, 0)
                .map(str::to_owned)
                .ok_or_else(|| joi_error!("invalid cached commit"))
        };
        let n = |index: usize| {
            int_at(&result.result_columns[index].values, 0)
                .ok_or_else(|| joi_error!("invalid cached commit"))
        };
        Ok(Some(GitCommitDetails {
            id: id.to_owned(),
            parent_ids: serde_json::from_str(&s(0)?).map_err(joi_error::report)?,
            message: s(1)?,
            author: s(2)?,
            authored_at: s(3)?,
            files_changed: n(4)?,
            lines_added: n(5)?,
            lines_deleted: n(6)?,
            status: parse_status(&s(7)?)?,
            patch: s(8)?,
        }))
    }

    fn store(&self, repository_id: &str, details: &GitCommitDetails) -> JoiResult<()> {
        let mut store = self
            .data_store
            .lock()
            .map_err(|_| joi_error!("data store lock is poisoned"))?;
        let strings = [
            ("commit_id", details.id.clone()),
            ("repository_id", repository_id.to_owned()),
            (
                "parent_ids",
                serde_json::to_string(&details.parent_ids).map_err(joi_error::report)?,
            ),
            ("message", details.message.clone()),
            ("author", details.author.clone()),
            ("authored_at", details.authored_at.clone()),
            ("patch", details.patch.clone()),
            ("status", "open".to_owned()),
        ];
        let mut columns: Vec<_> = strings
            .into_iter()
            .map(|(name, value)| AttributeColumn {
                attribute: AttributeName(name.into()),
                values: Values::String(vec![value.into()]),
            })
            .collect();
        columns.extend(
            [
                ("files_changed", details.files_changed),
                ("lines_added", details.lines_added),
                ("lines_deleted", details.lines_deleted),
            ]
            .map(|(name, value)| AttributeColumn {
                attribute: AttributeName(name.into()),
                values: Values::Int(vec![value]),
            }),
        );
        store.mutate(DataStoreMutation {
            steps: vec![DataStoreMutationStep::Insert(DataStoreInsertMutation {
                table_name: TableName("codevette_commits".into()),
                columns,
            })],
        })?;
        Ok(())
    }
}

fn string_at(values: &Values, index: usize) -> Option<&str> {
    if let Values::String(values) = values {
        values.get(index).map(|v| v.as_str())
    } else {
        None
    }
}
fn int_at(values: &Values, index: usize) -> Option<i64> {
    if let Values::Int(values) = values {
        values.get(index).copied()
    } else {
        None
    }
}
fn parse_status(value: &str) -> JoiResult<CommitStatus> {
    match value {
        "open" => Ok(CommitStatus::Open),
        "review-requested" => Ok(CommitStatus::ReviewRequested),
        "in-review" => Ok(CommitStatus::InReview),
        "reworking" => Ok(CommitStatus::Reworking),
        "approved" => Ok(CommitStatus::Approved),
        _ => Err(joi_error!("invalid commit status `{value}`")),
    }
}
