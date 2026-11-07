//! Newline-delimited JSON-RPC 2.0 adapter. Domain rules live in campaign-core.
use campaign_core::campaign::Session;
use serde_json::{json, Value};

pub const MAX_MESSAGE_BYTES: usize = 16 * 1024 * 1024;

pub async fn handle(session: &mut Session, line: &str) -> Option<Value> {
    let request: Value = match serde_json::from_str(line) {
        Ok(request) => request,
        Err(error) => {
            return Some(error_response(
                Value::Null,
                -32700,
                "Parse error",
                json!({"detail": error.to_string()}),
            ))
        }
    };
    let id = request.get("id").cloned().unwrap_or(Value::Null);
    if !request.is_object()
        || request["jsonrpc"] != "2.0"
        || !request["method"].is_string()
        || !(id.is_null() || id.is_string() || id.is_number())
        || request
            .get("params")
            .is_some_and(|p| !p.is_object() && !p.is_array())
    {
        return Some(error_response(
            Value::Null,
            -32600,
            "Invalid Request",
            Value::Null,
        ));
    }
    // Notifications execute normally but MUST NOT receive a response.
    let notification = request.get("id").is_none();
    let result = session
        .execute(
            request["method"].as_str().unwrap(),
            request.get("params").cloned().unwrap_or_else(|| json!({})),
        )
        .await;
    if notification {
        return None;
    }
    Some(match result {
        Ok(result) => json!({"jsonrpc": "2.0", "id": id, "result": result}),
        Err(error) => {
            let code = match error.code {
                "method_not_found" => -32601,
                "invalid_params" => -32602,
                "internal" => -32603,
                _ => -32000,
            };
            error_response(
                id,
                code,
                &error.message,
                serde_json::to_value(&error).unwrap(),
            )
        }
    })
}

pub fn error_response(id: Value, code: i32, message: &str, data: Value) -> Value {
    json!({"jsonrpc": "2.0", "id": id, "error": {"code": code, "message": message, "data": data}})
}
