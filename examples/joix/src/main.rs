use std::{path::PathBuf, process::ExitCode};

use joi_server::ServerConfig;
use joix_codevette::codevette_plugin;
use joix_tickets::tickets_plugin;

const ENTITY_STORE_PATH: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/joix.redb");
const SEARCH_INDEX_PATH: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/joix.search");

fn main() -> ExitCode {
    joi_server::application_main(ServerConfig {
        application_name: env!("CARGO_PKG_NAME").into(),
        application_version: env!("CARGO_PKG_VERSION").into(),
        listen_address: "127.0.0.1:3000".into(),
        entity_store_path: PathBuf::from(ENTITY_STORE_PATH),
        search_index_path: PathBuf::from(SEARCH_INDEX_PATH),
        insert_test_data: true,
        plugins: vec![tickets_plugin(), codevette_plugin()],
    })
}
