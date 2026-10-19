use serde_json::Value;

/// JavaScript can stringify lone UTF-16 surrogates in clipped previews, while
/// Rust strings require Unicode scalar values. Repair only those escapes at
/// the read boundary; never rewrite stored sessions or hide other JSON errors.
pub(crate) fn parse_dsh_response(bytes: &[u8]) -> serde_json::Result<Value> {
    match serde_json::from_slice(bytes) {
        Ok(value) => Ok(value),
        Err(error) => match repair_lone_surrogates(bytes) {
            Some(repaired) => serde_json::from_slice(&repaired),
            None => Err(error),
        },
    }
}

fn unicode_escape(bytes: &[u8], offset: usize) -> Option<u16> {
    let escape = bytes.get(offset..)?.get(..6)?;
    if &escape[..2] != b"\\u" {
        return None;
    }
    let mut value = 0;
    for byte in &escape[2..] {
        let digit = match byte {
            b'0'..=b'9' => byte - b'0',
            b'a'..=b'f' => byte - b'a' + 10,
            b'A'..=b'F' => byte - b'A' + 10,
            _ => return None,
        };
        value = (value << 4) | u16::from(digit);
    }
    Some(value)
}

fn repair_lone_surrogates(bytes: &[u8]) -> Option<Vec<u8>> {
    let mut repaired: Option<Vec<u8>> = None;
    let mut in_string = false;
    let mut offset = 0;
    while offset < bytes.len() {
        match bytes[offset] {
            b'"' => {
                in_string = !in_string;
                offset += 1;
            }
            b'\\' if in_string => {
                if let Some(unit) = unicode_escape(bytes, offset) {
                    if (0xD800..=0xDBFF).contains(&unit)
                        && matches!(unicode_escape(bytes, offset + 6), Some(0xDC00..=0xDFFF))
                    {
                        offset += 12;
                        continue;
                    }
                    if (0xD800..=0xDFFF).contains(&unit) {
                        repaired.get_or_insert_with(|| bytes.to_vec())[offset..offset + 6]
                            .copy_from_slice(br"\ufffd");
                    }
                    offset += 6;
                } else {
                    // Skip the entire escape so a literal \\uD83D is untouched.
                    offset += 2;
                }
            }
            _ => offset += 1,
        }
    }
    repaired
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn clipped_preview_does_not_block_usage_response() {
        let bytes = br#"{"result":{"ok":true,"value":{"items":[{"projections":{"values":{"turnOutline":[{"response":"clipped \ud83d..."}],"harnessDesktopInsights":{"totals":{"inputTokens":123,"outputTokens":45,"calls":6}}}}}]}}}"#;
        assert!(serde_json::from_slice::<Value>(bytes).is_err());
        let value = parse_dsh_response(bytes).unwrap();
        let projections = &value["result"]["value"]["items"][0]["projections"]["values"];
        assert_eq!(projections["turnOutline"][0]["response"], "clipped �...");
        assert_eq!(
            projections["harnessDesktopInsights"]["totals"],
            json!({ "inputTokens": 123, "outputTokens": 45, "calls": 6 })
        );
    }

    #[test]
    fn preserves_valid_pairs_unicode_and_literal_backslash_escapes() {
        let bytes = r#"{"paired":"\ud83d\uDE80","unicode":"中文 🚀","literal":"\\ud83d","clipped":"\ud83d"}"#.as_bytes();
        let value = parse_dsh_response(bytes).unwrap();
        assert_eq!(value["paired"], "🚀");
        assert_eq!(value["unicode"], "中文 🚀");
        assert_eq!(value["literal"], r"\ud83d");
        assert_eq!(value["clipped"], "�");
    }

    #[test]
    fn repairs_high_and_low_surrogates_without_consuming_valid_neighbors() {
        let bytes = br#"{"text":"\uD800\uD83D\uDE80\udfff\uD800x\ud800\n\udc00"}"#;
        assert_eq!(parse_dsh_response(bytes).unwrap()["text"], "�🚀��x�\n�");
    }

    #[test]
    fn distinguishes_literal_backslashes_from_active_unicode_escapes() {
        let bytes = br#"{"literal":"\\ud800","escaped":"\\\ud800","quote":"\"\ud800"}"#;
        let value = parse_dsh_response(bytes).unwrap();
        assert_eq!(value["literal"], r"\ud800");
        assert_eq!(value["escaped"], "\\�");
        assert_eq!(value["quote"], "\"�");
    }

    #[test]
    fn still_rejects_malformed_json_incomplete_escapes_and_invalid_utf8() {
        for bytes in [
            br#"{"text":"\ud800","invalid":"\q"}"#.as_slice(),
            br#"{"text":"\ud800","invalid":"\u12"}"#,
            br#"{"text":"\ud800\uZZZZ"}"#,
            br#"{"text":"\ud800""#,
            br#"{"text":\ud800}"#,
            b"{\"text\":\"\xff\"}",
        ] {
            assert!(parse_dsh_response(bytes).is_err(), "{bytes:?}");
        }
    }
}
