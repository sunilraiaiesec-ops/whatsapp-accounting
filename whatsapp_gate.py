from dataclasses import dataclass
import logging
from typing import Any, Optional

from whatsapp_access import (
    ACTION_CASH,
    ACTION_CANCEL,
    ACTION_DELIVERY,
    STATE_AWAITING_ACTION,
    STATE_AWAITING_PIN,
    STATE_CASH,
    STATE_DELIVERY,
    ensure_session_row,
    get_session,
    is_greeting,
    is_menu_command,
    looks_like_pin_attempt,
    parse_interactive_action,
    parse_text_action,
    set_session_action,
    set_session_after_pin,
    staff_pin_enabled,
    verify_staff_pin,
)
from whatsapp_client import (
    format_action_selected_reply,
    format_ask_pin_reply,
    format_need_delivery_photo_reply,
    format_need_pin_first_reply,
    format_pin_expired_reply,
    format_wrong_pin_reply,
    send_whatsapp_action_menu,
    send_whatsapp_text,
)


logger = logging.getLogger("uvicorn.error")


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
) -> AccessDecision:
    if not staff_pin_enabled():
        return AccessDecision(proceed=True, action=None)

    try:
        return await _handle_whatsapp_access_inner(
            sender,
            employee,
            message_type=message_type,
            message=message,
            text_body=text_body,
            is_media=is_media,
        )
    except Exception:
        logger.exception("WhatsApp access gate failed for sender %s", sender)
        await send_whatsapp_text(sender, format_ask_pin_reply(employee["name"]))
        return AccessDecision(
            proceed=False,
            status={"status": "access_gate_error", "sender": sender},
        )


async def _handle_whatsapp_access_inner(
    sender: str,
    employee: dict,
    *,
    message_type: str,
    message: dict,
    text_body: Optional[str],
    is_media: bool,
) -> AccessDecision:
    session = ensure_session_row(sender)
    state = session.get("state") or STATE_AWAITING_PIN

    if message_type == "interactive":
        action = parse_interactive_action(message)
        if action == ACTION_CANCEL:
            set_session_after_pin(sender)
            await send_whatsapp_action_menu(sender, employee["name"])
            return AccessDecision(
                proceed=False,
                status={"status": "awaiting_action", "sender": sender},
            )
        if action in (ACTION_CASH, ACTION_DELIVERY):
            if state == STATE_AWAITING_PIN:
                await send_whatsapp_text(sender, format_need_pin_first_reply())
                return AccessDecision(
                    proceed=False,
                    status={"status": "awaiting_pin", "sender": sender},
                )
            set_session_action(sender, action)
            await send_whatsapp_text(sender, format_action_selected_reply(action))
            return AccessDecision(
                proceed=False,
                status={"status": "action_selected", "action": action, "sender": sender},
            )

    if is_media:
        if state == STATE_AWAITING_PIN:
            await send_whatsapp_text(sender, format_ask_pin_reply(employee["name"]))
            return AccessDecision(
                proceed=False,
                status={"status": "awaiting_pin", "sender": sender},
            )
        if state == STATE_AWAITING_ACTION:
            await send_whatsapp_action_menu(sender, employee["name"])
            return AccessDecision(
                proceed=False,
                status={"status": "awaiting_action", "sender": sender},
            )
        if state == STATE_CASH:
            await send_whatsapp_text(
                sender,
                "You chose *Cash update*. Send a text message, not a photo.\nReply MENU to choose again.",
            )
            return AccessDecision(
                proceed=False,
                status={"status": "wrong_mode_for_media", "sender": sender},
            )
        if state == STATE_DELIVERY:
            return AccessDecision(proceed=True, action=ACTION_DELIVERY)

    if message_type == "text" and text_body is not None:
        text = text_body.strip()

        if is_menu_command(text):
            if state == STATE_AWAITING_PIN:
                await send_whatsapp_text(sender, format_ask_pin_reply(employee["name"]))
            else:
                set_session_after_pin(sender)
                await send_whatsapp_action_menu(sender, employee["name"])
            return AccessDecision(
                proceed=False,
                status={"status": "awaiting_action", "sender": sender},
            )

        if state == STATE_AWAITING_PIN:
            if looks_like_pin_attempt(text):
                if verify_staff_pin(text):
                    set_session_after_pin(sender)
                    await send_whatsapp_action_menu(sender, employee["name"])
                    return AccessDecision(
                        proceed=False,
                        status={"status": "pin_verified", "sender": sender},
                    )
                await send_whatsapp_text(sender, format_wrong_pin_reply())
                return AccessDecision(
                    proceed=False,
                    status={"status": "wrong_pin", "sender": sender},
                )
            await send_whatsapp_text(sender, format_ask_pin_reply(employee["name"]))
            return AccessDecision(
                proceed=False,
                status={"status": "awaiting_pin", "sender": sender},
            )

        if state == STATE_AWAITING_ACTION:
            action = parse_text_action(text)
            if action == ACTION_CANCEL:
                await send_whatsapp_action_menu(sender, employee["name"])
                return AccessDecision(
                    proceed=False,
                    status={"status": "awaiting_action", "sender": sender},
                )
            if action in (ACTION_CASH, ACTION_DELIVERY):
                set_session_action(sender, action)
                await send_whatsapp_text(sender, format_action_selected_reply(action))
                return AccessDecision(
                    proceed=False,
                    status={"status": "action_selected", "action": action, "sender": sender},
                )
            await send_whatsapp_action_menu(sender, employee["name"])
            return AccessDecision(
                proceed=False,
                status={"status": "awaiting_action", "sender": sender},
            )

        if state == STATE_CASH:
            return AccessDecision(proceed=True, action=ACTION_CASH)

        if state == STATE_DELIVERY:
            await send_whatsapp_text(sender, format_need_delivery_photo_reply())
            return AccessDecision(
                proceed=False,
                status={"status": "awaiting_delivery_photo", "sender": sender},
            )

    if state == STATE_AWAITING_PIN:
        await send_whatsapp_text(sender, format_ask_pin_reply(employee["name"]))
        return AccessDecision(
            proceed=False,
            status={"status": "awaiting_pin", "sender": sender},
        )

    if state == STATE_AWAITING_ACTION:
        await send_whatsapp_action_menu(sender, employee["name"])
        return AccessDecision(
            proceed=False,
            status={"status": "awaiting_action", "sender": sender},
        )

    return AccessDecision(
        proceed=False,
        status={"status": "access_blocked", "sender": sender},
    )


async def send_pin_expired_notice(sender: str, employee_name: str) -> None:
    if staff_pin_enabled() and get_session(sender):
        await send_whatsapp_text(sender, format_pin_expired_reply(employee_name))
