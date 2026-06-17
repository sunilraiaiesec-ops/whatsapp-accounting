from typing import Optional

from pydantic import BaseModel


class MessageInput(BaseModel):
    sender: str
    message: str


class EmployeeInput(BaseModel):
    phone: str
    name: str
    role: Optional[str] = None


class ProductUpdate(BaseModel):
    default_unit_price_fcfa: Optional[int] = None


class EmployeeUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None


class InvoiceLineInput(BaseModel):
    description: str
    quantity: float = 1.0
    unit: Optional[str] = None
    unit_price_fcfa: int
    product_id: Optional[int] = None


class InvoiceCreate(BaseModel):
    party_id: int
    invoice_date: Optional[str] = None
    due_date: Optional[str] = None
    notes: Optional[str] = None
    linked_receipt_id: Optional[str] = None
    lines: list[InvoiceLineInput]


class OpeningBalanceInput(BaseModel):
    product_id: int
    quantity: float
    unit: Optional[str] = None
    note: Optional[str] = None


class StockReceiptInput(BaseModel):
    product_id: int
    quantity: float
    unit: Optional[str] = None
    note: Optional[str] = None
