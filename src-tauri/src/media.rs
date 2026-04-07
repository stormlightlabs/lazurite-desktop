use super::error::{AppError, Result};
use super::explorer;
use super::settings::SettingsKey;
use super::state::AppState;
use image::ImageFormat;
use jacquard::types::cid::Cid;
use jacquard::types::did::Did;
use reqwest::Url;
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use std::fs::{self, OpenOptions};
use std::io::{Cursor, Write};
use std::path::{Path, PathBuf};
use tauri::AppHandle;
use tauri_plugin_log::log;
use uuid::Uuid;

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

#[derive(Debug, Clone, PartialEq, Eq)]
struct BlobRef {
    did: String,
    cid: String,
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

pub async fn download_image(
    url: &str, filename: Option<&str>, app: &AppHandle, state: &AppState,
) -> Result<DownloadResult> {
    let download_directory = {
        let conn = state.auth_store.lock_connection()?;
        db_get_download_directory(&conn)?
    };

    download_image_to_directory(url, filename, app, &download_directory).await
}

pub async fn download_video<F>(
    url: &str, filename: Option<&str>, app: &AppHandle, state: &AppState, mut emitter: F,
) -> Result<DownloadResult>
where
    F: FnMut(DownloadProgress) -> Result<()>,
{
    let download_directory = {
        let conn = state.auth_store.lock_connection()?;
        db_get_download_directory(&conn)?
    };

    download_video_to_directory(url, filename, app, &download_directory, &mut emitter).await
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
    url: &str, filename: Option<&str>, app: &AppHandle, download_directory: &Path,
) -> Result<DownloadResult> {
    ensure_directory_is_writable(download_directory)?;
    let source_url = parse_http_url(url)?;
    let temp_blob = fetch_blob_to_temp_file(&source_url, app, Some("blob")).await?;
    let bytes = fs::read(&temp_blob.path).map_err(|error| {
        log::error!(
            "failed to read temporary blob file {} for image download {}: {error}",
            temp_blob.path,
            source_url
        );
        AppError::validation("Couldn't read the downloaded image data.")
    })?;
    cleanup_blob_temp_file(&temp_blob.path, app);

    let content_type = content_type_from_url(&source_url);
    let png_bytes = transcode_image_to_png(&bytes, &source_url, content_type.as_deref())?;
    let output_name = build_filename(&source_url, filename, "image", Some("png"), true);
    let output_path = resolve_unique_path(download_directory, &output_name);

    fs::write(&output_path, &png_bytes).map_err(|error| {
        log::error!("failed to write image download to {}: {error}", output_path.display());
        AppError::validation("Couldn't save the image. Check that your download folder exists and is writable.")
    })?;

    Ok(DownloadResult { path: output_path.to_string_lossy().into_owned(), bytes: png_bytes.len() as u64 })
}

async fn download_video_to_directory<F>(
    url: &str, filename: Option<&str>, app: &AppHandle, download_directory: &Path, emit_progress: &mut F,
) -> Result<DownloadResult>
where
    F: FnMut(DownloadProgress) -> Result<()>,
{
    ensure_directory_is_writable(download_directory)?;

    let source_url = parse_http_url(url)?;
    let output_name = build_filename(&source_url, filename, "video", Some("mp4"), true);
    let output_path = resolve_unique_path(download_directory, &output_name);
    let total_segments = 1;

    maybe_emit_progress(
        emit_progress,
        DownloadProgress {
            url: source_url.to_string(),
            path: output_path.to_string_lossy().into_owned(),
            downloaded_bytes: 0,
            downloaded_segments: 0,
            total_segments,
            complete: false,
        },
    );

    let temp_blob = match fetch_blob_to_temp_file(&source_url, app, Some("mp4")).await {
        Ok(blob) => blob,
        Err(error) => {
            if let Err(cleanup_error) = fs::remove_file(&output_path) {
                log::warn!(
                    "failed to delete partial video download {}: {cleanup_error}",
                    output_path.display()
                );
            }
            return Err(error);
        }
    };
    let copied_bytes = match fs::copy(&temp_blob.path, &output_path) {
        Ok(bytes) => bytes,
        Err(error) => {
            cleanup_blob_temp_file(&temp_blob.path, app);
            if let Err(cleanup_error) = fs::remove_file(&output_path) {
                log::warn!(
                    "failed to delete partial video download {}: {cleanup_error}",
                    output_path.display()
                );
            }
            log::error!(
                "failed to copy temporary blob {} to download output {}: {error}",
                temp_blob.path,
                output_path.display()
            );
            return Err(AppError::validation(
                "Couldn't save the video. Check that your download folder exists and is writable.",
            ));
        }
    };
    cleanup_blob_temp_file(&temp_blob.path, app);

    maybe_emit_progress(
        emit_progress,
        DownloadProgress {
            url: source_url.to_string(),
            path: output_path.to_string_lossy().into_owned(),
            downloaded_bytes: copied_bytes,
            downloaded_segments: total_segments,
            total_segments,
            complete: true,
        },
    );

    Ok(DownloadResult { path: output_path.to_string_lossy().into_owned(), bytes: copied_bytes })
}

fn maybe_emit_progress<F>(emit_progress: &mut F, payload: DownloadProgress)
where
    F: FnMut(DownloadProgress) -> Result<()>,
{
    if let Err(error) = emit_progress(payload) {
        log::warn!("failed to emit download-progress event: {error}");
    }
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

async fn fetch_blob_to_temp_file(
    source_url: &Url, app: &AppHandle, extension: Option<&str>,
) -> Result<explorer::TempBlobFile> {
    let blob_ref = blob_ref_from_url(source_url)?;
    explorer::fetch_blob_to_temp_file(
        blob_ref.did,
        blob_ref.cid,
        extension.map(|value| value.to_string()),
        app,
    )
    .await
}

fn cleanup_blob_temp_file(path: &str, app: &AppHandle) {
    if let Err(error) = explorer::delete_blob_temp_file(path, app) {
        log::warn!("failed to clean up temporary blob file {}: {error}", path);
    }
}

fn blob_ref_from_url(source_url: &Url) -> Result<BlobRef> {
    let segments: Vec<String> = source_url
        .path_segments()
        .map(|values| {
            values
                .filter(|value| !value.is_empty())
                .map(decode_known_url_encoding)
                .collect()
        })
        .unwrap_or_default();
    if segments.is_empty() {
        return Err(AppError::validation("The media URL is missing path segments."));
    }

    for (index, segment) in segments.iter().enumerate() {
        if Did::new(segment).is_ok() {
            if let Some(candidate) = segments.get(index + 1).and_then(|value| normalize_cid_candidate(value)) {
                if Cid::str(candidate).to_ipld().is_ok() {
                    return Ok(BlobRef { did: segment.clone(), cid: candidate.to_string() });
                }
            }
        }
    }

    Err(AppError::validation(
        "Couldn't parse a valid DID/CID blob reference from the media URL.",
    ))
}

fn normalize_cid_candidate(segment: &str) -> Option<&str> {
    let without_query = segment.split('?').next().unwrap_or(segment);
    let without_fragment = without_query.split('#').next().unwrap_or(without_query);
    let without_suffix = without_fragment.split('@').next().unwrap_or(without_fragment);
    let without_extension = without_suffix.split('.').next().unwrap_or(without_suffix);
    let trimmed = without_extension.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed)
    }
}

fn decode_known_url_encoding(segment: &str) -> String {
    segment.replace("%3A", ":").replace("%3a", ":")
}

fn content_type_from_url(source_url: &Url) -> Option<String> {
    let path = source_url.path().to_ascii_lowercase();
    if path.ends_with(".png") || path.contains("@png") {
        return Some("image/png".to_string());
    }
    if path.ends_with(".webp") || path.contains("@webp") {
        return Some("image/webp".to_string());
    }
    if path.ends_with(".gif") || path.contains("@gif") {
        return Some("image/gif".to_string());
    }
    if path.ends_with(".bmp") || path.contains("@bmp") {
        return Some("image/bmp".to_string());
    }
    if path.ends_with(".avif") || path.contains("@avif") {
        return Some("image/avif".to_string());
    }
    if path.ends_with(".svg") || path.contains("@svg") {
        return Some("image/svg+xml".to_string());
    }
    if path.ends_with(".jpg") || path.ends_with(".jpeg") || path.contains("@jpeg") || path.contains("@jpg") {
        return Some("image/jpeg".to_string());
    }

    None
}

fn transcode_image_to_png(bytes: &[u8], source_url: &Url, content_type: Option<&str>) -> Result<Vec<u8>> {
    let normalized_content_type = content_type
        .and_then(|value| value.split(';').next())
        .map(str::trim)
        .map(str::to_ascii_lowercase);
    if normalized_content_type.as_deref() == Some("image/svg+xml") {
        return Err(AppError::validation("This image format can't be saved as PNG yet."));
    }

    let decoded = image::load_from_memory(bytes).map_err(|error| {
        log::warn!(
            "failed to decode downloaded image as raster for {} (content-type: {:?}): {error}",
            source_url,
            normalized_content_type
        );
        AppError::validation("Couldn't decode the downloaded image data.")
    })?;

    let mut encoded = Vec::new();
    decoded
        .write_to(&mut Cursor::new(&mut encoded), ImageFormat::Png)
        .map_err(|error| {
            log::error!(
                "failed to transcode image download to PNG for {} (content-type: {:?}): {error}",
                source_url,
                normalized_content_type
            );
            AppError::validation("Couldn't save this image as PNG.")
        })?;

    Ok(encoded)
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

fn build_filename(
    source_url: &Url, requested: Option<&str>, default_stem: &str, default_ext: Option<&str>, force_extension: bool,
) -> String {
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

    if let Some(extension) = default_ext.filter(|extension| !extension.is_empty()) {
        let mut path = PathBuf::from(&filename);
        if force_extension || path.extension().is_none() {
            path.set_extension(extension.trim_start_matches('.'));
            filename = path.to_string_lossy().into_owned();
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
    use image::{DynamicImage, ImageFormat, Rgba, RgbaImage};
    use std::io::Cursor;

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

    fn test_image_bytes(format: ImageFormat) -> Vec<u8> {
        let mut image = RgbaImage::new(1, 1);
        image.put_pixel(0, 0, Rgba([0xFF, 0x66, 0x00, 0xFF]));

        let mut bytes = Vec::new();
        DynamicImage::ImageRgba8(image)
            .write_to(&mut Cursor::new(&mut bytes), format)
            .expect("test image should encode");
        bytes
    }

    fn is_png(bytes: &[u8]) -> bool {
        bytes.starts_with(&[0x89, b'P', b'N', b'G', b'\r', b'\n', 0x1A, b'\n'])
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
    fn blob_ref_parses_from_bsky_image_and_video_urls() {
        let image_cid = "bafyreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku";
        let image_url = Url::parse(&format!(
            "https://cdn.bsky.app/img/feed_fullsize/plain/did:plc:alice/{image_cid}@jpeg"
        ))
        .expect("image url should parse");
        let image_ref = blob_ref_from_url(&image_url).expect("image blob ref should parse");
        assert_eq!(image_ref.did, "did:plc:alice");
        assert_eq!(image_ref.cid, image_cid);

        let video_cid = "bafyreic6b7f6qtk2obzmd2i4uj5qvlnxbv5b3pa3y3n6k5s2ucx6ws73mi";
        let video_url = Url::parse(&format!(
            "https://video.bsky.app/watch/did:plc:alice/{video_cid}/playlist.m3u8"
        ))
        .expect("video url should parse");
        let video_ref = blob_ref_from_url(&video_url).expect("video blob ref should parse");
        assert_eq!(video_ref.did, "did:plc:alice");
        assert_eq!(video_ref.cid, video_cid);
    }

    #[test]
    fn blob_ref_rejects_urls_without_did_cid_pair() {
        let bad_url = Url::parse("https://example.com/media/playlist.m3u8").expect("url should parse");
        let error = blob_ref_from_url(&bad_url).expect_err("blob ref parsing should fail");
        assert!(error.to_string().contains("DID/CID"));
    }

    #[test]
    fn content_type_is_inferred_from_media_url() {
        let png_url = Url::parse("https://cdn.bsky.app/img/feed_fullsize/plain/did:plc:alice/bafy@png")
            .expect("png url should parse");
        assert_eq!(content_type_from_url(&png_url).as_deref(), Some("image/png"));

        let jpeg_url = Url::parse("https://cdn.bsky.app/img/feed_fullsize/plain/did:plc:alice/bafy@jpeg")
            .expect("jpeg url should parse");
        assert_eq!(content_type_from_url(&jpeg_url).as_deref(), Some("image/jpeg"));
    }

    #[test]
    fn transcode_image_to_png_converts_valid_image_bytes() {
        let jpeg = test_image_bytes(ImageFormat::Jpeg);
        let source_url = Url::parse("https://cdn.bsky.app/img/feed_fullsize/plain/did:plc:alice/bafy@jpeg")
            .expect("url should parse");
        let converted =
            transcode_image_to_png(&jpeg, &source_url, Some("image/jpeg")).expect("image transcode should succeed");
        assert!(is_png(&converted));
    }

    #[test]
    fn normalize_cid_candidate_strips_suffixes() {
        assert_eq!(
            normalize_cid_candidate("bafy123@jpeg").expect("candidate should parse"),
            "bafy123"
        );
        assert_eq!(
            normalize_cid_candidate("bafy123.mp4?x=1").expect("candidate should parse"),
            "bafy123"
        );
        assert!(normalize_cid_candidate("").is_none());
    }

    #[test]
    fn build_filename_replaces_existing_extension_when_forced() {
        let source_url = Url::parse("https://cdn.example.com/path/master.m3u8").expect("url should parse");
        assert_eq!(
            build_filename(&source_url, None, "video", Some("mp4"), true),
            "master.mp4"
        );
        assert_eq!(
            build_filename(&source_url, Some("custom.m3u8"), "video", Some("mp4"), true),
            "custom.mp4"
        );
    }
}
