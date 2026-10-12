"""Nigerian phone numbers, stored as +234 followed by 10 digits."""
import re

_DIGITS = re.compile(r"\D")


def normalize_ng_phone(raw: str) -> str | None:
    """'0803 123 4567', '8031234567', '2348031234567' or '+234 803-123-4567' -> '+2348031234567'.
    Returns None if it isn't a Nigerian mobile number."""
    digits = _DIGITS.sub("", raw)
    if digits.startswith("234"):
        digits = digits[3:]
    elif digits.startswith("0"):
        digits = digits[1:]
    if len(digits) == 10 and digits[0] in "789":
        return f"+234{digits}"
    return None
