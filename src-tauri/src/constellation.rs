use crate::error::{AppError, Result};
use reqwest::{Client, Url};
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use tauri_plugin_log::log;

const DEFAULT_TIMEOUT_SECS: u64 = 10;
const USER_AGENT: &str = "lazurite-desktop";
const GET_BACKLINKS_COUNT_NSID: &str = "blue.microcosm.links.getBacklinksCount";
const GET_BACKLINKS_NSID: &str = "blue.microcosm.links.getBacklinks";
const GET_MANY_TO_MANY_COUNTS_NSID: &str = "blue.microcosm.links.getManyToManyCounts";
const GET_MANY_TO_MANY_NSID: &str = "blue.microcosm.links.getManyToMany";

#[derive(Debug, Clone)]
pub struct ConstellationClient {
    base_url: Url,
    http: Client,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
pub struct BacklinksCountResponse {
    pub total: u64,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ConstellationLinkRecord {
    pub did: String,
    pub collection: String,
    pub rkey: String,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
pub struct BacklinksResponse {
    pub total: u64,
    #[serde(default)]
    pub records: Vec<ConstellationLinkRecord>,
    pub cursor: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
pub struct ManyToManyCountsResponse {
    #[serde(default)]
    pub counts_by_other_subject: Vec<ManyToManyCount>,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
pub struct ManyToManyCount {
    #[serde(alias = "otherSubject")]
    pub subject: String,
    pub total: u64,
    pub distinct: u64,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
pub struct ManyToManyResponse {
    #[serde(default)]
    pub items: Vec<ManyToManyItem>,
    pub cursor: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ManyToManyItem {
    pub link_record: ConstellationLinkRecord,
    pub other_subject: String,
}

impl ConstellationClient {
    pub fn new(base_url: &str) -> Result<Self> {
        let parsed = Url::parse(base_url)
            .map_err(|error| AppError::validation(format!("invalid Constellation URL: {error}")))?;

        match parsed.scheme() {
            "http" | "https" => {}
            _ => return Err(AppError::validation("Constellation URL must use http or https")),
        }

        if parsed.host_str().is_none() {
            return Err(AppError::validation("Constellation URL must include a host"));
        }

        let http = Client::builder()
            .timeout(std::time::Duration::from_secs(DEFAULT_TIMEOUT_SECS))
            .user_agent(USER_AGENT)
            .build()?;

        Ok(Self { base_url: parsed, http })
    }

    pub async fn get_backlinks_count(&self, subject: String, source: String) -> Result<BacklinksCountResponse> {
        self.get_json(GET_BACKLINKS_COUNT_NSID, &[("subject", subject), ("source", source)])
            .await
    }

    pub async fn get_backlinks(
        &self, subject: String, source: String, limit: Option<u32>, cursor: Option<String>,
    ) -> Result<BacklinksResponse> {
        let mut query = vec![("subject", subject), ("source", source)];
        if let Some(limit) = limit {
            query.push(("limit", limit.to_string()));
        }
        if let Some(cursor) = cursor {
            query.push(("cursor", cursor));
        }

        self.get_json(GET_BACKLINKS_NSID, &query).await
    }

    pub async fn get_many_to_many_counts(
        &self, subject: String, source: String, path_to_other: String,
    ) -> Result<ManyToManyCountsResponse> {
        self.get_json(
            GET_MANY_TO_MANY_COUNTS_NSID,
            &[("subject", subject), ("source", source), ("pathToOther", path_to_other)],
        )
        .await
    }

    pub async fn get_many_to_many(
        &self, subject: String, source: String, path_to_other: String, limit: Option<u32>, cursor: Option<String>,
    ) -> Result<ManyToManyResponse> {
        let mut query = vec![("subject", subject), ("source", source), ("pathToOther", path_to_other)];
        if let Some(limit) = limit {
            query.push(("limit", limit.to_string()));
        }
        if let Some(cursor) = cursor {
            query.push(("cursor", cursor));
        }

        self.get_json(GET_MANY_TO_MANY_NSID, &query).await
    }

    async fn get_json<T>(&self, endpoint: &str, query: &[(&str, String)]) -> Result<T>
    where
        T: DeserializeOwned,
    {
        let response = self.send(endpoint, query).await?;
        Self::decode_json(response, endpoint).await
    }

    async fn send(&self, endpoint: &str, query: &[(&str, String)]) -> Result<reqwest::Response> {
        let mut url = self.base_url.clone();
        url.set_path(&format!("/xrpc/{endpoint}"));

        self.http.get(url).query(query).send().await.map_err(AppError::from)
    }

    async fn decode_json<T>(response: reqwest::Response, endpoint: &str) -> Result<T>
    where
        T: DeserializeOwned,
    {
        let status = response.status();
        if !status.is_success() {
            let body = response.text().await.unwrap_or_default();
            log::warn!("Constellation {endpoint} failed with {status}: {body}");
            return Err(AppError::validation(
                "The diagnostics service returned an unexpected response.",
            ));
        }

        response.json::<T>().await.map_err(|error| {
            log::error!("failed to decode Constellation {endpoint} response: {error}");
            AppError::validation("The diagnostics service returned data Lazurite could not read.")
        })
    }
}

#[cfg(test)]
mod tests {
    use super::ManyToManyCountsResponse;

    #[test]
    fn many_to_many_counts_accepts_subject_field() {
        let parsed: ManyToManyCountsResponse = serde_json::from_str(
            r#"{"counts_by_other_subject":[{"subject":"at://did/list/1","total":1,"distinct":1}]}"#,
        )
        .expect("many-to-many counts should deserialize");

        assert_eq!(parsed.counts_by_other_subject[0].subject, "at://did/list/1");
    }
}
