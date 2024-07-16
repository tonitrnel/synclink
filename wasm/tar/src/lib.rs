use serde::ser::SerializeStruct;
use serde::{Serialize, Serializer};
use std::borrow::Cow;
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};
use tar::{EntryType, Header, PaxExtensions};
use wasm_bindgen::prelude::*;
use web_sys::console;

#[wasm_bindgen(typescript_custom_section)]
const TYPESCRIPT_TYPE_CONST: &'static str = r##"
export interface TarHeader{
    name: string
    path: string
    type: 'directory' | 'file' | 'unknown',
    mtime: number
}
export type PullResult = {
    type: 'further'
} | {
    type: 'header'
    payload: TarHeader
} | {
    type: 'data'
    payload: Uint8Array
}
"##;

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(typescript_type = "PullResult")]
    pub type TPullResult;
}
fn exit(message: impl AsRef<str>) -> ! {
    let str = message.as_ref();
    #[cfg(target_arch = "wasm32")]
    {
        console::error_1(&str.into())
    }
    panic!("{}", str)
}

#[wasm_bindgen]
pub struct TarBinding {
    buffer: Vec<u8>,
}

#[wasm_bindgen]
impl TarBinding {
    pub fn create(capacity: f64) -> Self {
        let buffer = Vec::with_capacity(capacity as usize);
        Self { buffer }
    }
    /// 获取 buffer 的内存地址，这可以从 WASM Buffer 中直接写入/读取数据
    ///
    ///  **Example**:
    /// ```typescript
    /// import { TarBinding } from 'tar-binding';
    /// import * as tarWasm from 'tar-binding/tar_binding_bg.wasm';
    /// const tar = TarBinding.create(2048);
    /// const wasm_buffer = new Uint8Array(tarWasm.memory.buffer);
    /// const ptr = tar.as_ptr();
    /// wasm_buffer.slice(ptr, ptr + 2048); // 分配的内存
    /// ```
    pub fn as_ptr(&self) -> *const u8 {
        self.buffer.as_ptr()
    }
    /// 向 Buffer 插入目录头
    ///
    /// **返回**:
    ///
    /// 已写入数据长度: f64
    ///
    /// **Example**:
    /// ```typescript
    /// const len = tar.append_dir_header(path, mtime);
    /// wasm_buffer.slice(ptr, ptr + len); // 目录头数据
    /// ```
    pub fn append_dir_header(&mut self, path: &str, mtime: f64) -> f64 {
        self.buffer.clear();
        match append_dir_header(&mut self.buffer, path, mtime as u64) {
            Ok(v) => v as f64,
            Err(err) => exit(format!("Failed to append dir header, reason: {err:?}")),
        }
    }
    /// 插入文件头
    ///
    /// **返回**:
    ///
    /// 已写入数据长度: f64
    ///
    /// **Example**:
    /// ```typescript
    /// const len = tar.append_file_header(path, size, mtime);
    /// wasm_buffer.slice(ptr, ptr + len); // 文件头数据
    /// ```
    pub fn append_file_header(&mut self, path: &str, size: f64, mtime: f64) -> f64 {
        self.buffer.clear();
        match append_file_header(&mut self.buffer, path, size as u64, mtime as u64) {
            Ok(v) => v as f64,
            Err(err) => {
                console::error_1(&format!("Failed to append file header, reason: {err:?}").into());
                panic!("{:?}", err)
            }
        }
    }
}

enum ProcessState {
    Start,
    ParseHeader(Box<Header>),
    ParseGunLongName(usize),   // pad
    ParseGunLongLink(usize),   // pad
    ParsePaxExtensions(usize), // pad
    #[allow(unused)]
    SpareData(Box<Header>, usize),
    Data(usize, usize), // size, pad
}
struct ProcessContext {
    processed: usize,
    gnu_longname: Option<Vec<u8>>,
    gnu_longlink: Option<Vec<u8>>,
    pax_extensions: Option<Vec<u8>>,
}

impl ProcessContext {
    fn new() -> Self {
        Self {
            processed: 0,
            gnu_longname: None,
            gnu_longlink: None,
            pax_extensions: None,
        }
    }
}

#[derive(Debug)]
pub struct TarHeader {
    inner: Box<Header>,
    long_pathname: Option<Vec<u8>>,
    #[allow(unused)]
    long_linkname: Option<Vec<u8>>,
    size: u64,
    pax_extensions: Option<Vec<u8>>,
}
impl TarHeader {
    pub fn name(&self) -> String {
        let path = self.path().to_string_lossy().to_string();
        if self.is_dir() {
            let path = path.trim_end_matches('/');
            path.rsplit_once('/')
                .map(|(_, it)| it.to_string())
                .unwrap_or_else(|| path.to_string())
        } else {
            path.rsplit_once('/')
                .map(|(_, it)| it.to_string())
                .unwrap_or_default()
        }
    }
    pub fn path(&self) -> Cow<Path> {
        bytes2path(self._path_bytes()).unwrap()
    }
    fn _path_bytes(&self) -> Cow<[u8]> {
        match self.long_pathname {
            Some(ref bytes) => {
                if let Some(&0) = bytes.last() {
                    Cow::Borrowed(&bytes[..bytes.len() - 1])
                } else {
                    Cow::Borrowed(bytes)
                }
            }
            None => {
                if let Some(ref pax) = self.pax_extensions {
                    let pax = PaxExtensions::new(pax)
                        .filter_map(|it| it.ok())
                        .find(|it| it.key_bytes() == b"path")
                        .map(|it| it.value_bytes());
                    if let Some(field) = pax {
                        return Cow::Borrowed(field);
                    }
                }
                self.inner.path_bytes()
            }
        }
    }
    pub fn path_bytes(&self) -> Vec<u8> {
        self._path_bytes().to_vec()
    }
    pub fn size(&self) -> u64 {
        self.size
    }
    pub fn mtime(&self) -> u64 {
        self.inner.mtime().unwrap()
    }
    pub fn is_file(&self) -> bool {
        self.inner.entry_type().is_file()
    }
    pub fn is_dir(&self) -> bool {
        self.inner.entry_type().is_dir()
    }
    pub fn entry_type(&self) -> EntryType {
        self.inner.entry_type()
    }
}

impl Serialize for TarHeader {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let mut s = serializer.serialize_struct("DirEntry", 4)?;
        s.serialize_field("name", &self.name())?;
        s.serialize_field("path", &self.path())?;
        s.serialize_field(
            "type",
            match self.entry_type() {
                EntryType::Regular => "file",
                EntryType::Directory => "directory",
                _ => "unknown",
            },
        )?;
        s.serialize_field("mtime", &self.mtime())?;
        s.end()
    }
}

#[derive(Debug, Serialize)]
#[serde(tag = "type", content = "payload", rename_all = "kebab-case")]
pub enum PullResult {
    Further,
    Header(Box<TarHeader>),
    Data(Vec<u8>),
}

#[wasm_bindgen]
pub struct TarExtractor {
    buffer: Vec<u8>,
    required_bytes: usize,
    state: ProcessState,
    ctx: ProcessContext,
}
#[wasm_bindgen]
impl TarExtractor {
    pub fn create(capacity: f64) -> Self {
        Self {
            required_bytes: 0,
            buffer: Vec::with_capacity(capacity as usize),
            state: ProcessState::Start,
            ctx: ProcessContext::new(),
        }
    }
    pub fn pullable(&self) -> bool {
        self.buffer.len() >= self.required_bytes
    }
    pub fn push(&mut self, chunk: Vec<u8>) {
        self.buffer.extend(&chunk);
    }
    pub fn as_ptr(&self) -> *const u8 {
        self.buffer.as_ptr()
    }
    fn pull(&mut self) -> PullResult {
        // | loop
        // |- 第一次读取：解析 EntryBlock，得到 Header
        // |  第二次读取：解析 gnu_longname
        // |  第三次读取：解析 gnu_longlink
        // |- 第四次读取：解析 pax_extensions
        // 第五次读取：解析 sparse data / data

        // 为了不占用大量内存，每次读取都需要交替读写
        if !self.pullable() {
            return PullResult::Further;
        }
        self.next().unwrap_or_else(|err| {
            exit(format!("Failed to pull next result, reason: {err:?}"));
        })
    }
    #[wasm_bindgen(js_name = pull)]
    pub fn wasm_pull(&mut self) -> TPullResult {
        serde_wasm_bindgen::to_value(&self.pull())
            .unwrap()
            .unchecked_into::<TPullResult>()
    }
    fn next(&mut self) -> io::Result<PullResult> {
        match &mut self.state {
            ProcessState::Start => {
                self.state = ProcessState::ParseHeader(Box::new(Header::new_old()));
                self.ctx.processed = 0;
                self.required_bytes = 512usize.saturating_sub(self.buffer.len());
                Ok(PullResult::Further)
            }
            ProcessState::ParseHeader(ref mut header) => {
                // fill header
                let size = {
                    let bytes = self.buffer.drain(0..512);
                    // skip space block
                    if bytes.as_ref().iter().all(|it| it == &0) {
                        self.state = ProcessState::Start;
                        return Ok(PullResult::Further);
                    }
                    // println!(
                    //     "fill header size: {:?} bytes: {:02x?}({})",
                    //     self.required_bytes,
                    //     &bytes.as_ref()[0..4],
                    //     bytes.len()
                    // );
                    header.as_mut_bytes().copy_from_slice(bytes.as_ref());
                    TarExtractor::entry_raw(header, self.ctx.pax_extensions.as_deref())? as usize
                };

                let is_recognized_header = header.as_gnu().is_some() || header.as_ustar().is_some();
                if is_recognized_header && header.entry_type().is_gnu_longname() {
                    if self.ctx.gnu_longname.is_some() {
                        return Err(io::Error::new(
                            io::ErrorKind::Other,
                            "two long name entries describing \
                         the same member",
                        ));
                    }
                    let (size, pad) = round512(size);
                    self.required_bytes = size;
                    self.state = ProcessState::ParseGunLongName(pad);
                    return Ok(PullResult::Further);
                }
                if is_recognized_header && header.entry_type().is_gnu_longlink() {
                    if self.ctx.gnu_longlink.is_some() {
                        return Err(io::Error::new(
                            io::ErrorKind::Other,
                            "two long link entries describing \
                         the same member",
                        ));
                    }
                    let (size, pad) = round512(size);
                    self.required_bytes = size;
                    self.state = ProcessState::ParseGunLongLink(pad);
                    return Ok(PullResult::Further);
                }
                if is_recognized_header && header.entry_type().is_pax_local_extensions() {
                    if self.ctx.pax_extensions.is_some() {
                        return Err(io::Error::new(
                            io::ErrorKind::Other,
                            "two pax extensions entries describing \
                         the same member",
                        ));
                    }
                    let (size, pad) = round512(size);
                    self.required_bytes = size;
                    self.state = ProcessState::ParsePaxExtensions(pad);
                    return Ok(PullResult::Further);
                }

                let state = if header.entry_type().is_gnu_sparse() {
                    // spare data
                    let mut new_header = Header::new_gnu();
                    new_header.as_mut_bytes().copy_from_slice(header.as_bytes());
                    std::mem::replace(
                        &mut self.state,
                        ProcessState::SpareData(Box::new(new_header), size),
                    )
                } else {
                    // standard data
                    let (size, pad) = round512(size);
                    self.required_bytes = size.min(self.buffer.capacity() / 2);
                    std::mem::replace(&mut self.state, ProcessState::Data(size, pad))
                };
                let header = match state {
                    ProcessState::ParseHeader(header) => header,
                    _ => unreachable!(),
                };
                Ok(PullResult::Header(Box::new(TarHeader {
                    inner: header,
                    size: size as u64,
                    pax_extensions: std::mem::take(&mut self.ctx.pax_extensions),
                    long_pathname: std::mem::take(&mut self.ctx.gnu_longname),
                    long_linkname: std::mem::take(&mut self.ctx.gnu_longlink),
                })))
            }
            ProcessState::ParseGunLongName(pad) => {
                let bytes = self
                    .buffer
                    .drain(0..self.required_bytes)
                    .take(self.required_bytes - *pad);
                self.ctx.gnu_longname = Some(bytes.collect());
                self.state = ProcessState::Start;
                Ok(PullResult::Further)
            }
            ProcessState::ParseGunLongLink(pad) => {
                let bytes = self
                    .buffer
                    .drain(0..self.required_bytes)
                    .take(self.required_bytes - *pad);
                self.ctx.gnu_longlink = Some(bytes.collect());
                self.state = ProcessState::Start;
                Ok(PullResult::Further)
            }
            ProcessState::ParsePaxExtensions(pad) => {
                let bytes = self
                    .buffer
                    .drain(0..self.required_bytes)
                    .take(self.required_bytes - *pad);
                self.ctx.pax_extensions = Some(bytes.collect());
                self.state = ProcessState::Start;
                Ok(PullResult::Further)
            }
            ProcessState::Data(size, pad) => {
                let size = *size;
                let pad = *pad;
                // println!("n {:?} p {:?} r {:?}", size, pad, self.required_bytes);
                if size > self.required_bytes {
                    self.state = ProcessState::Data(size - self.required_bytes, pad);
                    Ok(PullResult::Data(
                        self.buffer.drain(0..self.required_bytes).collect(),
                    ))
                } else {
                    let raw_size = size - pad;
                    let bytes = self.buffer.drain(0..size).take(raw_size).collect();
                    self.required_bytes = 0;
                    self.state = ProcessState::Start;
                    Ok(PullResult::Data(bytes))
                }
            }
            ProcessState::SpareData(..) => exit("unsupported handle spare files efficiently"),
        }
    }
    fn entry_raw(header: &mut Header, pax_extensions: Option<&[u8]>) -> io::Result<u64> {
        let sum = header.as_bytes()[..148]
            .iter()
            .chain(&header.as_bytes()[156..])
            .fold(0, |a, b| a + (*b as u32))
            + 8 * 32;
        let cksum = header.cksum()?;
        if sum != cksum {
            return Err(io::Error::new(
                io::ErrorKind::Other,
                "archive header checksum mismatch",
            ));
        }
        let mut pax_size: Option<u64> = None;
        if let Some(pax_extensions_ref) = &pax_extensions {
            pax_size = pax_extensions_value(pax_extensions_ref, "size");

            if let Some(pax_uid) = pax_extensions_value(pax_extensions_ref, "uid") {
                header.set_uid(pax_uid);
            }

            if let Some(pax_gid) = pax_extensions_value(pax_extensions_ref, "gid") {
                header.set_gid(pax_gid);
            }
        }
        let mut size = header.entry_size()?;
        if size == 0 {
            if let Some(pax_size) = pax_size {
                size = pax_size;
            }
        }
        Ok(size)
    }
}
fn pax_extensions_value(a: &[u8], key: &str) -> Option<u64> {
    for extension in PaxExtensions::new(a) {
        let current_extension = match extension {
            Ok(ext) => ext,
            Err(_) => return None,
        };
        if current_extension.key() != Ok(key) {
            continue;
        }

        let value = match current_extension.value() {
            Ok(value) => value,
            Err(_) => return None,
        };
        let result = match value.parse::<u64>() {
            Ok(result) => result,
            Err(_) => return None,
        };
        return Some(result);
    }
    None
}
fn path2bytes(p: &Path) -> io::Result<Cow<[u8]>> {
    p.as_os_str()
        .to_str()
        .map(|s| s.as_bytes())
        .ok_or_else(|| {
            io::Error::new(
                io::ErrorKind::Other,
                format!("path {} was not valid Unicode", p.display()),
            )
        })
        .map(|bytes| {
            if bytes.contains(&b'\\') {
                // Normalize to Unix-style path separators
                let mut bytes = bytes.to_owned();
                for b in &mut bytes {
                    if *b == b'\\' {
                        *b = b'/';
                    }
                }
                Cow::Owned(bytes)
            } else {
                Cow::Borrowed(bytes)
            }
        })
}
fn bytes2path(bytes: Cow<[u8]>) -> io::Result<Cow<Path>> {
    Ok(match bytes {
        Cow::Borrowed(bytes) => {
            Cow::Borrowed(Path::new(std::str::from_utf8(bytes).map_err(invalid_utf8)?))
        }
        Cow::Owned(bytes) => Cow::Owned(PathBuf::from(
            String::from_utf8(bytes).map_err(invalid_utf8)?,
        )),
    })
}
fn invalid_utf8<T>(_: T) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, "Invalid utf-8")
}
fn prepare_header(size: u64, entry_type: u8) -> Header {
    let mut header = Header::new_gnu();
    let name = b"././@LongLink";
    header.as_gnu_mut().unwrap().name[..name.len()].clone_from_slice(&name[..]);
    header.set_mode(0o644);
    header.set_uid(0);
    header.set_gid(0);
    header.set_mtime(0);
    // + 1 to be compliant with GNU tar
    header.set_size(size + 1);
    header.set_entry_type(EntryType::new(entry_type));
    header.set_cksum();
    header
}
fn prepare_header_path(dst: &mut dyn Write, header: &mut Header, path: &Path) -> io::Result<u64> {
    let mut total_size = 0u64;
    if let Err(e) = header.set_path(path) {
        let data = path2bytes(path)?;
        let max = header.as_old().name.len();
        if data.len() < max {
            return Err(e);
        }
        let header2 = prepare_header(data.len() as u64, b'L');
        let mut data2 = data.chain(io::repeat(0).take(1));
        dst.write_all(header2.as_bytes())?;
        total_size += 512; // header 固定 512 大小
        let size = append_data_to_related(dst, &mut data2)?;
        total_size += size;
        total_size += append_pad_to_related(dst, size)?;
        let truncated = match std::str::from_utf8(&data[..max]) {
            Ok(s) => s,
            Err(e) => std::str::from_utf8(&data[..e.valid_up_to()]).unwrap(),
        };
        header.set_path(truncated)?;
    }
    Ok(total_size)
}

#[inline]
fn round512(v: usize) -> (usize, usize) {
    let remaining = 512 - (v % 512);
    if remaining < 512 {
        (v + remaining, remaining)
    } else {
        (v, 0)
    }
}

enum FileEntry {
    File(u64, u64), // size, mtime
    Directory(u64), // mtime
}
/// 填充 tar 头
///
/// 如果是 directory, f_size 为 `None`, 否则为文件大小
fn fill_from(dst: &mut dyn Write, header: &mut Header, entry: FileEntry) -> io::Result<u64> {
    header.set_uid(0);
    header.set_gid(0);
    // dir: 0o755 file: 0o644
    match entry {
        FileEntry::Directory(mtime) => {
            header.set_mtime(mtime);
            header.set_mode(0o755);
            header.set_entry_type(EntryType::dir());
            header.set_size(0);
        }
        FileEntry::File(size, mtime) => {
            header.set_mtime(mtime);
            header.set_mode(0o644);
            header.set_entry_type(EntryType::file());
            header.set_size(size);
        }
    }
    header.set_device_major(0)?;
    header.set_device_minor(0)?;
    header.set_cksum();
    dst.write_all(header.as_bytes())?;
    Ok(512)
}
fn append_dir_header(dst: &mut dyn Write, path: &str, mtime: u64) -> io::Result<u64> {
    let mut header = Header::new_gnu();
    let mut total_size = 0;
    total_size += prepare_header_path(dst, &mut header, Path::new(path))?;
    total_size += fill_from(dst, &mut header, FileEntry::Directory(mtime))?;
    Ok(total_size)
}
fn append_file_header(dst: &mut dyn Write, path: &str, size: u64, mtime: u64) -> io::Result<u64> {
    let mut header = Header::new_gnu();
    let mut total_size = 0;
    total_size += prepare_header_path(dst, &mut header, Path::new(path))?;
    total_size += fill_from(dst, &mut header, FileEntry::File(size, mtime))?;
    Ok(total_size)
}
fn append_data_to_related(dst: &mut dyn Write, data: &mut dyn Read) -> io::Result<u64> {
    io::copy(data, dst)
}
fn append_pad_to_related(dst: &mut dyn Write, size: u64) -> io::Result<u64> {
    let buf = [0; 512];
    let remaining = 512 - (size % 512);
    if remaining < 512 {
        dst.write_all(&buf[..remaining as usize])?;
        Ok(remaining)
    } else {
        Ok(0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::File;
    use std::path::Path;

    #[test]
    fn it_works() {
        let root_dir = Path::new(r"./target/tmp");
        let mut file = File::create(root_dir.join("foo.tar")).unwrap();
        // 插入文件夹
        append_dir_header(&mut file, "test/", 1717676784).unwrap();
        // 插入文件
        append_file_header(&mut file, "test/a.txt", 5, 1717676784).unwrap();
        append_data_to_related(&mut file, &mut "001\r\n".as_bytes()).unwrap();
        append_pad_to_related(&mut file, 5).unwrap();
        // 插入文件
        append_file_header(&mut file, "test/b.txt", 5, 1717676784).unwrap();
        append_data_to_related(&mut file, &mut "002\r\n".as_bytes()).unwrap();
        append_pad_to_related(&mut file, 5).unwrap();
        // 插入文件
        append_file_header(&mut file, "test/c.txt", 5, 1717676784).unwrap();
        append_data_to_related(&mut file, &mut "003\r\n".as_bytes()).unwrap();
        append_pad_to_related(&mut file, 5).unwrap();
        // 插入文件
        append_file_header(
            &mut file,
            "test/阿爸踩踩踩擦擦啊擦撒飞飞洒给飒旦撒大苏打撒撒哥飞洒发生飞洒在上大宫阙弱.txt", // 如果大于 100b 会增加 1kb 的尺寸
            5,
            1717676784,
        )
        .unwrap();
        append_data_to_related(&mut file, &mut "004\r\n".as_bytes()).unwrap();
        append_pad_to_related(&mut file, 5).unwrap();
        // 插入文件
        append_file_header(
            &mut file,
            "test/阿爸踩踩踩擦擦啊擦撒飞飞洒给飒旦撒大苏打撒撒哥飞洒发生飞洒在上小宫阙弱.txt", // 如果文件名大于 100b 会增加 1kb 的尺寸
            5,
            1717676784,
        )
        .unwrap();
        append_data_to_related(&mut file, &mut "005\r\n".as_bytes()).unwrap();
        append_pad_to_related(&mut file, 5).unwrap();
        // 完成
    }

    #[test]
    fn test_extractor() {
        let root_dir = Path::new(r"./target/tmp");
        let mut extractor = TarExtractor::create(2048f64);
        let mut file = File::open(root_dir.join("foo.tar")).unwrap();
        let mut chunk = [0u8; 1000];
        // let mut count = 1;
        loop {
            match extractor.pull() {
                PullResult::Further => {
                    let loaded = file.read(&mut chunk).unwrap();
                    if loaded == 0 {
                        if extractor.pullable() {
                            continue;
                        } else {
                            // println!("all data loaded!");
                            break;
                        }
                    }
                    // println!("Push {} bytes", loaded);
                    extractor.push(chunk[0..loaded].to_vec());
                    continue;
                }
                PullResult::Header(header) => {
                    // count = 1;
                    println!(
                        "[{}]: {:?} size: {:?} mtime: {:?}",
                        if header.is_dir() { "directory" } else { "file" },
                        header.path(),
                        header.size,
                        header.mtime()
                    )
                }
                PullResult::Data(_chunk) => {
                    // println!(
                    //     "data: [{}]({:02X})+{count}",
                    //     if chunk.len() > 4 {
                    //         format!(
                    //             "{} ... {}",
                    //             format!("{:02X?}", &chunk[0..4])
                    //                 .trim_matches(|ch| ch == ']' || ch == '['),
                    //             format!("{:02X?}", &chunk[chunk.len() - 4..chunk.len()])
                    //                 .trim_matches(|ch| ch == ']' || ch == '[')
                    //         )
                    //     } else {
                    //         format!("{:02X?}", &chunk)
                    //             .trim_matches(|ch| ch == ']' || ch == '[')
                    //             .to_string()
                    //     },
                    //     chunk.len()
                    // );
                    // count += 1;
                }
            }
        }
    }
}
