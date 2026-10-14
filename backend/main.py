from pathlib import Path
from typing import Optional, List, Dict, Any
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel

from backend.database import (
    init_db,
    search_patients,
    get_patient_with_history,
    create_patient,
    append_consultation,
    generate_next_pid,
)
from backend.ai_extractor import extract_clinical_report

app = FastAPI(
    title="Real-Time Clinical Scribe & Smart Prescription System",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"


@app.on_event("startup")
def on_startup():
    init_db()


class PatientCreateRequest(BaseModel):
    patient_id: Optional[str] = None
    name: str
    age: int
    gender: str
    phone: Optional[str] = ""
    blood_group: Optional[str] = ""
    allergies: Optional[str] = "None known"


class ExtractRequest(BaseModel):
    transcript: str
    api_key: Optional[str] = None


class ConsultationSaveRequest(BaseModel):
    patient_id: str
    visit_date: Optional[str] = None
    transcript: str = ""
    complaints: str = ""
    vitals: Dict[str, Any] = {}
    diagnosis: str = ""
    medicines: List[Dict[str, Any]] = []
    investigations: str = ""
    advice: str = ""
    follow_up: str = ""
    doctor_name: Optional[str] = ""


@app.get("/api/next-pid")
def api_next_pid():
    return {"next_pid": generate_next_pid()}


@app.get("/api/patients")
def api_search_patients(q: str = Query("", description="Search by Patient ID, Name, or Phone")):
    return {"patients": search_patients(q)}


@app.get("/api/patients/{patient_id}")
def api_get_patient(patient_id: str):
    patient = get_patient_with_history(patient_id)
    if not patient:
        raise HTTPException(status_code=404, detail=f"Patient ID '{patient_id}' not found")
    return patient


@app.post("/api/patients")
def api_create_patient(req: PatientCreateRequest):
    return create_patient(req.model_dump())


@app.post("/api/extract")
def api_extract(req: ExtractRequest):
    if not req.transcript.strip():
        raise HTTPException(status_code=400, detail="Transcript is empty")
    return extract_clinical_report(req.transcript, req.api_key)


@app.post("/api/consultations")
def api_save_consultation(req: ConsultationSaveRequest):
    existing = get_patient_with_history(req.patient_id)
    if not existing:
        raise HTTPException(status_code=404, detail=f"Patient ID '{req.patient_id}' not found")
    return append_consultation(req.model_dump())


app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")


@app.get("/")
def serve_index():
    return FileResponse(str(FRONTEND_DIR / "index.html"))
