use crate::models::dtos::p2p::{
    ExchangeProtocol, P2PAcceptBodyDto, P2PCreateBodyDto, P2PDiscardBodyDto, SignalingBodyDto,
};
use crate::models::notify::SSEBroadcastEvent;
use crate::services::notify::NotifyService;
use crate::utils::{Observer, TtiCache};
use anyhow::Context;
use std::sync::Arc;
use std::time::Duration;
use uuid::Uuid;

struct PeerSession {
    support_rtc: bool,
    /// 主发起方 Peer ID
    primary_peer: Uuid,
    /// 次发起方 Peer ID
    secondary_peer: Uuid,
    is_established: bool,
    priority: Option<ExchangeProtocol>,
}

pub struct P2PService {
    sessions: Arc<TtiCache<Uuid, PeerSession>>,
    notify_service: Arc<NotifyService>,
}

impl P2PService {
    pub fn new(notify_service: Arc<NotifyService>) -> P2PService {
        P2PService {
            sessions: Arc::new(TtiCache::new(Duration::from_secs(300))),
            notify_service,
        }
    }

    pub fn verify(&self, request_id: &Uuid, client_id: &Uuid) -> bool {
        let session = self.sessions.get(request_id);
        let session = match session {
            Some(session) => session,
            None => return false,
        };
        session.is_established
            && (&session.primary_peer == client_id || &session.secondary_peer == client_id)
    }

    pub fn create_request(&self, args: P2PCreateBodyDto) -> anyhow::Result<Uuid> {
        if self.sessions.iter().any(|entry| {
            entry.primary_peer == args.client_id || entry.secondary_peer == args.client_id
        }) {
            anyhow::bail!(
                "P2P request could not be created repeatedly.P2P request creation failed due to receiver is currently busy."
            )
        }
        let receiver_id = if let Some(receiver) = self.notify_service.get_id_by_code(&args.code) {
            receiver
        } else {
            anyhow::bail!("P2P request creation failed due to PIN mismatch.")
        };
        let request_id = Uuid::new_v4();
        self.notify_service
            .send_with_client(SSEBroadcastEvent::P2PRequest(request_id), &receiver_id)?;
        self.sessions.insert(
            request_id,
            PeerSession {
                support_rtc: args.supports_rtc,
                priority: args.priority,
                primary_peer: args.client_id,
                secondary_peer: receiver_id,
                is_established: false,
            },
        );
        tracing::debug!(
            "created p2p request, rtc: {}, request_id: {}",
            args.supports_rtc,
            request_id
        );
        Ok(request_id)
    }

    pub fn accept_request(&self, args: P2PAcceptBodyDto) -> anyhow::Result<()> {
        tracing::debug!(
            "accepted p2p request, rtc: {}, request_id: {}",
            args.supports_rtc,
            args.request_id
        );
        let (protocol, sender_id, receiver_id) = {
            let mut entry = if let Some(value) = self.sessions.get_mut(&args.request_id) {
                value
            } else {
                anyhow::bail!("Failed to accept p2p request, the request has expired.")
            };
            if entry.secondary_peer != args.client_id {
                anyhow::bail!("Failed to accept p2p request, the request is invalid.")
            }
            if !self.notify_service.contains_client(&entry.primary_peer) {
                drop(entry);
                self.sessions.remove(&args.request_id);
                anyhow::bail!("Failed to accept p2p request, sender closed.")
            }
            entry.is_established = true;
            let protocol = if entry.support_rtc
                && entry.support_rtc == args.supports_rtc
                && entry
                    .priority
                    .as_ref()
                    .map(|priority| priority != &ExchangeProtocol::WebSocket)
                    .unwrap_or(true)
            {
                ExchangeProtocol::WebRTC
            } else {
                ExchangeProtocol::WebSocket
            };
            (protocol, entry.primary_peer, entry.secondary_peer)
        };
        if let Err(err) = self.notify_service.send_with_clients(
            SSEBroadcastEvent::P2PExchange(Exchange {
                request_id: args.request_id,
                protocol,
                participants: vec![sender_id, receiver_id],
            }),
            vec![sender_id, receiver_id],
        ) {
            anyhow::bail!("Failed to accept p2p request, reason: {:?}.", err)
        };
        Ok(())
    }
    pub fn signaling(&self, args: SignalingBodyDto) -> anyhow::Result<()> {
        let entry = self
            .sessions
            .get(&args.request_id)
            .with_context(|| "Failed to send signal: invalid request_id")?;
        let receiver_id = if entry.primary_peer == args.client_id {
            entry.secondary_peer
        } else {
            entry.primary_peer
        };
        self.notify_service
            .send_with_client(SSEBroadcastEvent::P2PSignaling(args.payload), &receiver_id)?;
        Ok(())
    }
    pub fn discard_request(&self, args: P2PDiscardBodyDto) -> anyhow::Result<bool> {
        let mut is_primary = false;
        if let Some(entry) = self.sessions.remove(&args.request_id) {
            let evt = if entry.primary_peer == args.client_id {
                is_primary = true;
                SSEBroadcastEvent::P2PCanceled(args.request_id)
            } else {
                SSEBroadcastEvent::P2PRejected(args.request_id)
            };
            self.notify_service
                .send_with_client(evt, &entry.primary_peer)?;
        };
        tracing::info!("discard p2p request,request_id: {}", args.request_id);
        Ok(is_primary)
    }
}

impl Observer<Uuid> for P2PService {
    fn notify(&self, _value: Uuid) {
        // todo!()
    }
}

#[derive(Debug, Clone)]
pub struct Exchange {
    request_id: Uuid,
    protocol: ExchangeProtocol,
    participants: Vec<Uuid>,
}

impl Exchange {
    pub fn to_json(&self) -> String {
        serde_json::json!({
            "type": "P2P_EXCHANGE",
            "payload": {
                "request_id": self.request_id,
                "protocol": self.protocol,
                "participants": self.participants
            }
        })
        .to_string()
    }
}
