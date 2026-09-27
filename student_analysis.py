"""
Student Management Analysis System - Python Analytics Engine & Standalone CLI
=============================================================================
This module provides data analysis, statistical calculations, performance metrics,
academic risk detection, and report generation for student records.
"""

import json
import os
import csv
from typing import List, Dict, Any, Tuple


class StudentAnalyzer:
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
                return json.load(f)
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

    @staticmethod
    def calculate_gpa(scores: Dict[str, float]) -> float:
        """Calculate CGPA on a 4.0 scale from subject percentage scores."""
        if not scores:
            return 0.0
        
        # Standard grading scale conversion
        gpa_points = []
        for score in scores.values():
            if score >= 90:
                pts = 4.0
            elif score >= 80:
                pts = 3.0 + (score - 80) * 0.09
            elif score >= 70:
                pts = 2.0 + (score - 70) * 0.09
            elif score >= 60:
                pts = 1.0 + (score - 60) * 0.09
            else:
                pts = max(0.0, (score / 60.0))
            gpa_points.append(pts)
            
        avg_gpa = sum(gpa_points) / len(gpa_points)
        return round(avg_gpa, 2)

    @staticmethod
    def determine_status(gpa: float, attendance: float) -> str:
        """Determine academic standing status based on CGPA and attendance."""
        if gpa < 2.5 or attendance < 75.0:
            return "At-Risk"
        elif gpa >= 3.75 and attendance >= 90.0:
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
                "good_standing_count": 0
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
            "good_standing_count": statuses.count("Good Standing")
        }

    def get_subject_averages(self) -> Dict[str, float]:
        """Compute mean score per subject across all students."""
        subject_totals = {}
        subject_counts = {}

        for student in self.students:
            scores = student.get("scores", {})
            for subject, score in scores.items():
                subject_totals[subject] = subject_totals.get(subject, 0.0) + score
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
                "avg_attendance": avg_att
            }

        return result

    def get_at_risk_students(self) -> List[Dict[str, Any]]:
        """Identify students flagged as At-Risk with reason analysis."""
        at_risk = []
        for s in self.students:
            gpa = s.get("gpa", 0.0)
            attendance = s.get("attendance", 0.0)
            reasons = []
            if gpa < 2.5:
                reasons.append(f"Low CGPA ({gpa})")
            if attendance < 75.0:
                reasons.append(f"Low Attendance ({attendance}%)")
            
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
    print(f" Class Average CGPA  : {kpis['avg_gpa']} / 4.0")
    print(f" Overall Attendance  : {kpis['avg_attendance']}%")
    print(f" Status Breakdown    : Honor Roll: {kpis['honor_roll_count']} | Good Standing: {kpis['good_standing_count']} | At-Risk: {kpis['at_risk_count']}")
    print("------------------------------------------------------------------")
    
    print("\n[Subject Performance Averages]")
    for subj, avg in subject_avgs.items():
        bar = "#" * int(avg // 5)
        print(f"  {subj:<20}: {avg:5.1f}%  | {bar}")

    print("\n[Department Metrics Breakdown]")
    print(f"  {'Department':<24} | {'Count':<6} | {'Avg GPA':<8} | {'Avg Attnd %':<10}")
    print("  " + "-" * 56)
    for dept, metrics in dept_analysis.items():
        print(f"  {dept:<24} | {metrics['student_count']:<6} | {metrics['avg_gpa']:<8} | {metrics['avg_attendance']:<10}%")

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
