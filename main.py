from fastapi import FastAPI, Request

app = FastAPI()

@app.get("/")
def home():
    return {"status": "working", "project": "whatsapp-accounting"}

@app.post("/webhook/whatsapp")
async def whatsapp_webhook(request: Request):
    data = await request.json()
    print(data)
    return {"status": "received"}
