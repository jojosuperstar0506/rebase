"""
Schema validation and data normalization for Chrome-extracted competitor data.

Handles JSON output from Claude for Chrome, including:
- Stripping markdown code fences
- Converting Chinese number formats (万, 亿)
- Normalizing comma-separated numbers
- Validating required fields and types
- Returning clear, actionable error messages

All functions are pure — no database or network access.
"""

import json
import re
from typing import Any, Dict, List, Optional, Tuple, Union


# ─── Chinese Number Conversion ────────────────────────────────────────────────

# Pattern to match Chinese-style numbers: "15.2万", "2.3亿", "52.3万粉丝"
_CN_NUMBER_RE = re.compile(
    r"^[^\d]*?(\d+(?:\.\d+)?)\s*([万亿])"  # capture number + unit
    r"[^\d]*$"                               # ignore trailing text (粉丝, etc.)
)

_CN_MULTIPLIERS = {
    "万": 10_000,
    "亿": 100_000_000,
}


def parse_chinese_number(value: Any) -> Union[int, float, Any]:
    """
    Convert Chinese number formats to plain integers/floats.

    Handles:
        - "15.2万"      → 152000
        - "2.3亿"       → 230000000
        - "52.3万粉丝"   → 523000
        - "1,234,567"   → 1234567
        - "1234"        → 1234
        - 1234          → 1234 (passthrough)

    Args:
        value: The value to convert. Can be str, int, float, or anything else.

    Returns:
        int or float if conversion succeeds, original value otherwise.
    """
    if isinstance(value, (int, float)):
        return value

    if not isinstance(value, str):
        return value

    s = value.strip()
    if not s:
        return value

    # Try Chinese unit match first
    m = _CN_NUMBER_RE.match(s)
    if m:
        num = float(m.group(1))
        multiplier = _CN_MULTIPLIERS[m.group(2)]
        result = round(num * multiplier)
        return int(result)

    # Strip commas: "1,234,567" → "1234567"
    cleaned = s.replace(",", "").replace("，", "")

    # Try plain number parse
    try:
        if "." in cleaned:
            return float(cleaned)
        return int(cleaned)
    except ValueError:
        return value


def normalize_numbers_recursive(data: Any) -> Any:
    """
    Recursively walk a data structure and convert Chinese numbers
    in known numeric fields.

    Args:
        data: Any JSON-compatible data structure.

    Returns:
        The same structure with Chinese numbers converted.
    """
    if isinstance(data, dict):
        return {k: normalize_numbers_recursive(v) for k, v in data.items()}
    elif isinstance(data, list):
        return [normalize_numbers_recursive(item) for item in data]
    elif isinstance(data, str):
        # Only convert if it looks numeric
        converted = parse_chinese_number(data)
        if converted is not data:  # identity check — was actually converted
            return converted
        return data
    else:
        return data


# ─── JSON Cleanup ─────────────────────────────────────────────────────────────

def clean_json_text(text: str) -> str:
    """
    Clean up common issues in Claude for Chrome JSON output.

    Handles:
        - Markdown code fences: ```json ... ``` → just the JSON
        - Leading/trailing whitespace
        - Trailing commas before } or ] (common LLM output issue)

    Args:
        text: Raw text from Claude for Chrome.

    Returns:
        Cleaned JSON string ready for parsing.
    """
    s = text.strip()

    # Strip markdown code fences
    # Match ```json\n...\n``` or ```\n...\n```
    fence_re = re.compile(r"^```(?:json)?\s*\n(.*?)\n\s*```\s*$", re.DOTALL)
    m = fence_re.match(s)
    if m:
        s = m.group(1).strip()

    # Also handle cases where there's text before/after the fence
    if "```" in s:
        # Find the JSON content between fences
        parts = re.split(r"```(?:json)?\s*\n?", s)
        for part in parts:
            part = part.strip().rstrip("`").strip()
            if part.startswith("[") or part.startswith("{"):
                s = part
                break

    # Remove trailing commas before } or ]
    s = re.sub(r",\s*([}\]])", r"\1", s)

    return s


def parse_extract_json(text: str) -> List[dict]:
    """
    Parse JSON text from Chrome extraction, handling common issues.

    Args:
        text: Raw text output from Claude for Chrome.

    Returns:
        Parsed list of brand extract dicts.

    Raises:
        ValueError: If the text cannot be parsed as valid JSON.
    """
    cleaned = clean_json_text(text)
    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError as e:
        raise ValueError(f"Invalid JSON after cleanup: {e}")

    if isinstance(data, dict):
        # Single brand wrapped in a dict — wrap in list
        data = [data]

    if not isinstance(data, list):
        raise ValueError(f"Expected JSON array, got {type(data).__name__}")

    return data


# ─── Schema Validation ────────────────────────────────────────────────────────

# Required top-level fields for both platforms
_REQUIRED_COMMON = ["brand_name", "platform", "extract_date"]

# Required fields per platform
_REQUIRED_XHS = {
    "d2_brand_voice": ["followers"],
    "d1_search_index": ["search_suggestions"],
}

_REQUIRED_DOUYIN = {
    "d2_brand_voice": ["followers"],
    "d1_search_index": ["search_suggestions"],
}


def validate_extract(data: List[dict]) -> List[str]:
    """
    Validate a list of Chrome-extracted brand dicts.

    Checks:
        - Required top-level fields exist
        - Platform is 'xhs' or 'douyin'
        - Platform-specific required sections and fields exist
        - extract_date is a valid date format

    Args:
        data: List of brand extract dicts (already parsed from JSON).

    Returns:
        List of error messages. Empty list means validation passed.
    """
    errors: List[str] = []

    if not isinstance(data, list):
        return [f"Expected list, got {type(data).__name__}"]

    for i, item in enumerate(data):
        if not isinstance(item, dict):
            errors.append(f"Item {i}: expected dict, got {type(item).__name__}")
            continue

        brand_name = item.get("brand_name", f"<item {i}>")

        # Check required common fields
        for field in _REQUIRED_COMMON:
            if field not in item or not item[field]:
                errors.append(f"Brand '{brand_name}': missing required field '{field}'")

        # Validate platform
        platform = item.get("platform", "")
        if platform not in ("xhs", "douyin"):
            errors.append(
                f"Brand '{brand_name}': platform must be 'xhs' or 'douyin', got '{platform}'"
            )
            continue

        # Validate date format
        extract_date = item.get("extract_date", "")
        if extract_date and not re.match(r"^\d{4}-\d{2}-\d{2}$", extract_date):
            errors.append(
                f"Brand '{brand_name}': extract_date must be YYYY-MM-DD, got '{extract_date}'"
            )

        # Check platform-specific required sections
        required_sections = _REQUIRED_XHS if platform == "xhs" else _REQUIRED_DOUYIN
        for section, fields in required_sections.items():
            section_data = item.get(section)
            if section_data is None:
                errors.append(
                    f"Brand '{brand_name}' {platform} extract missing '{section}'"
                )
                continue
            if not isinstance(section_data, dict):
                errors.append(
                    f"Brand '{brand_name}' {platform} '{section}' must be a dict"
                )
                continue
            for field in fields:
                if field not in section_data:
                    errors.append(
                        f"Brand '{brand_name}' {platform} extract missing "
                        f"'{section}.{field}'"
                    )

    return errors


def validate_and_normalize(text: str) -> Tuple[List[dict], List[str]]:
    """
    Parse, validate, and normalize Chrome extraction output in one step.

    This is the main entry point for processing Chrome output.

    Args:
        text: Raw text from Claude for Chrome.

    Returns:
        Tuple of (normalized_data, errors).
        If errors is non-empty, data should NOT be imported.
    """
    try:
        data = parse_extract_json(text)
    except ValueError as e:
        return [], [str(e)]

    errors = validate_extract(data)
    if errors:
        return data, errors

    # Normalize Chinese numbers
    normalized = normalize_numbers_recursive(data)

    return normalized, []
