use std::{
    hint::black_box,
    time::{Duration, Instant},
};

use rusqlite::Connection;
use tantivy::{
    Index, IndexReader, Order, ReloadPolicy, TantivyDocument, Term,
    collector::{Count, FacetCollector, TopDocs},
    doc,
    query::{BooleanQuery, Occur, Query, TermQuery},
    schema::{Facet, FacetOptions, Field, IndexRecordOption, STORED, STRING, Schema, TEXT, Value},
};
use tempfile::TempDir;

const TICKET_COUNT: usize = 1_000_000;
const PAGE_SIZE: usize = 100;
const WARMUP_ITERATIONS: usize = 5;
const SAMPLE_ITERATIONS: usize = 40;

type BenchResult<T> = Result<T, Box<dyn std::error::Error>>;

#[derive(Clone, Copy)]
struct TicketFields {
    number: Field,
    id: Field,
    key: Field,
    project: Field,
    title: Field,
    description: Field,
    status: Field,
    assignee: Field,
    status_facet: Field,
    assignee_facet: Field,
}

struct SqliteBackend {
    connection: Connection,
    _directory: TempDir,
}

struct TantivyBackend {
    reader: IndexReader,
    fields: TicketFields,
    _directory: TempDir,
}

#[derive(Clone, Debug, PartialEq, Eq)]
enum Output {
    Rows(Vec<(String, String, String, String)>),
    Count(usize),
    Aggregate(Vec<(String, usize)>),
}

#[derive(Clone, Copy)]
enum Workload {
    SimpleRows,
    ComplexRows,
    SimpleCount,
    ComplexCount,
    SimpleAggregate,
    ComplexAggregate,
}

impl Workload {
    const ALL: [Self; 6] = [
        Self::SimpleRows,
        Self::ComplexRows,
        Self::SimpleCount,
        Self::ComplexCount,
        Self::SimpleAggregate,
        Self::ComplexAggregate,
    ];

    fn name(self) -> &'static str {
        match self {
            Self::SimpleRows => "rows: status=open, newest 100",
            Self::ComplexRows => "rows: status+project+assignee",
            Self::SimpleCount => "count: status=open",
            Self::ComplexCount => "count: status+project+assignee",
            Self::SimpleAggregate => "aggregate: status",
            Self::ComplexAggregate => "aggregate: assignee for active TEST",
        }
    }
}

struct Measurement {
    median: Duration,
    p95: Duration,
}

fn main() -> BenchResult<()> {
    println!("SQLite versus Tantivy query benchmark");
    println!("Tickets: {TICKET_COUNT}, row page size: {PAGE_SIZE}");
    println!("Samples: {SAMPLE_ITERATIONS}, warmups: {WARMUP_ITERATIONS}\n");

    let started = Instant::now();
    let sqlite = sqlite_fixture()?;
    let sqlite_indexing = started.elapsed();
    let started = Instant::now();
    let tantivy = tantivy_fixture()?;
    let tantivy_indexing = started.elapsed();
    println!(
        "Total indexing time: SQLite {:.3} s, Tantivy {:.3} s\n",
        sqlite_indexing.as_secs_f64(),
        tantivy_indexing.as_secs_f64()
    );

    println!(
        "{:<43} {:>12} {:>12} {:>9}",
        "workload", "SQLite", "Tantivy", "ratio"
    );
    println!("{}", "-".repeat(80));
    for workload in Workload::ALL {
        let expected = sqlite_query(&sqlite, workload)?;
        let actual = tantivy_query(&tantivy, workload)?;
        assert_eq!(
            actual,
            expected,
            "backend result mismatch for {}",
            workload.name()
        );

        let sqlite_result = measure(|| sqlite_query(&sqlite, workload))?;
        let tantivy_result = measure(|| tantivy_query(&tantivy, workload))?;
        println!(
            "{:<43} {:>8.3} ms {:>8.3} ms {:>8.2}x",
            workload.name(),
            milliseconds(sqlite_result.median),
            milliseconds(tantivy_result.median),
            tantivy_result.median.as_secs_f64() / sqlite_result.median.as_secs_f64(),
        );
        println!(
            "  {:<41} {:>8.3} ms {:>8.3} ms",
            "p95",
            milliseconds(sqlite_result.p95),
            milliseconds(tantivy_result.p95),
        );
    }
    Ok(())
}

fn measure(mut operation: impl FnMut() -> BenchResult<Output>) -> BenchResult<Measurement> {
    for _ in 0..WARMUP_ITERATIONS {
        black_box(operation()?);
    }
    let mut samples = Vec::with_capacity(SAMPLE_ITERATIONS);
    for _ in 0..SAMPLE_ITERATIONS {
        let started = Instant::now();
        black_box(operation()?);
        samples.push(started.elapsed());
    }
    samples.sort_unstable();
    Ok(Measurement {
        median: samples[SAMPLE_ITERATIONS / 2],
        p95: samples[SAMPLE_ITERATIONS * 95 / 100],
    })
}

fn sqlite_fixture() -> BenchResult<SqliteBackend> {
    let directory = tempfile::tempdir()?;
    let connection = Connection::open(directory.path().join("tickets.sqlite"))?;
    connection.execute_batch(&format!(
        "PRAGMA journal_mode = OFF;
         PRAGMA synchronous = OFF;
         CREATE TABLE tickets (
             number INTEGER PRIMARY KEY,
             id TEXT NOT NULL UNIQUE,
             key TEXT NOT NULL,
             project TEXT NOT NULL,
             title TEXT NOT NULL,
             description TEXT NOT NULL,
             status TEXT NOT NULL,
             assignee TEXT NOT NULL
         );
         WITH RECURSIVE ticket_number(value) AS (
             SELECT 1 UNION ALL
             SELECT value + 1 FROM ticket_number WHERE value < {TICKET_COUNT}
         )
         INSERT INTO tickets
         SELECT value,
                printf('ticket-%06d', value),
                printf(CASE value % 4 WHEN 0 THEN 'DEMO-%d' ELSE 'TEST-%d' END, value),
                CASE value % 4 WHEN 0 THEN 'DEMO' ELSE 'TEST' END,
                printf('Generated ticket %d about component %d', value, value % 25),
                printf('Benchmark description for ticket %d in component %d.', value, value % 25),
                CASE value % 4 WHEN 0 THEN 'closed' WHEN 1 THEN 'open' WHEN 2 THEN 'in-progress' ELSE 'review' END,
                CASE value % 3 WHEN 0 THEN 'jane' WHEN 1 THEN 'joe' ELSE 'alex' END
         FROM ticket_number;
         CREATE INDEX tickets_status_number ON tickets(status, number DESC);
         CREATE INDEX tickets_compound ON tickets(status, project, assignee, number DESC);
         CREATE INDEX tickets_project_status ON tickets(project, status);
         CREATE INDEX tickets_assignee ON tickets(assignee);"
    ))?;
    Ok(SqliteBackend {
        connection,
        _directory: directory,
    })
}

fn sqlite_query(backend: &SqliteBackend, workload: Workload) -> BenchResult<Output> {
    let connection = &backend.connection;
    match workload {
        Workload::SimpleRows => sqlite_rows(connection, "status = ?1", &["open"]),
        Workload::ComplexRows => sqlite_rows(
            connection,
            "status IN (?1, ?2) AND project = ?3 AND assignee = ?4",
            &["open", "in-progress", "TEST", "jane"],
        ),
        Workload::SimpleCount => sqlite_count(connection, "status = ?1", &["open"]),
        Workload::ComplexCount => sqlite_count(
            connection,
            "status IN (?1, ?2) AND project = ?3 AND assignee = ?4",
            &["open", "in-progress", "TEST", "jane"],
        ),
        Workload::SimpleAggregate => sqlite_aggregate(connection, "status", "1 = 1", &[]),
        Workload::ComplexAggregate => sqlite_aggregate(
            connection,
            "assignee",
            "status IN (?1, ?2, ?3) AND project = ?4",
            &["open", "in-progress", "review", "TEST"],
        ),
    }
}

fn sqlite_rows(connection: &Connection, predicate: &str, values: &[&str]) -> BenchResult<Output> {
    let sql = format!(
        "SELECT id, key, title, status FROM tickets WHERE {predicate} ORDER BY number DESC LIMIT {PAGE_SIZE}"
    );
    let mut statement = connection.prepare(&sql)?;
    let rows = statement.query_map(rusqlite::params_from_iter(values), |row| {
        Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
    })?;
    Ok(Output::Rows(rows.collect::<Result<_, _>>()?))
}

fn sqlite_count(connection: &Connection, predicate: &str, values: &[&str]) -> BenchResult<Output> {
    let sql = format!("SELECT COUNT(*) FROM tickets WHERE {predicate}");
    let count: i64 =
        connection.query_row(&sql, rusqlite::params_from_iter(values), |row| row.get(0))?;
    Ok(Output::Count(usize::try_from(count)?))
}

fn sqlite_aggregate(
    connection: &Connection,
    attribute: &str,
    predicate: &str,
    values: &[&str],
) -> BenchResult<Output> {
    let sql = format!(
        "SELECT {attribute}, COUNT(*) FROM tickets WHERE {predicate} GROUP BY {attribute} ORDER BY COUNT(*) DESC, {attribute} ASC"
    );
    let mut statement = connection.prepare(&sql)?;
    let rows = statement.query_map(rusqlite::params_from_iter(values), |row| {
        Ok((row.get(0)?, usize::try_from(row.get::<_, i64>(1)?).unwrap()))
    })?;
    Ok(Output::Aggregate(rows.collect::<Result<_, _>>()?))
}

fn tantivy_fixture() -> BenchResult<TantivyBackend> {
    let (schema, fields) = ticket_schema();
    let directory = tempfile::tempdir()?;
    let index = Index::create_in_dir(directory.path(), schema)?;
    let mut writer = index.writer(200_000_000)?;
    for number in 1..=TICKET_COUNT {
        let project = if number % 4 == 0 { "DEMO" } else { "TEST" };
        let status = match number % 4 {
            0 => "closed",
            1 => "open",
            2 => "in-progress",
            _ => "review",
        };
        let assignee = match number % 3 {
            0 => "jane",
            1 => "joe",
            _ => "alex",
        };
        let status_facet = format!("/status/{status}");
        let assignee_facet = format!("/assignee/{assignee}");
        writer.add_document(doc!(
            fields.number => number as u64,
            fields.id => format!("ticket-{number:06}"),
            fields.key => format!("{project}-{number}"),
            fields.project => project,
            fields.title => format!("Generated ticket {number} about component {}", number % 25),
            fields.description => format!("Benchmark description for ticket {number} in component {}.", number % 25),
            fields.status => status,
            fields.assignee => assignee,
            fields.status_facet => Facet::from(&status_facet),
            fields.assignee_facet => Facet::from(&assignee_facet),
        ))?;
    }
    writer.commit()?;
    let reader = index
        .reader_builder()
        .reload_policy(ReloadPolicy::Manual)
        .try_into()?;
    reader.reload()?;
    Ok(TantivyBackend {
        reader,
        fields,
        _directory: directory,
    })
}

fn ticket_schema() -> (Schema, TicketFields) {
    let mut schema = Schema::builder();
    let fields = TicketFields {
        number: schema.add_u64_field("number", tantivy::schema::INDEXED | tantivy::schema::FAST),
        id: schema.add_text_field("id", STRING | STORED),
        key: schema.add_text_field("key", STRING | STORED),
        project: schema.add_text_field("project", STRING),
        title: schema.add_text_field("title", TEXT | STORED),
        description: schema.add_text_field("description", TEXT),
        status: schema.add_text_field("status", STRING | STORED),
        assignee: schema.add_text_field("assignee", STRING),
        status_facet: schema.add_facet_field("status_facet", FacetOptions::default()),
        assignee_facet: schema.add_facet_field("assignee_facet", FacetOptions::default()),
    };
    (schema.build(), fields)
}

fn tantivy_query(backend: &TantivyBackend, workload: Workload) -> BenchResult<Output> {
    match workload {
        Workload::SimpleRows => tantivy_rows(backend, exact(backend.fields.status, "open")),
        Workload::ComplexRows => tantivy_rows(
            backend,
            complex_query(backend, &["open", "in-progress"], true),
        ),
        Workload::SimpleCount => tantivy_count(backend, exact(backend.fields.status, "open")),
        Workload::ComplexCount => tantivy_count(
            backend,
            complex_query(backend, &["open", "in-progress"], true),
        ),
        Workload::SimpleAggregate => tantivy_aggregate(
            backend,
            Box::new(tantivy::query::AllQuery),
            "status_facet",
            "/status",
        ),
        Workload::ComplexAggregate => tantivy_aggregate(
            backend,
            complex_query(backend, &["open", "in-progress", "review"], false),
            "assignee_facet",
            "/assignee",
        ),
    }
}

fn exact(field: Field, value: &str) -> Box<dyn Query> {
    Box::new(TermQuery::new(
        Term::from_field_text(field, value),
        IndexRecordOption::Basic,
    ))
}

fn complex_query(
    backend: &TantivyBackend,
    statuses: &[&str],
    with_assignee: bool,
) -> Box<dyn Query> {
    let status = BooleanQuery::new(
        statuses
            .iter()
            .map(|value| (Occur::Should, exact(backend.fields.status, value)))
            .collect(),
    );
    let mut clauses: Vec<(Occur, Box<dyn Query>)> = vec![
        (Occur::Must, Box::new(status)),
        (Occur::Must, exact(backend.fields.project, "TEST")),
    ];
    if with_assignee {
        clauses.push((Occur::Must, exact(backend.fields.assignee, "jane")));
    }
    Box::new(BooleanQuery::new(clauses))
}

fn tantivy_rows(backend: &TantivyBackend, query: Box<dyn Query>) -> BenchResult<Output> {
    let searcher = backend.reader.searcher();
    let top_docs = searcher.search(
        query.as_ref(),
        &TopDocs::with_limit(PAGE_SIZE).order_by_fast_field::<u64>("number", Order::Desc),
    )?;
    let mut rows = Vec::with_capacity(top_docs.len());
    for (_, address) in top_docs {
        let document: TantivyDocument = searcher.doc(address)?;
        let text = |field| {
            document
                .get_first(field)
                .and_then(|value| value.as_str())
                .unwrap()
                .to_owned()
        };
        rows.push((
            text(backend.fields.id),
            text(backend.fields.key),
            text(backend.fields.title),
            text(backend.fields.status),
        ));
    }
    Ok(Output::Rows(rows))
}

fn tantivy_count(backend: &TantivyBackend, query: Box<dyn Query>) -> BenchResult<Output> {
    Ok(Output::Count(
        backend.reader.searcher().search(query.as_ref(), &Count)?,
    ))
}

fn tantivy_aggregate(
    backend: &TantivyBackend,
    query: Box<dyn Query>,
    field: &str,
    root: &str,
) -> BenchResult<Output> {
    let mut collector = FacetCollector::for_field(field);
    collector.add_facet(root);
    let counts = backend
        .reader
        .searcher()
        .search(query.as_ref(), &collector)?;
    let mut aggregate = counts
        .get(root)
        .map(|(facet, count)| {
            let value = facet.to_path()[1].to_owned();
            (value, usize::try_from(count).unwrap())
        })
        .collect::<Vec<_>>();
    aggregate.sort_by(|left, right| right.1.cmp(&left.1).then_with(|| left.0.cmp(&right.0)));
    Ok(Output::Aggregate(aggregate))
}

fn milliseconds(duration: Duration) -> f64 {
    duration.as_secs_f64() * 1_000.0
}
