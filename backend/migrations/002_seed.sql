-- ============================================================
-- Seed Data for OES
-- ============================================================

-- Admin User (password: Admin@1234)
INSERT INTO users (id, email, password_hash, role, status, full_name, email_verified) VALUES
('00000000-0000-0000-0000-000000000002',
 'admin@oes.edu',
 '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewYpR7lj5HzxYf3K',
 'administrator', 'active', 'System Administrator', TRUE);

-- Sample Examiner (password: Examiner@1234)
INSERT INTO users (id, email, password_hash, role, status, full_name, department, email_verified) VALUES
('00000000-0000-0000-0000-000000000003',
 'examiner@oes.edu',
 '$2b$12$YJkjpjt3IaFJWbUO5jXNAOHkNFOJmCJQkFQS7ZVnYz.jL4Y9Iw5Vu',
 'examiner', 'active', 'Dr. John Smith', 'Computer Science', TRUE);

-- Sample Students (password: Student@1234)
INSERT INTO users (id, email, password_hash, role, status, full_name, enrollment_number, department, batch, email_verified) VALUES
('00000000-0000-0000-0000-000000000004', 'alice@student.edu',
 '$2b$12$MaYqkqQ0qrw7Z5vVcFe8HuqDl5MKExample1234567890abcdefghijk',
 'student', 'active', 'Alice Johnson', 'ENR001', 'Computer Science', '2024-A', TRUE),
('00000000-0000-0000-0000-000000000005', 'bob@student.edu',
 '$2b$12$MaYqkqQ0qrw7Z5vVcFe8HuqDl5MKExample1234567890abcdefghijk',
 'student', 'active', 'Bob Williams', 'ENR002', 'Computer Science', '2024-A', TRUE),
('00000000-0000-0000-0000-000000000006', 'carol@student.edu',
 '$2b$12$MaYqkqQ0qrw7Z5vVcFe8HuqDl5MKExample1234567890abcdefghijk',
 'student', 'active', 'Carol Davis', 'ENR003', 'Mathematics', '2024-B', TRUE);

-- Notification preferences for all users
INSERT INTO notification_preferences (user_id) VALUES
('00000000-0000-0000-0000-000000000002'),
('00000000-0000-0000-0000-000000000003'),
('00000000-0000-0000-0000-000000000004'),
('00000000-0000-0000-0000-000000000005'),
('00000000-0000-0000-0000-000000000006');

-- Default Grade Scale
INSERT INTO grade_scales (id, name, created_by, is_default) VALUES
('00000000-0000-0000-0000-000000000001', 'Standard Grade Scale', '00000000-0000-0000-0000-000000000002', TRUE);

INSERT INTO grade_scale_ranges (scale_id, grade_label, min_percentage, max_percentage, description) VALUES
('00000000-0000-0000-0000-000000000001', 'A+', 90, 100, 'Outstanding'),
('00000000-0000-0000-0000-000000000001', 'A',  80, 89.99, 'Excellent'),
('00000000-0000-0000-0000-000000000001', 'B+', 70, 79.99, 'Very Good'),
('00000000-0000-0000-0000-000000000001', 'B',  60, 69.99, 'Good'),
('00000000-0000-0000-0000-000000000001', 'C',  50, 59.99, 'Average'),
('00000000-0000-0000-0000-000000000001', 'D',  40, 49.99, 'Below Average'),
('00000000-0000-0000-0000-000000000001', 'F',  0,  39.99, 'Fail');

-- Sample Subjects
INSERT INTO subjects (id, name, code, department, created_by) VALUES
('00000000-0000-0000-0000-000000000010', 'Data Structures & Algorithms', 'CS301', 'Computer Science', '00000000-0000-0000-0000-000000000003'),
('00000000-0000-0000-0000-000000000011', 'Database Management Systems', 'CS302', 'Computer Science', '00000000-0000-0000-0000-000000000003'),
('00000000-0000-0000-0000-000000000012', 'Operating Systems', 'CS303', 'Computer Science', '00000000-0000-0000-0000-000000000003'),
('00000000-0000-0000-0000-000000000013', 'Mathematics', 'MATH201', 'Mathematics', '00000000-0000-0000-0000-000000000002');

-- Sample Topics
INSERT INTO topics (id, name, subject_id) VALUES
('00000000-0000-0000-0000-000000000020', 'Arrays & Linked Lists', '00000000-0000-0000-0000-000000000010'),
('00000000-0000-0000-0000-000000000021', 'Trees & Graphs', '00000000-0000-0000-0000-000000000010'),
('00000000-0000-0000-0000-000000000022', 'Sorting Algorithms', '00000000-0000-0000-0000-000000000010'),
('00000000-0000-0000-0000-000000000023', 'SQL Basics', '00000000-0000-0000-0000-000000000011'),
('00000000-0000-0000-0000-000000000024', 'Normalization', '00000000-0000-0000-0000-000000000011');

-- Sample Questions - MCQ
INSERT INTO questions (id, question_text, question_type, difficulty, subject_id, topic_id, marks, correct_answer, created_by) VALUES
('00000000-0000-0000-0000-000000000030',
 'What is the time complexity of binary search?',
 'mcq', 'easy', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000020',
 1.0, 'B', '00000000-0000-0000-0000-000000000003'),
('00000000-0000-0000-0000-000000000031',
 'Which data structure uses LIFO principle?',
 'mcq', 'easy', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000020',
 1.0, 'A', '00000000-0000-0000-0000-000000000003'),
('00000000-0000-0000-0000-000000000032',
 'What does SQL stand for?',
 'mcq', 'easy', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000023',
 1.0, 'C', '00000000-0000-0000-0000-000000000003'),
('00000000-0000-0000-0000-000000000033',
 'Which sorting algorithm has O(n log n) average time complexity?',
 'mcq', 'medium', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000022',
 2.0, 'B', '00000000-0000-0000-0000-000000000003');

-- MCQ Options
INSERT INTO question_options (question_id, option_text, option_key, is_correct, display_order) VALUES
-- Q1
('00000000-0000-0000-0000-000000000030', 'O(n)', 'A', FALSE, 1),
('00000000-0000-0000-0000-000000000030', 'O(log n)', 'B', TRUE, 2),
('00000000-0000-0000-0000-000000000030', 'O(n²)', 'C', FALSE, 3),
('00000000-0000-0000-0000-000000000030', 'O(1)', 'D', FALSE, 4),
-- Q2
('00000000-0000-0000-0000-000000000031', 'Stack', 'A', TRUE, 1),
('00000000-0000-0000-0000-000000000031', 'Queue', 'B', FALSE, 2),
('00000000-0000-0000-0000-000000000031', 'Tree', 'C', FALSE, 3),
('00000000-0000-0000-0000-000000000031', 'Graph', 'D', FALSE, 4),
-- Q3
('00000000-0000-0000-0000-000000000032', 'Structured Query Letters', 'A', FALSE, 1),
('00000000-0000-0000-0000-000000000032', 'Simple Query Language', 'B', FALSE, 2),
('00000000-0000-0000-0000-000000000032', 'Structured Query Language', 'C', TRUE, 3),
('00000000-0000-0000-0000-000000000032', 'Sequential Query Language', 'D', FALSE, 4),
-- Q4
('00000000-0000-0000-0000-000000000033', 'Bubble Sort', 'A', FALSE, 1),
('00000000-0000-0000-0000-000000000033', 'Merge Sort', 'B', TRUE, 2),
('00000000-0000-0000-0000-000000000033', 'Selection Sort', 'C', FALSE, 3),
('00000000-0000-0000-0000-000000000033', 'Insertion Sort', 'D', FALSE, 4);

-- True/False Questions
INSERT INTO questions (id, question_text, question_type, difficulty, subject_id, topic_id, marks, correct_answer, created_by) VALUES
('00000000-0000-0000-0000-000000000034',
 'A binary tree can have at most 2 children per node.',
 'true_false', 'easy', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000021',
 1.0, 'true', '00000000-0000-0000-0000-000000000003'),
('00000000-0000-0000-0000-000000000035',
 'SQL is a procedural language.',
 'true_false', 'easy', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000023',
 1.0, 'false', '00000000-0000-0000-0000-000000000003');

-- Short Answer Questions
INSERT INTO questions (id, question_text, question_type, difficulty, subject_id, topic_id, marks, correct_answer, model_answer, created_by) VALUES
('00000000-0000-0000-0000-000000000036',
 'Explain the difference between a stack and a queue.',
 'short_answer', 'medium', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000020',
 5.0, 'manual_review',
 'A stack is a LIFO (Last In, First Out) data structure where elements are added and removed from the top. A queue is a FIFO (First In, First Out) data structure where elements are added at the rear and removed from the front.',
 '00000000-0000-0000-0000-000000000003');

-- Sample Exam
INSERT INTO exams (id, title, subject_id, description, instructions, start_datetime, end_datetime, duration_minutes, total_marks, pass_marks, status, created_by, shuffle_questions, shuffle_options, target_all_students, is_published) VALUES
('00000000-0000-0000-0000-000000000040',
 'Mid-Semester Examination - Data Structures',
 '00000000-0000-0000-0000-000000000010',
 'Mid-semester examination covering Arrays, Linked Lists, Trees, and Sorting.',
 'Read all questions carefully. No mobile phones allowed. Use of calculator is prohibited.',
 NOW() + INTERVAL '1 day',
 NOW() + INTERVAL '1 day 3 hours',
 90, 12.0, 6.0, 'scheduled',
 '00000000-0000-0000-0000-000000000003',
 TRUE, TRUE, TRUE, TRUE);

-- Link questions to exam
INSERT INTO exam_questions (exam_id, question_id, display_order) VALUES
('00000000-0000-0000-0000-000000000040', '00000000-0000-0000-0000-000000000030', 1),
('00000000-0000-0000-0000-000000000040', '00000000-0000-0000-0000-000000000031', 2),
('00000000-0000-0000-0000-000000000040', '00000000-0000-0000-0000-000000000033', 3),
('00000000-0000-0000-0000-000000000040', '00000000-0000-0000-0000-000000000034', 4),
('00000000-0000-0000-0000-000000000040', '00000000-0000-0000-0000-000000000036', 5);

-- Completed exam for results demo
INSERT INTO exams (id, title, subject_id, start_datetime, end_datetime, duration_minutes, total_marks, pass_marks, status, created_by, is_published, result_published, result_published_at) VALUES
('00000000-0000-0000-0000-000000000041',
 'Quiz 1 - Database Fundamentals',
 '00000000-0000-0000-0000-000000000011',
 NOW() - INTERVAL '7 days',
 NOW() - INTERVAL '7 days' + INTERVAL '1 hour',
 60, 3.0, 1.5, 'completed',
 '00000000-0000-0000-0000-000000000003',
 TRUE, TRUE, NOW() - INTERVAL '6 days');

INSERT INTO exam_questions (exam_id, question_id, display_order) VALUES
('00000000-0000-0000-0000-000000000041', '00000000-0000-0000-0000-000000000032', 1),
('00000000-0000-0000-0000-000000000041', '00000000-0000-0000-0000-000000000035', 2);

-- Sample submission for alice
INSERT INTO exam_submissions (id, exam_id, user_id, status, started_at, submitted_at, total_score, percentage, grade, is_passed, time_taken_seconds) VALUES
('00000000-0000-0000-0000-000000000050',
 '00000000-0000-0000-0000-000000000041',
 '00000000-0000-0000-0000-000000000004',
 'submitted', NOW() - INTERVAL '7 days', NOW() - INTERVAL '7 days' + INTERVAL '45 minutes',
 2.0, 66.67, 'B', TRUE, 2700);

INSERT INTO submission_answers (submission_id, question_id, selected_option, status, is_correct, marks_obtained, is_auto_graded) VALUES
('00000000-0000-0000-0000-000000000050', '00000000-0000-0000-0000-000000000032', 'C', 'answered', TRUE, 1.0, TRUE),
('00000000-0000-0000-0000-000000000050', '00000000-0000-0000-0000-000000000035', 'false', 'answered', TRUE, 1.0, TRUE);

-- Sample notifications
INSERT INTO notifications (recipient_id, type, title, message, is_read, related_exam_id) VALUES
('00000000-0000-0000-0000-000000000004', 'exam_scheduled', 'New Exam Scheduled', 'A new exam "Mid-Semester Examination - Data Structures" has been scheduled for tomorrow.', FALSE, '00000000-0000-0000-0000-000000000040'),
('00000000-0000-0000-0000-000000000004', 'result_published', 'Results Published', 'Results for "Quiz 1 - Database Fundamentals" have been published. You scored 66.67%.', TRUE, '00000000-0000-0000-0000-000000000041'),
('00000000-0000-0000-0000-000000000005', 'exam_scheduled', 'New Exam Scheduled', 'A new exam "Mid-Semester Examination - Data Structures" has been scheduled for tomorrow.', FALSE, '00000000-0000-0000-0000-000000000040');

-- Demo Paper 1: Operating Systems Final
INSERT INTO exams (id, title, subject_id, description, instructions, start_datetime, end_datetime, duration_minutes, total_marks, pass_marks, status, created_by, is_published) VALUES
('00000000-0000-0000-0000-000000000042',
 'Final Examination - Operating Systems',
 '00000000-0000-0000-0000-000000000012',
 'Comprehensive exam covering all OS concepts.',
 'No external resources allowed.',
 NOW() + INTERVAL '2 days',
 NOW() + INTERVAL '2 days 3 hours',
 120, 100.0, 40.0, 'scheduled',
 '00000000-0000-0000-0000-000000000003', TRUE);

-- Demo Paper 2: Mathematics Mock Test
INSERT INTO exams (id, title, subject_id, description, instructions, start_datetime, end_datetime, duration_minutes, total_marks, pass_marks, status, created_by, is_published) VALUES
('00000000-0000-0000-0000-000000000043',
 'Mock Test - Mathematics',
 '00000000-0000-0000-0000-000000000013',
 'Practice test for upcoming mid-terms.',
 'Calculators allowed.',
 NOW() + INTERVAL '5 days',
 NOW() + INTERVAL '5 days 1 hour',
 60, 50.0, 20.0, 'scheduled',
 '00000000-0000-0000-0000-000000000002', TRUE);

-- Demo Paper 3: Active Exam
INSERT INTO exams (id, title, subject_id, description, instructions, start_datetime, end_datetime, duration_minutes, total_marks, pass_marks, status, created_by, is_published) VALUES
('00000000-0000-0000-0000-000000000044',
 'Pop Quiz - Data Structures',
 '00000000-0000-0000-0000-000000000010',
 'Surprise quiz!',
 'Answer quickly.',
 NOW() - INTERVAL '1 hour',
 NOW() + INTERVAL '1 hour',
 30, 20.0, 10.0, 'active',
 '00000000-0000-0000-0000-000000000003', TRUE);
