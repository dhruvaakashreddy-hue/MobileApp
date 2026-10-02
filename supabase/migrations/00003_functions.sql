-- ============== CREATE CRUSH FUNCTION ==============
CREATE OR REPLACE FUNCTION create_crush(to_user_id_param UUID)
RETURNS TABLE(crush_id UUID, status TEXT) AS $$
DECLARE
  from_user_id_val UUID;
  crush_exists BOOLEAN;
  reverse_crush_id UUID;
  new_match_id UUID;
BEGIN
  -- Get authenticated user
  from_user_id_val := auth.uid();

  -- Check if crush already exists
  SELECT id INTO crush_exists
  FROM crushes
  WHERE crushes.from_user_id = from_user_id_val
  AND crushes.to_user_id = to_user_id_param
  AND crushes.status != 'expired';

  IF crush_exists THEN
    RETURN QUERY SELECT crush_exists, 'crush_already_exists'::TEXT;
    RETURN;
  END IF;

  -- Check if users are not blocked
  IF EXISTS (
    SELECT 1 FROM blocks
    WHERE (user_id = from_user_id_val AND blocked_user_id = to_user_id_param)
    OR (user_id = to_user_id_param AND blocked_user_id = from_user_id_val)
  ) THEN
    RETURN QUERY SELECT NULL::UUID, 'users_blocked'::TEXT;
    RETURN;
  END IF;

  -- Create new crush
  INSERT INTO crushes (from_user_id, to_user_id, status)
  VALUES (from_user_id_val, to_user_id_param, 'pending')
  RETURNING id INTO crush_id;

  -- Check if reverse crush exists
  SELECT id INTO reverse_crush_id
  FROM crushes
  WHERE from_user_id = to_user_id_param
  AND to_user_id = from_user_id_val
  AND status = 'pending';

  -- If mutual crush, create match
  IF reverse_crush_id IS NOT NULL THEN
    -- Update both crushes to matched
    UPDATE crushes SET status = 'matched' WHERE id = crush_id;
    UPDATE crushes SET status = 'matched' WHERE id = reverse_crush_id;

    -- Create match
    INSERT INTO matches (user_a_id, user_b_id)
    VALUES (LEAST(from_user_id_val, to_user_id_param), GREATEST(from_user_id_val, to_user_id_param))
    RETURNING id INTO new_match_id;

    RETURN QUERY SELECT crush_id, 'mutual_match'::TEXT;
  ELSE
    RETURN QUERY SELECT crush_id, 'crush_created'::TEXT;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============== GET DISCOVERY PROFILES FUNCTION ==============
CREATE OR REPLACE FUNCTION get_discovery_profiles(
  p_limit INT DEFAULT 20,
  p_offset INT DEFAULT 0,
  p_include_nearby BOOLEAN DEFAULT false
)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  first_name VARCHAR,
  age INTEGER,
  college_id UUID,
  college_name VARCHAR,
  department_id UUID,
  year INTEGER,
  interests UUID[],
  verification_badge BOOLEAN,
  is_incognito BOOLEAN,
  primary_photo_url VARCHAR
) AS $$
DECLARE
  auth_user_id UUID;
  auth_user_college_id UUID;
  auth_user_interest_preference interest_preference;
  auth_user_min_age INT;
  auth_user_max_age INT;
  auth_user_gender user_gender;
BEGIN
  auth_user_id := auth.uid();

  -- Get authenticated user's info
  SELECT p.college_id, p.interest_preference, p.gender, p.age
  INTO auth_user_college_id, auth_user_interest_preference, auth_user_gender, auth_user_min_age
  FROM profiles p
  WHERE p.user_id = auth_user_id;

  auth_user_max_age := auth_user_min_age + 10; -- Allow 10 year range
  auth_user_min_age := auth_user_min_age - 5;

  -- Return discovery profiles
  RETURN QUERY
  SELECT
    p.id,
    p.user_id,
    CASE WHEN p.incognito_enabled THEN 'Anonymous' ELSE p.first_name END,
    p.age,
    p.college_id,
    c.name,
    p.department_id,
    p.year,
    ARRAY(SELECT interest_id FROM user_interests WHERE user_id = p.user_id),
    p.verification_badge,
    p.incognito_enabled,
    pp.photo_url
  FROM profiles p
  JOIN colleges c ON p.college_id = c.id
  LEFT JOIN profile_photos pp ON p.user_id = pp.user_id AND pp.is_primary = true
  WHERE
    p.user_id != auth_user_id
    AND p.is_deleted = false
    AND p.profile_completed = true
    AND p.age >= auth_user_min_age
    AND p.age <= auth_user_max_age
    AND (
      CASE
        WHEN auth_user_interest_preference = 'men' THEN p.gender = 'man'
        WHEN auth_user_interest_preference = 'women' THEN p.gender = 'woman'
        ELSE true
      END
    )
    AND (
      p.interest_preference = 'everyone'
      OR (p.interest_preference = 'men' AND auth_user_gender = 'man')
      OR (p.interest_preference = 'women' AND auth_user_gender = 'woman')
    )
    AND NOT EXISTS (SELECT 1 FROM blocks WHERE user_id = auth_user_id AND blocked_user_id = p.user_id)
    AND NOT EXISTS (SELECT 1 FROM blocks WHERE user_id = p.user_id AND blocked_user_id = auth_user_id)
    AND NOT EXISTS (SELECT 1 FROM matches WHERE (user_a_id = auth_user_id AND user_b_id = p.user_id) OR (user_a_id = p.user_id AND user_b_id = auth_user_id))
    AND NOT EXISTS (SELECT 1 FROM crushes WHERE from_user_id = auth_user_id AND to_user_id = p.user_id AND status != 'expired')
    AND NOT EXISTS (SELECT 1 FROM passes WHERE user_id = auth_user_id AND passed_user_id = p.user_id AND created_at > now() - INTERVAL '7 days')
    AND (
      p.college_id = auth_user_college_id
      OR p_include_nearby = true
    )
  ORDER BY p.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============== GET INCOMING CRUSHES FUNCTION ==============
CREATE OR REPLACE FUNCTION get_incoming_crushes(p_include_identity BOOLEAN DEFAULT false)
RETURNS TABLE (
  crush_count INT,
  first_crush_id UUID,
  hints JSONB
) AS $$
DECLARE
  auth_user_id UUID;
  incoming_count INT;
  first_id UUID;
BEGIN
  auth_user_id := auth.uid();

  -- Count incoming crushes
  SELECT COUNT(*) INTO incoming_count
  FROM crushes
  WHERE to_user_id = auth_user_id AND status = 'pending';

  -- Get first crush
  SELECT id INTO first_id
  FROM crushes
  WHERE to_user_id = auth_user_id AND status = 'pending'
  ORDER BY created_at DESC
  LIMIT 1;

  -- Return results
  RETURN QUERY
  SELECT
    incoming_count,
    first_id,
    CASE
      WHEN p_include_identity AND first_id IS NOT NULL THEN
        (SELECT to_jsonb(p) FROM profiles p
         WHERE p.user_id = (SELECT from_user_id FROM crushes WHERE id = first_id))
      ELSE
        jsonb_build_object(
          'department', (SELECT d.name FROM crushes c
                        JOIN profiles p ON c.from_user_id = p.user_id
                        JOIN departments d ON p.department_id = d.id
                        WHERE c.id = first_id),
          'year', (SELECT p.year FROM crushes c
                  JOIN profiles p ON c.from_user_id = p.user_id
                  WHERE c.id = first_id),
          'interests_count', (SELECT COUNT(*) FROM crushes c
                             JOIN user_interests ui ON c.from_user_id = ui.user_id
                             WHERE c.id = first_id)
        )
    END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============== INITIALIZE USER TRIAL FUNCTION ==============
CREATE OR REPLACE FUNCTION initialize_user_trial()
RETURNS TABLE (trial_started BOOLEAN, message TEXT) AS $$
DECLARE
  auth_user_id UUID;
  subscription_exists BOOLEAN;
  trial_already_claimed BOOLEAN;
BEGIN
  auth_user_id := auth.uid();

  -- Check if subscription record exists
  SELECT EXISTS (SELECT 1 FROM subscriptions WHERE user_id = auth_user_id)
  INTO subscription_exists;

  IF NOT subscription_exists THEN
    -- Create subscription record
    INSERT INTO subscriptions (user_id, plan_type, trial_status, trial_started_at, trial_ends_at, trial_claimed_at)
    VALUES (
      auth_user_id,
      'free',
      'active',
      now(),
      now() + INTERVAL '7 days',
      now()
    );

    RETURN QUERY SELECT true, 'trial_initialized'::TEXT;
  ELSE
    -- Check if trial already claimed
    SELECT trial_claimed_at IS NOT NULL INTO trial_already_claimed
    FROM subscriptions
    WHERE user_id = auth_user_id;

    IF trial_already_claimed THEN
      RETURN QUERY SELECT false, 'trial_already_claimed'::TEXT;
    ELSE
      -- Initialize trial
      UPDATE subscriptions
      SET trial_status = 'active',
          trial_started_at = now(),
          trial_ends_at = now() + INTERVAL '7 days',
          trial_claimed_at = now()
      WHERE user_id = auth_user_id;

      RETURN QUERY SELECT true, 'trial_initialized'::TEXT;
    END IF;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============== GET USER ENTITLEMENTS FUNCTION ==============
CREATE OR REPLACE FUNCTION get_user_entitlements()
RETURNS TABLE (
  plan subscription_plan,
  trial_active BOOLEAN,
  premium_active BOOLEAN,
  trial_started_at TIMESTAMP,
  trial_ends_at TIMESTAMP,
  subscription_started_at TIMESTAMP,
  subscription_ends_at TIMESTAMP,
  incognito_allowed BOOLEAN,
  see_who_crushed_allowed BOOLEAN,
  nearby_colleges_allowed BOOLEAN,
  advanced_filters_allowed BOOLEAN,
  boost_allowed BOOLEAN
) AS $$
DECLARE
  auth_user_id UUID;
  sub_record RECORD;
BEGIN
  auth_user_id := auth.uid();

  -- Get subscription record
  SELECT * INTO sub_record
  FROM subscriptions
  WHERE user_id = auth_user_id;

  IF sub_record IS NULL THEN
    -- No subscription, return free tier
    RETURN QUERY SELECT
      'free'::subscription_plan,
      false,
      false,
      NULL::TIMESTAMP,
      NULL::TIMESTAMP,
      NULL::TIMESTAMP,
      NULL::TIMESTAMP,
      false,
      false,
      false,
      false,
      false;
  ELSE
    -- Determine entitlements based on plan and trial
    RETURN QUERY SELECT
      sub_record.plan_type,
      (sub_record.trial_status = 'active' AND sub_record.trial_ends_at > now()),
      (sub_record.plan_type != 'free' AND sub_record.status = 'active' AND
       (sub_record.current_period_end IS NULL OR sub_record.current_period_end > now())),
      sub_record.trial_started_at,
      sub_record.trial_ends_at,
      sub_record.started_at,
      sub_record.current_period_end,
      (sub_record.plan_type != 'free' OR (sub_record.trial_status = 'active' AND sub_record.trial_ends_at > now())),
      (sub_record.plan_type != 'free' OR (sub_record.trial_status = 'active' AND sub_record.trial_ends_at > now())),
      (sub_record.plan_type != 'free' OR (sub_record.trial_status = 'active' AND sub_record.trial_ends_at > now())),
      (sub_record.plan_type != 'free' OR (sub_record.trial_status = 'active' AND sub_record.trial_ends_at > now())),
      (sub_record.plan_type != 'free' OR (sub_record.trial_status = 'active' AND sub_record.trial_ends_at > now()));
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============== BLOCK USER FUNCTION ==============
CREATE OR REPLACE FUNCTION block_user(blocked_user_id_param UUID)
RETURNS TABLE(block_id UUID, message TEXT) AS $$
DECLARE
  auth_user_id UUID;
  new_block_id UUID;
  existing_match UUID;
BEGIN
  auth_user_id := auth.uid();

  -- Check if users are the same
  IF auth_user_id = blocked_user_id_param THEN
    RETURN QUERY SELECT NULL::UUID, 'cannot_block_self'::TEXT;
    RETURN;
  END IF;

  -- Check if block already exists
  IF EXISTS (SELECT 1 FROM blocks WHERE user_id = auth_user_id AND blocked_user_id = blocked_user_id_param) THEN
    RETURN QUERY SELECT NULL::UUID, 'block_already_exists'::TEXT;
    RETURN;
  END IF;

  -- Create block
  INSERT INTO blocks (user_id, blocked_user_id)
  VALUES (auth_user_id, blocked_user_id_param)
  RETURNING id INTO new_block_id;

  -- Delete associated match if exists
  DELETE FROM matches
  WHERE (user_a_id = auth_user_id AND user_b_id = blocked_user_id_param)
  OR (user_a_id = blocked_user_id_param AND user_b_id = auth_user_id);

  RETURN QUERY SELECT new_block_id, 'block_created'::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============== UNMATCH FUNCTION ==============
CREATE OR REPLACE FUNCTION unmatch_user(match_id_param UUID)
RETURNS TABLE(success BOOLEAN, message TEXT) AS $$
DECLARE
  auth_user_id UUID;
  match_exists BOOLEAN;
BEGIN
  auth_user_id := auth.uid();

  -- Check if match exists and user is part of it
  SELECT EXISTS (
    SELECT 1 FROM matches
    WHERE id = match_id_param
    AND (user_a_id = auth_user_id OR user_b_id = auth_user_id)
  ) INTO match_exists;

  IF NOT match_exists THEN
    RETURN QUERY SELECT false, 'match_not_found'::TEXT;
    RETURN;
  END IF;

  -- Mark match as deleted
  UPDATE matches
  SET is_deleted = true
  WHERE id = match_id_param;

  RETURN QUERY SELECT true, 'unmatched'::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============== REPORT USER FUNCTION ==============
CREATE OR REPLACE FUNCTION report_user(
  reported_user_id_param UUID,
  reason_param report_reason,
  description_param TEXT DEFAULT NULL
)
RETURNS TABLE(report_id UUID, message TEXT) AS $$
DECLARE
  auth_user_id UUID;
  new_report_id UUID;
BEGIN
  auth_user_id := auth.uid();

  -- Check if users are the same
  IF auth_user_id = reported_user_id_param THEN
    RETURN QUERY SELECT NULL::UUID, 'cannot_report_self'::TEXT;
    RETURN;
  END IF;

  -- Create report
  INSERT INTO reports (reporter_id, reported_user_id, reason, description)
  VALUES (auth_user_id, reported_user_id_param, reason_param, description_param)
  RETURNING id INTO new_report_id;

  -- If underage report, flag for manual review
  IF reason_param = 'underage' THEN
    UPDATE profiles
    SET verification_status = 'manual_review'
    WHERE user_id = reported_user_id_param;
  END IF;

  RETURN QUERY SELECT new_report_id, 'report_created'::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============== DELETE ACCOUNT FUNCTION ==============
CREATE OR REPLACE FUNCTION delete_account()
RETURNS TABLE(success BOOLEAN, message TEXT) AS $$
DECLARE
  auth_user_id UUID;
BEGIN
  auth_user_id := auth.uid();

  -- Mark user as deleted
  UPDATE users
  SET is_deleted = true, account_status = 'suspended'
  WHERE id = auth_user_id;

  -- Mark profile as deleted
  UPDATE profiles
  SET is_deleted = true
  WHERE user_id = auth_user_id;

  -- Delete profile photos
  DELETE FROM profile_photos
  WHERE user_id = auth_user_id;

  -- Delete push tokens
  DELETE FROM push_tokens
  WHERE user_id = auth_user_id;

  -- Clear user interests
  DELETE FROM user_interests
  WHERE user_id = auth_user_id;

  -- Clear profile prompts
  DELETE FROM profile_prompts
  WHERE user_id = auth_user_id;

  -- Delete match data (but keep reports for safety)
  UPDATE matches
  SET is_deleted = true
  WHERE user_a_id = auth_user_id OR user_b_id = auth_user_id;

  RETURN QUERY SELECT true, 'account_deleted'::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
