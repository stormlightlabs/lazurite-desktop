use tauri_plugin_log::log;

pub type Result<T> = std::result::Result<T, AppError>;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TypeaheadFetchErrorKind {
    Decode,
    Status(reqwest::StatusCode),
    Transport,
}

#[derive(Debug, thiserror::Error)]
#[error("{message}")]
pub struct TypeaheadFetchError {
    pub kind: TypeaheadFetchErrorKind,
    pub message: String,
}

impl TypeaheadFetchError {
    pub fn decode(error: &reqwest::Error) -> Self {
        Self {
            kind: TypeaheadFetchErrorKind::Decode,
            message: format!("failed to decode typeahead response: {error}"),
        }
    }

    pub fn status(status: reqwest::StatusCode) -> Self {
        Self {
            kind: TypeaheadFetchErrorKind::Status(status),
            message: format!("typeahead endpoint returned {}", status.as_u16()),
        }
    }

    pub fn transport(error: &reqwest::Error) -> Self {
        Self {
            kind: TypeaheadFetchErrorKind::Transport,
            message: format!("failed to reach typeahead endpoint: {error}"),
        }
    }
}

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

    #[error("http error: {0}")]
    Http(#[from] reqwest::Error),

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
        let msg = msg.into();
        log::error!("validation error: {}", &msg);
        AppError::Validation(msg)
    }

    pub fn state_poisoned(msg: impl Into<String>) -> Self {
        let msg = msg.into();
        log::error!("state lock poisoned: {}", msg);
        AppError::StatePoisoned(Box::leak(msg.into_boxed_str()))
    }

    pub fn diagnostics(message: &'static str, error: impl std::fmt::Display) -> Self {
        log::error!("{message} {error}");
        AppError::validation(message)
    }
}
