from pydantic import BaseModel


class MessageInput(BaseModel):
    sender: str
    message: str


class EmployeeInput(BaseModel):
    phone: str
    name: str
    role: str | None = None
