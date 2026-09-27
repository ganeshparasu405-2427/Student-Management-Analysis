"""
Student Management Analysis System - Flask REST API & Web Backend Server
========================================================================
Serves the web dashboard static assets and provides JSON REST endpoints
for student record CRUD operations, role-based authentication, and student self-service portal.
"""

import os
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from student_analysis import StudentAnalyzer

app = Flask(__name__, static_folder="static", static_url_path="")
CORS(app)  # Enable Cross-Origin Resource Sharing for API access

DATA_FILE = os.path.join(os.path.dirname(__file__), "students_data.json")
analyzer = StudentAnalyzer(data_filepath=DATA_FILE)


def enrich_student_details(student):
    """Calculate arrears, subject marksheets, and achievements for a student record."""
    if not student:
        return None
    res = student.copy()
    scores = student.get("scores", {})
    
    # Calculate subject breakdown & arrears
    subject_marksheet = []
    arrear_count = 0
    for subject, score in scores.items():
        is_arrear = score < 50.0
        if is_arrear:
            arrear_count += 1
        grade_letter = "A+" if score >= 90 else ("A" if score >= 80 else ("B" if score >= 70 else ("C" if score >= 60 else ("D" if score >= 50 else "F (Arrear)"))))
        subject_marksheet.append({
            "subject": subject,
            "score": score,
            "grade": grade_letter,
            "status": "Arrear" if is_arrear else "Passed"
        })
        
    res["subject_marksheet"] = subject_marksheet
    res["arrear_count"] = arrear_count
    
    # Achievements list
    achievements = []
    gpa = student.get("gpa", 0.0)
    attendance = student.get("attendance", 0.0)
    
    if gpa >= 3.75:
        achievements.append({"title": "Dean's List Honor Roll", "description": "Earned a cumulative GPA of 3.75 or higher at St. Joseph's University", "icon": "fa-award"})
    if gpa >= 3.5:
        achievements.append({"title": "Academic Excellence Certificate", "description": "Maintained a cumulative GPA of 3.50 or higher across enrolled subjects", "icon": "fa-medal"})
    if attendance >= 100.0:
        achievements.append({"title": "100% Attendance Award", "description": "Maintained a perfect 100% classroom attendance record", "icon": "fa-calendar-check"})
    if arrear_count == 0:
        achievements.append({"title": "Clear Academic Standing", "description": "Zero Standing Arrears / Backlogs", "icon": "fa-circle-check"})
        
    res["achievements"] = achievements
    return res


@app.route("/")
def index():
    """Serve the single-page application dashboard."""
    return send_from_directory("static", "index.html")


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
        while new_id in existing_ids:
            count += 1
            new_id = f"STU{count:03d}"

    scores = data.get("scores", {})
    if not isinstance(scores, dict):
        scores = {}
    
    default_subjects = ["Mathematics", "Physics", "Computer Science", "English", "History"]
    for subj in default_subjects:
        if subj not in scores:
            scores[subj] = 75.0
        else:
            try:
                scores[subj] = float(scores[subj])
            except (ValueError, TypeError):
                scores[subj] = 75.0

    attendance = float(data.get("attendance", 85.0))
    gpa = StudentAnalyzer.calculate_gpa(scores)
    status = StudentAnalyzer.determine_status(gpa, attendance)

    new_student = {
        "id": new_id,
        "name": data.get("name").strip(),
        "email": data.get("email").strip(),
        "department": data.get("department").strip(),
        "grade_level": data.get("grade_level").strip(),
        "attendance": round(attendance, 1),
        "scores": scores,
        "gpa": gpa,
        "status": status
    }

    analyzer.students.append(new_student)
    analyzer.save_data()

    return jsonify({"success": True, "message": "Student created successfully", "student": new_student}), 201


@app.route("/api/students/<student_id>", methods=["PUT"])
def update_student(student_id):
    """Update an existing student record."""
    data = request.get_json() or {}
    student = next((s for s in analyzer.students if s["id"].lower() == student_id.lower()), None)
    if not student:
        return jsonify({"success": False, "error": "Student not found"}), 404

    if "name" in data:
        student["name"] = data["name"].strip()
    if "email" in data:
        student["email"] = data["email"].strip()
    if "department" in data:
        student["department"] = data["department"].strip()
    if "grade_level" in data:
        student["grade_level"] = data["grade_level"].strip()
    if "attendance" in data:
        student["attendance"] = float(data["attendance"])
    if "scores" in data and isinstance(data["scores"], dict):
        student["scores"] = {k: float(v) for k, v in data["scores"].items()}

    student["gpa"] = StudentAnalyzer.calculate_gpa(student["scores"])
    student["status"] = StudentAnalyzer.determine_status(student["gpa"], student["attendance"])

    analyzer.save_data()
    return jsonify({"success": True, "message": "Student updated successfully", "student": student})


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

    gpa_buckets = {"3.5 - 4.0 (A)": 0, "3.0 - 3.49 (B)": 0, "2.5 - 2.99 (C)": 0, "< 2.5 (D/F)": 0}
    for s in analyzer.students:
        gpa = s.get("gpa", 0.0)
        if gpa >= 3.5:
            gpa_buckets["3.5 - 4.0 (A)"] += 1
        elif gpa >= 3.0:
            gpa_buckets["3.0 - 3.49 (B)"] += 1
        elif gpa >= 2.5:
            gpa_buckets["2.5 - 2.99 (C)"] += 1
        else:
            gpa_buckets["< 2.5 (D/F)"] += 1

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
    print(f"[STARTING] St. Joseph's University Portal Server on http://127.0.0.1:{port}")
    app.run(host="0.0.0.0", port=port, debug=True)
