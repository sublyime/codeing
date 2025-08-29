from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from typing import List
import pdfplumber

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

PDF_PATH = r"C:\codeing\docs\ERG2024-Eng-Web-a.pdf"

def search_pdf(term: str) -> List[dict]:
    results = []
    with pdfplumber.open(PDF_PATH) as pdf:
        for i, page in enumerate(pdf.pages):
            text = page.extract_text()
            if text and term.lower() in text.lower():
                snippet = "\n".join([line for line in text.splitlines() if term.lower() in line.lower()])
                results.append({
                    "page": i + 1,
                    "snippet": snippet[:500]
                })
    return results

@app.get("/erg/search")
def erg_search(q: str = Query(..., min_length=2)):
    matches = search_pdf(q)
    return {"results": matches}