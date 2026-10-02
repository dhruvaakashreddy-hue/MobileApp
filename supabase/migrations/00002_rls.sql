-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE profile_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE crushes ENABLE ROW LEVEL SECURITY;
ALTER TABLE passes ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE colleges ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE interests ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE boosts ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_interests ENABLE ROW LEVEL SECURITY;
ALTER TABLE profile_prompts ENABLE ROW LEVEL SECURITY;

-- ============== USERS TABLE POLICIES ==============

CREATE POLICY "users_select_own" ON users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "users_insert_own" ON users
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "users_update_own" ON users
  FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- ============== PROFILES TABLE POLICIES ==============

CREATE POLICY "profiles_select_own" ON profiles
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "profiles_select_public" ON profiles
  FOR SELECT USING (
    auth.uid() != user_id AND
    is_deleted = false AND
    NOT EXISTS (SELECT 1 FROM blocks WHERE user_id = auth.uid() AND blocked_user_id = profiles.user_id) AND
    NOT EXISTS (SELECT 1 FROM blocks WHERE user_id = profiles.user_id AND blocked_user_id = auth.uid())
  );

CREATE POLICY "profiles_insert_own" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============== PROFILE PHOTOS TABLE POLICIES ==============

CREATE POLICY "profile_photos_select_own" ON profile_photos
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "profile_photos_select_public" ON profile_photos
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.user_id = profile_photos.user_id
      AND p.is_deleted = false
      AND NOT EXISTS (SELECT 1 FROM blocks WHERE user_id = auth.uid() AND blocked_user_id = p.user_id)
      AND NOT EXISTS (SELECT 1 FROM blocks WHERE user_id = p.user_id AND blocked_user_id = auth.uid())
    )
  );

CREATE POLICY "profile_photos_insert_own" ON profile_photos
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "profile_photos_update_own" ON profile_photos
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "profile_photos_delete_own" ON profile_photos
  FOR DELETE USING (auth.uid() = user_id);

-- ============== CRUSHES TABLE POLICIES ==============

CREATE POLICY "crushes_select_own" ON crushes
  FOR SELECT USING (auth.uid() = from_user_id OR auth.uid() = to_user_id);

CREATE POLICY "crushes_insert_own" ON crushes
  FOR INSERT WITH CHECK (auth.uid() = from_user_id);

-- ============== PASSES TABLE POLICIES ==============

CREATE POLICY "passes_select_own" ON passes
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "passes_insert_own" ON passes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ============== MATCHES TABLE POLICIES ==============

CREATE POLICY "matches_select_own" ON matches
  FOR SELECT USING (auth.uid() = user_a_id OR auth.uid() = user_b_id);

CREATE POLICY "matches_update_own" ON matches
  FOR UPDATE USING (auth.uid() = user_a_id OR auth.uid() = user_b_id)
  WITH CHECK (auth.uid() = user_a_id OR auth.uid() = user_b_id);

-- ============== MESSAGES TABLE POLICIES ==============

CREATE POLICY "messages_select_own_match" ON messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM matches
      WHERE matches.id = match_id
      AND (matches.user_a_id = auth.uid() OR matches.user_b_id = auth.uid())
      AND matches.is_deleted = false
    )
  );

CREATE POLICY "messages_insert_own_match" ON messages
  FOR INSERT WITH CHECK (
    auth.uid() = sender_id AND
    EXISTS (
      SELECT 1 FROM matches
      WHERE matches.id = match_id
      AND (matches.user_a_id = auth.uid() OR matches.user_b_id = auth.uid())
      AND matches.is_deleted = false
    )
  );

-- ============== MESSAGE REACTIONS TABLE POLICIES ==============

CREATE POLICY "message_reactions_select" ON message_reactions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM messages m
      JOIN matches mt ON m.match_id = mt.id
      WHERE m.id = message_id
      AND (mt.user_a_id = auth.uid() OR mt.user_b_id = auth.uid())
      AND mt.is_deleted = false
    )
  );

CREATE POLICY "message_reactions_insert_own" ON message_reactions
  FOR INSERT WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM messages m
      JOIN matches mt ON m.match_id = mt.id
      WHERE m.id = message_id
      AND (mt.user_a_id = auth.uid() OR mt.user_b_id = auth.uid())
      AND mt.is_deleted = false
    )
  );

-- ============== BLOCKS TABLE POLICIES ==============

CREATE POLICY "blocks_select_own" ON blocks
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "blocks_insert_own" ON blocks
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ============== REPORTS TABLE POLICIES ==============

CREATE POLICY "reports_select_own" ON reports
  FOR SELECT USING (auth.uid() = reporter_id);

CREATE POLICY "reports_insert_own" ON reports
  FOR INSERT WITH CHECK (auth.uid() = reporter_id);

-- ============== STUDENT VERIFICATIONS TABLE POLICIES ==============

CREATE POLICY "student_verifications_select_own" ON student_verifications
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "student_verifications_insert_own" ON student_verifications
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "student_verifications_update_own" ON student_verifications
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============== SUBSCRIPTIONS TABLE POLICIES ==============

CREATE POLICY "subscriptions_select_own" ON subscriptions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "subscriptions_update_own" ON subscriptions
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============== PUSH TOKENS TABLE POLICIES ==============

CREATE POLICY "push_tokens_select_own" ON push_tokens
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "push_tokens_insert_own" ON push_tokens
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "push_tokens_delete_own" ON push_tokens
  FOR DELETE USING (auth.uid() = user_id);

-- ============== NOTIFICATION PREFERENCES TABLE POLICIES ==============

CREATE POLICY "notification_preferences_select_own" ON notification_preferences
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "notification_preferences_update_own" ON notification_preferences
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============== PUBLIC READ POLICIES ==============

-- Colleges can be read by anyone
CREATE POLICY "colleges_select_all" ON colleges
  FOR SELECT USING (true);

-- Departments can be read by anyone
CREATE POLICY "departments_select_all" ON departments
  FOR SELECT USING (true);

-- Interests can be read by anyone
CREATE POLICY "interests_select_all" ON interests
  FOR SELECT USING (true);

-- Prompts can be read by anyone
CREATE POLICY "prompts_select_all" ON prompts
  FOR SELECT USING (true);

-- ============== ADMIN POLICIES ==============

CREATE POLICY "admin_users_select_own" ON admin_users
  FOR SELECT USING (auth.uid()::text = email);

-- ============== USER INTERESTS TABLE POLICIES ==============

CREATE POLICY "user_interests_select_own" ON user_interests
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "user_interests_insert_own" ON user_interests
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_interests_delete_own" ON user_interests
  FOR DELETE USING (auth.uid() = user_id);

-- ============== PROFILE PROMPTS TABLE POLICIES ==============

CREATE POLICY "profile_prompts_select_own" ON profile_prompts
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "profile_prompts_insert_own" ON profile_prompts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "profile_prompts_delete_own" ON profile_prompts
  FOR DELETE USING (auth.uid() = user_id);

-- ============== BOOSTS TABLE POLICIES ==============

CREATE POLICY "boosts_select_own" ON boosts
  FOR SELECT USING (auth.uid() = user_id);

-- ============== PAYMENT TRANSACTIONS TABLE POLICIES ==============

CREATE POLICY "payment_transactions_select_own" ON payment_transactions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "payment_transactions_insert_own" ON payment_transactions
  FOR INSERT WITH CHECK (auth.uid() = user_id);
