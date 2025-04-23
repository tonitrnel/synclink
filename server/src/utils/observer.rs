use std::sync::Weak;

pub trait Observer<V>: Send + Sync {
    fn notify(&self, value: V);
}

pub trait Observable<V> {
    fn register(&self, observer: Weak<dyn Observer<V> + 'static>);
}
