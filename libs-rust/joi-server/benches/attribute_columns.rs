//! Compares JSON, bincode, and FlatBuffers encoding of columnar query results.
//!
//! The datasets mirror the `tickets` table: seven string columns with
//! representative identifier, key, title, description, status, and assignee
//! values, including nullable columns with scattered nulls.
//!
//! FlatBuffers has no `flatc` code generation in this repository, so the
//! benchmark writes and reads the wire format by hand with
//! `FlatBufferBuilder`, using the layout documented on
//! [`encode_flatbuffers`]. The bytes on the wire are identical to generated
//! code using the same schema.
//!
//! Run with:
//!
//! ```sh
//! cargo bench -p joi-server --bench attribute_columns
//! ```

use std::hint::black_box;
use std::time::Duration;

use criterion::{BenchmarkId, Criterion, Throughput, criterion_group};
use flatbuffers::{FlatBufferBuilder, Follow, ForwardsUOffset, Table, VOffsetT, Vector};
use joi_base::JoiString;
use joi_server::data_store::{AttributeColumn, AttributeName, Values};

const ROW_COUNTS: [usize; 2] = [1_000, 10_000];

criterion_group!(benches, serialize_benchmarks, deserialize_benchmarks);

fn main() {
    print_encoded_sizes();
    benches();
    Criterion::default().configure_from_args().final_summary();
}

/// Builds ticket-shaped attribute columns with deterministic contents.
fn ticket_columns(row_count: usize) -> Vec<AttributeColumn> {
    let mut rng = Rng(0x9E37_79B9_7F4A_7C15);
    let mut ids = Vec::with_capacity(row_count);
    let mut keys = Vec::with_capacity(row_count);
    let mut project_ids = Vec::with_capacity(row_count);
    let mut titles = Vec::with_capacity(row_count);
    let mut descriptions = Vec::with_capacity(row_count);
    let mut statuses = Vec::with_capacity(row_count);
    let mut assignees = Vec::with_capacity(row_count);
    for index in 0..row_count {
        ids.push(base62_id(&mut rng));
        keys.push(JoiString::from(format!("TEST-{}", index + 1)));
        project_ids.push(Some(JoiString::from(format!("project-{}", rng.below(8)))));
        titles.push(JoiString::from(sentence(&mut rng, 4, 9)));
        descriptions.push(JoiString::from(paragraph(&mut rng)));
        statuses.push(JoiString::from(
            ["open", "in-progress", "closed", "wontfix"][rng.below(4) as usize],
        ));
        assignees.push(if rng.below(10) < 7 {
            Some(JoiString::from(format!("user-{}", rng.below(64))))
        } else {
            None
        });
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

fn serialize_benchmarks(criterion: &mut Criterion) {
    let mut group = criterion.benchmark_group("serialize");
    group.measurement_time(Duration::from_secs(3));
    for row_count in ROW_COUNTS {
        let columns = ticket_columns(row_count);
        let json = serde_json::to_vec(&columns).expect("columns serialize to JSON");
        let binary = bincode::serde::encode_to_vec(&columns, bincode_config())
            .expect("columns serialize to bincode");
        let flat = encode_flatbuffers(&columns);
        assert_eq!(
            serde_json::from_slice::<Vec<AttributeColumn>>(&json)
                .expect("columns deserialize from JSON"),
            columns,
        );
        assert_eq!(
            bincode::serde::decode_from_slice::<Vec<AttributeColumn>, _>(&binary, bincode_config())
                .expect("columns deserialize from bincode")
                .0,
            columns,
        );
        assert_eq!(decode_flatbuffers(&flat), columns);

        group.throughput(Throughput::Bytes(json.len() as u64));
        group.bench_with_input(
            BenchmarkId::new("json", row_count),
            &columns,
            |bencher, columns| {
                bencher.iter(|| {
                    serde_json::to_vec(black_box(columns)).expect("columns serialize to JSON")
                });
            },
        );
        group.throughput(Throughput::Bytes(binary.len() as u64));
        group.bench_with_input(
            BenchmarkId::new("bincode", row_count),
            &columns,
            |bencher, columns| {
                bencher.iter(|| {
                    bincode::serde::encode_to_vec(black_box(columns), bincode_config())
                        .expect("columns serialize to bincode")
                });
            },
        );
        group.throughput(Throughput::Bytes(flat.len() as u64));
        group.bench_with_input(
            BenchmarkId::new("flatbuffers", row_count),
            &columns,
            |bencher, columns| {
                bencher.iter(|| encode_flatbuffers(black_box(columns)));
            },
        );
    }
    group.finish();
}

fn deserialize_benchmarks(criterion: &mut Criterion) {
    let mut group = criterion.benchmark_group("deserialize");
    group.measurement_time(Duration::from_secs(3));
    for row_count in ROW_COUNTS {
        let columns = ticket_columns(row_count);
        let json = serde_json::to_vec(&columns).expect("columns serialize to JSON");
        let binary = bincode::serde::encode_to_vec(&columns, bincode_config())
            .expect("columns serialize to bincode");
        let flat = encode_flatbuffers(&columns);

        group.throughput(Throughput::Bytes(json.len() as u64));
        group.bench_with_input(
            BenchmarkId::new("json", row_count),
            &json,
            |bencher, bytes| {
                bencher.iter(|| {
                    serde_json::from_slice::<Vec<AttributeColumn>>(black_box(bytes))
                        .expect("columns deserialize from JSON")
                });
            },
        );
        group.throughput(Throughput::Bytes(binary.len() as u64));
        group.bench_with_input(
            BenchmarkId::new("bincode", row_count),
            &binary,
            |bencher, bytes| {
                bencher.iter(|| {
                    bincode::serde::decode_from_slice::<Vec<AttributeColumn>, _>(
                        black_box(bytes),
                        bincode_config(),
                    )
                    .expect("columns deserialize from bincode")
                });
            },
        );
        group.throughput(Throughput::Bytes(flat.len() as u64));
        group.bench_with_input(
            BenchmarkId::new("flatbuffers", row_count),
            &flat,
            |bencher, bytes| {
                bencher.iter(|| decode_flatbuffers(black_box(bytes)));
            },
        );
    }
    group.finish();
}

fn print_encoded_sizes() {
    println!("ticket attribute columns (7 columns, including 2 nullable):");
    println!(
        "{:>8} {:>12} {:>12} {:>12}",
        "rows", "json", "bincode", "flatbuffers"
    );
    for row_count in ROW_COUNTS {
        let columns = ticket_columns(row_count);
        let json = serde_json::to_vec(&columns).expect("columns serialize to JSON");
        let binary = bincode::serde::encode_to_vec(&columns, bincode_config())
            .expect("columns serialize to bincode");
        let flat = encode_flatbuffers(&columns);
        println!(
            "{row_count:>8} {:>12} {:>12} {:>12}  ({:.2}x / {:.2}x of json)",
            json.len(),
            binary.len(),
            flat.len(),
            binary.len() as f64 / json.len() as f64,
            flat.len() as f64 / json.len() as f64,
        );
    }
    println!();
}

/// FlatBuffers layout written by [`encode_flatbuffers`]:
///
/// ```text
/// Columns { columns: [Column] }
/// Column { attribute: string, values_type: byte, values: offset, values_aux: offset }
/// ```
///
/// `values_type` selects the union stored in `values`: `0` is a vector of
/// strings, `1` is a vector of strings plus a byte null bitmap in
/// `values_aux` (`0` marks null entries, whose string slot is empty), and `2`
/// is a vector of int64 values.
const VT_ATTRIBUTE: VOffsetT = 4;
const VT_VALUES_TYPE: VOffsetT = 6;
const VT_VALUES: VOffsetT = 8;
const VT_VALUES_AUX: VOffsetT = 10;
const VT_COLUMNS: VOffsetT = 4;

const VALUES_STRINGS: u8 = 0;
const VALUES_NULLABLE_STRINGS: u8 = 1;
const VALUES_INTS: u8 = 2;

fn encode_flatbuffers(columns: &[AttributeColumn]) -> Vec<u8> {
    let mut builder = FlatBufferBuilder::new();
    let mut column_offsets = Vec::with_capacity(columns.len());
    for column in columns {
        let attribute = builder.create_string(column.attribute.0.as_str());
        let (values_type, values, auxiliary) = match &column.values {
            Values::String(values) => {
                let mut offsets = Vec::with_capacity(values.len());
                for value in values {
                    offsets.push(builder.create_string(value.as_str()));
                }
                (
                    VALUES_STRINGS,
                    builder.create_vector(&offsets).as_union_value(),
                    None,
                )
            }
            Values::NullableString(values) => {
                let mut offsets = Vec::with_capacity(values.len());
                let mut nulls = Vec::with_capacity(values.len());
                for value in values {
                    match value {
                        Some(text) => {
                            offsets.push(builder.create_string(text.as_str()));
                            nulls.push(1u8);
                        }
                        None => {
                            offsets.push(builder.create_string(""));
                            nulls.push(0u8);
                        }
                    }
                }
                let strings = builder.create_vector(&offsets).as_union_value();
                let bitmap = builder.create_vector(nulls.as_slice());
                (VALUES_NULLABLE_STRINGS, strings, Some(bitmap))
            }
            Values::Int(values) => (
                VALUES_INTS,
                builder.create_vector(values.as_slice()).as_union_value(),
                None,
            ),
        };
        let table = builder.start_table();
        builder.push_slot_always(VT_ATTRIBUTE, attribute);
        builder.push_slot(VT_VALUES_TYPE, values_type, 0u8);
        builder.push_slot_always(VT_VALUES, values);
        if let Some(auxiliary) = auxiliary {
            builder.push_slot_always(VT_VALUES_AUX, auxiliary);
        }
        column_offsets.push(builder.end_table(table));
    }
    let columns = builder.create_vector(&column_offsets);
    let root = builder.start_table();
    builder.push_slot_always(VT_COLUMNS, columns);
    let finished = builder.end_table(root);
    builder.finish(finished, None);
    builder.finished_data().to_vec()
}

fn decode_flatbuffers(bytes: &[u8]) -> Vec<AttributeColumn> {
    // Safety: `bytes` always comes from `encode_flatbuffers`, so the root
    // offset and every table field follow the documented layout. Skipping
    // verification also keeps the comparison fair: neither serde_json nor
    // bincode pre-validates its input beyond parsing it.
    let root = unsafe {
        let offset = <u32 as Follow>::follow(bytes, 0);
        Table::new(bytes, offset as usize)
    };
    let columns = table_field::<ForwardsUOffset<Vector<ForwardsUOffset<Table>>>>(root, VT_COLUMNS)
        .expect("columns vector");
    (0..columns.len())
        .map(|index| {
            let table = columns.get(index);
            let attribute =
                table_field::<ForwardsUOffset<&str>>(table, VT_ATTRIBUTE).expect("attribute");
            let values_type = table_field::<u8>(table, VT_VALUES_TYPE).unwrap_or(0);
            let values = match values_type {
                VALUES_STRINGS => {
                    let strings = table_field::<ForwardsUOffset<Vector<ForwardsUOffset<&str>>>>(
                        table, VT_VALUES,
                    )
                    .expect("string values");
                    Values::String(
                        (0..strings.len())
                            .map(|item| JoiString::from(strings.get(item)))
                            .collect(),
                    )
                }
                VALUES_NULLABLE_STRINGS => {
                    let strings = table_field::<ForwardsUOffset<Vector<ForwardsUOffset<&str>>>>(
                        table, VT_VALUES,
                    )
                    .expect("string values");
                    let bitmap = table_field::<ForwardsUOffset<Vector<u8>>>(table, VT_VALUES_AUX)
                        .expect("null bitmap");
                    Values::NullableString(
                        (0..strings.len())
                            .map(|item| {
                                if bitmap.get(item) == 0 {
                                    None
                                } else {
                                    Some(JoiString::from(strings.get(item)))
                                }
                            })
                            .collect(),
                    )
                }
                VALUES_INTS => {
                    let ints = table_field::<ForwardsUOffset<Vector<i64>>>(table, VT_VALUES)
                        .expect("int values");
                    Values::Int((0..ints.len()).map(|item| ints.get(item)).collect())
                }
                unexpected => panic!("unknown flatbuffer values type {unexpected}"),
            };
            AttributeColumn {
                attribute: AttributeName(JoiString::from(attribute)),
                values,
            }
        })
        .collect()
}

/// Reads a table slot written by [`encode_flatbuffers`].
///
/// # Safety
///
/// `table` must come from a buffer produced by [`encode_flatbuffers`], so
/// every offset follows the documented layout.
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
