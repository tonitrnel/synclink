use crate::models::dtos::notify::SseClientResponseDto;
use crate::models::notify::{SSEBroadcastEvent, SSEBroadcastTargets};
use crate::utils::lru_cache::LruCache;
use crate::utils::{Observable, Observer, base64_url};
use dashmap::DashMap;
use std::sync::{Arc, Mutex, Weak};
use tokio::sync::broadcast;
use uuid::Uuid;

#[derive(Clone)]
pub(crate) struct SseClientGuard {
    id: Uuid,
    notify_service: Arc<NotifyService>,
}
impl Drop for SseClientGuard {
    fn drop(&mut self) {
        if let Some(ipaddr) = self.notify_service.inactive_client(&self.id) {
            tracing::trace!("client {} disconnected", ipaddr,);
        };
    }
}

/// 负责向客户端发送消息，同时还负责记录客户端的信息
pub struct NotifyService {
    sender: broadcast::Sender<(SSEBroadcastEvent, SSEBroadcastTargets)>,
    clients: DashMap<Uuid, SseClientInfo>,
    inactive_clients: LruCache<Uuid, SseClientInfo>,
    observers: Mutex<Vec<Weak<dyn Observer<Uuid>>>>,
}

#[derive(Debug)]
pub struct SseClientInfo {
    ipaddr: String,
    user_agent: String,
    code: String,
    secret: String,
}

type SendResult =
    Result<usize, broadcast::error::SendError<(SSEBroadcastEvent, SSEBroadcastTargets)>>;
impl NotifyService {
    pub fn new() -> Self {
        let (tx, _) = broadcast::channel(8);
        Self {
            sender: tx,
            clients: DashMap::new(),
            inactive_clients: LruCache::new(32),
            observers: Mutex::new(Vec::new()),
        }
    }
    pub fn create_client(
        ipaddr: String,
        user_agent: String,
        notify_service: Arc<NotifyService>,
    ) -> (Uuid, String, SseClientGuard) {
        let id = Uuid::new_v4();
        let code = Self::generate_code(&notify_service);
        let secret = Self::generate_secret();
        let client_info = SseClientInfo {
            ipaddr,
            code,
            user_agent,
            secret: secret.clone(),
        };
        notify_service.add_client(id, client_info);
        (id, secret, SseClientGuard { id, notify_service })
    }
    fn generate_code(&self) -> String {
        use rand::Rng;
        let mut rng = rand::rng();
        loop {
            let code: u32 = rng.random_range(000000..=999999);
            let code = format!("{:0>6}", code);
            if !self.is_pin_code_used(&code) {
                break code;
            }
        }
    }
    fn generate_secret() -> String {
        use rand::prelude::*;

        let mut rng = StdRng::from_os_rng();
        let mut key = [0u8; 32];
        rng.fill(&mut key);
        base64_url::encode(&key)
    }
    pub fn try_resume_client(
        resume_secret: String,
        notify_service: Arc<NotifyService>,
    ) -> Option<(Uuid, String, SseClientGuard)> {
        let id = notify_service.inactive_clients.iter().find_map(|it| {
            if &it.secret == &resume_secret {
                Some(it.key().clone_key())
            } else {
                None
            }
        })?;
        let mut entry = notify_service.inactive_clients.remove(&id)?;
        entry.secret = Self::generate_secret();
        let secret = entry.secret.clone();
        notify_service.add_client(id, entry);
        Some((id, secret, SseClientGuard { id, notify_service }))
    }
    pub fn add_client(&self, id: Uuid, conn: SseClientInfo) {
        self.clients.insert(id, conn);
        tracing::trace!("add_client, connection len {:?}", self.clients.len());
        if self.clients.len() <= 1 {
            return;
        }
        if let Err(err) = self.send(SSEBroadcastEvent::UserConnected(id)) {
            tracing::error!(reason = ?err, "Failed to send sse client connected event");
        }
    }
    fn inactive_client(&self, id: &Uuid) -> Option<String> {
        let (_, conn) = self.clients.remove(id)?;
        tracing::trace!("inactive_client, connection len {:?}", self.clients.len());
        if !self.clients.is_empty() {
            if let Err(err) = self.send(SSEBroadcastEvent::UserDisconnected(*id)) {
                tracing::error!(reason = ?err, "Failed to send sse client disconnected event");
            };
        }
        let ipaddr = conn.ipaddr.clone();
        self.inactive_clients.insert(*id, conn);
        Some(ipaddr)
    }
    pub fn remove_client(&self, id: &Uuid) -> Option<SseClientInfo> {
        let (_, conn) = self.clients.remove(id)?;
        self.observers.lock().unwrap().iter().for_each(|it| {
            let observer = it.upgrade();
            if let Some(observer) = observer {
                observer.notify(*id)
            }
        });
        tracing::trace!("remove_client, connection len {:?}", self.clients.len());
        if !self.clients.is_empty() {
            if let Err(err) = self.send(SSEBroadcastEvent::UserDisconnected(*id)) {
                tracing::error!(reason = ?err, "Failed to send sse client disconnected event");
            };
        }
        Some(conn)
    }
    pub fn contains_client(&self, id: &Uuid) -> bool {
        self.clients.contains_key(id)
    }
    pub fn clients(&self) -> Vec<SseClientResponseDto> {
        let device_ip_tags = crate::config::CONFIG.device_ip_tags.as_ref();
        let data = self
            .clients
            .iter()
            .map(|entry| SseClientResponseDto {
                id: *entry.key(),
                ip_alias: device_ip_tags.and_then(|tags| tags.get(&entry.ipaddr).cloned()),
                user_agent: entry.user_agent.clone(),
            })
            .collect::<Vec<_>>();
        data
    }
    pub fn get_id_by_code(&self, pin_code: &str) -> Option<Uuid> {
        self.clients.iter().find_map(|entry| {
            if entry.code == pin_code {
                Some(*entry.key())
            } else {
                None
            }
        })
    }
    pub fn get_code(&self, id: &Uuid) -> Option<String> {
        let entry = self.clients.get(id)?;
        Some(entry.code.clone())
    }
    pub fn get_ipaddr(&self, id: &Uuid) -> Option<String> {
        let entry = self.clients.get(id)?;
        Some(entry.ipaddr.clone())
    }
    pub fn is_pin_code_used(&self, code: &str) -> bool {
        self.clients
            .iter()
            .find(|entry| &entry.code == code)
            .is_some()
    }
    pub fn get_secret(&self, id: &Uuid) -> Option<String> {
        let entry = self.clients.get(id)?;
        Some(entry.secret.clone())
    }
    pub fn send(&self, event: SSEBroadcastEvent) -> SendResult {
        self.sender.send((event, SSEBroadcastTargets::AllClients))
    }
    pub fn send_with_client(&self, event: SSEBroadcastEvent, conn_id: &Uuid) -> SendResult {
        self.sender
            .send((event, SSEBroadcastTargets::Client(*conn_id)))
    }
    pub fn send_without_client(&self, event: SSEBroadcastEvent, conn_id: &Uuid) -> SendResult {
        self.sender
            .send((event, SSEBroadcastTargets::AllExceptClient(*conn_id)))
    }
    pub fn send_with_clients(&self, event: SSEBroadcastEvent, conn_ids: Vec<Uuid>) -> SendResult {
        self.sender
            .send((event, SSEBroadcastTargets::ClientSet(conn_ids)))
    }
    pub fn send_without_clients(
        &self,
        event: SSEBroadcastEvent,
        conn_ids: Vec<Uuid>,
    ) -> SendResult {
        self.sender
            .send((event, SSEBroadcastTargets::AllExceptClientSet(conn_ids)))
    }
    pub fn subscribe(&self) -> broadcast::Receiver<(SSEBroadcastEvent, SSEBroadcastTargets)> {
        self.sender.subscribe()
    }
}

impl Observable<Uuid> for NotifyService {
    /// 注册用于当客户端断开的通知的监听
    fn register(&self, observer: Weak<dyn Observer<Uuid>>) {
        self.observers.lock().unwrap().push(observer)
    }
}

#[cfg(test)]
mod tests {
    use super::NotifyService;

    #[test]
    fn test_secret() {
        println!("{}", NotifyService::generate_secret())
    }
}
