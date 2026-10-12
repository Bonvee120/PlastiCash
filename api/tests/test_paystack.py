"""Step 4.6: the Paystack client, against a mocked Paystack (respx). No real network calls."""
import httpx
import pytest
import respx

from app.services import paystack
from app.services.paystack import BASE_URL, PaystackError


@pytest.fixture(autouse=True)
def fresh_bank_cache(monkeypatch):
    monkeypatch.setattr(paystack, "_banks_cache", None)


@respx.mock
async def test_list_banks_is_cached() -> None:
    route = respx.get(f"{BASE_URL}/bank").respond(
        200, json={"status": True, "data": [{"name": "Access Bank", "code": "044", "active": True},
                                            {"name": "Old Bank", "code": "999", "active": False}]}
    )
    assert await paystack.list_banks() == [{"name": "Access Bank", "code": "044"}]
    await paystack.list_banks()
    assert route.call_count == 1
    assert route.calls[0].request.url.params["country"] == "nigeria"


@respx.mock
async def test_resolve_account_returns_the_name() -> None:
    route = respx.get(f"{BASE_URL}/bank/resolve").respond(
        200, json={"status": True, "data": {"account_name": "CHINAZA OKAFOR", "account_number": "0123456789"}}
    )
    assert await paystack.resolve_account("0123456789", "058") == "CHINAZA OKAFOR"
    assert route.calls[0].request.headers["Authorization"].startswith("Bearer ")


@respx.mock
async def test_create_recipient() -> None:
    route = respx.post(f"{BASE_URL}/transferrecipient").respond(
        200, json={"status": True, "data": {"recipient_code": "RCP_abc"}}
    )
    assert await paystack.create_recipient("CHINAZA OKAFOR", "0123456789", "058") == "RCP_abc"
    sent = route.calls[0].request.read()
    assert b'"type":"nuban"' in sent and b'"currency":"NGN"' in sent


@respx.mock
async def test_initiate_transfer_sends_kobo_and_reference() -> None:
    route = respx.post(f"{BASE_URL}/transfer").respond(
        200, json={"status": True, "data": {"transfer_code": "TRF_1", "status": "pending"}}
    )
    result = await paystack.initiate_transfer(500_000, "RCP_abc", "wd-ref-1", "PlastiCash payout")
    assert result == {"transfer_code": "TRF_1", "status": "pending"}
    sent = route.calls[0].request.read()
    assert b'"amount":500000' in sent and b'"reference":"wd-ref-1"' in sent and b'"source":"balance"' in sent


@respx.mock
async def test_refusal_is_not_sent() -> None:
    respx.post(f"{BASE_URL}/transfer").respond(400, json={"status": False, "message": "Insufficient balance"})
    with pytest.raises(PaystackError) as error:
        await paystack.initiate_transfer(500_000, "RCP_abc", "ref", "PlastiCash payout")
    assert error.value.not_sent is True
    assert error.value.message == "Insufficient balance"


@respx.mock
async def test_connection_failure_is_not_sent() -> None:
    respx.post(f"{BASE_URL}/transfer").mock(side_effect=httpx.ConnectError("no route"))
    with pytest.raises(PaystackError) as error:
        await paystack.initiate_transfer(500_000, "RCP_abc", "ref", "PlastiCash payout")
    assert error.value.not_sent is True


@respx.mock
@pytest.mark.parametrize("failure", [httpx.ReadTimeout("slow"), None])
async def test_timeout_or_server_error_is_unknown(failure) -> None:
    """The transfer may exist: the caller must not refund; the webhook decides."""
    route = respx.post(f"{BASE_URL}/transfer")
    route.mock(side_effect=failure) if failure else route.respond(502, text="Bad gateway")
    with pytest.raises(PaystackError) as error:
        await paystack.initiate_transfer(500_000, "RCP_abc", "ref", "PlastiCash payout")
    assert error.value.not_sent is False
