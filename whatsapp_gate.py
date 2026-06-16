"""Legacy access gate — delegates to the accounting state machine."""

from dataclasses import dataclass
from typing import Any, Optional

from whatsapp_flow import FlowResult, handle_whatsapp_flow


@dataclass
class AccessDecision:
    proceed: bool
    action: Optional[str] = None
    status: Optional[dict[str, Any]] = None


async def handle_whatsapp_access(
    sender: str,
    employee: dict,
    *,
    message_type: str,
    message: dict,
    text_body: Optional[str],
    is_media: bool,
    media_id: Optional[str] = None,
    mime_type: Optional[str] = None,
    whatsapp_message_id: Optional[str] = None,
) -> AccessDecision:
    result = await handle_whatsapp_flow(
        sender,
        employee,
        message_type=message_type,
        message=message,
        text_body=text_body,
        is_media=is_media,
        media_id=media_id,
        mime_type=mime_type,
        whatsapp_message_id=whatsapp_message_id,
    )
    if not result.handled:
        return AccessDecision(proceed=True, action=None)
    return AccessDecision(proceed=False, status=result.status)
