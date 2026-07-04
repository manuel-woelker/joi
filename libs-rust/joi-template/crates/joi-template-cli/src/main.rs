use std::process::ExitCode;

use std::collections::BTreeMap;

use joi_template::{NativeDataSource, NativeValue, render};

fn main() -> ExitCode {
    match parse_args(std::env::args().skip(1)) {
        Ok(Command::Render(template)) => {
            let data = NativeDataSource::new(NativeValue::struct_(BTreeMap::new()));
            match render(&template, &data) {
                Ok(output) => {
                    println!("{output}");
                    ExitCode::SUCCESS
                }
                Err(error) => {
                    eprintln!("{error}");
                    ExitCode::FAILURE
                }
            }
        }
        Ok(Command::Help) => {
            print_usage();
            ExitCode::SUCCESS
        }
        Err(message) => {
            eprintln!("{message}");
            print_usage();
            ExitCode::FAILURE
        }
    }
}

#[derive(Debug, PartialEq, Eq)]
enum Command {
    Render(String),
    Help,
}

fn parse_args(args: impl Iterator<Item = String>) -> Result<Command, &'static str> {
    let collected: Vec<String> = args.collect();

    match collected.as_slice() {
        [] => Err("missing template argument"),
        [flag] if flag == "--help" || flag == "-h" => Ok(Command::Help),
        [template] => Ok(Command::Render(template.clone())),
        _ => Err("expected exactly one template argument"),
    }
}

fn print_usage() {
    eprintln!("Usage: joi-template-cli <template>");
    eprintln!("       joi-template-cli --help");
}

#[cfg(test)]
mod tests {
    use super::{Command, parse_args};

    #[test]
    fn parses_help_flag() {
        let command = parse_args(vec!["--help".to_owned()].into_iter()).unwrap();

        assert!(matches!(command, Command::Help));
    }

    #[test]
    fn parses_template_argument() {
        let command = parse_args(vec!["hello".to_owned()].into_iter()).unwrap();

        match command {
            Command::Render(template) => assert_eq!(template, "hello"),
            Command::Help => panic!("expected render command"),
        }
    }

    #[test]
    fn rejects_missing_arguments() {
        let error = parse_args(Vec::<String>::new().into_iter()).unwrap_err();

        assert_eq!(error, "missing template argument");
    }
}
