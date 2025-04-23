use dashmap::DashMap;
use dashmap::mapref::one::{Ref, RefMut};
use std::hash::Hash;
use std::ops::{Deref, DerefMut};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

pub struct Entry<V>(Instant, V);

impl<V> Deref for Entry<V> {
    type Target = V;

    fn deref(&self) -> &Self::Target {
        &self.1
    }
}

impl<V> DerefMut for Entry<V> {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.1
    }
}
/// TTI(Time to idle) Cache
///
/// 超过一定时间没有访问则会被淘汰
pub struct TtiCache<K, V> {
    map: Arc<DashMap<K, Entry<V>>>,
    ttl: Duration,
    task: Mutex<Option<tokio::task::JoinHandle<()>>>,
    task_started: Arc<AtomicBool>,
}

impl<K: Eq + Hash, V> TtiCache<K, V>
where
    K: Eq + Hash + Send + Sync + 'static,
    V: Send + Sync + 'static,
{
    pub fn new(ttl: Duration) -> TtiCache<K, V> {
        TtiCache {
            map: Arc::new(DashMap::new()),
            ttl,
            task: Mutex::new(None),
            task_started: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn get<'a>(&'a self, k: &'a K) -> Option<Ref<'a, K, Entry<V>>> {
        // update access time
        {
            let mut entry = self.map.get_mut(k)?;
            entry.0 = Instant::now();
        }
        let entry = self.map.get(k)?;
        Some(entry)
    }
    pub fn get_mut<'a>(&'a self, k: &'a K) -> Option<RefMut<'a, K, Entry<V>>> {
        // update access time
        {
            let mut entry = self.map.get_mut(k)?;
            entry.0 = Instant::now();
        }
        let entry = self.map.get_mut(k)?;
        Some(entry)
    }
    pub fn insert(&self, k: K, v: V) {
        self.map.insert(k, Entry(Instant::now(), v));
        self.start_task();
    }
    pub fn remove(&self, k: &K) -> Option<V> {
        let v = self.map.remove(k).map(|(_, entry)| entry.1);
        if self.map.is_empty() {
            let task = self.task.lock().unwrap().take();
            task?.abort();
            self.task_started.store(false, Ordering::Release);
        }
        v
    }
    pub fn contains_key(&self, k: &K) -> bool {
        self.map.contains_key(k)
    }
    fn start_task(&self) {
        if self.task_started.load(Ordering::Relaxed) == true {
            return;
        }
        let task_started = self.task_started.clone();
        let ttl = self.ttl.clone();
        let map = self.map.clone();
        task_started.store(true, Ordering::Relaxed);
        let handle = tokio::task::spawn(async move {
            loop {
                tokio::time::sleep(ttl).await;
                let previous_len = map.len();
                if previous_len == 0 {
                    break;
                };
                let now = Instant::now();
                map.retain(|_, Entry(instant, _)| now.duration_since(*instant) < ttl);
                let current_len = map.len();
                tracing::debug!(
                    "Session cleanup: before = {}, after = {}, removed = {}",
                    previous_len,
                    current_len,
                    previous_len - current_len
                );
                if current_len == 0 {
                    break;
                };
            }
            task_started.store(false, Ordering::Relaxed);
        });
        let mut task = self.task.lock().unwrap();
        *task = Some(handle);
    }

    pub fn iter(&self) -> dashmap::iter::Iter<K, Entry<V>> {
        self.map.iter()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct MyStruct {
        msg: String,
    }
    
    #[test]
    fn it_works() {
        let sessions = TtiCache::new(Duration::from_secs(300));
        sessions.insert(
            "key1",
            MyStruct {
                msg: String::from("吼吼吼"),
            },
        );
        let value = sessions.get(&"key1");
        assert!(value.is_some());
        let value = value.unwrap();
        assert_eq!(value.msg, "吼吼吼")
    }
}
