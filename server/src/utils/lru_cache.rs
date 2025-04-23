use dashmap::DashMap;
use dashmap::mapref::one::{Ref, RefMut};
use std::hash::Hash;
use std::ops::{Deref, DerefMut};
use std::ptr::NonNull;
use std::{mem, ptr};

pub(crate) struct KeyRef<K> {
    k: *const K,
}

impl<K> KeyRef<K> {
    #[inline]
    fn new(k: *const K) -> KeyRef<K> {
        KeyRef { k }
    }
}
impl<K: Clone> KeyRef<K>{
    pub fn clone_key(&self) -> K {
        unsafe { (&*self.k).clone() }
    }
} 
impl<K> Deref for KeyRef<K>{
    type Target = K;
    fn deref(&self) -> &K {
        unsafe { &*self.k }
    }
}
impl<K: Hash> Hash for KeyRef<K> {
    fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
        unsafe { (*self.k).hash(state) };
    }
}

impl<K: PartialEq> PartialEq for KeyRef<K> {
    fn eq(&self, other: &KeyRef<K>) -> bool {
        unsafe { (*self.k).eq(&*other.k) }
    }
}
impl<K: Eq> Eq for KeyRef<K> {}

impl<K: PartialEq> PartialEq<K> for KeyRef<K> {
    fn eq(&self, other: &K) -> bool {
        unsafe { (*self.k).eq(other) }
    }
}

pub(crate) struct LruEntry<K, V> {
    key: mem::MaybeUninit<K>,
    val: mem::MaybeUninit<V>,
    prev: *mut LruEntry<K, V>,
    next: *mut LruEntry<K, V>,
}

impl<K, V> LruEntry<K, V> {
    fn new(key: K, val: V) -> LruEntry<K, V> {
        LruEntry {
            key: mem::MaybeUninit::new(key),
            val: mem::MaybeUninit::new(val),
            prev: ptr::null_mut(),
            next: ptr::null_mut(),
        }
    }
    fn new_sigil() -> Self {
        LruEntry {
            key: mem::MaybeUninit::uninit(),
            val: mem::MaybeUninit::uninit(),
            prev: ptr::null_mut(),
            next: ptr::null_mut(),
        }
    }
}

pub(crate) struct SafeLruEntry<K, V>(NonNull<LruEntry<K, V>>);

impl<K, V> SafeLruEntry<K, V> {
    fn as_ptr(&self) -> *mut LruEntry<K, V> {
        self.0.as_ptr()
    }
    fn as_ref(&self) -> &LruEntry<K, V> {
        unsafe { self.0.as_ref() }
    }
    fn as_mut(&mut self) -> &mut LruEntry<K, V> {
        unsafe { self.0.as_mut() }
    }
}

impl<K, V> Deref for SafeLruEntry<K, V> {
    type Target = V;
    fn deref(&self) -> &Self::Target {
        unsafe { &*self.0.as_ref().val.as_ptr() }
    }
}
impl<K, V> DerefMut for SafeLruEntry<K, V> {
    fn deref_mut(&mut self) -> &mut Self::Target {
        unsafe { &mut *self.0.as_mut().val.as_mut_ptr() }
    }
}

#[allow(unused)]
pub struct LruCache<K, V> {
    map: DashMap<KeyRef<K>, SafeLruEntry<K, V>>,
    capacity: usize,

    head: *mut LruEntry<K, V>,
    tail: *mut LruEntry<K, V>,
}

impl<K: Eq + Hash, V> LruCache<K, V> {
    pub fn new(capacity: usize) -> LruCache<K, V> {
        let cache = LruCache {
            map: DashMap::new(),
            capacity,
            head: Box::into_raw(Box::new(LruEntry::new_sigil())),
            tail: Box::into_raw(Box::new(LruEntry::new_sigil())),
        };
        unsafe {
            (*cache.head).next = cache.tail;
            (*cache.tail).prev = cache.head;
        }
        cache
    }
    fn detach(&self, node: *mut LruEntry<K, V>) {
        unsafe {
            (*(*node).prev).next = (*node).next;
            (*(*node).next).prev = (*node).prev;
        }
    }
    fn attach(&self, node: *mut LruEntry<K, V>) {
        unsafe {
            (*node).next = (*self.head).next;
            (*node).prev = self.head;
            (*self.head).next = node;
            (*(*node).next).prev = node;
        }
    }
    pub fn get<'a>(&'a self, key: &'a K) -> Option<Ref<'a, KeyRef<K>, SafeLruEntry<K, V>>> {
        if let Some(node) = self.map.get(&KeyRef::new(key)) {
            let node_ptr: *mut LruEntry<K, V> = node.as_ptr();

            self.detach(node_ptr);
            self.attach(node_ptr);

            Some(node)
        } else {
            None
        }
    }
    pub fn get_mut<'a>(&'a self, key: &'a K) -> Option<RefMut<'a, KeyRef<K>, SafeLruEntry<K, V>>> {
        if let Some(node) = self.map.get_mut(&KeyRef::new(key)) {
            let node_ptr: *mut LruEntry<K, V> = node.as_ptr();

            self.detach(node_ptr);
            self.attach(node_ptr);

            Some(node)
        } else {
            None
        }
    }
    pub fn insert(&self, key: K, mut val: V) -> Option<V> {
        let node_ref = self.map.get_mut(&KeyRef::new(&key));
        match node_ref {
            Some(node_ref) => {
                let node_ptr: *mut LruEntry<K, V> = node_ref.as_ptr();

                let node_ref = unsafe { &mut (*(*node_ptr).val.as_mut_ptr()) };
                mem::swap(&mut val, node_ref);
                let _ = node_ref;

                self.detach(node_ptr);
                self.attach(node_ptr);

                Some(val)
            }
            None => {
                let (_replaced, node) = self.replace_or_create_node(key, val);
                let node_ptr: *mut LruEntry<K, V> = node.as_ptr();

                self.attach(node_ptr);

                let keyref = unsafe { (*node_ptr).key.as_ptr() };
                self.map.insert(KeyRef::new(keyref), node);

                None
            }
        }
    }
    pub fn remove(&self, key: &K) -> Option<V> {
        if let Some((_, node)) = self.map.remove(&KeyRef::new(key)) {
            let mut node = unsafe {
                let mut node = *Box::from_raw(node.as_ptr());
                ptr::drop_in_place(node.key.as_mut_ptr());

                node
            };

            self.detach(&mut node);

            let LruEntry { key: _, val, .. } = node;
            Some(unsafe { val.assume_init() })
        } else {
            None
        }
    }
    pub fn contains_key(&self, key: &K) -> bool {
        self.map.contains_key(&KeyRef::new(key))
    }
    pub fn iter(&self) -> dashmap::iter::Iter<KeyRef<K>, SafeLruEntry<K, V>> {
        self.map.iter()
    }
    fn replace_or_create_node(&self, k: K, v: V) -> (Option<(K, V)>, SafeLruEntry<K, V>) {
        if self.map.len() == self.capacity {
            let old_key = KeyRef::new(unsafe { &(*(*(*self.tail).prev).key.as_ptr()) });
            let (_, old_node) = self.map.remove(&old_key).unwrap();
            let node_ptr: *mut LruEntry<K, V> = old_node.as_ptr();

            let replaced = unsafe {
                (
                    mem::replace(&mut (*node_ptr).key, mem::MaybeUninit::new(k)).assume_init(),
                    mem::replace(&mut (*node_ptr).val, mem::MaybeUninit::new(v)).assume_init(),
                )
            };
            self.detach(node_ptr);
            (Some(replaced), old_node)
        } else {
            (
                None,
                SafeLruEntry(unsafe {
                    NonNull::new_unchecked(Box::into_raw(Box::new(LruEntry::new(k, v))))
                }),
            )
        }
    }
}

unsafe impl<K, V> Sync for LruCache<K, V> {}
unsafe impl<K, V> Send for LruCache<K, V> {}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    static COUNT: AtomicUsize = AtomicUsize::new(0);

    struct MyStruct {
        msg: String,
    }

    impl MyStruct {
        fn new(msg: &str) -> Self {
            COUNT.fetch_add(1, Ordering::Relaxed);
            MyStruct { msg: msg.into() }
        }
    }

    impl Drop for MyStruct {
        fn drop(&mut self) {
            COUNT.fetch_sub(1, Ordering::Relaxed);
        }
    }

    #[test]
    fn it_works() {
        let cache = LruCache::new(2);
        cache.insert("411", MyStruct::new("hello world"));
        cache.insert("478", MyStruct::new("你好"));
        cache.insert("497", MyStruct::new("吼吼吼"));
        assert_eq!(COUNT.load(Ordering::Relaxed), 2);
        assert!(!cache.contains_key(&"411"));
        assert!(cache.contains_key(&"478"));
        assert!(cache.contains_key(&"497"));
        let v = cache.get(&"497").unwrap();
        assert_eq!(v.msg, "吼吼吼");
        drop(v);
        let mut v = cache.get_mut(&"478").unwrap();
        v.msg.push_str("啊");
        drop(v);
        let v = cache.get(&"478").unwrap();
        assert_eq!(v.msg, "你好啊");
        assert_eq!(COUNT.load(Ordering::Relaxed), 2);
        cache.insert("499", MyStruct::new("zeek"));
        assert_eq!(COUNT.load(Ordering::Relaxed), 2);
        assert!(cache.contains_key(&"499"));
        assert!(cache.contains_key(&"478"));
        assert!(!cache.contains_key(&"497"));
    }
}
