use std::collections::HashMap;
use std::fs::{File, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use tokio::sync::mpsc;
use tokio::task::JoinHandle;
use tracing_subscriber::fmt::MakeWriter;

enum LogTask {
    Write(usize, Vec<u8>),
    Flush(usize),
    Reopen,
    AddFile(usize, PathBuf, File),
    Terminal,
}
pub struct Writer<'a> {
    id: usize,
    sender: &'a mpsc::Sender<LogTask>,
}
impl Write for Writer<'_> {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        self.sender
            .try_send(LogTask::Write(self.id, buf.to_vec()))
            .map_err(|_| io::Error::new(io::ErrorKind::Other, "Failed to send log task"))?;
        Ok(buf.len())
    }

    fn flush(&mut self) -> io::Result<()> {
        self.sender
            .try_send(LogTask::Flush(self.id))
            .map_err(|_| io::Error::new(io::ErrorKind::Other, "Failed to send flush task"))?;
        Ok(())
    }
}
pub struct FileWriter {
    id: usize,
    sender: mpsc::Sender<LogTask>,
}
impl<'a> MakeWriter<'a> for FileWriter {
    type Writer = Writer<'a>;

    fn make_writer(&'a self) -> Self::Writer {
        Writer {
            id: self.id,
            sender: &self.sender,
        }
    }
}

pub struct LogWriter {
    id_acc: usize,
    sender: mpsc::Sender<LogTask>,
    handles: HashMap<PathBuf, File>,
}

impl LogWriter {
    pub fn new() -> anyhow::Result<(Self, JoinHandle<anyhow::Result<()>>)> {
        let (sender, mut tasks) = mpsc::channel::<LogTask>(128);
        let handle = tokio::spawn(async move {
            let mut map: HashMap<usize, (PathBuf, File)> = HashMap::new();
            while let Some(task) = tasks.recv().await {
                match task {
                    LogTask::Write(id, buf) => {
                        let file = match map.get_mut(&id) {
                            Some(r) => &mut r.1,
                            None => continue,
                        };
                        if let Err(err) = file.write_all(&buf) {
                            eprintln!("Failed to write to log file: {}", err);
                        }
                    }
                    LogTask::Flush(id) => {
                        let file = match map.get_mut(&id) {
                            Some(r) => &mut r.1,
                            None => continue,
                        };
                        if let Err(err) = file.flush() {
                            eprintln!("Failed to flush log file: {}", err);
                        };
                    }
                    LogTask::Reopen => {
                        for (_, (path, file)) in map.iter_mut() {
                            *file = match Self::open(path) {
                                Ok(file) => file,
                                Err(err) => {
                                    eprintln!("Failed to reopen log file: {}", err);
                                    return Err(err);
                                }
                            };
                        }
                    }
                    LogTask::AddFile(id, path, file) => {
                        map.insert(id, (path, file));
                    }
                    // 似乎不合适
                    LogTask::Terminal => {
                        drop(tasks);
                        break;
                    }
                }
            }
            Ok(()) as anyhow::Result<()>
        });
        Ok((
            Self {
                id_acc: 0,
                sender,
                handles: HashMap::new(),
            },
            handle,
        ))
    }
    fn open(path: &Path) -> anyhow::Result<File> {
        use anyhow::Context;
        OpenOptions::new()
            .append(true)
            .create(true)
            .open(path)
            .with_context(|| format!("Failed to open log file '{path:?}'"))
    }
    #[allow(unused)]
    pub fn create_file_writer(&mut self, path: impl AsRef<Path>) -> anyhow::Result<FileWriter> {
        let path = path.as_ref().to_path_buf();
        let file = if self.handles.contains_key(&path) {
            self.handles.get(&path)
        } else {
            let file = Self::open(&path)?;
            self.handles.insert(path.to_owned(), file);
            self.handles.get(&path)
        }
        .unwrap()
        .try_clone()?;
        self.id_acc += 1;
        self.sender
            .try_send(LogTask::AddFile(self.id_acc, path, file))
            .map_err(|_| io::Error::new(io::ErrorKind::Other, "Failed to send log task"))?;
        Ok(FileWriter {
            id: self.id_acc,
            sender: self.sender.clone(),
        })
    }
    /// 用于轮转日志，将会重新打开日志文件
    #[allow(unused)]
    pub fn reopen(&self) -> anyhow::Result<()> {
        self.sender
            .try_send(LogTask::Reopen)
            .map_err(|_| io::Error::new(io::ErrorKind::Other, "Failed to send log task"))?;
        Ok(())
    }
    pub fn terminal(&self) {
        if let Err(err) = self
            .sender
            .try_send(LogTask::Terminal)
            .map_err(|_| io::Error::new(io::ErrorKind::Other, "Failed to send log task"))
        {
            tracing::error!("{}", err)
        } else {
            println!("log terminating...");
        }
    }
}
