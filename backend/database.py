import sqlite3
import json
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, List, Optional

DB_PATH = Path(__file__).resolve().parent.parent / "clinic_records.db"


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS patients (
            patient_id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            age INTEGER NOT NULL,
            gender TEXT NOT NULL,
            phone TEXT DEFAULT '',
            blood_group TEXT DEFAULT '',
            allergies TEXT DEFAULT 'None',
            created_at TEXT NOT NULL
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS consultations (
            consultation_id INTEGER PRIMARY KEY AUTOINCREMENT,
            patient_id TEXT NOT NULL,
            visit_date TEXT NOT NULL,
            transcript TEXT DEFAULT '',
            complaints TEXT DEFAULT '',
            vitals_json TEXT DEFAULT '{}',
            diagnosis TEXT DEFAULT '',
            medicines_json TEXT DEFAULT '[]',
            investigations TEXT DEFAULT '',
            advice TEXT DEFAULT '',
            follow_up TEXT DEFAULT '',
            doctor_name TEXT DEFAULT '',
            FOREIGN KEY (patient_id) REFERENCES patients (patient_id)
        )
    """)

    conn.commit()
    conn.close()


def generate_next_pid() -> str:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) as cnt FROM patients")
    count = cursor.fetchone()["cnt"]
    conn.close()
    return f"PID-{1001 + count}"


def search_patients(query: str) -> List[Dict[str, Any]]:
    conn = get_connection()
    cursor = conn.cursor()
    q = f"%{query.strip()}%"
    cursor.execute(
        """
        SELECT * FROM patients
        WHERE UPPER(patient_id) LIKE UPPER(?)
           OR UPPER(name) LIKE UPPER(?)
           OR phone LIKE ?
        ORDER BY patient_id DESC
        """,
        (q, q, q)
    )
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return rows


def get_patient_with_history(patient_id: str) -> Optional[Dict[str, Any]]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM patients WHERE UPPER(patient_id) = UPPER(?)", (patient_id.strip(),))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return None

    patient = dict(row)
    cursor.execute(
        """
        SELECT * FROM consultations
        WHERE UPPER(patient_id) = UPPER(?)
        ORDER BY consultation_id DESC
        """,
        (patient["patient_id"],)
    )
    consultations = []
    for c in cursor.fetchall():
        c_dict = dict(c)
        c_dict["vitals"] = json.loads(c_dict.get("vitals_json") or "{}")
        c_dict["medicines"] = json.loads(c_dict.get("medicines_json") or "[]")
        consultations.append(c_dict)

    patient["consultations"] = consultations
    conn.close()
    return patient


def create_patient(data: Dict[str, Any]) -> Dict[str, Any]:
    pid = (data.get("patient_id") or generate_next_pid()).strip().upper()
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        INSERT OR REPLACE INTO patients (patient_id, name, age, gender, phone, blood_group, allergies, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            pid,
            data["name"].strip(),
            int(data.get("age", 30)),
            data.get("gender", "Male"),
            data.get("phone", "").strip(),
            data.get("blood_group", "").strip(),
            data.get("allergies", "None").strip() or "None",
            now_str
        )
    )
    conn.commit()
    conn.close()
    return get_patient_with_history(pid)


def append_consultation(data: Dict[str, Any]) -> Dict[str, Any]:
    conn = get_connection()
    cursor = conn.cursor()
    visit_date = data.get("visit_date") or datetime.now().strftime("%Y-%m-%d %I:%M %p")
    vitals_json = json.dumps(data.get("vitals") or {})
    medicines_json = json.dumps(data.get("medicines") or [])

    cursor.execute(
        """
        INSERT INTO consultations (
            patient_id, visit_date, transcript, complaints, vitals_json,
            diagnosis, medicines_json, investigations, advice, follow_up, doctor_name
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            data["patient_id"].upper(),
            visit_date,
            data.get("transcript", ""),
            data.get("complaints", ""),
            vitals_json,
            data.get("diagnosis", ""),
            medicines_json,
            data.get("investigations", ""),
            data.get("advice", ""),
            data.get("follow_up", ""),
            data.get("doctor_name", "")
        )
    )
    conn.commit()
    conn.close()
    return get_patient_with_history(data["patient_id"].upper())
