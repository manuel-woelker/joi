use joi_error::{JoiResult, joi_error, report};
use joi_server::data_store::{
    AttributeColumn, AttributeName, ColumnDataType, ColumnDescription, DataStoreInsertMutation,
    DataStoreMutation, DataStoreMutationStep, DataStoreQuery, DataStoreUpdateMutation,
    QueryCriterion, SharedDataStore, TableDescription, TableDescriptionProvider, TableName, Values,
};
use joi_server::{
    command::CommandDescriptor,
    command_handler::{CommandContext, CommandHandler},
    command_registry::{CommandProvider, CommandRegistryBuilder},
    generated::api::{
        DiffSide, ReviewComment, ReviewCommentSaveRequest, ReviewCommentsRequest,
        ReviewCommentsResponse,
    },
};
use time::{OffsetDateTime, format_description::well_known::Rfc3339};

/// Defines persisted single-line review comments and reply relationships.
pub struct ReviewCommentTableDescriptionProvider;

impl TableDescriptionProvider for ReviewCommentTableDescriptionProvider {
    fn table_description(&self) -> TableDescription {
        TableDescription {
            name: TableName("review_comments".into()),
            discoverable: false,
            columns: vec![
                string_column("id", "Immutable KSUID review comment identifier"),
                reference_column(
                    "commit_id",
                    "Commit being reviewed",
                    "codevette_commits",
                    false,
                ),
                string_column(
                    "created_at",
                    "Comment creation timestamp in RFC 3339 format",
                ),
                reference_column("author_id", "User who authored the comment", "users", false),
                reference_column(
                    "parent_id",
                    "Parent comment when this comment is a reply",
                    "review_comments",
                    true,
                ),
                string_column("file", "Repository-relative path of the commented file"),
                ColumnDescription {
                    name: AttributeName("line".into()),
                    description: "One-based line number on the selected diff side".into(),
                    data_type: ColumnDataType::Int,
                    optional: false,
                },
                string_column("side", "Diff side: additions or deletions"),
                string_column("comment", "Review comment text"),
            ],
        }
    }
}

/// Registers review-comment query and mutation commands.
pub struct ReviewCommentCommandProvider;

impl CommandProvider for ReviewCommentCommandProvider {
    fn register_commands(
        &self,
        builder: &mut CommandRegistryBuilder,
        data_store: SharedDataStore,
    ) -> JoiResult<()> {
        builder.register(ListReviewComments {
            data_store: data_store.clone(),
        })?;
        builder.register(SaveReviewComment { data_store })?;
        builder.require_handlers(&[
            CommandDescriptor::of::<ReviewCommentsRequest>(),
            CommandDescriptor::of::<ReviewCommentSaveRequest>(),
        ])
    }
}

struct ListReviewComments {
    data_store: SharedDataStore,
}
struct SaveReviewComment {
    data_store: SharedDataStore,
}

impl CommandHandler for ListReviewComments {
    type Command = ReviewCommentsRequest;

    fn execute(
        &self,
        _context: &CommandContext,
        request: Self::Command,
    ) -> JoiResult<ReviewCommentsResponse> {
        let store = self
            .data_store
            .lock()
            .map_err(|_| joi_error!("data store lock is poisoned"))?;
        let attributes = [
            "id",
            "commit_id",
            "created_at",
            "author_id",
            "parent_id",
            "file",
            "line",
            "side",
            "comment",
        ];
        let rows = store.query(DataStoreQuery {
            table_name: TableName("review_comments".into()),
            criterion: QueryCriterion::Equals {
                attribute: AttributeName("commit_id".into()),
                values: vec![request.commit_id.into()],
            },
            sorting: Vec::new(),
            max_results: 10_000,
            attributes: attributes.map(|name| AttributeName(name.into())).to_vec(),
        })?;
        let mut comments = Vec::with_capacity(rows.number_of_hits);
        for index in 0..rows.number_of_hits {
            let author_id = required_string(&rows.result_columns[3].values, index)?;
            let users = store.query(DataStoreQuery {
                table_name: TableName("users".into()),
                criterion: QueryCriterion::Equals {
                    attribute: AttributeName("id".into()),
                    values: vec![author_id.as_str().into()],
                },
                sorting: Vec::new(),
                max_results: 1,
                attributes: vec![AttributeName("username".into())],
            })?;
            comments.push(ReviewComment {
                id: required_string(&rows.result_columns[0].values, index)?,
                commit_id: required_string(&rows.result_columns[1].values, index)?,
                created_at: required_string(&rows.result_columns[2].values, index)?,
                author_id,
                author_username: required_string(&users.result_columns[0].values, 0)?,
                parent_id: optional_string(&rows.result_columns[4].values, index)?,
                file: required_string(&rows.result_columns[5].values, index)?,
                line: required_int(&rows.result_columns[6].values, index)?,
                side: parse_side(&required_string(&rows.result_columns[7].values, index)?)?,
                comment: required_string(&rows.result_columns[8].values, index)?,
            });
        }
        comments.sort_by(|left, right| left.created_at.cmp(&right.created_at));
        Ok(ReviewCommentsResponse { comments })
    }
}

impl CommandHandler for SaveReviewComment {
    type Command = ReviewCommentSaveRequest;

    fn execute(
        &self,
        context: &CommandContext,
        request: Self::Command,
    ) -> JoiResult<ReviewComment> {
        let user = context.require_user()?;
        let text = request.comment.trim();
        if text.is_empty() {
            return Err(joi_error!("review comment must not be empty"));
        }
        if request.line < 1 {
            return Err(joi_error!("review comment line must be positive"));
        }
        let side = side_name(&request.side);
        let mut store = self
            .data_store
            .lock()
            .map_err(|_| joi_error!("data store lock is poisoned"))?;
        if let Some(id) = request.id {
            let existing = store.query(DataStoreQuery {
                table_name: TableName("review_comments".into()),
                criterion: QueryCriterion::Equals {
                    attribute: AttributeName("id".into()),
                    values: vec![id.as_str().into()],
                },
                sorting: Vec::new(),
                max_results: 1,
                attributes: vec![
                    AttributeName("author_id".into()),
                    AttributeName("created_at".into()),
                    AttributeName("parent_id".into()),
                    AttributeName("commit_id".into()),
                    AttributeName("file".into()),
                    AttributeName("line".into()),
                    AttributeName("side".into()),
                ],
            })?;
            if required_string(&existing.result_columns[0].values, 0)? != user.id {
                return Err(joi_error!("only the comment author may edit it"));
            }
            store.mutate(DataStoreMutation {
                return_entities: false,
                steps: vec![DataStoreMutationStep::Update(DataStoreUpdateMutation {
                    table_name: TableName("review_comments".into()),
                    ids: vec![id.as_str().into()],
                    columns: vec![string_values("comment", text)],
                })],
            })?;
            return Ok(ReviewComment {
                id,
                commit_id: required_string(&existing.result_columns[3].values, 0)?,
                created_at: required_string(&existing.result_columns[1].values, 0)?,
                author_id: user.id.to_string(),
                author_username: user.username.to_string(),
                parent_id: optional_string(&existing.result_columns[2].values, 0)?,
                file: required_string(&existing.result_columns[4].values, 0)?,
                line: required_int(&existing.result_columns[5].values, 0)?,
                side: parse_side(&required_string(&existing.result_columns[6].values, 0)?)?,
                comment: text.to_owned(),
            });
        }
        if let Some(parent_id) = &request.parent_id {
            let parent = store.query(DataStoreQuery {
                table_name: TableName("review_comments".into()),
                criterion: QueryCriterion::Equals {
                    attribute: AttributeName("id".into()),
                    values: vec![parent_id.as_str().into()],
                },
                sorting: Vec::new(),
                max_results: 1,
                attributes: ["commit_id", "file", "line", "side"]
                    .map(|name| AttributeName(name.into()))
                    .to_vec(),
            })?;
            if parent.number_of_hits == 0 {
                return Err(joi_error!("review comment parent does not exist"));
            }
            let same_location = required_string(&parent.result_columns[0].values, 0)?
                == request.commit_id
                && required_string(&parent.result_columns[1].values, 0)? == request.file
                && required_int(&parent.result_columns[2].values, 0)? == request.line
                && required_string(&parent.result_columns[3].values, 0)? == side;
            if !same_location {
                return Err(joi_error!(
                    "review comment reply must use its parent's commit and diff location"
                ));
            }
        }
        let id = ksuid::Ksuid::generate().to_base62();
        let created_at = OffsetDateTime::now_utc().format(&Rfc3339).map_err(report)?;
        let parent_values = Values::NullableString(vec![request.parent_id.clone().map(Into::into)]);
        store.mutate(DataStoreMutation {
            return_entities: false,
            steps: vec![DataStoreMutationStep::Insert(DataStoreInsertMutation {
                table_name: TableName("review_comments".into()),
                columns: vec![
                    string_values("id", &id),
                    string_values("commit_id", &request.commit_id),
                    string_values("created_at", &created_at),
                    string_values("author_id", user.id.as_str()),
                    AttributeColumn {
                        attribute: AttributeName("parent_id".into()),
                        values: parent_values,
                    },
                    string_values("file", &request.file),
                    AttributeColumn {
                        attribute: AttributeName("line".into()),
                        values: Values::Int(vec![request.line]),
                    },
                    string_values("side", side),
                    string_values("comment", text),
                ],
            })],
        })?;
        Ok(ReviewComment {
            id,
            commit_id: request.commit_id,
            created_at,
            author_id: user.id.to_string(),
            author_username: user.username.to_string(),
            parent_id: request.parent_id,
            file: request.file,
            line: request.line,
            side: request.side,
            comment: text.to_owned(),
        })
    }
}

fn string_values(name: &'static str, value: &str) -> AttributeColumn {
    AttributeColumn {
        attribute: AttributeName(name.into()),
        values: Values::String(vec![value.into()]),
    }
}
fn required_string(values: &Values, index: usize) -> JoiResult<String> {
    match values {
        Values::String(values) => values.get(index).map(ToString::to_string),
        _ => None,
    }
    .ok_or_else(|| joi_error!("invalid review comment data"))
}
fn optional_string(values: &Values, index: usize) -> JoiResult<Option<String>> {
    match values {
        Values::NullableString(values) => values
            .get(index)
            .map(|value| value.as_ref().map(ToString::to_string)),
        Values::String(values) => values.get(index).map(|value| Some(value.to_string())),
        _ => None,
    }
    .ok_or_else(|| joi_error!("invalid review comment data"))
}
fn required_int(values: &Values, index: usize) -> JoiResult<i64> {
    match values {
        Values::Int(values) => values.get(index).copied(),
        _ => None,
    }
    .ok_or_else(|| joi_error!("invalid review comment data"))
}
fn side_name(side: &DiffSide) -> &'static str {
    match side {
        DiffSide::Additions => "additions",
        DiffSide::Deletions => "deletions",
    }
}
fn parse_side(side: &str) -> JoiResult<DiffSide> {
    match side {
        "additions" => Ok(DiffSide::Additions),
        "deletions" => Ok(DiffSide::Deletions),
        _ => Err(joi_error!("invalid diff side `{side}`")),
    }
}

fn string_column(name: &'static str, description: &'static str) -> ColumnDescription {
    ColumnDescription {
        name: AttributeName(name.into()),
        description: description.into(),
        data_type: ColumnDataType::String,
        optional: false,
    }
}

fn reference_column(
    name: &'static str,
    description: &'static str,
    entity: &'static str,
    optional: bool,
) -> ColumnDescription {
    ColumnDescription {
        name: AttributeName(name.into()),
        description: description.into(),
        data_type: ColumnDataType::Reference {
            entity: TableName(entity.into()),
        },
        optional,
    }
}

#[cfg(test)]
mod tests {
    use joi_server::data_store::TableDescriptionProvider;

    use super::ReviewCommentTableDescriptionProvider;

    #[test]
    fn describes_single_line_review_comments() {
        let table = ReviewCommentTableDescriptionProvider.table_description();

        assert_eq!(table.name.0, "review_comments");
        assert!(!table.discoverable);
        assert_eq!(
            table
                .columns
                .iter()
                .map(|column| column.name.0.as_str())
                .collect::<Vec<_>>(),
            [
                "id",
                "commit_id",
                "created_at",
                "author_id",
                "parent_id",
                "file",
                "line",
                "side",
                "comment",
            ]
        );
        assert!(table.columns[4].optional);
        assert!(
            table
                .columns
                .iter()
                .enumerate()
                .all(|(index, column)| index == 4 || !column.optional)
        );
    }
}
