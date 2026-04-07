use super::error::{AppError, Result};
use super::settings::SettingsKey;
use super::state::AppState;
use reqwest::Url;
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use std::collections::HashMap;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::Duration;
use tauri_plugin_log::log;
use uuid::Uuid;

const DOWNLOAD_HTTP_TIMEOUT: Duration = Duration::from_secs(45);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadResult {
    pub path: String,
    pub bytes: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadProgress {
    pub url: String,
    pub path: String,
    pub downloaded_bytes: u64,
    pub downloaded_segments: usize,
    pub total_segments: usize,
    pub complete: bool,
}

#[derive(Debug, Clone)]
struct VariantPlaylist {
    uri: Url,
    bandwidth: u64,
}

#[derive(Debug, Clone)]
struct MediaPlaylist {
    init_segment: Option<Url>,
    segments: Vec<Url>,
}

pub fn get_download_directory(state: &AppState) -> Result<String> {
    let conn = state.auth_store.lock_connection()?;
    let path = db_get_download_directory(&conn)?;
    Ok(path.to_string_lossy().into_owned())
}

pub fn set_download_directory(path: &str, state: &AppState) -> Result<()> {
    let conn = state.auth_store.lock_connection()?;
    db_set_download_directory(&conn, path)
}

pub async fn download_image(url: &str, filename: Option<&str>, state: &AppState) -> Result<DownloadResult> {
    let download_directory = {
        let conn = state.auth_store.lock_connection()?;
        db_get_download_directory(&conn)?
    };

    download_image_to_directory(url, filename, &download_directory).await
}

pub async fn download_video<F>(
    url: &str, filename: Option<&str>, state: &AppState, mut emitter: F,
) -> Result<DownloadResult>
where
    F: FnMut(DownloadProgress) -> Result<()>,
{
    let download_directory = {
        let conn = state.auth_store.lock_connection()?;
        db_get_download_directory(&conn)?
    };

    download_video_to_directory(url, filename, &download_directory, &mut emitter).await
}

fn db_get_download_directory(conn: &Connection) -> Result<PathBuf> {
    let setting_key = SettingsKey::DownloadDirectory.to_string();
    let persisted: Option<String> = conn
        .query_row(
            "SELECT value FROM app_settings WHERE key = ?1",
            params![setting_key],
            |row| row.get(0),
        )
        .optional()?;

    match persisted {
        Some(path) => normalize_and_validate_directory(&path),
        None => default_download_directory_path(),
    }
}

fn db_set_download_directory(conn: &Connection, path: &str) -> Result<()> {
    let validated = normalize_and_validate_directory(path)?;
    let setting_key = SettingsKey::DownloadDirectory.to_string();

    conn.execute(
        "INSERT INTO app_settings(key, value) VALUES(?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![setting_key, validated.to_string_lossy().into_owned()],
    )?;

    Ok(())
}

async fn download_image_to_directory(
    url: &str, filename: Option<&str>, download_directory: &Path,
) -> Result<DownloadResult> {
    ensure_directory_is_writable(download_directory)?;

    let source_url = parse_http_url(url)?;
    let client = reqwest::Client::builder()
        .timeout(DOWNLOAD_HTTP_TIMEOUT)
        .build()
        .map_err(|error| {
            log::error!("failed to construct HTTP client for image download: {error}");
            AppError::validation("Couldn't start the image download.")
        })?;

    let response = client.get(source_url.clone()).send().await.map_err(|error| {
        log::error!("image download request failed for {source_url}: {error}");
        AppError::validation("Couldn't download the image right now.")
    })?;

    if !response.status().is_success() {
        log::warn!(
            "image download request returned non-success status {} for {}",
            response.status(),
            source_url
        );
        return Err(AppError::validation(
            "Couldn't download the image because the server rejected the request.",
        ));
    }

    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|header| header.to_str().ok())
        .map(str::to_string);
    let bytes = response.bytes().await.map_err(|error| {
        log::error!("failed to read image response body for {source_url}: {error}");
        AppError::validation("Couldn't read the downloaded image data.")
    })?;

    let default_extension = content_type
        .as_deref()
        .and_then(extension_from_image_content_type)
        .unwrap_or("jpg");
    let output_name = build_filename(&source_url, filename, "image", Some(default_extension));
    let output_path = resolve_unique_path(download_directory, &output_name);

    fs::write(&output_path, &bytes).map_err(|error| {
        log::error!("failed to write image download to {}: {error}", output_path.display());
        AppError::validation("Couldn't save the image. Check that your download folder exists and is writable.")
    })?;

    Ok(DownloadResult { path: output_path.to_string_lossy().into_owned(), bytes: bytes.len() as u64 })
}

async fn download_video_to_directory<F>(
    url: &str, filename: Option<&str>, download_directory: &Path, emit_progress: &mut F,
) -> Result<DownloadResult>
where
    F: FnMut(DownloadProgress) -> Result<()>,
{
    ensure_directory_is_writable(download_directory)?;

    let source_url = parse_http_url(url)?;
    let client = reqwest::Client::builder()
        .timeout(DOWNLOAD_HTTP_TIMEOUT)
        .build()
        .map_err(|error| {
            log::error!("failed to construct HTTP client for video download: {error}");
            AppError::validation("Couldn't start the video download.")
        })?;

    let manifest = fetch_text(&client, &source_url, "video playlist").await?;
    let variants = parse_master_variants(&source_url, &manifest)?;
    let (playlist_url, media_playlist_body) =
        if let Some(variant) = variants.iter().max_by_key(|variant| variant.bandwidth) {
            let body = fetch_text(&client, &variant.uri, "video variant playlist").await?;
            (variant.uri.clone(), body)
        } else {
            (source_url.clone(), manifest)
        };

    let playlist = parse_media_playlist(&playlist_url, &media_playlist_body)?;

    let output_name = build_filename(&playlist_url, filename, "video", Some("mp4"));
    let output_path = resolve_unique_path(download_directory, &output_name);
    let mut output_file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&output_path)
        .map_err(|error| {
            log::error!("failed to create output video file {}: {error}", output_path.display());
            AppError::validation("Couldn't create a file in your download folder.")
        })?;

    let mut downloaded_bytes: u64 = 0;
    let total_segments = playlist.segments.len();

    maybe_emit_progress(
        emit_progress,
        DownloadProgress {
            url: source_url.to_string(),
            path: output_path.to_string_lossy().into_owned(),
            downloaded_bytes,
            downloaded_segments: 0,
            total_segments,
            complete: false,
        },
    );

    let write_result = async {
        if let Some(init_segment_url) = &playlist.init_segment {
            let init_bytes = fetch_binary(&client, init_segment_url, "video init segment").await?;
            output_file.write_all(&init_bytes).map_err(|error| {
                log::error!(
                    "failed to write video init segment to {}: {error}",
                    output_path.display()
                );
                AppError::validation("Couldn't write the video to disk.")
            })?;
            downloaded_bytes += init_bytes.len() as u64;
        }

        for (index, segment_url) in playlist.segments.iter().enumerate() {
            let segment = fetch_binary(&client, segment_url, "video segment").await?;
            output_file.write_all(&segment).map_err(|error| {
                log::error!(
                    "failed to write video segment {} to {}: {error}",
                    segment_url,
                    output_path.display()
                );
                AppError::validation("Couldn't write the video to disk.")
            })?;
            downloaded_bytes += segment.len() as u64;

            maybe_emit_progress(
                emit_progress,
                DownloadProgress {
                    url: source_url.to_string(),
                    path: output_path.to_string_lossy().into_owned(),
                    downloaded_bytes,
                    downloaded_segments: index + 1,
                    total_segments,
                    complete: false,
                },
            );
        }

        output_file.flush().map_err(|error| {
            log::error!("failed to flush output video file {}: {error}", output_path.display());
            AppError::validation("Couldn't finish writing the video to disk.")
        })?;

        Ok::<(), AppError>(())
    }
    .await;

    if let Err(error) = write_result {
        if let Err(cleanup_error) = fs::remove_file(&output_path) {
            log::warn!(
                "failed to delete partial video download {}: {cleanup_error}",
                output_path.display()
            );
        }
        return Err(error);
    }

    maybe_emit_progress(
        emit_progress,
        DownloadProgress {
            url: source_url.to_string(),
            path: output_path.to_string_lossy().into_owned(),
            downloaded_bytes,
            downloaded_segments: total_segments,
            total_segments,
            complete: true,
        },
    );

    Ok(DownloadResult { path: output_path.to_string_lossy().into_owned(), bytes: downloaded_bytes })
}

fn maybe_emit_progress<F>(emit_progress: &mut F, payload: DownloadProgress)
where
    F: FnMut(DownloadProgress) -> Result<()>,
{
    if let Err(error) = emit_progress(payload) {
        log::warn!("failed to emit download-progress event: {error}");
    }
}

async fn fetch_text(client: &reqwest::Client, url: &Url, label: &str) -> Result<String> {
    let response = client.get(url.clone()).send().await.map_err(|error| {
        log::error!("failed to fetch {label} {url}: {error}");
        AppError::validation("Couldn't download the video playlist.")
    })?;

    if !response.status().is_success() {
        log::warn!("{label} request for {url} returned status {}", response.status());
        return Err(AppError::validation(
            "Couldn't download the video playlist from the server.",
        ));
    }

    response.text().await.map_err(|error| {
        log::error!("failed to read {label} response body for {url}: {error}");
        AppError::validation("Couldn't read the video playlist data.")
    })
}

async fn fetch_binary(client: &reqwest::Client, url: &Url, label: &str) -> Result<Vec<u8>> {
    let response = client.get(url.clone()).send().await.map_err(|error| {
        log::error!("failed to fetch {label} {url}: {error}");
        AppError::validation("Couldn't download part of the video.")
    })?;

    if !response.status().is_success() {
        log::warn!("{label} request for {url} returned status {}", response.status());
        return Err(AppError::validation(
            "Couldn't download part of the video from the server.",
        ));
    }

    response.bytes().await.map(|bytes| bytes.to_vec()).map_err(|error| {
        log::error!("failed to read {label} response body for {url}: {error}");
        AppError::validation("Couldn't read part of the downloaded video.")
    })
}

fn parse_master_variants(base_url: &Url, manifest: &str) -> Result<Vec<VariantPlaylist>> {
    let mut variants = Vec::new();
    let mut pending_bandwidth: Option<u64> = None;

    for raw_line in manifest.lines() {
        let line = raw_line.trim();
        if line.is_empty() {
            continue;
        }

        if let Some(attributes) = line.strip_prefix("#EXT-X-STREAM-INF:") {
            let parsed = parse_m3u8_attributes(attributes);
            let bandwidth = parsed
                .get("BANDWIDTH")
                .and_then(|value| value.parse::<u64>().ok())
                .unwrap_or(0);
            pending_bandwidth = Some(bandwidth);
            continue;
        }

        if let Some(bandwidth) = pending_bandwidth.take() {
            if line.starts_with('#') {
                continue;
            }

            let uri = resolve_manifest_url(base_url, line)?;
            variants.push(VariantPlaylist { uri, bandwidth });
        }
    }

    Ok(variants)
}

fn parse_media_playlist(base_url: &Url, playlist: &str) -> Result<MediaPlaylist> {
    let mut init_segment: Option<Url> = None;
    let mut segments: Vec<Url> = Vec::new();

    for raw_line in playlist.lines() {
        let line = raw_line.trim();
        if line.is_empty() {
            continue;
        }

        if let Some(attributes) = line.strip_prefix("#EXT-X-MAP:") {
            let parsed = parse_m3u8_attributes(attributes);
            if let Some(uri) = parsed.get("URI") {
                init_segment = Some(resolve_manifest_url(base_url, uri)?);
            }
            continue;
        }

        if let Some(attributes) = line.strip_prefix("#EXT-X-KEY:") {
            let parsed = parse_m3u8_attributes(attributes);
            let method = parsed
                .get("METHOD")
                .map(String::as_str)
                .unwrap_or("NONE")
                .to_ascii_uppercase();
            if method != "NONE" {
                return Err(AppError::validation(
                    "This video stream is encrypted and can't be downloaded yet.",
                ));
            }
            continue;
        }

        if line.starts_with('#') {
            continue;
        }

        segments.push(resolve_manifest_url(base_url, line)?);
    }

    if segments.is_empty() {
        return Err(AppError::validation(
            "The video playlist did not contain any downloadable segments.",
        ));
    }

    Ok(MediaPlaylist { init_segment, segments })
}

fn parse_m3u8_attributes(raw: &str) -> HashMap<String, String> {
    let mut attributes = HashMap::new();
    let mut current = String::new();
    let mut in_quotes = false;

    for character in raw.chars() {
        match character {
            '"' => {
                in_quotes = !in_quotes;
                current.push(character);
            }
            ',' if !in_quotes => {
                if let Some((key, value)) = parse_m3u8_attribute_chunk(&current) {
                    attributes.insert(key, value);
                }
                current.clear();
            }
            _ => current.push(character),
        }
    }

    if let Some((key, value)) = parse_m3u8_attribute_chunk(&current) {
        attributes.insert(key, value);
    }

    attributes
}

fn parse_m3u8_attribute_chunk(chunk: &str) -> Option<(String, String)> {
    let (key, value) = chunk.split_once('=')?;
    let normalized_key = key.trim().to_ascii_uppercase();
    if normalized_key.is_empty() {
        return None;
    }

    let normalized_value = value.trim().trim_matches('"').to_string();
    Some((normalized_key, normalized_value))
}

fn resolve_manifest_url(base_url: &Url, candidate: &str) -> Result<Url> {
    let trimmed = candidate.trim();
    if trimmed.is_empty() {
        return Err(AppError::validation(
            "The video playlist referenced an empty segment URL.",
        ));
    }

    let url = Url::parse(trimmed)
        .or_else(|_| base_url.join(trimmed))
        .map_err(|error| {
            log::error!("failed to resolve manifest URL '{trimmed}' against {base_url}: {error}");
            AppError::validation("The video playlist contained an invalid segment URL.")
        })?;

    ensure_http_url(&url)?;
    Ok(url)
}

fn parse_http_url(raw_url: &str) -> Result<Url> {
    let trimmed = raw_url.trim();
    if trimmed.is_empty() {
        return Err(AppError::validation("A download URL is required."));
    }

    let url = Url::parse(trimmed).map_err(|error| {
        log::error!("failed to parse download URL '{trimmed}': {error}");
        AppError::validation("The download URL is not valid.")
    })?;

    ensure_http_url(&url)?;
    Ok(url)
}

fn ensure_http_url(url: &Url) -> Result<()> {
    if matches!(url.scheme(), "http" | "https") {
        Ok(())
    } else {
        Err(AppError::validation(
            "Only http:// and https:// download URLs are supported.",
        ))
    }
}

fn normalize_and_validate_directory(path: &str) -> Result<PathBuf> {
    let expanded = expand_tilde(path.trim());
    ensure_directory_is_writable(&expanded)?;

    fs::canonicalize(&expanded).map_err(|error| {
        log::error!(
            "failed to canonicalize download directory {}: {error}",
            expanded.display()
        );
        AppError::validation("Couldn't resolve the selected download folder.")
    })
}

fn ensure_directory_is_writable(directory: &Path) -> Result<()> {
    if !directory.exists() {
        return Err(AppError::validation("The download folder does not exist."));
    }

    if !directory.is_dir() {
        return Err(AppError::validation("The download folder must be a directory."));
    }

    let probe_path = directory.join(format!(".lazurite-write-check-{}", Uuid::new_v4()));
    let mut probe_file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&probe_path)
        .map_err(|error| {
            log::warn!("download directory {} is not writable: {error}", directory.display());
            AppError::validation("The download folder is not writable.")
        })?;

    probe_file.write_all(b"ok").map_err(|error| {
        log::warn!(
            "failed to write probe file {} for download directory {}: {error}",
            probe_path.display(),
            directory.display()
        );
        AppError::validation("The download folder is not writable.")
    })?;

    if let Err(error) = fs::remove_file(&probe_path) {
        log::warn!(
            "failed to remove probe file {} for download directory {}: {error}",
            probe_path.display(),
            directory.display()
        );
    }

    Ok(())
}

fn default_download_directory_path() -> Result<PathBuf> {
    let Some(path) = dirs::download_dir().or_else(|| dirs::home_dir().map(|home| home.join("Downloads"))) else {
        return Err(AppError::validation(
            "Couldn't locate a default Downloads folder on this system.",
        ));
    };

    normalize_and_validate_directory(&path.to_string_lossy())
}

fn expand_tilde(path: &str) -> PathBuf {
    if path == "~" {
        return dirs::home_dir().unwrap_or_else(|| PathBuf::from(path));
    }

    if let Some(rest) = path.strip_prefix("~/") {
        if let Some(home) = dirs::home_dir() {
            return home.join(rest);
        }
    }

    PathBuf::from(path)
}

fn extension_from_image_content_type(content_type: &str) -> Option<&'static str> {
    let normalized = content_type
        .split(';')
        .next()
        .unwrap_or(content_type)
        .trim()
        .to_ascii_lowercase();

    match normalized.as_str() {
        "image/jpeg" | "image/jpg" => Some("jpg"),
        "image/png" => Some("png"),
        "image/webp" => Some("webp"),
        "image/gif" => Some("gif"),
        "image/avif" => Some("avif"),
        "image/svg+xml" => Some("svg"),
        "image/bmp" => Some("bmp"),
        _ => None,
    }
}

fn build_filename(source_url: &Url, requested: Option<&str>, default_stem: &str, default_ext: Option<&str>) -> String {
    let requested_name = requested
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .map(sanitize_filename)
        .filter(|name| !name.is_empty());

    let mut filename = requested_name.unwrap_or_else(|| {
        let derived = source_url
            .path_segments()
            .and_then(|mut segments| segments.rfind(|segment| !segment.is_empty()))
            .unwrap_or(default_stem);
        sanitize_filename(derived)
    });

    if filename.is_empty() {
        filename = default_stem.to_string();
    }

    if Path::new(&filename).extension().is_none() {
        if let Some(extension) = default_ext.filter(|extension| !extension.is_empty()) {
            filename.push('.');
            filename.push_str(extension);
        }
    }

    filename
}

fn sanitize_filename(raw: &str) -> String {
    let basename = Path::new(raw)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or(raw)
        .trim();

    basename
        .chars()
        .map(|character| match character {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            _ if character.is_control() => '_',
            _ => character,
        })
        .collect::<String>()
        .trim()
        .trim_matches('.')
        .to_string()
}

fn resolve_unique_path(directory: &Path, filename: &str) -> PathBuf {
    let safe_filename = sanitize_filename(filename);
    let fallback_name = if safe_filename.is_empty() { "download.bin".to_string() } else { safe_filename };

    let candidate = directory.join(&fallback_name);
    if !candidate.exists() {
        return candidate;
    }

    let path = Path::new(&fallback_name);
    let stem = path
        .file_stem()
        .and_then(|value| value.to_str())
        .filter(|value| !value.is_empty())
        .unwrap_or("download");
    let extension = path.extension().and_then(|value| value.to_str());

    for suffix in 1..10_000 {
        let numbered = match extension {
            Some(extension) if !extension.is_empty() => format!("{stem}_{suffix}.{extension}"),
            _ => format!("{stem}_{suffix}"),
        };

        let numbered_path = directory.join(numbered);
        if !numbered_path.exists() {
            return numbered_path;
        }
    }

    directory.join(format!("{}_{}", stem, Uuid::new_v4()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;
    use std::io::{Read, Write};
    use std::net::{SocketAddr, TcpListener};
    use std::sync::mpsc;
    use std::thread;

    #[derive(Clone)]
    struct TestResponse {
        status_line: &'static str,
        content_type: &'static str,
        body: Vec<u8>,
    }

    struct TestServer {
        address: SocketAddr,
        shutdown_tx: mpsc::Sender<()>,
        handle: Option<thread::JoinHandle<()>>,
    }

    impl TestServer {
        fn url(&self, path: &str) -> String {
            format!("http://{}{}", self.address, path)
        }
    }

    impl Drop for TestServer {
        fn drop(&mut self) {
            let _ = self.shutdown_tx.send(());
            if let Some(handle) = self.handle.take() {
                let _ = handle.join();
            }
        }
    }

    fn start_test_server(routes: HashMap<String, TestResponse>) -> TestServer {
        let listener = TcpListener::bind("127.0.0.1:0").expect("test server should bind");
        listener
            .set_nonblocking(true)
            .expect("test server listener should be nonblocking");
        let address = listener.local_addr().expect("test server should expose local address");
        let (shutdown_tx, shutdown_rx) = mpsc::channel::<()>();

        let handle = thread::spawn(move || loop {
            if shutdown_rx.try_recv().is_ok() {
                break;
            }

            match listener.accept() {
                Ok((mut stream, _)) => {
                    let mut buffer = [0_u8; 4096];
                    let read = match stream.read(&mut buffer) {
                        Ok(read) if read > 0 => read,
                        _ => continue,
                    };

                    let request_line = String::from_utf8_lossy(&buffer[..read]);
                    let target = request_line
                        .lines()
                        .next()
                        .and_then(|line| line.split_whitespace().nth(1))
                        .unwrap_or("/")
                        .split('?')
                        .next()
                        .unwrap_or("/")
                        .to_string();

                    let response = routes.get(&target).cloned().unwrap_or(TestResponse {
                        status_line: "HTTP/1.1 404 Not Found",
                        content_type: "text/plain",
                        body: b"not found".to_vec(),
                    });

                    let headers = format!(
                        "{}\r\nContent-Type: {}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                        response.status_line,
                        response.content_type,
                        response.body.len()
                    );

                    if stream.write_all(headers.as_bytes()).is_ok() {
                        let _ = stream.write_all(&response.body);
                    }
                }
                Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                    thread::sleep(Duration::from_millis(5));
                }
                Err(_) => break,
            }
        });

        TestServer { address, shutdown_tx, handle: Some(handle) }
    }

    fn settings_db() -> Connection {
        let conn = Connection::open_in_memory().expect("in-memory db should open");
        conn.execute_batch(include_str!("migrations/006_app_settings.sql"))
            .expect("settings migration should apply");
        conn
    }

    fn temp_directory() -> PathBuf {
        let path = std::env::temp_dir().join(format!("lazurite-media-tests-{}", Uuid::new_v4()));
        fs::create_dir_all(&path).expect("temporary directory should be created");
        path
    }

    #[test]
    fn set_download_directory_persists_value() {
        let conn = settings_db();
        let directory = temp_directory();

        db_set_download_directory(&conn, directory.to_str().expect("path should be utf-8"))
            .expect("set download directory should succeed");
        let resolved = db_get_download_directory(&conn).expect("get download directory should succeed");

        assert_eq!(
            resolved,
            fs::canonicalize(directory).expect("directory should canonicalize")
        );
    }

    #[test]
    fn set_download_directory_rejects_missing_path() {
        let conn = settings_db();
        let missing = std::env::temp_dir().join(format!("lazurite-missing-{}", Uuid::new_v4()));

        let error = db_set_download_directory(&conn, missing.to_str().expect("path should be utf-8"))
            .expect_err("missing path should be rejected");

        assert!(
            error.to_string().contains("download folder"),
            "error should describe invalid folder"
        );
    }

    #[test]
    fn resolve_unique_path_appends_numeric_suffixes() {
        let directory = temp_directory();
        let first = directory.join("image.jpg");
        let second = directory.join("image_1.jpg");
        fs::write(&first, b"first").expect("first file should be written");
        fs::write(&second, b"second").expect("second file should be written");

        let resolved = resolve_unique_path(&directory, "image.jpg");
        assert_eq!(resolved.file_name().and_then(|name| name.to_str()), Some("image_2.jpg"));
    }

    #[test]
    fn parse_master_variants_extracts_bandwidth_and_urls() {
        let base_url = Url::parse("https://example.com/path/master.m3u8").expect("url should parse");
        let manifest =
            "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1280000\nlow.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=2560000\nhigh.m3u8\n";

        let variants = parse_master_variants(&base_url, manifest).expect("master playlist should parse");

        assert_eq!(variants.len(), 2);
        assert_eq!(variants[0].bandwidth, 1_280_000);
        assert_eq!(variants[1].bandwidth, 2_560_000);
        assert_eq!(variants[1].uri.as_str(), "https://example.com/path/high.m3u8");
    }

    #[test]
    fn parse_media_playlist_extracts_segments_and_init_map() {
        let base_url = Url::parse("https://cdn.example.com/video/index.m3u8").expect("url should parse");
        let playlist = "#EXTM3U\n#EXT-X-MAP:URI=\"init.mp4\"\n#EXTINF:1.0,\nseg-1.ts\n#EXTINF:1.0,\nseg-2.ts\n";

        let parsed = parse_media_playlist(&base_url, playlist).expect("media playlist should parse");

        assert_eq!(parsed.segments.len(), 2);
        assert_eq!(
            parsed.init_segment.as_ref().map(Url::as_str),
            Some("https://cdn.example.com/video/init.mp4")
        );
        assert_eq!(parsed.segments[0].as_str(), "https://cdn.example.com/video/seg-1.ts");
    }

    #[tokio::test]
    async fn download_image_writes_file_to_target_directory() {
        let server = start_test_server(HashMap::from([(
            "/image.jpg".to_string(),
            TestResponse { status_line: "HTTP/1.1 200 OK", content_type: "image/jpeg", body: b"fake-jpeg".to_vec() },
        )]));
        let directory = temp_directory();

        let result = download_image_to_directory(&server.url("/image.jpg"), None, &directory)
            .await
            .expect("image download should succeed");

        assert_eq!(result.bytes, 9);
        assert!(result.path.ends_with("image.jpg"));
        assert_eq!(
            fs::read(result.path).expect("downloaded image should be readable"),
            b"fake-jpeg"
        );
    }

    #[tokio::test]
    async fn download_video_downloads_highest_bandwidth_variant_and_emits_progress() {
        let server = start_test_server(HashMap::from([
            (
                "/master.m3u8".to_string(),
                TestResponse {
                    status_line: "HTTP/1.1 200 OK",
                    content_type: "application/vnd.apple.mpegurl",
                    body: b"#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=64000\nlow.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=128000\nhigh.m3u8\n"
                        .to_vec(),
                },
            ),
            (
                "/high.m3u8".to_string(),
                TestResponse {
                    status_line: "HTTP/1.1 200 OK",
                    content_type: "application/vnd.apple.mpegurl",
                    body: b"#EXTM3U\n#EXTINF:1.0,\nseg-a.ts\n#EXTINF:1.0,\nseg-b.ts\n".to_vec(),
                },
            ),
            (
                "/seg-a.ts".to_string(),
                TestResponse {
                    status_line: "HTTP/1.1 200 OK",
                    content_type: "video/mp2t",
                    body: b"segment-a".to_vec(),
                },
            ),
            (
                "/seg-b.ts".to_string(),
                TestResponse {
                    status_line: "HTTP/1.1 200 OK",
                    content_type: "video/mp2t",
                    body: b"segment-b".to_vec(),
                },
            ),
        ]));
        let directory = temp_directory();
        let mut progress_events = Vec::new();

        let result = download_video_to_directory(
            &server.url("/master.m3u8"),
            Some("clip.mp4"),
            &directory,
            &mut |progress| {
                progress_events.push(progress);
                Ok(())
            },
        )
        .await
        .expect("video download should succeed");

        assert!(result.path.ends_with("clip.mp4"));
        assert_eq!(result.bytes, (b"segment-a".len() + b"segment-b".len()) as u64);

        let final_progress = progress_events
            .last()
            .expect("at least one progress event should be emitted");
        assert!(final_progress.complete);
        assert_eq!(final_progress.downloaded_segments, 2);
        assert_eq!(final_progress.total_segments, 2);
        assert_eq!(
            fs::read(result.path).expect("downloaded video should be readable"),
            b"segment-asegment-b"
        );
    }
}
