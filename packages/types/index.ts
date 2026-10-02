import { z } from 'zod';

// ============== ENUMS ==============

export enum UserGender {
  MAN = 'man',
  WOMAN = 'woman',
  NON_BINARY = 'non_binary',
  SELF_DESCRIBE = 'self_describe',
}

export enum InterestPreference {
  MEN = 'men',
  WOMEN = 'women',
  EVERYONE = 'everyone',
}

export enum VerificationStatus {
  UNVERIFIED = 'unverified',
  PENDING = 'pending',
  VERIFIED = 'verified',
  REJECTED = 'rejected',
  MANUAL_REVIEW = 'manual_review',
}

export enum DatingIntent {
  DATING = 'dating',
  CASUAL = 'casual_dating',
  TALKING = 'talking',
  FRIENDS_FIRST = 'friends_first',
  FIGURING_IT_OUT = 'figuring_it_out',
}

export enum CrushStatus {
  PENDING = 'pending',
  MATCHED = 'matched',
  EXPIRED = 'expired',
}

export enum BlockStatus {
  BLOCKED = 'blocked',
}

export enum ReportReason {
  FAKE_PROFILE = 'fake_profile',
  UNDERAGE = 'underage',
  HARASSMENT = 'harassment',
  THREATS = 'threats',
  SPAM = 'spam',
  SCAM = 'scam',
  IMPERSONATION = 'impersonation',
  INAPPROPRIATE_CONTENT = 'inappropriate_content',
  NONCONSENSUAL_INTIMATE = 'nonconsensual_intimate',
  OFFLINE_SAFETY = 'offline_safety',
  OTHER = 'other',
}

export enum SubscriptionPlan {
  FREE = 'free',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
}

export enum SubscriptionStatus {
  ACTIVE = 'active',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired',
  PENDING = 'pending',
}

export enum TrialStatus {
  NOT_STARTED = 'not_started',
  ACTIVE = 'active',
  EXPIRED = 'expired',
  CONVERTED = 'converted',
}

export enum AdminRole {
  SUPER_ADMIN = 'super_admin',
  MODERATOR = 'moderator',
  SUPPORT = 'support',
}

export enum AccountStatus {
  ACTIVE = 'active',
  PAUSED = 'paused',
  SUSPENDED = 'suspended',
  BANNED = 'banned',
}

// ============== CORE TYPES ==============

export interface User {
  id: string;
  phone: string;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
  account_status: AccountStatus;
  is_deleted: boolean;
}

export interface Profile {
  id: string;
  user_id: string;
  first_name: string;
  display_name: string;
  legal_name: string;
  dob: string; // ISO date
  age: number;
  gender: UserGender;
  bio: string;
  college_id: string;
  department_id: string;
  year: number;
  dating_intent: DatingIntent;
  interests: string[]; // Array of interest IDs
  prompts: ProfilePrompt[];
  verification_status: VerificationStatus;
  verification_badge: boolean;
  incognito_enabled: boolean;
  incognito_enabled_at: string | null;
  profile_completed: boolean;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
}

export interface ProfilePrompt {
  prompt_id: string;
  answer: string;
}

export interface ProfilePhoto {
  id: string;
  user_id: string;
  photo_url: string;
  thumbnail_url: string;
  position: number;
  is_primary: boolean;
  created_at: string;
}

export interface College {
  id: string;
  name: string;
  short_name: string;
  city: string;
  state: string;
  country: string;
  email_domain: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface Department {
  id: string;
  college_id: string;
  name: string;
  short_code: string;
  created_at: string;
}

export interface Interest {
  id: string;
  name: string;
  category: string;
  icon: string;
  created_at: string;
}

export interface Prompt {
  id: string;
  text: string;
  category: string;
  active: boolean;
  created_at: string;
}

export interface Crush {
  id: string;
  from_user_id: string;
  to_user_id: string;
  status: CrushStatus;
  created_at: string;
  updated_at: string;
  expired_at: string | null;
}

export interface Pass {
  id: string;
  user_id: string;
  passed_user_id: string;
  created_at: string;
}

export interface Match {
  id: string;
  user_a_id: string;
  user_b_id: string;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
}

export interface Message {
  id: string;
  match_id: string;
  sender_id: string;
  content: string;
  message_type: 'text' | 'photo';
  photo_url?: string;
  thumbnail_url?: string;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
}

export interface MessageReaction {
  id: string;
  message_id: string;
  user_id: string;
  reaction: string;
  created_at: string;
}

export interface Block {
  id: string;
  user_id: string;
  blocked_user_id: string;
  created_at: string;
}

export interface Report {
  id: string;
  reporter_id: string;
  reported_user_id: string;
  reason: ReportReason;
  description: string;
  status: 'open' | 'investigating' | 'resolved' | 'closed';
  created_at: string;
  updated_at: string;
}

export interface Subscription {
  id: string;
  user_id: string;
  plan_type: SubscriptionPlan;
  provider: string; // 'razorpay', 'app_store', 'google_play'
  provider_subscription_id: string;
  status: SubscriptionStatus;
  started_at: string;
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
  cancelled_at: string | null;
  trial_started_at: string | null;
  trial_ends_at: string | null;
  trial_claimed_at: string | null;
  trial_status: TrialStatus;
  created_at: string;
  updated_at: string;
}

export interface PaymentTransaction {
  id: string;
  user_id: string;
  provider: string;
  provider_order_id: string;
  provider_payment_id: string;
  plan_type: SubscriptionPlan;
  amount: number; // in paise for INR
  currency: 'INR';
  status: 'pending' | 'success' | 'failed';
  created_at: string;
  verified_at: string | null;
}

export interface AdminUser {
  id: string;
  email: string;
  role: AdminRole;
  created_at: string;
  updated_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  body: string;
  type: 'crush' | 'match' | 'message' | 'verification' | 'subscription' | 'safety';
  data: Record<string, string>;
  read: boolean;
  created_at: string;
}

export interface PushToken {
  id: string;
  user_id: string;
  token: string;
  platform: 'ios' | 'android' | 'web';
  created_at: string;
}

export interface StudentVerification {
  id: string;
  user_id: string;
  college_id: string;
  method: 'email' | 'student_id';
  status: VerificationStatus;
  email: string | null;
  student_id_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Boost {
  id: string;
  user_id: string;
  started_at: string;
  expires_at: string;
  created_at: string;
}

export interface FeatureFlag {
  id: string;
  key: string;
  enabled: boolean;
  value: string | null;
  created_at: string;
  updated_at: string;
}

export interface Entitlements {
  plan: SubscriptionPlan;
  trial_active: boolean;
  premium_active: boolean;
  trial_started_at: string | null;
  trial_ends_at: string | null;
  subscription_started_at: string | null;
  subscription_ends_at: string | null;
  incognito_allowed: boolean;
  see_who_crushed_allowed: boolean;
  nearby_colleges_allowed: boolean;
  advanced_filters_allowed: boolean;
  boost_allowed: boolean;
}

// ============== VALIDATION SCHEMAS ==============

export const signupPhoneSchema = z.object({
  phone: z.string().min(10).max(15),
});

export const verifyOtpSchema = z.object({
  phone: z.string().min(10).max(15),
  otp: z.string().length(6),
});

export const profileCreationSchema = z.object({
  first_name: z.string().min(1).max(50),
  dob: z.string().datetime(),
  gender: z.enum(['man', 'woman', 'non_binary', 'self_describe']),
  interest_preference: z.enum(['men', 'women', 'everyone']),
  college_id: z.string().uuid(),
  department_id: z.string().uuid(),
  year: z.number().min(1).max(5),
});

export const updateProfileSchema = z.object({
  first_name: z.string().min(1).max(50).optional(),
  bio: z.string().max(500).optional(),
  gender: z.enum(['man', 'woman', 'non_binary', 'self_describe']).optional(),
  dating_intent: z.enum(['dating', 'casual_dating', 'talking', 'friends_first', 'figuring_it_out']).optional(),
});

export const crushSchema = z.object({
  to_user_id: z.string().uuid(),
});

export const reportSchema = z.object({
  reported_user_id: z.string().uuid(),
  reason: z.enum([
    'fake_profile',
    'underage',
    'harassment',
    'threats',
    'spam',
    'scam',
    'impersonation',
    'inappropriate_content',
    'nonconsensual_intimate',
    'offline_safety',
    'other',
  ]),
  description: z.string().max(1000).optional(),
});

export const messageSchema = z.object({
  match_id: z.string().uuid(),
  content: z.string().min(1).max(5000),
  message_type: z.enum(['text', 'photo']),
  photo_url: z.string().optional(),
});

export const blockSchema = z.object({
  blocked_user_id: z.string().uuid(),
});
