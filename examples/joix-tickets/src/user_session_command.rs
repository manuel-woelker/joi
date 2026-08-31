use joi_base::JoiString;
use joi_error::{JoiResult, joi_bail, joi_error};
use serde::{Deserialize, Serialize};

use crate::command::{Command, CommandDescriptor, CommandRequest};
use crate::data_store::{
    AttributeColumn, AttributeName, ColumnDataType, ColumnDescription, ColumnReference, DataStore,
    DataStoreDeleteMutation, DataStoreInsertMutation, DataStoreMutation, DataStoreMutationStep,
    DataStoreQuery, DataStoreQueryResult, QueryCriterion, SharedDataStore, TableDescription,
    TableDescriptionProvider, TableName, Values,
};

pub const LOGIN_COMMAND: &str = "login";
pub const LOGOUT_COMMAND: &str = "logout";
pub const USER_INFO_COMMAND: &str = "user-info";
pub const SESSION_COOKIE: &str = "joix_session";

/// Defines persisted login sessions and their owning users.
pub struct UserSessionTableDescriptionProvider;

impl TableDescriptionProvider for UserSessionTableDescriptionProvider {
    fn table_description(&self) -> TableDescription {
        TableDescription {
            name: TableName("user_sessions".into()),
            columns: vec![
                ColumnDescription {
                    name: AttributeName("session_id".into()),
                    description: "Cryptographically unguessable session identifier".into(),
                    data_type: ColumnDataType::String,
                    optional: false,
                    references: None,
                },
                ColumnDescription {
                    name: AttributeName("user_id".into()),
                    description: "User owning this session".into(),
                    data_type: ColumnDataType::String,
                    optional: false,
                    references: Some(ColumnReference {
                        table: TableName("users".into()),
                        attribute: AttributeName("id".into()),
                    }),
                },
            ],
        }
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct LoginRequest {
    user_id: JoiString,
}

impl CommandRequest for LoginRequest {
    type Response = LoginResponse;
}

#[derive(Serialize)]
pub struct LoginResponse {
    pub session_id: JoiString,
    pub user: UserInfo,
}

pub struct LoginCommand {
    data_store: SharedDataStore,
}

impl LoginCommand {
    pub fn new(data_store: SharedDataStore) -> Self {
        Self { data_store }
    }
}

impl Command for LoginCommand {
    type Request = LoginRequest;

    fn descriptor() -> CommandDescriptor {
        CommandDescriptor {
            name: LOGIN_COMMAND.into(),
            description: "Creates a session for a selected user".into(),
        }
    }

    fn execute(&self, request: Self::Request) -> JoiResult<LoginResponse> {
        let mut data_store = self
            .data_store
            .lock()
            .map_err(|_| joi_error!("data store lock is poisoned"))?;
        let user = find_user(data_store.as_ref(), &request.user_id)?
            .ok_or_else(|| joi_error!("user `{}` does not exist", request.user_id))?;
        let session_id = generate_session_id()?;
        data_store.mutate(DataStoreMutation {
            steps: vec![DataStoreMutationStep::Insert(DataStoreInsertMutation {
                table_name: TableName("user_sessions".into()),
                columns: vec![
                    string_column("session_id", session_id.clone()),
                    string_column("user_id", request.user_id),
                ],
            })],
        })?;
        Ok(LoginResponse { session_id, user })
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct UserInfoRequest {
    session_id: JoiString,
}

impl CommandRequest for UserInfoRequest {
    type Response = UserInfo;
}

#[derive(Debug, PartialEq, Serialize)]
pub struct UserInfo {
    pub id: JoiString,
    pub username: JoiString,
    pub name: JoiString,
}

pub struct UserInfoCommand {
    data_store: SharedDataStore,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct LogoutRequest {
    session_id: JoiString,
}

impl CommandRequest for LogoutRequest {
    type Response = LogoutResponse;
}

#[derive(Debug, PartialEq, Serialize)]
pub struct LogoutResponse {}

pub struct LogoutCommand {
    data_store: SharedDataStore,
}

impl LogoutCommand {
    pub fn new(data_store: SharedDataStore) -> Self {
        Self { data_store }
    }
}

impl Command for LogoutCommand {
    type Request = LogoutRequest;

    fn descriptor() -> CommandDescriptor {
        CommandDescriptor {
            name: LOGOUT_COMMAND.into(),
            description: "Revokes the current user session".into(),
        }
    }

    fn execute(&self, request: Self::Request) -> JoiResult<LogoutResponse> {
        self.data_store
            .lock()
            .map_err(|_| joi_error!("data store lock is poisoned"))?
            .mutate(DataStoreMutation {
                steps: vec![DataStoreMutationStep::Delete(DataStoreDeleteMutation {
                    table_name: TableName("user_sessions".into()),
                    ids: vec![request.session_id],
                })],
            })?;
        Ok(LogoutResponse {})
    }
}

impl UserInfoCommand {
    pub fn new(data_store: SharedDataStore) -> Self {
        Self { data_store }
    }
}

impl Command for UserInfoCommand {
    type Request = UserInfoRequest;

    fn descriptor() -> CommandDescriptor {
        CommandDescriptor {
            name: USER_INFO_COMMAND.into(),
            description: "Returns the user associated with the current session".into(),
        }
    }

    fn execute(&self, request: Self::Request) -> JoiResult<UserInfo> {
        let data_store = self
            .data_store
            .lock()
            .map_err(|_| joi_error!("data store lock is poisoned"))?;
        let sessions = data_store.query(DataStoreQuery {
            table_name: TableName("user_sessions".into()),
            criterion: equals("session_id", request.session_id),
            max_results: 1,
            attributes: vec![AttributeName("user_id".into())],
        })?;
        let user_id = first_string(&sessions, "user_id")?
            .ok_or_else(|| joi_error!("session is not valid"))?;
        find_user(data_store.as_ref(), &user_id)?
            .ok_or_else(|| joi_error!("session user no longer exists"))
    }
}

fn find_user(data_store: &dyn DataStore, user_id: &str) -> JoiResult<Option<UserInfo>> {
    let users = data_store.query(DataStoreQuery {
        table_name: TableName("users".into()),
        criterion: equals("id", user_id.into()),
        max_results: 1,
        attributes: vec![
            AttributeName("id".into()),
            AttributeName("username".into()),
            AttributeName("name".into()),
        ],
    })?;
    let Some(id) = first_string(&users, "id")? else {
        return Ok(None);
    };
    Ok(Some(UserInfo {
        id,
        username: first_string(&users, "username")?
            .ok_or_else(|| joi_error!("user has no username"))?,
        name: first_string(&users, "name")?.ok_or_else(|| joi_error!("user has no name"))?,
    }))
}

fn first_string(result: &DataStoreQueryResult, attribute: &str) -> JoiResult<Option<JoiString>> {
    let Some(column) = result
        .result_columns
        .iter()
        .find(|column| column.attribute.0 == attribute)
    else {
        joi_bail!("query result has no `{attribute}` attribute");
    };
    let Values::String(values) = &column.values else {
        joi_bail!("query result attribute `{attribute}` is not a string");
    };
    Ok(values.first().cloned())
}

fn equals(attribute: &'static str, value: JoiString) -> QueryCriterion {
    QueryCriterion::Equals {
        attribute: AttributeName(attribute.into()),
        values: vec![value],
    }
}

fn string_column(attribute: &'static str, value: JoiString) -> AttributeColumn {
    AttributeColumn {
        attribute: AttributeName(attribute.into()),
        values: Values::String(vec![value]),
    }
}

fn generate_session_id() -> JoiResult<JoiString> {
    let mut bytes = [0_u8; 32];
    getrandom::fill(&mut bytes)
        .map_err(|error| joi_error!("failed to generate a secure session ID: {error}"))?;
    let mut encoded = String::with_capacity(bytes.len() * 2);
    const HEX: &[u8; 16] = b"0123456789abcdef";
    for byte in bytes {
        encoded.push(char::from(HEX[usize::from(byte >> 4)]));
        encoded.push(char::from(HEX[usize::from(byte & 0x0f)]));
    }
    Ok(encoded.into())
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use crate::command::Command;
    use crate::data_store::{
        DataStore, SharedDataStore, TableDescriptionProvider, TestDataProvider,
    };
    use crate::sqlite_data_store::SqliteDataStore;
    use crate::tickets_module::{UserTableDescriptionProvider, UserTestDataProvider};

    use super::{
        LoginCommand, LoginRequest, UserInfoCommand, UserInfoRequest,
        UserSessionTableDescriptionProvider,
    };

    #[test]
    fn creates_a_session_and_resolves_its_user() {
        let mut store = SqliteDataStore::in_memory().unwrap();
        store
            .ensure_tables(vec![
                UserTableDescriptionProvider.table_description(),
                UserSessionTableDescriptionProvider.table_description(),
            ])
            .unwrap();
        UserTestDataProvider.insert_test_data(&mut store).unwrap();
        let invalid_session = store.mutate(crate::data_store::DataStoreMutation {
            steps: vec![crate::data_store::DataStoreMutationStep::Insert(
                crate::data_store::DataStoreInsertMutation {
                    table_name: crate::data_store::TableName("user_sessions".into()),
                    columns: vec![
                        super::string_column("session_id", "invalid-session".into()),
                        super::string_column("user_id", "missing-user".into()),
                    ],
                },
            )],
        });
        assert!(invalid_session.is_err());
        let users = store
            .query(crate::data_store::DataStoreQuery {
                table_name: crate::data_store::TableName("users".into()),
                criterion: crate::data_store::QueryCriterion::MatchAny,
                max_results: 1,
                attributes: vec![crate::data_store::AttributeName("id".into())],
            })
            .unwrap();
        let user_id = super::first_string(&users, "id").unwrap().unwrap();
        let store: SharedDataStore = Arc::new(Mutex::new(Box::new(store)));

        let login = LoginCommand::new(store.clone())
            .execute(LoginRequest { user_id })
            .unwrap();
        assert_eq!(login.session_id.len(), 64);
        assert!(
            login
                .session_id
                .chars()
                .all(|character| character.is_ascii_hexdigit())
        );
        let user = UserInfoCommand::new(store)
            .execute(UserInfoRequest {
                session_id: login.session_id,
            })
            .unwrap();

        assert_eq!(user, login.user);
    }
}
