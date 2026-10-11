"""
Student Management Analysis System - Python Analytics Engine & Standalone CLI
=============================================================================
This module provides data analysis, statistical calculations, performance metrics,
academic risk detection, and report generation for student records.
"""

import csv
import json
import os
from typing import Any, Dict, List


class StudentAnalyzer:
    DEPARTMENT_SUBJECTS = {
        "Computer Science & Engineering": [
            "Data Structures & Algorithms",
            "Computer Architecture",
            "Operating Systems",
            "Database Management Systems",
            "Software Engineering",
            "Artificial Intelligence",
            "Data Structures Lab",
            "Object-Oriented Programming Lab",
            "DBMS Lab",
            "Operating Systems Lab",
        ],
        "Information Technology": [
            "Discrete Mathematics",
            "Web Technologies",
            "Computer Networks",
            "Cloud Computing",
            "Database Management Systems",
            "Software Engineering",
            "Web Technologies Lab",
            "Computer Networks Lab",
            "Cloud Computing Lab",
            "IT Project Lab",
        ],
        "Data Science": [
            "Probability and Statistics",
            "Linear Algebra",
            "Programming for Data Science",
            "Data Structures for Data Science",
            "Data Management Systems",
            "Data Visualization",
            "Machine Learning",
            "Data Mining",
            "Big Data Analytics",
            "Data Science Project",
        ],
        "Electronics & Communication Engineering": [
            "Electronic Circuits",
            "Digital Logic Design",
            "VLSI Design",
            "Signal Processing",
            "Communication Systems",
            "Microprocessors & Microcontrollers",
            "Electronic Devices Lab",
            "Digital Signal Processing Lab",
            "Communication Lab",
            "VLSI Lab",
        ],
        "Electrical & Electronics Engineering": [
            "Electric Circuits",
            "Electrical Machines",
            "Power Electronics",
            "Control Systems",
            "Power Systems",
            "Electrical Measurements",
            "Electrical Machines Lab",
            "Power Electronics Lab",
            "Simulation Lab",
            "Measurements Lab",
        ],
        "Civil Engineering": [
            "Mechanics of Solids",
            "Structural Analysis",
            "Environmental Engineering",
            "Surveying",
            "Construction Materials",
            "Geotechnical Engineering",
            "Surveying Lab",
            "Materials Testing Lab",
            "Hydraulics Lab",
            "Concrete Lab",
        ],
        "Mechanical Engineering": [
            "Thermodynamics",
            "Engineering Mechanics",
            "Machine Dynamics",
            "Manufacturing Technology",
            "CAD/CAM",
            "Fluid Mechanics",
            "Thermal Engineering Lab",
            "Manufacturing Lab",
            "CAD Lab",
            "Design Lab",
        ],
        "Chemical Engineering": [
            "Process Calculations",
            "Chemical Engineering Thermodynamics",
            "Mass Transfer",
            "Heat Transfer",
            "Chemical Reaction Engineering",
            "Fluid Mechanics",
            "Process Equipment Lab",
            "Chemical Engineering Lab",
            "Heat Transfer Lab",
            "Mass Transfer Lab",
        ],
        "Biotechnology": [
            "Cell Biology",
            "Biochemistry",
            "Molecular Biology",
            "Microbiology",
            "Bioprocess Engineering",
            "Genetic Engineering",
            "Cell Biology Lab",
            "Biochemistry Lab",
            "Microbiology Lab",
            "Bioprocess Lab",
        ],
        "Master of Business Administration": [
            "Principles of Management",
            "Financial Accounting",
            "Marketing Management",
            "Human Resource Management",
            "Strategic Management",
            "Business Analytics",
            "Operations Management",
            "Internship",
            "Business Project",
            "Leadership Lab",
        ],
    }

    DEPARTMENT_ALIASES = {
        "cse": "Computer Science & Engineering",
        "computer science & engineering": "Computer Science & Engineering",
        "computer science": "Computer Science & Engineering",
        "cs": "Computer Science & Engineering",
        "it": "Information Technology",
        "information technology": "Information Technology",
        "data science": "Data Science",
        "ece": "Electronics & Communication Engineering",
        "electronics & communication engineering": "Electronics & Communication Engineering",
        "electronics": "Electronics & Communication Engineering",
        "eee": "Electrical & Electronics Engineering",
        "electrical & electronics engineering": "Electrical & Electronics Engineering",
        "electrical engineering": "Electrical & Electronics Engineering",
        "civil": "Civil Engineering",
        "civil engineering": "Civil Engineering",
        "mech": "Mechanical Engineering",
        "mechanical engineering": "Mechanical Engineering",
        "chemical": "Chemical Engineering",
        "chemical engineering": "Chemical Engineering",
        "biotech": "Biotechnology",
        "biotechnology": "Biotechnology",
        "mba": "Master of Business Administration",
        "master of business administration": "Master of Business Administration",
    }

    @classmethod
    def normalize_department_name(cls, department: str) -> str:
        if not department:
            return "Computer Science & Engineering"
        normalized = str(department).strip()
        lookup = normalized.lower()
        return cls.DEPARTMENT_ALIASES.get(lookup, normalized)

    @classmethod
    def get_department_subjects(cls, department: str) -> List[str]:
        canonical = cls.normalize_department_name(department)
        return list(cls.DEPARTMENT_SUBJECTS.get(canonical, cls.DEPARTMENT_SUBJECTS["Computer Science & Engineering"]))

    def __init__(self, data_filepath: str = "students_data.json"):
        self.data_filepath = data_filepath
        self.students = self.load_data()

    def load_data(self) -> List[Dict[str, Any]]:
        """Load student records from JSON file."""
        if not os.path.exists(self.data_filepath):
            print(f"[Warning] File '{self.data_filepath}' not found. Returning empty list.")
            return []
        try:
            with open(self.data_filepath, "r", encoding="utf-8") as f:
                data = json.load(f)
            return [self.normalize_student_record(student) for student in data]
        except Exception as e:
            print(f"[Error] Failed to read student data: {e}")
            return []

    def save_data(self) -> bool:
        """Save updated student records back to JSON file."""
        try:
            with open(self.data_filepath, "w", encoding="utf-8") as f:
                json.dump(self.students, f, indent=2)
            return True
        except Exception as e:
            print(f"[Error] Failed to save student data: {e}")
            return False

    @classmethod
    def normalize_student_record(cls, student: Dict[str, Any]) -> Dict[str, Any]:
        if not student:
            return {}

        normalized = dict(student)
        student_id = str(normalized.get("id") or "STU000")
        department = cls.normalize_department_name(normalized.get("department") or "Computer Science & Engineering")
        normalized["department"] = department
        normalized["department_subjects"] = cls.get_department_subjects(department)
        attendance = normalized.get("attendance")
        try:
            normalized["attendance"] = float(85.0 if attendance is None or attendance == "" else attendance)
        except (TypeError, ValueError):
            normalized["attendance"] = 85.0

        grade_level = str(normalized.get("grade_level") or "").strip()
        grade_years = {"freshman": 1, "sophomore": 2, "junior": 3, "senior": 4}
        try:
            year = int(normalized.get("year"))
        except (TypeError, ValueError):
            year = grade_years.get(grade_level.lower())
        normalized["year"] = year if year and 1 <= year <= 6 else None
        normalized["academic_year"] = str(normalized.get("academic_year") or "").strip() or None
        try:
            semester = int(normalized.get("semester"))
        except (TypeError, ValueError):
            semester = None
        normalized["semester"] = semester if semester and 1 <= semester <= 12 else None
        normalized["section"] = str(normalized.get("section") or "").strip().upper() or None

        existing_scores = normalized.get("scores") or {}
        if not isinstance(existing_scores, dict):
            existing_scores = {}

        recorded_scores = {}
        for key, value in existing_scores.items():
            try:
                score = float(value)
            except (TypeError, ValueError):
                continue
            if str(key).strip() and 0 <= score <= 100:
                recorded_scores[str(key).strip()] = score

        normalized["scores"] = recorded_scores
        try:
            stored_gpa = float(normalized.get("gpa") or 0.0)
        except (TypeError, ValueError):
            stored_gpa = 0.0
        normalized["gpa"] = cls.calculate_gpa(recorded_scores) if recorded_scores else stored_gpa
        normalized["cgpa"] = normalized["gpa"]
        normalized["status"] = cls.determine_status(normalized["gpa"], normalized["attendance"])
        normalized["qr_code"] = ""
        normalized["qr_code_data"] = normalized["qr_code"]
        normalized["profile_url"] = f"/student-verify.html?id={student_id}"
        return normalized

    @staticmethod
    def calculate_cgpa(scores: Dict[str, float], credit_points: Dict[str, float] = None) -> float:
        """Calculate CGPA on a 10-point scale using subject marks and credit points."""
        if not scores:
            return 0.0

        numeric_scores = {}
        for subject, score in scores.items():
            try:
                numeric_scores[str(subject)] = float(score)
            except (TypeError, ValueError):
                continue

        if not numeric_scores:
            return 0.0

        credit_map = credit_points or {}
        total_weight = 0.0
        total_credits = 0.0

        for subject, score in numeric_scores.items():
            credits = float(credit_map.get(subject, 3.0) or 3.0)
            total_weight += (score / 10.0) * credits
            total_credits += credits

        if total_credits == 0:
            return round(sum(value / 10.0 for value in numeric_scores.values()) / len(numeric_scores), 2)
        return round(total_weight / total_credits, 2)

    @staticmethod
    def calculate_gpa(scores: Dict[str, float]) -> float:
        """Backward-compatible CGPA function for the 10-point scale."""
        return StudentAnalyzer.calculate_cgpa(scores)

    @staticmethod
    def determine_status(gpa: float, attendance: float) -> str:
        """Determine academic standing status based on 10-point CGPA and attendance."""
        if gpa < 5.0 or attendance < 75.0:
            return "At-Risk"
        elif gpa >= 8.5 and attendance >= 90.0:
            return "Honor Roll"
        else:
            return "Good Standing"

    def get_kpis(self) -> Dict[str, Any]:
        """Compute key performance indicators (KPIs) across all students."""
        if not self.students:
            return {
                "total_students": 0,
                "avg_gpa": 0.0,
                "avg_attendance": 0.0,
                "at_risk_count": 0,
                "honor_roll_count": 0,
                "good_standing_count": 0,
            }

        total = len(self.students)
        gpas = [s.get("gpa", 0.0) for s in self.students]
        attendances = [s.get("attendance", 0.0) for s in self.students]
        statuses = [s.get("status", self.determine_status(s.get("gpa", 0.0), s.get("attendance", 0.0))) for s in self.students]

        return {
            "total_students": total,
            "avg_gpa": round(sum(gpas) / total, 2),
            "avg_attendance": round(sum(attendances) / total, 1),
            "at_risk_count": statuses.count("At-Risk"),
            "honor_roll_count": statuses.count("Honor Roll"),
            "good_standing_count": statuses.count("Good Standing"),
        }

    def get_subject_averages(self) -> Dict[str, float]:
        """Compute mean score per subject across all students."""
        subject_totals = {}
        subject_counts = {}

        for student in self.students:
            scores = student.get("scores", {})
            for subject, score in scores.items():
                subject_totals[subject] = subject_totals.get(subject, 0.0) + float(score)
                subject_counts[subject] = subject_counts.get(subject, 0) + 1

        averages = {}
        for subject, total in subject_totals.items():
            count = subject_counts[subject]
            averages[subject] = round(total / count, 1)

        return averages

    def get_department_analysis(self) -> Dict[str, Dict[str, Any]]:
        """Compute department-wise metrics (student count, average GPA, average attendance)."""
        dept_data = {}

        for student in self.students:
            dept = student.get("department", "Unassigned")
            if dept not in dept_data:
                dept_data[dept] = {"students": [], "gpas": [], "attendances": []}

            dept_data[dept]["students"].append(student)
            dept_data[dept]["gpas"].append(student.get("gpa", 0.0))
            dept_data[dept]["attendances"].append(student.get("attendance", 0.0))

        result = {}
        for dept, data in dept_data.items():
            count = len(data["students"])
            avg_gpa = round(sum(data["gpas"]) / count, 2)
            avg_att = round(sum(data["attendances"]) / count, 1)
            result[dept] = {
                "student_count": count,
                "avg_gpa": avg_gpa,
                "avg_attendance": avg_att,
            }

        return result

    def get_at_risk_students(self) -> List[Dict[str, Any]]:
        """Identify students flagged as At-Risk with reason analysis."""
        at_risk = []
        for s in self.students:
            gpa = s.get("gpa", 0.0)
            attendance = s.get("attendance", 0.0)
            reasons = []
            if gpa < 5.0:
                reasons.append(f"Low CGPA ({gpa:.2f} / 10.00)")
            if attendance < 75.0:
                reasons.append(f"Low Attendance ({attendance:.1f}%)")

            if reasons or s.get("status") == "At-Risk":
                item = s.copy()
                item["risk_reasons"] = reasons if reasons else ["Academic Performance Warning"]
                at_risk.append(item)

        return at_risk

    def export_csv_report(self, output_filepath: str = "student_summary_report.csv") -> bool:
        """Export comprehensive student report to a CSV file."""
        if not self.students:
            return False

        try:
            fieldnames = ["id", "name", "email", "department", "grade_level", "attendance", "gpa", "status"]
            with open(output_filepath, "w", newline="", encoding="utf-8") as csvfile:
                writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
                writer.writeheader()
                for student in self.students:
                    row = {k: student.get(k, "") for k in fieldnames}
                    writer.writerow(row)
            print(f"[Success] CSV report exported to '{output_filepath}'.")
            return True
        except Exception as e:
            print(f"[Error] Failed to export CSV: {e}")
            return False


def print_cli_dashboard(analyzer: StudentAnalyzer):
    """Print an aesthetic ASCII console dashboard report."""
    kpis = analyzer.get_kpis()
    subject_avgs = analyzer.get_subject_averages()
    dept_analysis = analyzer.get_department_analysis()
    at_risk = analyzer.get_at_risk_students()

    print("==================================================================")
    print("      STUDENT MANAGEMENT & ANALYSIS SYSTEM - SUMMARY REPORT       ")
    print("==================================================================")
    print(f" Total Students      : {kpis['total_students']}")
    print(f" Class Average CGPA  : {kpis['avg_gpa']} / 10.00")
    print(f" Overall Attendance  : {kpis['avg_attendance']}%")
    print(f" Status Breakdown    : Honor Roll: {kpis['honor_roll_count']} | Good Standing: {kpis['good_standing_count']} | At-Risk: {kpis['at_risk_count']}")
    print("------------------------------------------------------------------")

    print("\n[Subject Performance Averages]")
    for subj, avg in subject_avgs.items():
        bar = "#" * int(avg // 5)
        print(f"  {subj:<25}: {avg:5.1f}%  | {bar}")

    print("\n[Department Metrics Breakdown]")
    print(f"  {'Department':<26} | {'Count':<6} | {'Avg CGPA':<8} | {'Avg Attnd %':<10}")
    print("  " + "-" * 60)
    for dept, metrics in dept_analysis.items():
        print(f"  {dept:<26} | {metrics['student_count']:<6} | {metrics['avg_gpa']:<8} | {metrics['avg_attendance']:<10}%")

    if at_risk:
        print("\n[AT-RISK STUDENTS WARNING]")
        for student in at_risk:
            reasons = ", ".join(student.get("risk_reasons", []))
            print(f"  [RISK] [{student['id']}] {student['name']} ({student['department']}) -> Reasons: {reasons}")
    print("==================================================================\n")


if __name__ == "__main__":
    analyzer = StudentAnalyzer()
    print_cli_dashboard(analyzer)
    analyzer.export_csv_report()
