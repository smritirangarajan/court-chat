from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from astrapy.db import AstraDB
import os
import openai
from dotenv import load_dotenv
import logging

# Load environment variables
load_dotenv()

# Set up logging
logging.basicConfig(level=logging.INFO)

app = FastAPI()
openai.api_key = os.getenv("OPENAI_API_KEY")

db = AstraDB(
    token=os.getenv("ASTRA_DB_APPLICATION_TOKEN"),
    api_endpoint=os.getenv("ASTRA_DB_API_ENDPOINT"),
)

opinions = db.collection(os.getenv("ASTRA_DB_COLLECTION_OPINIONS", "opinions"))
cases = db.collection(os.getenv("ASTRA_DB_COLLECTION_CASES", "cases"))

class QueryRequest(BaseModel):
    query: str

@app.post("/chat")
async def chat_endpoint(input: QueryRequest):
    try:
        logging.info(f"💬 Incoming query: {input.query}")

        # Step 1: Embed the query
        embedding = openai.Embedding.create(
            model="text-embedding-3-small",
            input=input.query
        ).data[0].embedding

        # Step 2: Search opinions
        opinion_results = opinions.vector_find(embedding, limit=5)
        logging.info(f"🔍 Found {len(opinion_results)} opinion chunks.")

        formatted = []

        for op in opinion_results:
            case_id = op.get("case_id")
            logging.info(f"🆔 Extracted case_id: {case_id}")
            if not case_id:
                continue

            raw_case = cases.find_one({ "case_id": case_id })
            case_doc = raw_case.get("data", {}).get("document", {}) if raw_case else {}
            logging.info(f"📁 Fetched matching_case: {case_doc.get('case_name', 'Unknown')}")

            formatted.append({
                "type": "opinion",
                "author": op.get("author"),
                "section": op.get("section"),
                "opinion_text_preview": (op.get("text") or "")[:300] + "...",
                "case": {
                    "name": case_doc.get("case_name", "Unknown"),
                    "court": case_doc.get("court", "Unknown"),
                    "decision_date": case_doc.get("decision_date", "Unknown"),
                    "citations": len(case_doc.get("citations", [])),
                    "url": case_doc.get("download_url")
                }
            })

        # ✅ Return Python dict directly (not using JSONResponse)
        return {
            "role": "assistant",
            "content": {
                "results": formatted
            }
        }

    except Exception as e:
        logging.exception("❌ Failed to process chat request.")
        raise HTTPException(status_code=500, detail=str(e))
