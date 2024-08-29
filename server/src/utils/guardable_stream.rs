use futures::Stream;
use pin_project_lite::pin_project;
use std::pin::Pin;
use std::task::{Context, Poll};

pub fn guardable<S, G>(stream: S, guard: G) -> Guardable<S, G> {
    Guardable::new(stream, guard)
}

pin_project! {
    #[derive(Debug, Clone)]
    pub struct Guardable<S, G> {
        #[pin]
        inner: S,
        guard: Option<G>,
    }
}

impl<S, G> Guardable<S, G> {
    fn new(stream: S, guard: G) -> Self {
        Self {
            inner: stream,
            guard: Some(guard),
        }
    }
}

impl<S, G> Stream for Guardable<S, G>
where
    S: Stream,
    G: Unpin,
{
    type Item = S::Item;
    fn poll_next(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        let mut this = self.project();
        let r = Pin::new(&mut this.inner).poll_next(cx);
        if let Poll::Ready(None) = r {
            this.guard.take();
        }
        r
    }
    fn size_hint(&self) -> (usize, Option<usize>) {
        self.inner.size_hint()
    }
}
