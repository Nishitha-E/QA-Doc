import os
import re
import json
from typing import Dict, Any, List, Optional

try:
    import google.generativeai as genai
    HAS_GENAI = True
except ImportError:
    HAS_GENAI = False


PHONETIC_CORRECTIONS = {
    r"\bdollar\s*650\b": "Dolo 650",
    r"\bdolo\s*six\s*fifty\b": "Dolo 650",
    r"\bpan\s*party\b": "Pan 40",
    r"\bpan\s*forty\b": "Pan 40",
    r"\bpanto\s*cid\b": "Pantocid",
    r"\bsit\s*reason\b": "Cetirizine",
    r"\bcetrizine\b": "Cetirizine",
    r"\bazythral\b": "Azithral",
    r"\baugment\s*in\b": "Augmentin",
    r"\bmet\s*for\s*min\b": "Metformin",
    r"\btell\s*ma\b": "Telma",
    r"\bvert\s*in\b": "Vertin",
}

DOSAGE_TRANSLATIONS = {
    "1-1-1": {
        "te_base": "3 పూటలా (ఉదయం, మధ్యాహ్నం, రాత్రి)",
        "hi_base": "दिन में 3 बार (सुबह, दोपहर, रात)"
    },
    "1-0-1": {
        "te_base": "2 పూటలా (ఉదయం, రాత్రి)",
        "hi_base": "दिन में 2 बार (सुबह, रात)"
    },
    "0-1-0": {
        "te_base": "మధ్యాహ్నం మాత్రమే",
        "hi_base": "केवल दोपहर को"
    },
    "0-1-1": {
        "te_base": "మధ్యాహ్నం మరియు రాత్రి",
        "hi_base": "दोपहर और रात को"
    },
    "0-0-1": {
        "te_base": "రాత్రి పడుకునే ముందు",
        "hi_base": "केवल रात को सोने से पहले"
    },
    "1-0-0": {
        "te_base": "ఉదయం మాత్రమే",
        "hi_base": "केवल सुबह"
    },
    "1-1-1-1": {
        "te_base": "రోజుకు 4 సార్లు (ప్రతి 6 గంటలకు)",
        "hi_base": "दिन में 4 बार (हर 6 घंटे में)"
    }
}


def build_vernacular_notes(dosage: str, timing: str) -> Dict[str, str]:
    info = DOSAGE_TRANSLATIONS.get(dosage, DOSAGE_TRANSLATIONS["1-0-1"])
    is_before = "before" in timing.lower() or "empty" in timing.lower()
    te_food = "పరిగడుపున (తినక ముందు)" if is_before else "భోజనం తర్వాత"
    hi_food = "खाली पेट (खाने से पहले)" if is_before else "खाने के बाद"
    return {
        "telugu_note": f"{info['te_base']} - {te_food}",
        "hindi_note": f"{info['hi_base']} - {hi_food}"
    }


def normalize_transcript(raw_text: str) -> str:
    cleaned = raw_text
    for pattern, replacement in PHONETIC_CORRECTIONS.items():
        cleaned = re.sub(pattern, replacement, cleaned, flags=re.IGNORECASE)
    return cleaned

def _detect_dosage_in_context(context: str, default_dosage: str = "1-0-1") -> str:
    c = context.lower()
    if re.search(r"(1-1-1-1|4\s*times|four\s*times|nalugu\s*sarlu|chaar\s*baar|4/day|every\s*6\s*hours)", c):
        return "1-1-1-1"
    if re.search(r"(1-1-1|3\s*times|three\s*times|thrice|moodu\s*pootala|3\s*putalalu|3\s*pootala|teen\s*baar|teen\s*time|subah\s*dopahar\s*shaam|morning\s*afternoon\s*night|3\s*పూటలా|మూడు\s*పూటలా|तीन\s*बार)", c):
        return "1-1-1"
    if re.search(r"(0-1-1|afternoon\s*and\s*night|madhyahnam\s*rathri|dopahar\s*aur\s*raat)", c):
        return "0-1-1"
    if re.search(r"(1-0-1|2\s*times|two\s*times|twice|rendu\s*pootala|2\s*putalalu|podduna\s*rathri|subah\s*shaam|morning\s*and\s*night|morning\s*night|2\s*పూటలా|రెండు\s*పూటలా|दो\s*बार|सुबह\s*शाम)", c):
        return "1-0-1"
    if re.search(r"(0-1-0|afternoon\s*only|in\s*the\s*afternoon|madhyahnam\s*okkate|madhyahnam\s*matrame|dopahar\s*ko|మధ్యాహ్నం|दोपहर)", c):
        return "0-1-0"
    if re.search(r"(0-0-1|night\s*only|at\s*night|bedtime|rathri\s*matrame|padukune\s*mundu|raat\s*ko|రాత్రి|रात\s*को)", c):
        return "0-0-1"
    if re.search(r"(1-0-0|morning\s*only|in\s*the\s*morning|podduna\s*matrame|subah\s*ko|ఉదయం|सुबह)", c):
        return "1-0-0"
    return default_dosage


def _detect_timing_in_context(context: str, default_timing: str = "After Food") -> str:
    c = context.lower()
    if re.search(r"(before\s*food|empty\s*stomach|parigadupuna|thinaka\s*mundu|khali\s*pet|khane\s*se\s*pehle|పరిగడుపున|తినక\s*ముందు|खाली\s*पेट)", c):
        return "Before Food"
    if re.search(r"(after\s*food|thinnaka|bhojanam\s*tarvata|khane\s*ke\s*baad|భోజనం\s*తర్వాత|खाने\s*के\s*बाद)", c):
        return "After Food"
    return default_timing


def _detect_days_in_context(context: str, default_days: int = 5) -> int:
    m = re.search(r"(\d+)\s*(days|day|rojulu|roju|din|రోజులు|दिन)", context, flags=re.IGNORECASE)
    if m:
        val = int(m.group(1))
        if 1 <= val <= 90:
            return val
    word_map = {"one": 1, "oka": 1, "ek": 1, "two": 2, "rendu": 2, "do": 2, "three": 3, "moodu": 3, "teen": 3, "five": 5, "aidu": 5, "paanch": 5, "seven": 7, "vaaram": 7, "saat": 7, "ten": 10}
    for w, d in word_map.items():
        if re.search(rf"\b{w}\s*(days|day|rojulu|din)\b", context, flags=re.IGNORECASE):
            return d
    return default_days


def _count_doses_per_day(dosage: str) -> int:
    return sum(1 for part in dosage.split("-") if part.strip() == "1")


def extract_spoken_medicines(text: str) -> List[Dict[str, Any]]:
    medicines = []
    seen_names = set()

    patterns = [
        r"\b(Tab(?:let)?\.?|Cap(?:sule)?\.?|Syp\.?|Syrup|Inj(?:ection)?\.?|Drops)\s+([A-Za-z][A-Za-z0-9\-]*(?:\s+\d+\s*(?:mg|ml|mcg|g|dsr|sr|sp|lc|plus|forte))?)",
        r"\b(?:take|prescribe|use|eskondi|vesukondi|lijiye|lena)\s+([A-Za-z][A-Za-z0-9\-]+(?:\s+\d+\s*(?:mg|ml|mcg|g))?)"
    ]

    stop_words = {"this", "that", "one", "two", "three", "medicine", "tablet", "capsule", "syrup", "water", "rest", "food", "for", "after", "before", "morning", "night", "afternoon"}

    for pat_idx, pat in enumerate(patterns):
        for match in re.finditer(pat, text, flags=re.IGNORECASE):
            if pat_idx == 0:
                prefix_raw = match.group(1).lower()
                med_raw = match.group(2).strip()
                if "cap" in prefix_raw:
                    prefix = "Cap."
                elif "syp" in prefix_raw or "syrup" in prefix_raw:
                    prefix = "Syp."
                elif "inj" in prefix_raw:
                    prefix = "Inj."
                else:
                    prefix = "Tab."
                full_name = f"{prefix} {med_raw.title()}"
            else:
                med_raw = match.group(1).strip()
                full_name = f"Tab. {med_raw.title()}"

            key = full_name.lower().strip()
            first_word = med_raw.split()[0].lower()
            if first_word in stop_words or len(first_word) < 3 or key in seen_names:
                continue

            seen_names.add(key)

            start_idx = max(0, match.start() - 25)
            end_idx = min(len(text), match.end() + 90)
            context = text[start_idx:end_idx]

            dosage = _detect_dosage_in_context(context, "1-0-1")
            timing = _detect_timing_in_context(context, "After Food")
            days = _detect_days_in_context(context, 5)
            doses_per_day = _count_doses_per_day(dosage)
            qty = "1 Bottle" if "Syp." in full_name else f"{doses_per_day * days} Tabs"
            notes = build_vernacular_notes(dosage, timing)

            medicines.append({
                "name": full_name,
                "dosage": dosage,
                "timing": timing,
                "duration": f"{days} Days",
                "qty": qty,
                "telugu_note": notes["telugu_note"],
                "hindi_note": notes["hindi_note"]
            })

    return medicines

def local_multilingual_extract(raw_transcript: str) -> Dict[str, Any]:
    text = normalize_transcript(raw_transcript)
    lower = text.lower()
    symptom_keywords = [
        (r"(fever|jwaram|jvaram|bukhar|temperature|జ్వరం|बुखार)", "Fever"),
        (r"(headache|talanoppi|thalanoppi|sar\s*dard|sirdard|తలనొప్పి|सिरदर्द)", "Headache"),
        (r"(body\s*pain|ontlo\s*noppulu|ollu\s*noppulu|badan\s*dard|ఒళ్ళు\s*నొప్పులు|बदन\s*दर्द)", "Body Pains"),
        (r"(cough|daggu|khansi|దగ్గు|खांसी)", "Cough"),
        (r"(cold|running\s*nose|jalubu|zukam|జలుబు|जुकाम)", "Cold & Running Nose"),
        (r"(throat\s*pain|sore\s*throat|gonthu\s*noppi|gale\s*me\s*dard|గొంతు\s*నొప్పి)", "Throat Pain"),
        (r"(acidity|gas|kadupu\s*manta|pet\s*me\s*jalan|heartburn|కడుపు\s*మంట)", "Acidity / Burning Sensation"),
        (r"(stomach\s*pain|kadupu\s*noppi|pet\s*dard|కడుపు\s*నొప్పి)", "Stomach Pain"),
        (r"(vomit|vanthulu|ulti|వాంతులు|उल्टी)", "Vomiting"),
        (r"(dizziness|vertigo|kallu\s*thirugu|chakkar|కళ్ళు\s*తిరుగు|चक्कर)", "Dizziness / Vertigo"),
        (r"(loose\s*motion|motions|virechanalu|dast|విరేచనాలు|दस्त)", "Loose Motions"),
        (r"(weakness|neerasam|kamzori|నీరసం)", "Weakness"),
    ]

    spoken_symptoms = []
    for pattern, label in symptom_keywords:
        if re.search(pattern, text, flags=re.IGNORECASE):
            spoken_symptoms.append(label)

    dur_match = re.search(r"(\d+|one|two|three|four|five|seven|rendu|moodu|teen|chaar)\s*(days|day|rojulu|din|hours|weeks|months|రోజులు|दिन)", text, flags=re.IGNORECASE)
    dur_str = f" (Duration: {dur_match.group(0)})" if dur_match else ""

    if spoken_symptoms:
        complaints = ", ".join(spoken_symptoms) + dur_str
    else:
        first_line = text.strip().split("\n")[0]
        complaints = first_line[:120] if first_line else ""

    bp_match = re.search(r"\b(\d{2,3}\s*/\s*\d{2,3})\b", text)
    temp_match = re.search(r"\b(9[89](?:\.\d)?|10[0-5](?:\.\d)?)\s*(?:f|deg|°f|degrees)?\b", lower)
    pulse_match = re.search(r"(?:pulse|heart\s*rate|hr)\s*(?:is|of|:)?\s*(\d{2,3})", lower)
    weight_match = re.search(r"(\d{2,3}(?:\.\d)?)\s*(?:kg|kgs|kilograms)", lower)

    vitals = {
        "bp": f"{bp_match.group(1).replace(' ', '')} mmHg" if bp_match else "",
        "pulse": f"{pulse_match.group(1)} bpm" if pulse_match else "",
        "temp": f"{temp_match.group(1)} °F" if temp_match else "",
        "weight": f"{weight_match.group(1)} kg" if weight_match else ""
    }

    diagnosis = ""
    dx_match = re.search(r"(?:diagnosis\s*is|diagnosed\s*with|suffering\s*from|problem\s*is|it\s*is)\s+([A-Za-z\s]+?)(?:\.|\n|take|tab|cap|$)", text, flags=re.IGNORECASE)
    if dx_match:
        diagnosis = dx_match.group(1).strip().title()
    elif "viral fever" in lower:
        diagnosis = "Viral Fever"
    elif "acidity" in lower or "gastritis" in lower:
        diagnosis = "Acidity / Gastritis"
    elif "vertigo" in lower:
        diagnosis = "Vertigo"
    elif "infection" in lower:
        diagnosis = "Acute Infection"

    medicines = extract_spoken_medicines(text)

    investigations = ""
    if re.search(r"\b(cbp|cbc|blood\s*test)\b", lower):
        investigations = "CBP (Complete Blood Picture)"
    elif re.search(r"\b(x-ray|xray)\b", lower):
        investigations = "Chest X-Ray"
    elif re.search(r"\b(ecg)\b", lower):
        investigations = "ECG"
    elif re.search(r"\b(dengue)\b", lower):
        investigations = "Dengue NS1"

    follow_up = ""
    fu_match = re.search(r"(?:review|come\s*back|see\s*me|follow\s*up)\s*(?:after|in)?\s*(\d+\s*(?:days|weeks|months))", text, flags=re.IGNORECASE)
    if fu_match:
        follow_up = f"Review after {fu_match.group(1)}"

    return {
        "normalized_transcript": text,
        "complaints": complaints,
        "vitals": vitals,
        "diagnosis": diagnosis,
        "medicines": medicines,
        "investigations": investigations,
        "follow_up": follow_up
    }

def extract_clinical_report(transcript: str, api_key: Optional[str] = None) -> Dict[str, Any]:
    return local_multilingual_extract(transcript)
