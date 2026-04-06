use jacquard::types::did::Did;
use jacquard::types::handle::Handle;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ActorAvailability {
    Available,
    Unavailable,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ActorAvailabilityReason {
    NotFound,
    Suspended,
    Deactivated,
    Unavailable,
}

pub fn requested_actor_hints(actor: &str) -> (Option<String>, Option<String>) {
    let trimmed = actor.trim();
    if trimmed.is_empty() {
        return (None, None);
    }

    if let Ok(did) = Did::new(trimmed) {
        return (Some(did.to_string()), None);
    }

    let normalized_handle = trimmed.trim_start_matches('@');
    if let Ok(handle) = Handle::new(normalized_handle) {
        return (None, Some(handle.to_string()));
    }

    (None, None)
}

pub fn classify_actor_unavailability(error: &impl std::fmt::Display) -> Option<ActorAvailabilityReason> {
    let message = error.to_string().to_ascii_lowercase();

    if mentions_not_found(&message) {
        return Some(ActorAvailabilityReason::NotFound);
    }

    if message.contains("suspended") || message.contains("taken down") || message.contains("takendown") {
        return Some(ActorAvailabilityReason::Suspended);
    }

    if message.contains("deactivated") || message.contains("deleted account") {
        return Some(ActorAvailabilityReason::Deactivated);
    }

    if message.contains("profile unavailable")
        || message.contains("account unavailable")
        || message.contains("repo unavailable")
    {
        return Some(ActorAvailabilityReason::Unavailable);
    }

    None
}

pub fn actor_unavailable_message(reason: ActorAvailabilityReason) -> &'static str {
    match reason {
        ActorAvailabilityReason::NotFound => "This profile could not be found.",
        ActorAvailabilityReason::Suspended => "This profile is unavailable because the account is suspended.",
        ActorAvailabilityReason::Deactivated => "This profile is unavailable because the account is deactivated.",
        ActorAvailabilityReason::Unavailable => "This profile is unavailable right now.",
    }
}

fn mentions_not_found(message: &str) -> bool {
    message.contains("actornotfound")
        || message.contains("profile not found")
        || message.contains("profile notfound")
        || message.contains("repo not found")
        || message.contains("repo notfound")
        || message.contains("account not found")
        || message.contains("could not resolve")
        || message.contains("not found")
        || message.contains("notfound")
}

#[cfg(test)]
mod tests {
    use super::{
        actor_unavailable_message, classify_actor_unavailability, requested_actor_hints, ActorAvailabilityReason,
    };

    #[test]
    fn classifies_not_found_actor_errors() {
        assert_eq!(
            classify_actor_unavailability(&"ActorNotFound: profile not found"),
            Some(ActorAvailabilityReason::NotFound)
        );
        assert_eq!(
            classify_actor_unavailability(&"repo not found"),
            Some(ActorAvailabilityReason::NotFound)
        );
    }

    #[test]
    fn classifies_suspended_and_deactivated_actor_errors() {
        assert_eq!(
            classify_actor_unavailability(&"account is suspended"),
            Some(ActorAvailabilityReason::Suspended)
        );
        assert_eq!(
            classify_actor_unavailability(&"account is deactivated"),
            Some(ActorAvailabilityReason::Deactivated)
        );
    }

    #[test]
    fn builds_requested_actor_hints() {
        assert_eq!(
            requested_actor_hints("did:plc:xg2vq45muivyy3xwatcehspu"),
            (Some("did:plc:xg2vq45muivyy3xwatcehspu".to_string()), None)
        );
        assert_eq!(
            requested_actor_hints("@desertthunder.dev"),
            (None, Some("desertthunder.dev".to_string()))
        );
    }

    #[test]
    fn returns_human_messages() {
        assert_eq!(
            actor_unavailable_message(ActorAvailabilityReason::Unavailable),
            "This profile is unavailable right now."
        );
    }
}
