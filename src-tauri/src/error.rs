#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("database error: {0}")]
    Database(#[from] rusqlite::Error),

    #[error("auth flow error: {0}")]
    OAuth(#[from] jacquard::oauth::error::OAuthError),

    #[error("session error: {0}")]
    OAuthSession(#[from] jacquard::oauth::session::Error),

    #[error("session store error: {0}")]
    SessionStore(#[from] jacquard::common::session::SessionStoreError),

    #[error("io error: {0}")]
    Io(#[from] std::io::Error),

    #[error("serialization error: {0}")]
    SerdeJson(#[from] serde_json::Error),

    #[error("invalid atproto identifier: {0}")]
    AtIdentifier(#[from] jacquard::types::string::AtStrError),

    #[error("uri parse error: {0}")]
    UriParse(#[from] jacquard::deps::fluent_uri::ParseError),

    #[error("tauri error: {0}")]
    Tauri(#[from] tauri::Error),

    #[error("deep-link error: {0}")]
    DeepLink(#[from] tauri_plugin_deep_link::Error),

    #[error("path resolution failed: {0}")]
    PathResolve(String),

    #[error("state lock poisoned: {0}")]
    StatePoisoned(&'static str),

    #[error("{0}")]
    Validation(String),
}

impl serde::Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::ser::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

impl AppError {
    pub fn validation(msg: impl Into<String>) -> Self {
        AppError::Validation(msg.into())
    }
}

pub type Result<T> = std::result::Result<T, AppError>;
