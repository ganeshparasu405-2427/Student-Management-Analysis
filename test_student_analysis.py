from student_analysis import StudentAnalyzer


def test_calculate_gpa_uses_ten_point_scale():
    scores = {
        "Data Structures & Algorithms": 88,
        "Operating Systems": 92,
        "Database Management Systems": 80,
    }
    result = StudentAnalyzer.calculate_gpa(scores)
    assert result == 8.67, result


def test_get_department_subjects_for_cse():
    subjects = StudentAnalyzer.get_department_subjects("Computer Science & Engineering")
    assert "Data Structures & Algorithms" in subjects
    assert "Operating Systems" in subjects
    assert "Database Management Systems" in subjects


def test_get_department_subjects_for_it():
    subjects = StudentAnalyzer.get_department_subjects("Information Technology")
    assert "Discrete Mathematics" in subjects
    assert "Web Technologies" in subjects
    assert "Computer Networks" in subjects


def test_get_department_subjects_for_data_science():
    subjects = StudentAnalyzer.get_department_subjects("Data Science")
    cse_subjects = StudentAnalyzer.get_department_subjects("Computer Science & Engineering")
    assert "Machine Learning" in subjects
    assert "Data Mining" in subjects
    assert subjects != cse_subjects


def test_normalize_student_preserves_only_recorded_scores_and_term_details():
    student = StudentAnalyzer.normalize_student_record({
        "id": "STU-TERM-1",
        "department": "Information Technology",
        "grade_level": "Junior",
        "academic_year": "2025-2026",
        "year": 3,
        "semester": 5,
        "section": "b",
        "attendance": 0,
        "scores": {"Web Technologies": 0, "Computer Networks": 84},
    })

    assert student["scores"] == {"Web Technologies": 0.0, "Computer Networks": 84.0}
    assert student["attendance"] == 0
    assert student["year"] == 3
    assert student["semester"] == 5
    assert student["section"] == "B"
    assert student["academic_year"] == "2025-2026"
    assert student["department_subjects"] == StudentAnalyzer.get_department_subjects("Information Technology")


def test_student_qr_payloads_target_unique_profiles_with_recorded_marks():
    from app import app

    client = app.test_client()
    first = client.get("/api/students/STU001").get_json()["student"]
    second = client.get("/api/students/STU002").get_json()["student"]
    qr_response = client.get("/api/qr.png", query_string={"data": first["qr_code_data"]})

    assert first["qr_code_data"] == first["profile_url"]
    assert first["qr_code_data"] != second["qr_code_data"]
    assert first["qr_code_data"].endswith("/student-verify.html?id=STU001")
    assert len(first["scores"]) == 5
    assert qr_response.status_code == 200
    assert qr_response.mimetype == "image/png"


def test_student_creation_stores_term_scoped_department_scores():
    import os
    import tempfile

    import app as api

    original_analyzer = api.analyzer
    try:
        with tempfile.TemporaryDirectory() as directory:
            api.analyzer = StudentAnalyzer(os.path.join(directory, "students.json"))
            client = api.app.test_client()
            response = client.post("/api/students", json={
                "name": "Taylor Student",
                "email": "taylor@example.edu",
                "department": "Information Technology",
                "grade_level": "Junior",
                "academic_year": "2025-2026",
                "year": 3,
                "semester": 5,
                "section": "b",
                "attendance": 92,
                "scores": {"Web Technologies": 0, "Computer Networks": 84},
            })

            assert response.status_code == 201
            student = response.get_json()["student"]
            assert student["scores"] == {"Web Technologies": 0.0, "Computer Networks": 84.0}
            assert student["academic_year"] == "2025-2026"
            assert student["year"] == 3
            assert student["semester"] == 5
            assert student["section"] == "B"
            assert student["academic_records"][0]["department"] == "Information Technology"
            assert student["academic_records"][0]["semester"] == 5
            assert student["qr_code_data"] == student["profile_url"]

            rejected_update = client.put(f"/api/students/{student['id']}", json={
                "department": "Computer Science & Engineering",
                "scores": {"Web Technologies": 95},
            })
            assert rejected_update.status_code == 400
            assert api.analyzer.students[0]["department"] == "Information Technology"

            updated = client.put(f"/api/students/{student['id']}", json={
                "academic_year": "2026-2027",
                "year": 4,
                "semester": 7,
                "section": "c",
                "scores": {"Computer Networks": 86},
            }).get_json()["student"]
            assert updated["academic_records"][0]["academic_year"] == "2026-2027"
            assert updated["academic_records"][0]["year"] == 4
            assert updated["academic_records"][0]["semester"] == 7
            assert updated["academic_records"][0]["section"] == "C"
            assert updated["scores"] == {"Computer Networks": 86.0}

            wrong_department = client.post("/api/students", json={
                "name": "Wrong Course Student",
                "email": "wrong@example.edu",
                "department": "Information Technology",
                "grade_level": "Junior",
                "scores": {"Data Structures & Algorithms": 80},
            })
            assert wrong_department.status_code == 400
    finally:
        api.analyzer = original_analyzer
