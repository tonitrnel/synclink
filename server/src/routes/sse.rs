use crate::common::AppError;
use crate::extractors::{ClientIp, Header};
use crate::models::dtos::notify::NotifyHeaderDto;
use crate::models::notify::{BroadcastEvent, BroadcastScope};
use crate::services::notify::NotifyService;
use crate::state::AppState;
use crate::utils::guardable;
use axum::extract::State;
use axum::http::header::SET_COOKIE;
use axum::response::{AppendHeaders, IntoResponse, Sse, sse};
use axum::{BoxError, Json};
use futures::stream;
use std::time::Duration;
use tokio_stream::{StreamExt, wrappers};

pub async fn notify(
    State(state): State<AppState>,
    ClientIp(ip): ClientIp,
    Header(header): Header<NotifyHeaderDto>,
) -> impl IntoResponse {
    let ipaddr = ip.unwrap_or("unknown".to_string());
    let user_agent = header.user_agent;
    tracing::trace!("client `{}@{}` connected", ipaddr, user_agent);
    let resume_secret = header
        .cookie
        .as_ref()
        .map(|it| it.split("; "))
        .and_then(|mut it| it.find(|part| part.starts_with("resume_secret=")))
        .and_then(|it| it.split_once('='))
        .map(|(_k, v)| v.trim().to_string());
    let (id, resume_secret, guard) = resume_secret
        .and_then(|resume_secret| {
            NotifyService::try_resume_client(resume_secret, state.notify_service.clone())
        })
        .unwrap_or_else(|| {
            NotifyService::create_client(ipaddr, user_agent, state.notify_service.clone())
        });
    let receiver = state.notify_service.subscribe();
    let headers = AppendHeaders([(
        SET_COOKIE,
        format!(
            "resume_secret={}; HttpOnly; Secure; SameSite=Strict; Path=/",
            resume_secret
        ),
    )]);

    let notify_stream = wrappers::BroadcastStream::new(receiver).filter_map(
        move |it| -> Option<Result<sse::Event, BoxError>> {
            match it {
                Ok((payload, targets)) => match targets {
                    BroadcastScope::All => {
                        Some(Ok(sse::Event::default().data(payload.to_json())))
                    }
                    BroadcastScope::Only(target) if target == id => {
                        Some(Ok(sse::Event::default().data(payload.to_json())))
                    }
                    BroadcastScope::OnlySet(targets) if targets.contains(&id) => {
                        Some(Ok(sse::Event::default().data(payload.to_json())))
                    }
                    BroadcastScope::Except(target) if target != id => {
                        Some(Ok(sse::Event::default().data(payload.to_json())))
                    }
                    BroadcastScope::ExceptSet(targets) if !targets.contains(&id) => {
                        Some(Ok(sse::Event::default().data(payload.to_json())))
                    }
                    _ => None,
                },
                Err(err) => {
                    tracing::error!(reason = ?err, "failed to read broadcast message.");
                    Some(Err(Box::new(err)))
                }
            }
        },
    );
    // let heart_stream = stream::repeat_with(|| {
    //     let now = SystemTime::now()
    //         .duration_since(std::time::UNIX_EPOCH)
    //         .unwrap_or_default();
    //     sse::Event::default().data(
    //         serde_json::json!({
    //             "type": "HEART",
    //             "time": now.as_millis()
    //         })
    //         .to_string(),
    //     )
    // })
    // .map(|it| -> Result<sse::Event, BoxError> { Ok(it) })
    // .throttle(Duration::from_secs(1));
    // let combined_stream = stream::select(notify_stream, heart_stream);
    let combined_stream = guardable(notify_stream, guard);
    let (combined_stream, stream_controller) = stream::abortable(combined_stream);
    let shutdown_signal = state.shutdown_signal.clone();
    // issue: https://github.com/hyperium/hyper/issues/2787
    tokio::spawn(async move {
        shutdown_signal.cancelled().await;
        stream_controller.abort();
    });
    let pin_code = state.notify_service.get_code(&id).unwrap();
    state
        .notify_service
        .send_with_client(
            BroadcastEvent::ClientRegistration(id, pin_code),
            &id,
        )
        .unwrap();
    (
        headers,
        Sse::new(combined_stream).keep_alive(
            sse::KeepAlive::new()
                .interval(Duration::from_secs(15))
                .text("ping"),
        ),
    )
        .into_response()
}
pub async fn connections(
    State(state): State<AppState>,
) -> anyhow::Result<impl IntoResponse, AppError> {
    let data = state.notify_service.clients();
    Ok(Json(data))
}
