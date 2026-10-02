-- ============== SEED COLLEGES ==============

INSERT INTO colleges (name, short_name, city, state, country, email_domain, enabled) VALUES
('CBIT - Chaitanya Bharathi Institute of Technology', 'CBIT', 'Hyderabad', 'Telangana', 'India', 'cbit.ac.in', true),
('VNR VJIET - Vasavi College of Engineering', 'VNR VJIET', 'Hyderabad', 'Telangana', 'India', 'vnrvjiet.ac.in', true),
('BITS Hyderabad', 'BITS H', 'Hyderabad', 'Telangana', 'India', 'bitshyderabad.ac.in', true),
('IIIT Hyderabad', 'IIIT H', 'Hyderabad', 'Telangana', 'India', 'iiit.ac.in', true),
('GITAM University', 'GITAM', 'Hyderabad', 'Telangana', 'India', 'gitam.edu', true),
('Osmania University', 'OU', 'Hyderabad', 'Telangana', 'India', 'osmania.ac.in', true);

-- ============== SEED DEPARTMENTS ==============

-- CBIT Departments
INSERT INTO departments (college_id, name, short_code) VALUES
((SELECT id FROM colleges WHERE short_name = 'CBIT'), 'Computer Science Engineering', 'CSE'),
((SELECT id FROM colleges WHERE short_name = 'CBIT'), 'Electronics and Communication Engineering', 'ECE'),
((SELECT id FROM colleges WHERE short_name = 'CBIT'), 'Electrical and Electronics Engineering', 'EEE'),
((SELECT id FROM colleges WHERE short_name = 'CBIT'), 'Mechanical Engineering', 'MECH');

-- VNR VJIET Departments
INSERT INTO departments (college_id, name, short_code) VALUES
((SELECT id FROM colleges WHERE short_name = 'VNR VJIET'), 'Computer Science Engineering', 'CSE'),
((SELECT id FROM colleges WHERE short_name = 'VNR VJIET'), 'Electronics and Communication Engineering', 'ECE'),
((SELECT id FROM colleges WHERE short_name = 'VNR VJIET'), 'Civil Engineering', 'CIVIL');

-- BITS Hyderabad Departments
INSERT INTO departments (college_id, name, short_code) VALUES
((SELECT id FROM colleges WHERE short_name = 'BITS H'), 'Computer Science', 'CS'),
((SELECT id FROM colleges WHERE short_name = 'BITS H'), 'Electronics & Communication', 'EC');

-- IIIT Hyderabad Departments
INSERT INTO departments (college_id, name, short_code) VALUES
((SELECT id FROM colleges WHERE short_name = 'IIIT H'), 'Computer Science & Engineering', 'CSE'),
((SELECT id FROM colleges WHERE short_name = 'IIIT H'), 'Artificial Intelligence', 'AI');

-- ============== SEED INTERESTS ==============

INSERT INTO interests (name, category, icon) VALUES
('Music', 'entertainment', '🎵'),
('Movies', 'entertainment', '🎬'),
('Coffee', 'lifestyle', '☕'),
('Fitness', 'sports', '💪'),
('Running', 'sports', '🏃'),
('Gaming', 'entertainment', '🎮'),
('Startups', 'career', '🚀'),
('Travel', 'lifestyle', '✈️'),
('Cricket', 'sports', '🏏'),
('Football', 'sports', '⚽'),
('Photography', 'creative', '📷'),
('Food', 'lifestyle', '🍕'),
('Books', 'education', '📚'),
('Nightlife', 'social', '🍾'),
('Art', 'creative', '🎨'),
('Cars', 'lifestyle', '🏎️'),
('Fashion', 'lifestyle', '👗'),
('Pets', 'lifestyle', '🐕'),
('Yoga', 'wellness', '🧘'),
('Cooking', 'lifestyle', '👨‍🍳');

-- ============== SEED PROMPTS ==============

INSERT INTO prompts (text, category, active) VALUES
('My toxic trait is...', 'personality', true),
('We will get along if...', 'compatibility', true),
('My ideal first date is...', 'dating', true),
('Something I''m obsessed with...', 'interests', true),
('Two truths and a lie...', 'fun', true),
('I''ll fall for you if...', 'romance', true),
('My hidden talent is...', 'personality', true),
('Worst decision I ever made...', 'life', true),
('My most embarrassing moment...', 'fun', true),
('What I''m really looking for...', 'dating', true),
('My biggest pet peeve is...', 'personality', true),
('If I won the lottery...', 'dreams', true);

-- ============== CREATE SEED USERS (TEST DATA) ==============

-- Note: In production, use Supabase Auth to create users
-- These are for testing purposes only

-- Helper function to create test user with profile
CREATE OR REPLACE FUNCTION create_test_user(
  p_phone VARCHAR,
  p_first_name VARCHAR,
  p_gender user_gender,
  p_college_short_name VARCHAR,
  p_department_name VARCHAR,
  p_year INTEGER,
  p_dob DATE,
  p_interest_preference interest_preference,
  p_dating_intent dating_intent
)
RETURNS UUID AS $$
DECLARE
  v_user_id UUID;
  v_college_id UUID;
  v_department_id UUID;
BEGIN
  -- Get college ID
  SELECT id INTO v_college_id
  FROM colleges
  WHERE short_name = p_college_short_name;

  -- Get department ID
  SELECT id INTO v_department_id
  FROM departments
  WHERE college_id = v_college_id
  AND name = p_department_name;

  -- Create user (simplified - in real app, use Supabase Auth)
  INSERT INTO users (phone)
  VALUES (p_phone)
  RETURNING id INTO v_user_id;

  -- Create profile
  INSERT INTO profiles (
    user_id, first_name, display_name, legal_name, dob, gender,
    college_id, department_id, year, interest_preference, dating_intent,
    verification_status, verification_badge, profile_completed
  ) VALUES (
    v_user_id, p_first_name, p_first_name, p_first_name, p_dob, p_gender,
    v_college_id, v_department_id, p_year, p_interest_preference, p_dating_intent,
    'verified', true, true
  );

  -- Create subscription record
  INSERT INTO subscriptions (user_id, plan_type, status)
  VALUES (v_user_id, 'free', 'active');

  -- Create notification preferences
  INSERT INTO notification_preferences (user_id)
  VALUES (v_user_id);

  RETURN v_user_id;
END;
$$ LANGUAGE plpgsql;

-- NOTE: The above is a helper function for manual testing.
-- In production, use Supabase Auth for user creation.
-- Test users and crushes should be created via API endpoints.

-- ============== FEATURE FLAGS ==============

INSERT INTO feature_flags (key, enabled, value) VALUES
('nearby_colleges', true, NULL),
('profile_boost', true, '30'),
('see_who_crushed', true, NULL),
('advanced_filters', true, NULL),
('photo_messages', true, NULL),
('icebreakers', true, NULL),
('incognito_mode', true, NULL);
