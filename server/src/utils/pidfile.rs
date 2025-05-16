use anyhow::Context;
use std::io::Write;
use std::path::PathBuf;
use std::{fs, process};

pub struct Pidfile {
    path: Option<PathBuf>,
}

impl Pidfile {
    #[cfg(target_os = "linux")]
    pub fn new() -> anyhow::Result<Self> {
        let uid = unsafe { nix::libc::getuid() as u32 };
        let path = if uid == 0 {
            PathBuf::from("/var/run/ephemera.pid")
        } else {
            PathBuf::from(format!("/run/user/{}/ephemera.pid", uid))
        };
        let mut file = fs::OpenOptions::new()
            .create(true)
            .truncate(true)
            .write(true)
            .open(&path)
            .with_context(|| format!("Failed to create pidfile '{path:?}'"))?;
        file.write_all(format!("{}", process::id()).as_bytes())?;
        Ok(Self { path: Some(path) })
    }
    #[cfg(target_os = "windows")]
    pub fn new() -> anyhow::Result<Self> {
        Ok(Self { path: None })
    }
}

impl Drop for Pidfile {
    fn drop(&mut self) {
        if let Some(path) = self.path.take() {
            if let Err(err) = fs::remove_file(&path) {
                eprintln!("Failed to remove pidfile '{path:?}', reason: {err}")
            }
        }
    }
}
