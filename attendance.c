#include <ctype.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdarg.h>

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#else
#define EMSCRIPTEN_KEEPALIVE
#endif

#define MAX_STUDENTS 200
#define MAX_RECORDS 10000
#define NAME_LENGTH 50
#define DATE_LENGTH 11
#define DATA_FILE "students.dat"
#define JSON_BUFFER_SIZE 1048576 

struct Student {
    int regNo;
    char name[50];
    int totalClasses;
    int attendedClasses;
};

typedef struct AttendanceRecord {
    int regNo;
    char date[DATE_LENGTH];
    char status;
} AttendanceRecord;

static struct Student students[MAX_STUDENTS];
static AttendanceRecord attendanceRecords[MAX_RECORDS];
static int studentCount = 0;
static int attendanceCount = 0;
static char jsonBuffer[JSON_BUFFER_SIZE];

enum ResultCode {
    RESULT_OK = 0,
    RESULT_UPDATED = 1,
    ERR_MAX_STUDENTS = -1,
    ERR_DUPLICATE_REGNO = -2,
    ERR_INVALID_NAME = -3,
    ERR_STUDENT_NOT_FOUND = -4,
    ERR_INVALID_DATE = -5,
    ERR_INVALID_STATUS = -6,
    ERR_RECORD_LIMIT = -7,
    ERR_INVALID_REGNO = -8
};

// Internal Logic
static int findStudentIndex(int regNo) {
    for (int i = 0; i < studentCount; i++) {
        if (students[i].regNo == regNo) return i;
    }
    return -1;
}

static int findAttendanceIndex(int regNo, const char *date) {
    for (int i = 0; i < attendanceCount; i++) {
        if (attendanceRecords[i].regNo == regNo && strcmp(attendanceRecords[i].date, date) == 0) return i;
    }
    return -1;
}

// === CURRENT ATTENDANCE LOGIC ===
static double getPercentage(int index) {
    if (index < 0 || index >= studentCount || students[index].totalClasses == 0) return 0.0;
    return ((double)students[index].attendedClasses * 100.0) / (double)students[index].totalClasses;
}

static int getShortageCount(void) {
    int count = 0;
    for (int i = 0; i < studentCount; i++) {
        if (getPercentage(i) < 75.0 && students[i].totalClasses > 0) count++;
    }
    return count;
}

static double getClassAverage(void) {
    if (studentCount == 0) return 0.0;
    double total = 0.0;
    for (int i = 0; i < studentCount; i++) total += getPercentage(i);
    return total / (double)studentCount;
}

static void rebuildAttendanceTotals(void) {
    for (int i = 0; i < studentCount; i++) {
        students[i].totalClasses = 0;
        students[i].attendedClasses = 0;
    }
    for (int i = 0; i < attendanceCount; i++) {
        int idx = findStudentIndex(attendanceRecords[i].regNo);
        if (idx >= 0) {
            students[idx].totalClasses++;
            if (attendanceRecords[i].status == 'P') students[idx].attendedClasses++;
        }
    }
}

// Persistence
void saveToFile() {
    FILE *file = fopen(DATA_FILE, "wb");
    if (!file) return;
    fwrite(&studentCount, sizeof(int), 1, file);
    fwrite(&attendanceCount, sizeof(int), 1, file);
    fwrite(students, sizeof(struct Student), (size_t)studentCount, file);
    fwrite(attendanceRecords, sizeof(AttendanceRecord), (size_t)attendanceCount, file);
    fclose(file);
}

void loadFromFile() {
    FILE *file = fopen(DATA_FILE, "rb");
    if (!file) return;
    
    int tempStudentCount = 0;
    int tempAttendanceCount = 0;

    if (fread(&tempStudentCount, sizeof(int), 1, file) != 1 ||
        fread(&tempAttendanceCount, sizeof(int), 1, file) != 1) {
        fclose(file);
        return;
    }

    studentCount = tempStudentCount;
    attendanceCount = tempAttendanceCount;

    if (studentCount > 0) fread(students, sizeof(struct Student), (size_t)studentCount, file);
    if (attendanceCount > 0) fread(attendanceRecords, sizeof(AttendanceRecord), (size_t)attendanceCount, file);
    
    fclose(file);
    rebuildAttendanceTotals();
}

// WASM API
EMSCRIPTEN_KEEPALIVE int wasmAddStudent(int regNo, const char *name) {
    if (regNo <= 0 || strlen(name) == 0 || studentCount >= MAX_STUDENTS || findStudentIndex(regNo) >= 0) return -2;
    students[studentCount].regNo = regNo;
    strncpy(students[studentCount].name, name, NAME_LENGTH - 1);
    students[studentCount].name[NAME_LENGTH - 1] = '\0';
    students[studentCount].totalClasses = 0;
    students[studentCount].attendedClasses = 0;
    studentCount++;
    saveToFile();
    return 0;
}

EMSCRIPTEN_KEEPALIVE int wasmMarkAttendance(int regNo, const char *date, const char *status) {
    int sIdx = findStudentIndex(regNo);
    if (sIdx < 0) return -4;
    char s = (char)toupper((unsigned char)status[0]);
    int aIdx = findAttendanceIndex(regNo, date);
    if (aIdx >= 0) {
        attendanceRecords[aIdx].status = s;
    } else {
        if (attendanceCount >= MAX_RECORDS) return -7;
        attendanceRecords[attendanceCount].regNo = regNo;
        strncpy(attendanceRecords[attendanceCount].date, date, DATE_LENGTH - 1);
        attendanceRecords[attendanceCount].date[DATE_LENGTH - 1] = '\0';
        attendanceRecords[attendanceCount].status = s;
        attendanceCount++;
    }
    rebuildAttendanceTotals();
    saveToFile();
    return 0;
}

EMSCRIPTEN_KEEPALIVE int wasmDeleteStudent(int regNo) {
    int idx = findStudentIndex(regNo);
    if (idx < 0) return -4; // Not found

    // 1. Shift students array left
    for (int i = idx; i < studentCount - 1; i++) {
        students[i] = students[i + 1];
    }
    studentCount--;

    // 2. Remove their records
    for (int i = 0; i < attendanceCount; ) {
        if (attendanceRecords[i].regNo == regNo) {
            for (int j = i; j < attendanceCount - 1; j++) {
                attendanceRecords[j] = attendanceRecords[j + 1];
            }
            attendanceCount--;
        } else {
            i++;
        }
    }

    rebuildAttendanceTotals();
    saveToFile();
    return 0;
}

EMSCRIPTEN_KEEPALIVE int wasmDeleteRecord(int regNo, const char* date) {
    int idx = findAttendanceIndex(regNo, date);
    if (idx < 0) return -7; // Not found or similar error code

    // Shift records left
    for (int i = idx; i < attendanceCount - 1; i++) {
        attendanceRecords[i] = attendanceRecords[i + 1];
    }
    attendanceCount--;

    rebuildAttendanceTotals();
    saveToFile();
    return 0;
}

EMSCRIPTEN_KEEPALIVE int wasmDeleteRecordsByDate(const char* date) {
    int count = 0;
    for (int i = 0; i < attendanceCount; ) {
        if (strcmp(attendanceRecords[i].date, date) == 0) {
            for (int j = i; j < attendanceCount - 1; j++) {
                attendanceRecords[j] = attendanceRecords[j + 1];
            }
            attendanceCount--;
            count++;
        } else {
            i++;
        }
    }

    if (count > 0) {
        rebuildAttendanceTotals();
        saveToFile();
    }
    return count;
}

EMSCRIPTEN_KEEPALIVE const char* wasmGetStudentsJson() {
    int offset = 0;
    offset += sprintf(jsonBuffer + offset, "[");
    for (int i = 0; i < studentCount; i++) {
        offset += sprintf(jsonBuffer + offset, "%s{\"regNo\":%d,\"name\":\"%s\",\"totalClasses\":%d,\"attendedClasses\":%d,\"percentage\":%.2f}",
                (i > 0 ? "," : ""), students[i].regNo, students[i].name, students[i].totalClasses, students[i].attendedClasses, getPercentage(i));
    }
    sprintf(jsonBuffer + offset, "]");
    return jsonBuffer;
}

EMSCRIPTEN_KEEPALIVE const char* wasmGetRecordsJson() {
    int offset = 0;
    offset += sprintf(jsonBuffer + offset, "[");
    for (int i = 0; i < attendanceCount; i++) {
        int sIdx = findStudentIndex(attendanceRecords[i].regNo);
        const char* name = (sIdx >= 0) ? students[sIdx].name : "Unknown";
        
        offset += sprintf(jsonBuffer + offset, "%s{\"regNo\":%d,\"name\":\"%s\",\"date\":\"%s\",\"status\":\"%c\"}",
                (i > 0 ? "," : ""), attendanceRecords[i].regNo, name, attendanceRecords[i].date, attendanceRecords[i].status);
    }
    sprintf(jsonBuffer + offset, "]");
    return jsonBuffer;
}

EMSCRIPTEN_KEEPALIVE const char* wasmGetSummaryJson() {
    sprintf(jsonBuffer, "{\"totalStudents\":%d,\"shortageCount\":%d,\"classAverage\":%.2f}",
            studentCount, getShortageCount(), getClassAverage());
    return jsonBuffer;
}

EMSCRIPTEN_KEEPALIVE void wasmLoadData() { loadFromFile(); }
EMSCRIPTEN_KEEPALIVE const char* wasmGetMessageForCode(int code) { return (code >= 0) ? "Success" : "Error"; }
EMSCRIPTEN_KEEPALIVE const char* wasmGetShortageJson() { return wasmGetStudentsJson(); }