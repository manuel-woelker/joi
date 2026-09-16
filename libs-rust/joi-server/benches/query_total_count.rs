use std::{hint::black_box, time::Duration, time::Instant};

use rusqlite::{Connection, Result, params};

const TICKET_COUNT: usize = 100_000;
const PAGE_SIZE: usize = 100;
const WARMUP_ITERATIONS: usize = 5;
const SAMPLE_ITERATIONS: usize = 40;

struct Measurement {
    name: &'static str,
    median: Duration,
    p95: Duration,
}

type Strategy = fn(&Connection) -> Result<(usize, usize)>;

fn main() -> Result<()> {
    let connection = fixture()?;
    let strategies: [(&str, Strategy); 3] = [
        ("separate count and page", separate_count_and_page),
        ("count window", count_window),
        ("scalar count subquery", scalar_count_subquery),
    ];

    println!("Query total-count benchmark");
    println!("Tickets: {TICKET_COUNT}, returned page size: {PAGE_SIZE}");
    println!("Filter: status != 'closed' (66,667 matching tickets)\n");

    for (_, strategy) in strategies {
        for _ in 0..WARMUP_ITERATIONS {
            assert_result(strategy(&connection)?);
        }
    }

    let mut samples: [Vec<Duration>; 3] =
        std::array::from_fn(|_| Vec::with_capacity(SAMPLE_ITERATIONS));
    for iteration in 0..SAMPLE_ITERATIONS {
        for offset in 0..strategies.len() {
            let index = (iteration + offset) % strategies.len();
            let strategy = strategies[index].1;
            let start = Instant::now();
            assert_result(black_box(strategy(black_box(&connection)))?);
            samples[index].push(start.elapsed());
        }
    }

    let mut measurements = Vec::new();
    for ((name, _), mut samples) in strategies.into_iter().zip(samples) {
        samples.sort_unstable();
        measurements.push(Measurement {
            name,
            median: samples[SAMPLE_ITERATIONS / 2],
            p95: samples[SAMPLE_ITERATIONS * 95 / 100],
        });
    }

    let fastest = measurements
        .iter()
        .map(|result| result.median)
        .min()
        .unwrap();
    for result in measurements {
        println!(
            "{:<25} median {:>9.3} ms  p95 {:>9.3} ms  {:>5.2}x",
            result.name,
            milliseconds(result.median),
            milliseconds(result.p95),
            result.median.as_secs_f64() / fastest.as_secs_f64(),
        );
    }

    Ok(())
}

fn fixture() -> Result<Connection> {
    let connection = Connection::open_in_memory()?;
    connection.execute_batch(
        "
        PRAGMA journal_mode = OFF;
        PRAGMA synchronous = OFF;
        CREATE TABLE tickets (
            id TEXT PRIMARY KEY,
            key TEXT NOT NULL,
            project_id TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT NOT NULL,
            status TEXT NOT NULL,
            assignee TEXT
        );
        WITH RECURSIVE ticket_number(value) AS (
            SELECT 1
            UNION ALL
            SELECT value + 1 FROM ticket_number WHERE value < 100000
        )
        INSERT INTO tickets (id, key, project_id, title, description, status, assignee)
        SELECT
            printf('ticket-%06d', value),
            printf('TEST-%d', value),
            'project-test',
            printf('Generated ticket number %d', value),
            printf('Benchmark description for generated ticket number %d.', value),
            CASE value % 3 WHEN 0 THEN 'closed' WHEN 1 THEN 'open' ELSE 'in-progress' END,
            CASE value % 2 WHEN 0 THEN 'user-jane' ELSE 'user-joe' END
        FROM ticket_number;
        CREATE INDEX tickets_status ON tickets(status);
        ",
    )?;
    Ok(connection)
}

fn separate_count_and_page(connection: &Connection) -> Result<(usize, usize)> {
    let total = connection.query_row(
        "SELECT COUNT(*) FROM tickets WHERE status != ?1",
        params!["closed"],
        |row| row.get(0),
    )?;
    let shown = consume_rows(
        connection,
        "SELECT id, key, title, status FROM tickets WHERE status != ?1 LIMIT ?2",
        false,
    )?
    .0;
    Ok((shown, total))
}

fn count_window(connection: &Connection) -> Result<(usize, usize)> {
    consume_rows(
        connection,
        "SELECT id, key, title, status, COUNT(*) OVER() FROM tickets WHERE status != ?1 LIMIT ?2",
        true,
    )
}

fn scalar_count_subquery(connection: &Connection) -> Result<(usize, usize)> {
    consume_rows(
        connection,
        "SELECT id, key, title, status,
                (SELECT COUNT(*) FROM tickets WHERE status != ?1)
         FROM tickets WHERE status != ?1 LIMIT ?2",
        true,
    )
}

fn consume_rows(connection: &Connection, sql: &str, has_count: bool) -> Result<(usize, usize)> {
    let mut statement = connection.prepare(sql)?;
    let mut rows = statement.query(params!["closed", PAGE_SIZE])?;
    let mut shown = 0;
    let mut total = 0;
    while let Some(row) = rows.next()? {
        black_box(row.get::<_, String>(0)?);
        black_box(row.get::<_, String>(1)?);
        black_box(row.get::<_, String>(2)?);
        black_box(row.get::<_, String>(3)?);
        if has_count {
            total = row.get(4)?;
        }
        shown += 1;
    }
    Ok((shown, total))
}

fn assert_result((shown, total): (usize, usize)) {
    assert_eq!(shown, PAGE_SIZE);
    assert_eq!(total, 66_667);
}

fn milliseconds(duration: Duration) -> f64 {
    duration.as_secs_f64() * 1_000.0
}
