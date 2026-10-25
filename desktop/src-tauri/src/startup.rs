use std::future::Future;
use std::time::Duration;

use serde::Serialize;

// Reporting every network chunk would flood the IPC; a step of 256 KiB is ~200 events for a 50 MB installer.
pub const PROGRESS_STEP: u64 = 256 * 1024;

/// What the splash is told while the shell opens; `desktop/src/shell-events.ts` validates the same shape.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum StartupEvent {
    CheckingUpdate,
    Downloading { downloaded: u64, total: Option<u64> },
    Installing,
    Connecting,
    ServerUnavailable,
    Offline,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StartupOutcome {
    Restart,
    Navigate,
    WaitForRetry,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StartupResult {
    pub outcome: StartupOutcome,
    pub update_problem: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HealthStatus {
    Healthy,
    Unavailable,
    Unreachable,
}

/// A newer shell already found by the update source.
pub trait PendingUpdate: Send {
    fn download(
        &self,
        on_chunk: impl FnMut(u64, Option<u64>) + Send,
    ) -> impl Future<Output = Result<Vec<u8>, String>> + Send;
    fn install(&self, bytes: Vec<u8>) -> Result<(), String>;
}

pub trait UpdateSource: Sync {
    type Update: PendingUpdate;
    fn check(&self) -> impl Future<Output = Result<Option<Self::Update>, String>> + Send;
}

pub trait HealthProbe: Sync {
    fn probe(&self) -> impl Future<Output = HealthStatus> + Send;
}

/// The whole opening: update first (bounded by `update_timeout`, never blocking play), then the server.
///
/// Example: `run_startup(&source, &probe, Duration::from_secs(8), &mut |event| splash.emit(event)).await`
pub async fn run_startup(
    update: &impl UpdateSource,
    health: &impl HealthProbe,
    update_timeout: Duration,
    emit: &mut (impl FnMut(StartupEvent) + Send),
) -> StartupResult {
    emit(StartupEvent::CheckingUpdate);
    let update_problem = match update_within(update, update_timeout, emit).await {
        Ok(true) => {
            return StartupResult {
                outcome: StartupOutcome::Restart,
                update_problem: None,
            }
        }
        Ok(false) => None,
        Err(problem) => Some(problem),
    };
    let outcome = check_connection(health, emit).await;
    StartupResult {
        outcome,
        update_problem,
    }
}

/// The server half of the opening, also run by the splash's "Tentar de novo".
///
/// Example: `check_connection(&probe, &mut |event| splash.emit(event)).await // StartupOutcome::Navigate`
pub async fn check_connection(
    health: &impl HealthProbe,
    emit: &mut (impl FnMut(StartupEvent) + Send),
) -> StartupOutcome {
    emit(StartupEvent::Connecting);
    match health.probe().await {
        HealthStatus::Healthy => StartupOutcome::Navigate,
        HealthStatus::Unavailable => wait_for_retry(emit, StartupEvent::ServerUnavailable),
        HealthStatus::Unreachable => wait_for_retry(emit, StartupEvent::Offline),
    }
}

fn wait_for_retry(emit: &mut impl FnMut(StartupEvent), event: StartupEvent) -> StartupOutcome {
    emit(event);
    StartupOutcome::WaitForRetry
}

// `Ok(true)`: installed, the app must restart. Only the check has a deadline; a started download runs to the end.
async fn update_within(
    update: &impl UpdateSource,
    deadline: Duration,
    emit: &mut (impl FnMut(StartupEvent) + Send),
) -> Result<bool, String> {
    let checked = tokio::time::timeout(deadline, update.check())
        .await
        .map_err(|_| format!("checagem de atualização passou de {deadline:?}"))?;
    let Some(pending) =
        checked.map_err(|cause| format!("checagem de atualização falhou: {cause}"))?
    else {
        return Ok(false);
    };
    let bytes = download_reporting(&pending, emit).await?;
    emit(StartupEvent::Installing);
    pending
        .install(bytes)
        .map_err(|cause| format!("instalação falhou: {cause}"))?;
    Ok(true)
}

async fn download_reporting(
    pending: &impl PendingUpdate,
    emit: &mut (impl FnMut(StartupEvent) + Send),
) -> Result<Vec<u8>, String> {
    let mut downloaded: u64 = 0;
    let mut reported: Option<u64> = None;
    let on_chunk = |chunk: u64, total: Option<u64>| {
        downloaded += chunk;
        if reported.is_none_or(|last| downloaded - last >= PROGRESS_STEP) {
            reported = Some(downloaded);
            emit(StartupEvent::Downloading { downloaded, total });
        }
    };
    pending
        .download(on_chunk)
        .await
        .map_err(|cause| format!("download da atualização falhou: {cause}"))
}

#[cfg(test)]
mod tests {
    use std::collections::VecDeque;
    use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
    use std::sync::Mutex;

    use super::*;

    const TIMEOUT: Duration = Duration::from_millis(50);

    struct UpdateFake {
        chunks: Vec<u64>,
        total: Option<u64>,
        download_fails: bool,
        installed: AtomicBool,
    }

    impl UpdateFake {
        fn of(chunks: Vec<u64>, total: Option<u64>) -> Self {
            Self {
                chunks,
                total,
                download_fails: false,
                installed: AtomicBool::new(false),
            }
        }
    }

    impl PendingUpdate for &UpdateFake {
        async fn download(
            &self,
            mut on_chunk: impl FnMut(u64, Option<u64>) + Send,
        ) -> Result<Vec<u8>, String> {
            for chunk in &self.chunks {
                on_chunk(*chunk, self.total);
            }
            if self.download_fails {
                return Err(String::from("conexão caiu no meio"));
            }
            Ok(vec![1, 2, 3])
        }

        fn install(&self, _bytes: Vec<u8>) -> Result<(), String> {
            self.installed.store(true, Ordering::SeqCst);
            Ok(())
        }
    }

    enum UpdateSourceFake<'a> {
        UpToDate,
        Fails,
        Hangs,
        Offers(&'a UpdateFake),
    }

    impl<'a> UpdateSource for UpdateSourceFake<'a> {
        type Update = &'a UpdateFake;

        async fn check(&self) -> Result<Option<Self::Update>, String> {
            match self {
                Self::UpToDate => Ok(None),
                Self::Fails => Err(String::from("latest.json fora do ar")),
                Self::Hangs => std::future::pending().await,
                Self::Offers(update) => Ok(Some(*update)),
            }
        }
    }

    struct HealthProbeFake {
        answers: Mutex<VecDeque<HealthStatus>>,
        calls: AtomicUsize,
    }

    impl HealthProbeFake {
        fn answering(answers: &[HealthStatus]) -> Self {
            Self {
                answers: Mutex::new(answers.iter().copied().collect()),
                calls: AtomicUsize::new(0),
            }
        }

        fn calls(&self) -> usize {
            self.calls.load(Ordering::SeqCst)
        }
    }

    impl HealthProbe for HealthProbeFake {
        async fn probe(&self) -> HealthStatus {
            self.calls.fetch_add(1, Ordering::SeqCst);
            self.answers
                .lock()
                .unwrap()
                .pop_front()
                .expect("HealthProbeFake sem resposta")
        }
    }

    fn start(
        update: &UpdateSourceFake<'_>,
        health: &HealthProbeFake,
    ) -> (StartupResult, Vec<StartupEvent>) {
        let mut events = Vec::new();
        let result =
            tauri::async_runtime::block_on(run_startup(update, health, TIMEOUT, &mut |event| {
                events.push(event)
            }));
        (result, events)
    }

    #[test]
    fn available_update_downloads_installs_and_restarts_without_health() {
        let update = UpdateFake::of(vec![PROGRESS_STEP, PROGRESS_STEP], Some(2 * PROGRESS_STEP));
        let health = HealthProbeFake::answering(&[]);

        let (result, events) = start(&UpdateSourceFake::Offers(&update), &health);

        assert_eq!(result.outcome, StartupOutcome::Restart);
        assert_eq!(
            events,
            vec![
                StartupEvent::CheckingUpdate,
                StartupEvent::Downloading {
                    downloaded: PROGRESS_STEP,
                    total: Some(2 * PROGRESS_STEP)
                },
                StartupEvent::Downloading {
                    downloaded: 2 * PROGRESS_STEP,
                    total: Some(2 * PROGRESS_STEP)
                },
                StartupEvent::Installing,
            ]
        );
        assert!(update.installed.load(Ordering::SeqCst));
        assert_eq!(health.calls(), 0);
    }

    #[test]
    fn small_chunks_are_reported_once_per_progress_step() {
        let update = UpdateFake::of(vec![1; 10], None);
        let health = HealthProbeFake::answering(&[]);

        let (_, events) = start(&UpdateSourceFake::Offers(&update), &health);

        assert_eq!(
            events,
            vec![
                StartupEvent::CheckingUpdate,
                StartupEvent::Downloading {
                    downloaded: 1,
                    total: None
                },
                StartupEvent::Installing,
            ]
        );
    }

    #[test]
    fn no_update_and_healthy_server_connects_and_navigates() {
        let health = HealthProbeFake::answering(&[HealthStatus::Healthy]);

        let (result, events) = start(&UpdateSourceFake::UpToDate, &health);

        assert_eq!(
            result,
            StartupResult {
                outcome: StartupOutcome::Navigate,
                update_problem: None
            }
        );
        assert_eq!(
            events,
            vec![StartupEvent::CheckingUpdate, StartupEvent::Connecting]
        );
    }

    #[test]
    fn failed_update_check_still_opens_the_site_and_reports_why() {
        let health = HealthProbeFake::answering(&[HealthStatus::Healthy]);

        let (result, _) = start(&UpdateSourceFake::Fails, &health);

        assert_eq!(result.outcome, StartupOutcome::Navigate);
        assert!(result
            .update_problem
            .unwrap()
            .contains("latest.json fora do ar"));
    }

    #[test]
    fn update_check_past_the_deadline_still_opens_the_site() {
        let health = HealthProbeFake::answering(&[HealthStatus::Healthy]);

        let (result, _) = start(&UpdateSourceFake::Hangs, &health);

        assert_eq!(result.outcome, StartupOutcome::Navigate);
        assert!(result.update_problem.unwrap().contains("50ms"));
    }

    #[test]
    fn failed_download_still_opens_the_site_without_installing() {
        let update = UpdateFake {
            download_fails: true,
            ..UpdateFake::of(vec![1], Some(10))
        };
        let health = HealthProbeFake::answering(&[HealthStatus::Healthy]);

        let (result, events) = start(&UpdateSourceFake::Offers(&update), &health);

        assert_eq!(result.outcome, StartupOutcome::Navigate);
        assert!(result
            .update_problem
            .unwrap()
            .contains("conexão caiu no meio"));
        assert!(!update.installed.load(Ordering::SeqCst));
        assert_eq!(events.last(), Some(&StartupEvent::Connecting));
    }

    #[test]
    fn server_answering_503_shows_maintenance_and_waits() {
        let health = HealthProbeFake::answering(&[HealthStatus::Unavailable]);

        let (result, events) = start(&UpdateSourceFake::UpToDate, &health);

        assert_eq!(result.outcome, StartupOutcome::WaitForRetry);
        assert_eq!(events.last(), Some(&StartupEvent::ServerUnavailable));
    }

    #[test]
    fn network_error_shows_offline_and_waits() {
        let health = HealthProbeFake::answering(&[HealthStatus::Unreachable]);

        let (result, events) = start(&UpdateSourceFake::UpToDate, &health);

        assert_eq!(result.outcome, StartupOutcome::WaitForRetry);
        assert_eq!(events.last(), Some(&StartupEvent::Offline));
    }

    #[test]
    fn retry_after_offline_checks_the_server_again() {
        let health =
            HealthProbeFake::answering(&[HealthStatus::Unreachable, HealthStatus::Healthy]);
        start(&UpdateSourceFake::UpToDate, &health);
        let mut events = Vec::new();

        let outcome = tauri::async_runtime::block_on(check_connection(&health, &mut |event| {
            events.push(event)
        }));

        assert_eq!(outcome, StartupOutcome::Navigate);
        assert_eq!(events, vec![StartupEvent::Connecting]);
        assert_eq!(health.calls(), 2);
    }

    #[test]
    fn events_serialize_in_the_shape_the_splash_reads() {
        let event = StartupEvent::Downloading {
            downloaded: 21,
            total: None,
        };

        assert_eq!(
            serde_json::to_string(&event).unwrap(),
            r#"{"kind":"downloading","downloaded":21,"total":null}"#
        );
        assert_eq!(
            serde_json::to_string(&StartupEvent::ServerUnavailable).unwrap(),
            r#"{"kind":"server-unavailable"}"#
        );
    }
}
