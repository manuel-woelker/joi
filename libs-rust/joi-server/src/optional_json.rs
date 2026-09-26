use serde::{Deserialize, Deserializer};
use serde_json::Value;

/// Preserves a present JSON null as `Some(Null)`; serde defaults handle absence.
pub fn deserialize<'de, D: Deserializer<'de>>(deserializer: D) -> Result<Option<Value>, D::Error> {
    Value::deserialize(deserializer).map(Some)
}
