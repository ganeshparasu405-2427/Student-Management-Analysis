"""
Student Management Analysis System - Flask REST API & Web Backend Server
========================================================================
Serves the web dashboard static assets and provides JSON REST endpoints
for student record CRUD operations, role-based authentication, and student self-service portal.
"""

import os
import socket
import json
from io import BytesIO
from urllib.parse import urlsplit
from flask import Flask, jsonify, request, send_file, send_from_directory, url_for
from flask_cors import CORS
import qrcode
from student_analysis import StudentAnalyzer

app = Flask(__name__, static_folder="static", static_url_path="")
CORS(app)  # Enable Cross-Origin Resource Sharing for API access

DATA_FILE = os.path.join(os.path.dirname(__file__), "students_data.json")
analyzer = StudentAnalyzer(data_filepath=DATA_FILE)

CERTIFICATE_LABELS = {
    "deans-list": "Dean's List Honor Roll",
    "academic-excellence": "Academic Excellence Certificate",
    "perfect-attendance": "100% Attendance Award",
    "clear-standing": "Clear Academic Standing",
}


def student_qr_image_url(student_id):
    base_url = public_portal_base_url()
    profile_url = student_profile_url(student_id, base_url)
    return f"{base_url}{url_for('qr_code', data=profile_url)}"


def student_profile_url(student_id, base_url=None):
    base_url = base_url or public_portal_base_url()
    return f"{base_url}{url_for('student_verify_page', id=student_id)}"


def public_portal_base_url():
    configured_url = os.environ.get("PUBLIC_BASE_URL", "").strip().rstrip("/")
    if configured_url:
        return configured_url

    host = (urlsplit(request.host_url).hostname or "").lower()
    if host in {"localhost", "127.0.0.1", "0.0.0.0", "::1"}:
        try:
            addresses = socket.gethostbyname_ex(socket.gethostname())[2]
            lan_address = next(address for address in addresses if not address.startswith("127."))
            port = urlsplit(request.host_url).port or request.environ.get("SERVER_PORT", "5000")
            return f"{request.scheme}://{lan_address}:{port}"
        except (OSError, StopIteration):
            pass

    return request.host_url.rstrip("/")


def save_student_profile_fields(student_id, name, email):
    try:
        with open(DATA_FILE, "r", encoding="utf-8") as data_file:
            records = json.load(data_file)
        record = next((item for item in records if item.get("id", "").lower() == student_id.lower()), None)
        if record is None:
            return False
        record["name"] = name
        record["email"] = email
        with open(DATA_FILE, "w", encoding="utf-8") as data_file:
            json.dump(records, data_file, indent=2)
        return True
    except (OSError, json.JSONDecodeError, AttributeError, TypeError):
        return False


def parse_optional_integer(value, label, maximum):
    if value in (None, ""):
        return None
    try:
        number = int(value)
    except (TypeError, ValueError):
        raise ValueError(f"{label} must be a whole number.") from None
    if not 1 <= number <= maximum:
        raise ValueError(f"{label} must be between 1 and {maximum}.")
    return number


def enrich_student_details(student):
    """Calculate arrears, subject marksheets, and achievements for a student record."""
    if not student:
        return None
    res = StudentAnalyzer.normalize_student_record(student.copy())
    res["profile_url"] = student_profile_url(res["id"])
    res["qr_code"] = student_qr_image_url(res["id"])
    res["qr_code_data"] = res["profile_url"]
    scores = res.get("scores", {})

    subject_marksheet = []
    arrear_count = 0
    for subject, score in scores.items():
        numeric_score = float(score)
        is_arrear = numeric_score < 50.0
        if is_arrear:
            arrear_count += 1
        grade_letter = "A+" if numeric_score >= 90 else ("A" if numeric_score >= 80 else ("B" if numeric_score >= 70 else ("C" if numeric_score >= 60 else ("D" if numeric_score >= 50 else "F (Arrear)"))))
        subject_marksheet.append({
            "subject": subject,
            "score": round(numeric_score, 1),
            "grade": grade_letter,
            "status": "Arrear" if is_arrear else "Passed",
            "subject_scope": "Department subject" if subject in res["department_subjects"] else "Unassigned legacy mark",
            "academic_year": res.get("academic_year"),
            "year": res.get("year"),
            "semester": res.get("semester"),
            "section": res.get("section"),
        })

    res["subject_marksheet"] = subject_marksheet
    res["arrear_count"] = arrear_count
    scores_list = [(item["subject"], item["score"]) for item in subject_marksheet]
    res["academic_performance"] = {
        "average_mark": round(sum(score for _, score in scores_list) / len(scores_list), 1) if scores_list else None,
        "subject_count": len(scores_list),
        "pass_rate": round((len(scores_list) - arrear_count) / len(scores_list) * 100, 1) if scores_list else None,
        "strongest_subject": max(scores_list, key=lambda item: item[1])[0] if scores_list else None,
        "needs_attention": min(scores_list, key=lambda item: item[1])[0] if scores_list else None,
    }
    res["academic_records"] = [{
        "department": res["department"],
        "academic_year": res.get("academic_year"),
        "year": res.get("year"),
        "semester": res.get("semester"),
        "section": res.get("section"),
        "subjects": subject_marksheet,
        "unassigned_subjects": [item["subject"] for item in subject_marksheet if item["subject_scope"] != "Department subject"],
    }] if subject_marksheet else []

    achievements = []
    cgpa = float(res.get("gpa", 0.0) or 0.0)
    attendance = float(res.get("attendance", 0.0) or 0.0)

    if cgpa >= 8.5:
        achievements.append({"title": "Dean's List Honor Roll", "description": "Earned a cumulative CGPA of 8.50 or higher at St. Joseph's College of Engineering", "icon": "fa-award"})
    if cgpa >= 8.0:
        achievements.append({"title": "Academic Excellence Certificate", "description": "Maintained a cumulative CGPA of 8.00 or higher across enrolled subjects", "icon": "fa-medal"})
    if attendance >= 100.0:
        achievements.append({"title": "100% Attendance Award", "description": "Maintained a perfect 100% classroom attendance record", "icon": "fa-calendar-check"})
    if arrear_count == 0:
        achievements.append({"title": "Clear Academic Standing", "description": "Zero standing arrears or backlogs", "icon": "fa-circle-check"})

    res["achievements"] = achievements
    res["cgpa_text"] = f"{res.get('gpa', 0.0):.2f} / 10.00"
    return res


@app.route("/")
def index():
    """Serve the single-page application dashboard."""
    return send_from_directory("static", "index.html")


@app.route("/student-verify.html")
def student_verify_page():
    """Serve the QR verification/profile page."""
    return send_from_directory("static", "student-verify.html")


@app.route("/certificate-verify.html")
def certificate_verify_page():
    """Serve the public certificate verification page."""
    return send_from_directory("static", "certificate-verify.html")


@app.route("/api/qr.png")
def qr_code():
    """Generate a same-origin QR code image without an external image service."""
    data = request.args.get("data", "").strip()
    if not data or len(data) > 2048:
        return jsonify({"success": False, "error": "A QR payload of up to 2048 characters is required."}), 400

    code = qrcode.QRCode(box_size=7, border=3)
    code.add_data(data)
    code.make(fit=True)
    image = code.make_image(fill_color="#173779", back_color="white")
    output = BytesIO()
    image.save(output, format="PNG")
    output.seek(0)
    return send_file(output, mimetype="image/png", max_age=0)


@app.route("/api/login", methods=["POST"])
def login():
    """Authenticate Admin or Student credentials."""
    data = request.get_json() or {}
    role = data.get("role", "admin").lower()
    
    if role == "admin":
        username = data.get("username", "").strip()
        password = data.get("password", "").strip()
        
        # Accept only the designated admin credentials
        if username.lower() == "ganeshmoorthy" and password == "Ganesh@2007":
            return jsonify({
                "success": True,
                "role": "admin",
                "user": {
                    "name": "GANESHMOORTHY",
                    "role": "System Administrator",
                    "email": "admin@stjosephs.edu"
                }
            })
        return jsonify({"success": False, "error": "Invalid admin credentials"}), 401
        
    elif role == "student":
        student_id = data.get("student_id", "").strip().lower()
        
        student = next((s for s in analyzer.students if s["id"].lower() == student_id), None)
        if not student:
            return jsonify({"success": False, "error": "Student ID not found"}), 404
            
        enriched = enrich_student_details(student)
        return jsonify({
            "success": True,
            "role": "student",
            "student": enriched
        })
        
    return jsonify({"success": False, "error": "Invalid login role specified"}), 400


@app.route("/api/students", methods=["GET"])
def get_students():
    """Retrieve students with optional search query & filter criteria."""
    students = analyzer.students
    
    search_q = request.args.get("q", "").strip().lower()
    department = request.args.get("department", "").strip()
    grade_level = request.args.get("grade_level", "").strip()
    status = request.args.get("status", "").strip()

    filtered = []
    for s in students:
        if search_q:
            match_name = search_q in s.get("name", "").lower()
            match_id = search_q in s.get("id", "").lower()
            match_email = search_q in s.get("email", "").lower()
            if not (match_name or match_id or match_email):
                continue
        if department and s.get("department") != department:
            continue
        if grade_level and s.get("grade_level") != grade_level:
            continue
        if status and s.get("status") != status:
            continue
        filtered.append(s)

    return jsonify({"success": True, "count": len(filtered), "students": filtered})


@app.route("/api/students/<student_id>", methods=["GET"])
def get_student(student_id):
    """Retrieve a single student record by ID with arrear & achievement details."""
    student = next((s for s in analyzer.students if s["id"].lower() == student_id.lower()), None)
    if not student:
        return jsonify({"success": False, "error": "Student not found"}), 404
    enriched = enrich_student_details(student)
    return jsonify({"success": True, "student": enriched})


@app.route("/api/certificates/<student_id>/<cert_key>", methods=["GET"])
def verify_certificate(student_id, cert_key):
    """Verify that a student currently qualifies for the requested certificate."""
    label = CERTIFICATE_LABELS.get(cert_key)
    if not label:
        return jsonify({"success": False, "error": "Certificate type not recognized."}), 404

    student = next((s for s in analyzer.students if s["id"].lower() == student_id.lower()), None)
    if not student:
        return jsonify({"success": False, "error": "Student record not found."}), 404

    enriched = enrich_student_details(student)
    achievement = next((a for a in enriched["achievements"] if a["title"] == label), None)
    if not achievement:
        return jsonify({"success": False, "error": "This certificate is not currently eligible for this student."}), 404

    return jsonify({
        "success": True,
        "verified": True,
        "certificate_id": f"SJCE/{enriched['id']}/{cert_key.upper()}",
        "student": {
            "id": enriched["id"],
            "name": enriched["name"],
            "department": enriched["department"],
            "grade_level": enriched["grade_level"],
        },
        "award": label,
    })


@app.route("/api/students", methods=["POST"])
def add_student():
    """Create a new student record."""
    data = request.get_json() or {}

    required_fields = ["name", "email", "department", "grade_level"]
    for field in required_fields:
        if not data.get(field):
            return jsonify({"success": False, "error": f"Missing required field: {field}"}), 400

    existing_ids = [s["id"] for s in analyzer.students if "id" in s]
    new_id = data.get("id")
    if not new_id:
        count = len(analyzer.students) + 1
        new_id = f"STU{count:03d}"
        while new_id.lower() in {student_id.lower() for student_id in existing_ids}:
            count += 1
            new_id = f"STU{count:03d}"
    if any(student_id.lower() == str(new_id).lower() for student_id in existing_ids):
        return jsonify({"success": False, "error": "A student with this ID already exists."}), 409

    try:
        year = parse_optional_integer(data.get("year"), "Year", 6)
        semester = parse_optional_integer(data.get("semester"), "Semester", 12)
    except ValueError as error:
        return jsonify({"success": False, "error": str(error)}), 400

    department = StudentAnalyzer.normalize_department_name(data.get("department"))
    scores = data.get("scores", {})
    if not isinstance(scores, dict):
        scores = {}

    allowed_subjects = set(StudentAnalyzer.get_department_subjects(department))
    normalized_scores = {}
    for subject, raw in scores.items():
        if subject not in allowed_subjects:
            return jsonify({"success": False, "error": f"{subject} is not a subject in {department}."}), 400
        try:
            score = float(raw)
        except (TypeError, ValueError):
            return jsonify({"success": False, "error": f"Invalid mark for {subject}."}), 400
        if not 0 <= score <= 100:
            return jsonify({"success": False, "error": f"Mark for {subject} must be between 0 and 100."}), 400
        normalized_scores[str(subject)] = score

    attendance = float(data.get("attendance", 85.0))
    gpa = StudentAnalyzer.calculate_gpa(normalized_scores)
    status = StudentAnalyzer.determine_status(gpa, attendance)
    qr_url = student_qr_image_url(new_id)

    new_student = {
        "id": new_id,
        "name": data.get("name").strip(),
        "email": data.get("email").strip(),
        "department": department,
        "grade_level": data.get("grade_level").strip(),
        "academic_year": str(data.get("academic_year") or "").strip() or None,
        "year": year,
        "semester": semester,
        "section": str(data.get("section") or "").strip().upper() or None,
        "attendance": round(attendance, 1),
        "scores": normalized_scores,
        "gpa": gpa,
        "cgpa": gpa,
        "status": status,
        "department_subjects": StudentAnalyzer.get_department_subjects(department),
        "qr_code": qr_url,
        "qr_code_data": student_profile_url(new_id),
        "profile_url": f"/student-verify.html?id={new_id}",
    }

    analyzer.students.append(new_student)
    analyzer.save_data()

    return jsonify({"success": True, "message": "Student created successfully", "student": enrich_student_details(new_student)}), 201


@app.route("/api/students/<student_id>", methods=["PUT"])
def update_student(student_id):
    """Update an existing student record."""
    data = request.get_json() or {}
    student = next((s for s in analyzer.students if s["id"].lower() == student_id.lower()), None)
    if not student:
        return jsonify({"success": False, "error": "Student not found"}), 404

    academic_fields_changed = any(field in data for field in (
        "department", "grade_level", "academic_year", "year", "semester", "section", "attendance", "scores"
    ))
    score_fields_changed = any(field in data for field in ("department", "attendance", "scores"))
    original_department = StudentAnalyzer.normalize_department_name(student.get("department", ""))
    try:
        year = parse_optional_integer(data.get("year"), "Year", 6) if "year" in data else student.get("year")
        semester = parse_optional_integer(data.get("semester"), "Semester", 12) if "semester" in data else student.get("semester")
    except ValueError as error:
        return jsonify({"success": False, "error": str(error)}), 400

    department = StudentAnalyzer.normalize_department_name(data.get("department", original_department))
    attendance = student.get("attendance", 85.0)
    if "attendance" in data:
        try:
            attendance = float(data["attendance"])
        except (TypeError, ValueError):
            return jsonify({"success": False, "error": "Attendance must be a number."}), 400
        if not 0 <= attendance <= 100:
            return jsonify({"success": False, "error": "Attendance must be between 0 and 100."}), 400

    normalized_scores = None
    if "scores" in data and isinstance(data["scores"], dict):
        department_subjects = set(StudentAnalyzer.get_department_subjects(department))
        all_department_subjects = {
            subject
            for department_name in StudentAnalyzer.DEPARTMENT_SUBJECTS
            for subject in StudentAnalyzer.get_department_subjects(department_name)
        }
        normalized_scores = {
            subject: value for subject, value in (student.get("scores") or {}).items()
            if original_department == department and subject not in all_department_subjects
        }
        for subject, value in data["scores"].items():
            if subject not in department_subjects:
                return jsonify({"success": False, "error": f"{subject} is not a subject in {department}."}), 400
            try:
                score = float(value)
            except (TypeError, ValueError):
                return jsonify({"success": False, "error": f"Invalid mark for {subject}."}), 400
            if not 0 <= score <= 100:
                return jsonify({"success": False, "error": f"Mark for {subject} must be between 0 and 100."}), 400
            normalized_scores[str(subject)] = score

    original_name = student.get("name", "")
    original_email = student.get("email", "")
    if "name" in data:
        student["name"] = data["name"].strip()
    if "email" in data:
        student["email"] = data["email"].strip()
    profile_fields_changed = student["name"] != original_name or student["email"] != original_email
    if "department" in data:
        student["department"] = department
    if "grade_level" in data:
        student["grade_level"] = data["grade_level"].strip()
    if "academic_year" in data:
        student["academic_year"] = str(data["academic_year"] or "").strip() or None
    if "year" in data:
        student["year"] = year
    if "semester" in data:
        student["semester"] = semester
    if "section" in data:
        student["section"] = str(data["section"] or "").strip().upper() or None
    if "attendance" in data:
        student["attendance"] = attendance
    if normalized_scores is not None:
        student["scores"] = normalized_scores

    if score_fields_changed:
        student["department_subjects"] = StudentAnalyzer.get_department_subjects(student.get("department", "Computer Science & Engineering"))
        student["gpa"] = StudentAnalyzer.calculate_gpa(student["scores"])
        student["cgpa"] = student["gpa"]
        student["status"] = StudentAnalyzer.determine_status(student["gpa"], student["attendance"])

    if academic_fields_changed:
        analyzer.save_data()
    elif profile_fields_changed and not save_student_profile_fields(student["id"], student["name"], student["email"]):
        student["name"] = original_name
        student["email"] = original_email
        return jsonify({"success": False, "error": "Student profile could not be saved."}), 500
    return jsonify({"success": True, "message": "Student updated successfully", "student": enrich_student_details(student)})


@app.route("/api/students/<student_id>", methods=["DELETE"])
def delete_student(student_id):
    """Delete a student record."""
    idx = next((i for i, s in enumerate(analyzer.students) if s["id"].lower() == student_id.lower()), None)
    if idx is None:
        return jsonify({"success": False, "error": "Student not found"}), 404

    deleted = analyzer.students.pop(idx)
    analyzer.save_data()
    return jsonify({"success": True, "message": f"Student {student_id} deleted successfully", "student": deleted})


@app.route("/api/analytics", methods=["GET"])
def get_analytics():
    """Return key performance metrics, department analysis, and subject scores for dashboard charts."""
    kpis = analyzer.get_kpis()
    subject_averages = analyzer.get_subject_averages()
    department_analysis = analyzer.get_department_analysis()
    at_risk_list = analyzer.get_at_risk_students()

    gpa_buckets = {"8.5 - 10.0 (Honor Roll)": 0, "7.0 - 8.49 (Strong)": 0, "5.0 - 6.99 (Developing)": 0, "< 5.0 (At-Risk)": 0}
    for s in analyzer.students:
        gpa = s.get("gpa", 0.0)
        if gpa >= 8.5:
            gpa_buckets["8.5 - 10.0 (Honor Roll)"] += 1
        elif gpa >= 7.0:
            gpa_buckets["7.0 - 8.49 (Strong)"] += 1
        elif gpa >= 5.0:
            gpa_buckets["5.0 - 6.99 (Developing)"] += 1
        else:
            gpa_buckets["< 5.0 (At-Risk)"] += 1

    scatter_points = [
        {"name": s["name"], "id": s["id"], "x": s["attendance"], "y": s["gpa"], "status": s["status"]}
        for s in analyzer.students
    ]

    return jsonify({
        "success": True,
        "kpis": kpis,
        "subject_averages": subject_averages,
        "department_analysis": department_analysis,
        "at_risk_students": at_risk_list,
        "gpa_distribution": gpa_buckets,
        "attendance_gpa_scatter": scatter_points
    })


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    print(f"[STARTING] St. Joseph's College of Engineering Portal Server on http://127.0.0.1:{port}")
    app.run(host="0.0.0.0", port=port, debug=True)
