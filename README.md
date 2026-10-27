# Clinical Scribe & Smart Prescription System

A real-time, multilingual ambient clinical documentation system designed for outpatient consultations (Telugu, Hindi, and Indian English). It captures spoken doctor-patient dialogue, dynamically extracts clinical entities (complaints, vitals, provisional diagnosis, prescribed medications with dosage schedules, investigations, and follow-up), and generates an editable, printable hospital prescription sheet with longitudinal patient record tracking.

## Features

- **Ambient Audio Scribe:** Real-time speech recognition with WebRTC acoustic noise filtering.
- **Multilingual Support:** Handles Telugu, Hindi/Dakhni, and Indian English clinical conversations.
- **Dynamic Entity Extraction:** Identifies chief complaints, vitals, provisional diagnosis, and prescribed medications without hardcoded clinical defaults.
- **Doctor-Style Dosage Notations:** Supports numeric codes (1-1-1, 1-0-1, 0-1-0, 0-0-1, 1-1-1-1) and visual dot-and-line timeline diagrams with localized vernacular instructions (Telugu & Hindi).
- **Longitudinal Patient Records:** Indexed by Unique Patient ID (UPID) to store past visit history and append newly concluded visits sequentially.
- **1-Click Print Engine:** Generates clean, hospital-grade A4 prescription slips with doctor signature blocks, hiding all application interfaces during print.

## Project Structure

```text
QA-Doc/
├── backend/
│   ├── main.py              # FastAPI application & REST endpoints
│   ├── database.py          # SQLite database manager for patients & consultations
│   ├── ai_extractor.py      # Clinical NLP & dynamic entity extraction engine
│   └── __init__.py
├── frontend/
│   ├── index.html           # Doctor dashboard & prescription sheet layout
│   ├── styles.css           # Responsive styles & dedicated @media print rules
│   └── app.js               # Audio streaming, UI handlers & validation
├── demo_output/
│   └── sample_case_prescription.pdf  # Sample clinical prescription output PDF
├── requirements.txt         # Python dependencies
└── .gitignore
```

## Setup & Execution

### 1. Install Dependencies
```bash
pip install -r requirements.txt
```

### 2. Run Application
```bash
python -m uvicorn backend.main:app --reload
```

### 3. Open Dashboard
Open your browser and navigate to:
`http://localhost:8000`
