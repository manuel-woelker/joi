//! Compares JSON, bincode, and FlatBuffers encoding of individual entities.
//!
//! Each ticket is serialized into its own buffer, mirroring how entities are
//! stored. `Vec<AttributeColumn>` stays the interface on both ends: rows are
//! materialized from columns through [`Values::value_at`] for encoding and
//! rebuilt back into columns after decoding.
//!
//! The datasets mirror the `tickets` table: seven string columns with
//! representative identifier, key, title, description, status, and assignee
//! values, including nullable columns with scattered nulls.
//!
//! FlatBuffers has no `flatc` code generation in this repository, so the
//! benchmark writes and reads the wire format by hand with
//! `FlatBufferBuilder`, using the layout documented on
//! [`encode_flatbuffers_ticket`]. The bytes on the wire are identical to
//! generated code using the same schema.
//!
//! Run with:
//!
//! ```sh
//! cargo bench -p joi-server --bench attribute_columns
//! ```

use std::hint::black_box;
use std::time::Duration;

use criterion::{BenchmarkId, Criterion, Throughput, criterion_group};
use flatbuffers::{FlatBufferBuilder, Follow, ForwardsUOffset, Table, VOffsetT};
use joi_base::JoiString;
use joi_server::data_store::{AttributeColumn, AttributeName, Values};
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;

const ROW_COUNTS: [usize; 2] = [1_000, 10_000];

criterion_group!(benches, serialize_benchmarks, deserialize_benchmarks);

fn main() {
    print_encoded_sizes();
    benches();
    Criterion::default().configure_from_args().final_summary();
}

/// Representative ticket entity. Tickets are materialized from
/// `Vec<AttributeColumn>` for encoding and rebuilt back into columns after
/// decoding, so the column batch stays the interface in both directions.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
struct Ticket {
    id: JoiString,
    key: JoiString,
    project_id: Option<JoiString>,
    title: JoiString,
    description: JoiString,
    status: JoiString,
    assignee: Option<JoiString>,
}

/// Builds ticket-shaped entities with deterministic contents.
fn ticket_entities(row_count: usize) -> Vec<Ticket> {
    let mut rng = Rng(0x9E37_79B9_7F4A_7C15);
    (0..row_count)
        .map(|index| Ticket {
            id: base62_id(&mut rng),
            key: JoiString::from(format!("TEST-{}", index + 1)),
            project_id: Some(JoiString::from(format!("project-{}", rng.below(8)))),
            title: JoiString::from(sentence(&mut rng, 4, 9)),
            description: JoiString::from(paragraph(&mut rng)),
            status: JoiString::from(
                ["open", "in-progress", "closed", "wontfix"][rng.below(4) as usize],
            ),
            assignee: if rng.below(10) < 7 {
                Some(JoiString::from(format!("user-{}", rng.below(64))))
            } else {
                None
            },
        })
        .collect()
}

/// Expands entities into the columnar interface.
fn columns_from_tickets(tickets: &[Ticket]) -> Vec<AttributeColumn> {
    let mut ids = Vec::with_capacity(tickets.len());
    let mut keys = Vec::with_capacity(tickets.len());
    let mut project_ids = Vec::with_capacity(tickets.len());
    let mut titles = Vec::with_capacity(tickets.len());
    let mut descriptions = Vec::with_capacity(tickets.len());
    let mut statuses = Vec::with_capacity(tickets.len());
    let mut assignees = Vec::with_capacity(tickets.len());
    for ticket in tickets {
        ids.push(ticket.id.clone());
        keys.push(ticket.key.clone());
        project_ids.push(ticket.project_id.clone());
        titles.push(ticket.title.clone());
        descriptions.push(ticket.description.clone());
        statuses.push(ticket.status.clone());
        assignees.push(ticket.assignee.clone());
    }
    vec![
        string_column("id", ids),
        string_column("key", keys),
        nullable_string_column("project_id", project_ids),
        string_column("title", titles),
        string_column("description", descriptions),
        string_column("status", statuses),
        nullable_string_column("assignee", assignees),
    ]
}

/// Materializes entities back from the columnar interface, one row at a time.
fn tickets_from_columns(columns: &[AttributeColumn]) -> Vec<Ticket> {
    let column = |name: &str| {
        columns
            .iter()
            .find(|column| column.attribute.0.as_str() == name)
            .unwrap_or_else(|| panic!("column {name} present"))
    };
    let row_count = columns.first().map_or(0, |column| column.values.len());
    (0..row_count)
        .map(|index| Ticket {
            id: required_string(column("id").values.value_at(index)),
            key: required_string(column("key").values.value_at(index)),
            project_id: optional_string(column("project_id").values.value_at(index)),
            title: required_string(column("title").values.value_at(index)),
            description: required_string(column("description").values.value_at(index)),
            status: required_string(column("status").values.value_at(index)),
            assignee: optional_string(column("assignee").values.value_at(index)),
        })
        .collect()
}

fn required_string(value: JsonValue) -> JoiString {
    match value {
        JsonValue::String(text) => JoiString::from(text),
        unexpected => panic!("expected string value, found {unexpected}"),
    }
}

fn optional_string(value: JsonValue) -> Option<JoiString> {
    match value {
        JsonValue::Null => None,
        JsonValue::String(text) => Some(JoiString::from(text)),
        unexpected => panic!("expected nullable string value, found {unexpected}"),
    }
}

fn string_column(name: &str, values: Vec<JoiString>) -> AttributeColumn {
    AttributeColumn {
        attribute: AttributeName(JoiString::from(name)),
        values: Values::String(values),
    }
}

fn nullable_string_column(name: &str, values: Vec<Option<JoiString>>) -> AttributeColumn {
    AttributeColumn {
        attribute: AttributeName(JoiString::from(name)),
        values: Values::NullableString(values),
    }
}

fn bincode_config() -> bincode::config::Configuration {
    bincode::config::standard()
}

fn encode_json(ticket: &Ticket) -> Vec<u8> {
    serde_json::to_vec(ticket).expect("ticket serializes to JSON")
}

fn decode_json(bytes: &[u8]) -> Ticket {
    serde_json::from_slice(bytes).expect("ticket deserializes from JSON")
}

fn encode_bincode(ticket: &Ticket) -> Vec<u8> {
    bincode::serde::encode_to_vec(ticket, bincode_config()).expect("ticket serializes to bincode")
}

fn decode_bincode(bytes: &[u8]) -> Ticket {
    bincode::serde::decode_from_slice(bytes, bincode_config())
        .expect("ticket deserializes from bincode")
        .0
}

fn total_bytes(buffers: &[Vec<u8>]) -> u64 {
    buffers.iter().map(Vec::len).sum::<usize>() as u64
}

fn serialize_benchmarks(criterion: &mut Criterion) {
    let mut group = criterion.benchmark_group("serialize");
    group.measurement_time(Duration::from_secs(3));
    for row_count in ROW_COUNTS {
        let columns = columns_from_tickets(&ticket_entities(row_count));
        let tickets = tickets_from_columns(&columns);
        let json: Vec<Vec<u8>> = tickets.iter().map(encode_json).collect();
        let binary: Vec<Vec<u8>> = tickets.iter().map(encode_bincode).collect();
        let flat: Vec<Vec<u8>> = tickets.iter().map(encode_flatbuffers_ticket).collect();
        assert_eq!(
            columns_from_tickets(&decode_all(&json, decode_json)),
            columns
        );
        assert_eq!(
            columns_from_tickets(&decode_all(&binary, decode_bincode)),
            columns
        );
        assert_eq!(
            columns_from_tickets(&decode_all(&flat, decode_flatbuffers_ticket)),
            columns
        );

        group.throughput(Throughput::Bytes(total_bytes(&json)));
        group.bench_with_input(
            BenchmarkId::new("json", row_count),
            &tickets,
            |bencher, tickets| {
                bencher.iter(|| {
                    let mut total = 0;
                    for ticket in black_box(tickets) {
                        total += encode_json(ticket).len();
                    }
                    total
                });
            },
        );
        group.throughput(Throughput::Bytes(total_bytes(&binary)));
        group.bench_with_input(
            BenchmarkId::new("bincode", row_count),
            &tickets,
            |bencher, tickets| {
                bencher.iter(|| {
                    let mut total = 0;
                    for ticket in black_box(tickets) {
                        total += encode_bincode(ticket).len();
                    }
                    total
                });
            },
        );
        group.throughput(Throughput::Bytes(total_bytes(&flat)));
        group.bench_with_input(
            BenchmarkId::new("flatbuffers", row_count),
            &tickets,
            |bencher, tickets| {
                bencher.iter(|| {
                    let mut total = 0;
                    for ticket in black_box(tickets) {
                        total += encode_flatbuffers_ticket(ticket).len();
                    }
                    total
                });
            },
        );
    }
    group.finish();
}

fn deserialize_benchmarks(criterion: &mut Criterion) {
    let mut group = criterion.benchmark_group("deserialize");
    group.measurement_time(Duration::from_secs(3));
    for row_count in ROW_COUNTS {
        let columns = columns_from_tickets(&ticket_entities(row_count));
        let tickets = tickets_from_columns(&columns);
        let json: Vec<Vec<u8>> = tickets.iter().map(encode_json).collect();
        let binary: Vec<Vec<u8>> = tickets.iter().map(encode_bincode).collect();
        let flat: Vec<Vec<u8>> = tickets.iter().map(encode_flatbuffers_ticket).collect();

        group.throughput(Throughput::Bytes(total_bytes(&json)));
        group.bench_with_input(
            BenchmarkId::new("json", row_count),
            &json,
            |bencher, buffers| {
                bencher.iter(|| columns_from_tickets(&decode_all(black_box(buffers), decode_json)));
            },
        );
        group.throughput(Throughput::Bytes(total_bytes(&binary)));
        group.bench_with_input(
            BenchmarkId::new("bincode", row_count),
            &binary,
            |bencher, buffers| {
                bencher
                    .iter(|| columns_from_tickets(&decode_all(black_box(buffers), decode_bincode)));
            },
        );
        group.throughput(Throughput::Bytes(total_bytes(&flat)));
        group.bench_with_input(
            BenchmarkId::new("flatbuffers", row_count),
            &flat,
            |bencher, buffers| {
                bencher.iter(|| {
                    columns_from_tickets(&decode_all(black_box(buffers), decode_flatbuffers_ticket))
                });
            },
        );
    }
    group.finish();
}

fn decode_all(buffers: &[Vec<u8>], decode: fn(&[u8]) -> Ticket) -> Vec<Ticket> {
    buffers.iter().map(|buffer| decode(buffer)).collect()
}

fn print_encoded_sizes() {
    println!("one buffer per ticket (7 attributes, 2 nullable):");
    println!(
        "{:>8} {:>12} {:>12} {:>12}",
        "rows", "json", "bincode", "flatbuffers"
    );
    for row_count in ROW_COUNTS {
        let columns = columns_from_tickets(&ticket_entities(row_count));
        let tickets = tickets_from_columns(&columns);
        let json: Vec<Vec<u8>> = tickets.iter().map(encode_json).collect();
        let binary: Vec<Vec<u8>> = tickets.iter().map(encode_bincode).collect();
        let flat: Vec<Vec<u8>> = tickets.iter().map(encode_flatbuffers_ticket).collect();
        println!(
            "{row_count:>8} {:>12} {:>12} {:>12}  ({:.2}x / {:.2}x of json)",
            total_bytes(&json),
            total_bytes(&binary),
            total_bytes(&flat),
            total_bytes(&binary) as f64 / total_bytes(&json) as f64,
            total_bytes(&flat) as f64 / total_bytes(&json) as f64,
        );
    }
    println!();
}

/// FlatBuffers layout written by [`encode_flatbuffers_ticket`]:
///
/// ```text
/// Ticket {
///   id: string, key: string, project_id: string (absent means null),
///   title: string, description: string, status: string,
///   assignee: string (absent means null),
/// }
/// ```
const VT_TICKET_ID: VOffsetT = 4;
const VT_TICKET_KEY: VOffsetT = 6;
const VT_TICKET_PROJECT_ID: VOffsetT = 8;
const VT_TICKET_TITLE: VOffsetT = 10;
const VT_TICKET_DESCRIPTION: VOffsetT = 12;
const VT_TICKET_STATUS: VOffsetT = 14;
const VT_TICKET_ASSIGNEE: VOffsetT = 16;

fn encode_flatbuffers_ticket(ticket: &Ticket) -> Vec<u8> {
    let mut builder = FlatBufferBuilder::new();
    let id = builder.create_string(ticket.id.as_str());
    let key = builder.create_string(ticket.key.as_str());
    let project_id = ticket
        .project_id
        .as_ref()
        .map(|value| builder.create_string(value.as_str()));
    let title = builder.create_string(ticket.title.as_str());
    let description = builder.create_string(ticket.description.as_str());
    let status = builder.create_string(ticket.status.as_str());
    let assignee = ticket
        .assignee
        .as_ref()
        .map(|value| builder.create_string(value.as_str()));
    let table = builder.start_table();
    builder.push_slot_always(VT_TICKET_ID, id);
    builder.push_slot_always(VT_TICKET_KEY, key);
    if let Some(offset) = project_id {
        builder.push_slot_always(VT_TICKET_PROJECT_ID, offset);
    }
    builder.push_slot_always(VT_TICKET_TITLE, title);
    builder.push_slot_always(VT_TICKET_DESCRIPTION, description);
    builder.push_slot_always(VT_TICKET_STATUS, status);
    if let Some(offset) = assignee {
        builder.push_slot_always(VT_TICKET_ASSIGNEE, offset);
    }
    let finished = builder.end_table(table);
    builder.finish(finished, None);
    builder.finished_data().to_vec()
}

fn decode_flatbuffers_ticket(bytes: &[u8]) -> Ticket {
    // Safety: `bytes` always comes from `encode_flatbuffers_ticket`, so the
    // root offset and every table field follow the documented layout.
    // Skipping verification also keeps the comparison fair: neither
    // serde_json nor bincode pre-validates its input beyond parsing it.
    let root = unsafe {
        let offset = <u32 as Follow>::follow(bytes, 0);
        Table::new(bytes, offset as usize)
    };
    Ticket {
        id: required_field(root, VT_TICKET_ID),
        key: required_field(root, VT_TICKET_KEY),
        project_id: optional_field(root, VT_TICKET_PROJECT_ID),
        title: required_field(root, VT_TICKET_TITLE),
        description: required_field(root, VT_TICKET_DESCRIPTION),
        status: required_field(root, VT_TICKET_STATUS),
        assignee: optional_field(root, VT_TICKET_ASSIGNEE),
    }
}

fn required_field(table: Table<'_>, slot: VOffsetT) -> JoiString {
    JoiString::from(
        table_field::<ForwardsUOffset<&str>>(table, slot).expect("ticket field present"),
    )
}

fn optional_field(table: Table<'_>, slot: VOffsetT) -> Option<JoiString> {
    table_field::<ForwardsUOffset<&str>>(table, slot).map(JoiString::from)
}

/// Reads a table slot written by [`encode_flatbuffers_ticket`].
///
/// # Safety
///
/// `table` must come from a buffer produced by [`encode_flatbuffers_ticket`],
/// so every offset follows the documented layout.
fn table_field<'a, T: Follow<'a> + 'a>(table: Table<'a>, slot: VOffsetT) -> Option<T::Inner> {
    unsafe { table.get::<T>(slot, None) }
}

/// Deterministic 64-bit generator so benchmark inputs stay stable.
struct Rng(u64);

impl Rng {
    fn next(&mut self) -> u64 {
        let mut value = self.0;
        value ^= value << 13;
        value ^= value >> 7;
        value ^= value << 17;
        self.0 = value;
        value
    }

    fn below(&mut self, bound: u64) -> u64 {
        self.next() % bound
    }
}

/// Generates a 27-character base62 identifier shaped like a KSUID.
fn base62_id(rng: &mut Rng) -> JoiString {
    const ALPHABET: &[u8] = b"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
    (0..27)
        .map(|_| ALPHABET[rng.below(ALPHABET.len() as u64) as usize] as char)
        .collect::<String>()
        .into()
}

fn sentence(rng: &mut Rng, min_words: u64, max_words: u64) -> String {
    const WORDS: &[&str] = &[
        "fix",
        "navigation",
        "review",
        "table",
        "schema",
        "document",
        "ticket",
        "workflow",
        "filter",
        "status",
        "branch",
        "commit",
        "comment",
        "update",
        "check",
        "initial",
        "storage",
        "definition",
        "query",
        "reload",
        "selected",
        "view",
        "record",
        "column",
        "entity",
        "server",
        "plugin",
        "command",
        "render",
        "panel",
    ];
    let count = min_words + rng.below(max_words - min_words + 1);
    (0..count)
        .map(|index| {
            let word = WORDS[rng.below(WORDS.len() as u64) as usize];
            if index == 0 {
                let mut first = word.to_owned();
                first[..1].make_ascii_uppercase();
                first
            } else {
                word.to_owned()
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn paragraph(rng: &mut Rng) -> String {
    (0..2 + rng.below(3))
        .map(|_| format!("{}.", sentence(rng, 6, 12)))
        .collect::<Vec<_>>()
        .join(" ")
}
