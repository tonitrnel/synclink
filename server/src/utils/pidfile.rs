use anyhow::Context;
use std::io::Write;
use std::path::Path;
use std::{fs, process};

static PID_FILE: &str = "/var/run/ephemera.pid";

pub struct Pidfile {}

impl Pidfile {
    #[allow(unused)]
    pub fn new() -> anyhow::Result<Self> {
        {
            let path = Path::new(PID_FILE);
            let mut file = fs::OpenOptions::new()
                .create(true)
                .truncate(true)
                .write(true)
                .open(path)
                .with_context(|| format!("Failed to create pidfile '{path:?}'"))?;
            file.write_all(format!("{}", process::id()).as_bytes())?;
        }
        Ok(Self {})
    }
}
impl Drop for Pidfile {
    fn drop(&mut self) {
        let path = Path::new(PID_FILE);
        if let Err(err) = fs::remove_file(path) {
            eprintln!("Failed to remove pidfile '{path:?}', reason: {err}")
        }
    }
}
