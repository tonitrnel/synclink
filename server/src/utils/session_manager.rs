use std::cell::OnceCell;
use std::collections::HashMap;
use std::hash::Hash;
use std::ops::{Deref, DerefMut};
use std::sync::{Arc, Mutex, MutexGuard};
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

pub struct SessionManager<K, V> {
    sessions: Mutex<HashMap<K, Entry<V>>>,
    ttl: Duration,
}

impl<K, V> SessionManager<K, V>
where
    K: Eq + Hash + Send + 'static,
    V: Send + 'static,
{
    pub fn new(ttl: Duration) -> Arc<SessionManager<K, V>> {
        let manager = Arc::new(Self {
            sessions: Mutex::new(HashMap::new()),
            ttl,
        });
        let cloned_manager = manager.clone();
        tokio::spawn(async move {
            cloned_manager.run_cleanup_task().await;
        });
        manager
    }
    pub fn get<'a>(&'a self, k: &'a K) -> Option<AccessGuard<'a, K, V>> {
        let mut sessions = self.sessions.lock().unwrap();
        if let Some(Entry(instant, _)) = sessions.get_mut(k) {
            *instant = Instant::now();
            Some(AccessGuard(sessions, k, OnceCell::new()))
        } else {
            None
        }
    }
    pub fn insert(&self, k: K, v: V) {
        let mut sessions = self.sessions.lock().unwrap();
        sessions.insert(k, Entry(Instant::now(), v));
    }
    pub fn remove(&self, k: &K) -> Option<V> {
        let mut sessions = self.sessions.lock().unwrap();
        sessions.remove(k).map(|Entry(_, v)| v)
    }
    pub fn contains_key(&self, k: &K) -> bool {
        let sessions = self.sessions.lock().unwrap();
        sessions.contains_key(k)
    }
    pub fn guard(&self) -> MutexGuard<HashMap<K, Entry<V>>> {
        self.sessions.lock().unwrap()
    }
    async fn run_cleanup_task(&self) {
        loop {
            tokio::time::sleep(self.ttl).await;
            let mut sessions = self.sessions.lock().unwrap();
            let now = Instant::now();
            sessions.retain(|_, Entry(instant, _)| now.duration_since(*instant) < self.ttl);
        }
    }
}

pub struct AccessGuard<'input, K, V>(
    MutexGuard<'input, HashMap<K, Entry<V>>>,
    &'input K,
    OnceCell<*const V>, // storage memory ptr
);
impl<'input, K, V> Deref for AccessGuard<'input, K, V>
where
    K: Eq + Hash,
{
    type Target = V;
    fn deref(&self) -> &Self::Target {
        let value_ptr = self.2.get_or_init(move || {
            let v = self
                .0
                .get(self.1)
                .map(|Entry(_, v)| v)
                .expect("Unexpected Error: key not found in HashMap");
            v as *const V
        });
        unsafe { &**value_ptr }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct MyStruct {
        msg: String,
    }
    #[tokio::test]
    async fn it_works() {
        let sessions = SessionManager::new(Duration::from_secs(300));
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
