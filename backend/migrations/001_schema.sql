-- ============================================================
-- Online Examination System - Complete Database Schema
-- PostgreSQL 14+
-- ============================================================

-- Drop existing tables if re-running
DROP TABLE IF EXISTS system_settings CASCADE;
DROP TABLE IF EXISTS token_blacklist CASCADE;
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS notification_preferences CASCADE;
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS tab_switch_logs CASCADE;
DROP TABLE IF EXISTS submission_answers CASCADE;
DROP TABLE IF EXISTS exam_submissions CASCADE;
DROP TABLE IF EXISTS exam_enrollments CASCADE;
DROP TABLE IF EXISTS exam_random_criteria CASCADE;
DROP TABLE IF EXISTS exam_questions CASCADE;
DROP TABLE IF EXISTS exams CASCADE;
DROP TABLE IF EXISTS grade_scale_ranges CASCADE;
DROP TABLE IF EXISTS grade_scales CASCADE;
DROP TABLE IF EXISTS question_options CASCADE;
DROP TABLE IF EXISTS questions CASCADE;
DROP TABLE IF EXISTS topics CASCADE;
DROP TABLE IF EXISTS subjects CASCADE;
DROP TABLE IF EXISTS users CASCADE;

DROP TYPE IF EXISTS user_role CASCADE;
DROP TYPE IF EXISTS user_status CASCADE;
DROP TYPE IF EXISTS question_type CASCADE;
DROP TYPE IF EXISTS difficulty_level CASCADE;
DROP TYPE IF EXISTS exam_status CASCADE;
DROP TYPE IF EXISTS submission_status CASCADE;
DROP TYPE IF EXISTS notification_type CASCADE;
DROP TYPE IF EXISTS answer_status CASCADE;

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- ENUMS
-- ============================================================
CREATE TYPE user_role AS ENUM ('student', 'examiner', 'administrator');
CREATE TYPE user_status AS ENUM ('active', 'inactive', 'locked', 'pending_verification');
CREATE TYPE question_type AS ENUM ('mcq', 'true_false', 'short_answer');
CREATE TYPE difficulty_level AS ENUM ('easy', 'medium', 'hard');
CREATE TYPE exam_status AS ENUM ('draft', 'scheduled', 'active', 'completed', 'cancelled');
CREATE TYPE submission_status AS ENUM ('in_progress', 'submitted', 'auto_submitted', 'flagged');
CREATE TYPE notification_type AS ENUM ('exam_scheduled', 'exam_reminder', 'exam_submitted', 'result_published', 'account_locked', 'broadcast', 'individual');
CREATE TYPE answer_status AS ENUM ('unanswered', 'answered', 'flagged', 'review');

-- ============================================================
-- USERS
-- ============================================================
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role user_role NOT NULL DEFAULT 'student',
    status user_status NOT NULL DEFAULT 'pending_verification',
    full_name VARCHAR(255) NOT NULL,
    enrollment_number VARCHAR(100) UNIQUE,
    department VARCHAR(255),
    contact VARCHAR(20),
    batch VARCHAR(50),
    profile_image VARCHAR(500),
    email_verified BOOLEAN DEFAULT FALSE,
    verification_token VARCHAR(255),
    verification_token_expires TIMESTAMPTZ,
    reset_password_token VARCHAR(255),
    reset_password_expires TIMESTAMPTZ,
    failed_login_attempts INT DEFAULT 0,
    locked_until TIMESTAMPTZ,
    last_login TIMESTAMPTZ,
    last_active TIMESTAMPTZ,
    theme_preference VARCHAR(10) DEFAULT 'light',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- SUBJECTS & TOPICS
-- ============================================================
CREATE TABLE subjects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50) UNIQUE NOT NULL,
    department VARCHAR(255),
    description TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE topics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(name, subject_id)
);

-- ============================================================
-- QUESTION BANK
-- ============================================================
CREATE TABLE questions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    question_text TEXT NOT NULL,
    question_type question_type NOT NULL,
    difficulty difficulty_level NOT NULL DEFAULT 'medium',
    subject_id UUID NOT NULL REFERENCES subjects(id),
    topic_id UUID REFERENCES topics(id),
    marks DECIMAL(5,2) NOT NULL DEFAULT 1.0,
    negative_marks DECIMAL(5,2) DEFAULT 0.0,
    explanation TEXT,
    image_url VARCHAR(500),
    correct_answer TEXT NOT NULL,
    model_answer TEXT,
    tags VARCHAR(500),
    created_by UUID NOT NULL REFERENCES users(id),
    is_active BOOLEAN DEFAULT TRUE,
    usage_count INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE question_options (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    option_text TEXT NOT NULL,
    option_key VARCHAR(5) NOT NULL,
    is_correct BOOLEAN DEFAULT FALSE,
    display_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- GRADE SCALES
-- ============================================================
CREATE TABLE grade_scales (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    created_by UUID NOT NULL REFERENCES users(id),
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE grade_scale_ranges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    scale_id UUID NOT NULL REFERENCES grade_scales(id) ON DELETE CASCADE,
    grade_label VARCHAR(10) NOT NULL,
    min_percentage DECIMAL(5,2) NOT NULL,
    max_percentage DECIMAL(5,2) NOT NULL,
    description VARCHAR(100),
    CONSTRAINT no_overlap CHECK (min_percentage < max_percentage),
    CONSTRAINT valid_percentage CHECK (min_percentage >= 0 AND max_percentage <= 100)
);

-- ============================================================
-- EXAMS
-- ============================================================
CREATE TABLE exams (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(500) NOT NULL,
    subject_id UUID NOT NULL REFERENCES subjects(id),
    description TEXT,
    instructions TEXT,
    start_datetime TIMESTAMPTZ NOT NULL,
    end_datetime TIMESTAMPTZ NOT NULL,
    duration_minutes INT NOT NULL,
    total_marks DECIMAL(8,2) NOT NULL,
    pass_marks DECIMAL(8,2) NOT NULL,
    status exam_status NOT NULL DEFAULT 'draft',
    created_by UUID NOT NULL REFERENCES users(id),
    grade_scale_id UUID REFERENCES grade_scales(id),
    allow_navigation BOOLEAN DEFAULT TRUE,
    shuffle_questions BOOLEAN DEFAULT FALSE,
    shuffle_options BOOLEAN DEFAULT FALSE,
    unique_question_set BOOLEAN DEFAULT FALSE,
    show_result_immediately BOOLEAN DEFAULT FALSE,
    negative_marking BOOLEAN DEFAULT FALSE,
    negative_marks_factor DECIMAL(4,2) DEFAULT 0.25,
    max_tab_switches INT DEFAULT 3,
    question_selection_type VARCHAR(20) DEFAULT 'manual',
    target_batch VARCHAR(50),
    target_all_students BOOLEAN DEFAULT TRUE,
    is_published BOOLEAN DEFAULT FALSE,
    result_published BOOLEAN DEFAULT FALSE,
    result_published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT valid_dates CHECK (end_datetime > start_datetime),
    CONSTRAINT valid_marks CHECK (pass_marks <= total_marks)
);

CREATE TABLE exam_questions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES questions(id),
    display_order INT NOT NULL DEFAULT 0,
    marks_override DECIMAL(5,2),
    UNIQUE(exam_id, question_id)
);

CREATE TABLE exam_random_criteria (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
    difficulty difficulty_level NOT NULL,
    count INT NOT NULL,
    subject_id UUID REFERENCES subjects(id),
    topic_id UUID REFERENCES topics(id)
);

CREATE TABLE exam_enrollments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),
    enrolled_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(exam_id, user_id)
);

-- ============================================================
-- EXAM SUBMISSIONS
-- ============================================================
CREATE TABLE exam_submissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    exam_id UUID NOT NULL REFERENCES exams(id),
    user_id UUID NOT NULL REFERENCES users(id),
    status submission_status NOT NULL DEFAULT 'in_progress',
    started_at TIMESTAMPTZ DEFAULT NOW(),
    submitted_at TIMESTAMPTZ,
    ip_address VARCHAR(45),
    user_agent TEXT,
    tab_switch_count INT DEFAULT 0,
    is_flagged BOOLEAN DEFAULT FALSE,
    flag_reason TEXT,
    total_score DECIMAL(8,2),
    percentage DECIMAL(5,2),
    grade VARCHAR(10),
    is_passed BOOLEAN,
    time_taken_seconds INT,
    token VARCHAR(255) UNIQUE,
    token_expires TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(exam_id, user_id)
);

CREATE TABLE submission_answers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    submission_id UUID NOT NULL REFERENCES exam_submissions(id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES questions(id),
    answer_text TEXT,
    selected_option VARCHAR(5),
    status answer_status DEFAULT 'unanswered',
    is_correct BOOLEAN,
    marks_obtained DECIMAL(5,2) DEFAULT 0,
    is_auto_graded BOOLEAN DEFAULT FALSE,
    reviewed_by UUID REFERENCES users(id),
    reviewed_at TIMESTAMPTZ,
    review_notes TEXT,
    time_spent_seconds INT DEFAULT 0,
    saved_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(submission_id, question_id)
);

-- ============================================================
-- TAB SWITCH LOGS
-- ============================================================
CREATE TABLE tab_switch_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    submission_id UUID NOT NULL REFERENCES exam_submissions(id) ON DELETE CASCADE,
    switched_at TIMESTAMPTZ DEFAULT NOW(),
    ip_address VARCHAR(45),
    switch_count INT
);

-- ============================================================
-- NOTIFICATIONS
-- ============================================================
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    recipient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    sender_id UUID REFERENCES users(id),
    type notification_type NOT NULL,
    title VARCHAR(500) NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMPTZ,
    related_exam_id UUID REFERENCES exams(id),
    email_sent BOOLEAN DEFAULT FALSE,
    email_sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE notification_preferences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
    exam_scheduled BOOLEAN DEFAULT TRUE,
    exam_reminder BOOLEAN DEFAULT TRUE,
    exam_submitted BOOLEAN DEFAULT TRUE,
    result_published BOOLEAN DEFAULT TRUE,
    account_locked BOOLEAN DEFAULT TRUE,
    broadcast BOOLEAN DEFAULT TRUE,
    individual BOOLEAN DEFAULT TRUE,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- AUDIT LOG
-- ============================================================
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    action VARCHAR(255) NOT NULL,
    entity_type VARCHAR(100),
    entity_id UUID,
    old_values JSONB,
    new_values JSONB,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- SESSION BLACKLIST (for JWT invalidation)
-- ============================================================
CREATE TABLE token_blacklist (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    token_hash VARCHAR(255) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    blacklisted_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- SYSTEM SETTINGS
-- ============================================================
CREATE TABLE system_settings (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT,
    updated_by UUID REFERENCES users(id),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_enrollment ON users(enrollment_number);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_batch ON users(batch);
CREATE INDEX idx_questions_subject ON questions(subject_id);
CREATE INDEX idx_questions_topic ON questions(topic_id);
CREATE INDEX idx_questions_type ON questions(question_type);
CREATE INDEX idx_questions_difficulty ON questions(difficulty);
CREATE INDEX idx_questions_created_by ON questions(created_by);
CREATE INDEX idx_exams_status ON exams(status);
CREATE INDEX idx_exams_start ON exams(start_datetime);
CREATE INDEX idx_exams_created_by ON exams(created_by);
CREATE INDEX idx_exam_questions_exam ON exam_questions(exam_id);
CREATE INDEX idx_submissions_exam ON exam_submissions(exam_id);
CREATE INDEX idx_submissions_user ON exam_submissions(user_id);
CREATE INDEX idx_submissions_status ON exam_submissions(status);
CREATE INDEX idx_answers_submission ON submission_answers(submission_id);
CREATE INDEX idx_notifications_recipient ON notifications(recipient_id);
CREATE INDEX idx_notifications_read ON notifications(is_read);
CREATE INDEX idx_audit_user ON audit_logs(user_id);
CREATE INDEX idx_audit_action ON audit_logs(action);
CREATE INDEX idx_audit_created ON audit_logs(created_at);

-- ============================================================
-- TRIGGERS
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_users_updated BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_subjects_updated BEFORE UPDATE ON subjects FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_questions_updated BEFORE UPDATE ON questions FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_exams_updated BEFORE UPDATE ON exams FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_submissions_updated BEFORE UPDATE ON exam_submissions FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- DEFAULT SYSTEM SETTINGS
-- ============================================================
INSERT INTO system_settings (key, value, description) VALUES
('site_name', 'Online Examination System', 'Application name'),
('site_tagline', 'Secure Digital Examinations', 'Application tagline'),
('max_file_size_mb', '5', 'Maximum upload file size in MB'),
('session_timeout_min', '30', 'Inactive session timeout in minutes'),
('exam_session_buffer_min', '30', 'Extra minutes after exam ends for session'),
('max_tab_switches', '3', 'Max tab switches before auto-submit'),
('maintenance_mode', 'false', 'Enable maintenance mode'),
('registration_open', 'true', 'Allow new student registrations'),
('version', '1.0.0', 'System version');
