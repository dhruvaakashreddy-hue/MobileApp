# CRUSH - 18+ College Dating App MVP

> "Your campus. Your crush. Find out if it's mutual."

A modern, privacy-focused dating application exclusively for verified college students aged 18+.

## 🎯 Core Features

- **Secret Crush System**: Send anonymous crushes that reveal mutual matches
- **College Verification**: Verified student profiles with institutional email or ID
- **Real-Time Chat**: Instant messaging with read receipts
- **Discovery Matching**: Smart filtering by college, department, interests, and preferences
- **CRUSH+ Premium**: Unlock advanced features like seeing who crushed you and Incognito Mode
- **Safety First**: Report, block, and safety popup on every login
- **Admin Dashboard**: Moderation, verification, analytics, and user management

## 🏗️ Tech Stack

### Mobile
- **React Native** + **Expo** - Cross-platform mobile development
- **Expo Router** - File-based routing
- **TypeScript** - Type safety
- **TanStack Query** - Data fetching and caching
- **Zustand** - Global state management
- **React Hook Form** + **Zod** - Forms and validation

### Backend
- **Supabase** - PostgreSQL, Auth, Storage, Realtime, Edge Functions
- **PostgreSQL** - Database with RLS policies
- **TypeScript** - Type safety

### Admin
- **Next.js 14** - Web admin dashboard
- **Recharts** - Analytics visualization
- **Tailwind CSS** - Styling

### Payment
- **Razorpay** - Payment processing (India-focused)
- **RevenueCat** - Subscription management (future)

## 📁 Project Structure

```
crush-monorepo/
├── apps/
│   ├── mobile/           # React Native + Expo app
│   │   ├── app/          # Expo Router app directory
│   │   ├── src/
│   │   │   ├── components/
│   │   │   ├── hooks/
│   │   │   ├── lib/
│   │   │   ├── providers/
│   │   │   ├── screens/
│   │   │   └── store/
│   │   ├── app.json      # Expo config
│   │   └── package.json
│   └── admin/            # Next.js admin dashboard
│       ├── app/
│       ├── components/
│       ├── lib/
│       └── package.json
├── packages/
│   ├── types/           # Shared TypeScript types
│   ├── ui/              # Shared UI components
│   └── config/          # Configuration
├── supabase/
│   ├── migrations/      # Database migrations (SQL)
│   ├── functions/       # Edge functions (TypeScript)
│   ├── tests/           # RLS and integration tests
│   └── config.json
├── docs/                # Documentation
├── .env.example         # Environment template
├── tsconfig.json        # Root TypeScript config
└── package.json         # Root workspace config
```

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ and npm 9+
- Supabase account (https://supabase.com)
- Expo CLI: `npm install -g expo-cli`

### Setup

1. **Clone and install dependencies**

```bash
npm install
```

2. **Create Supabase project**

- Visit https://supabase.com and create a new project
- Copy your project URL and anon key

3. **Configure environment variables**

```bash
cp .env.example .env.local
# Edit .env.local with your Supabase credentials
```

4. **Run database migrations**

```bash
# Visit Supabase console → SQL Editor
# Run migrations/00001_init.sql, 00002_rls.sql, 00003_functions.sql, 00004_seed.sql
# In order
```

5. **Start mobile app**

```bash
npm run dev:mobile
```

The app will start on Expo Go (scan QR code).

6. **Start admin dashboard** (in another terminal)

```bash
npm run dev:admin
```

Admin dashboard opens at http://localhost:3000

## 🔐 Security & Privacy

### 18+ Age Gate (STRICT)
- DOB collected at signup (Step 2)
- Age validated on client and server
- Users under 18 cannot access the app
- Age verification cannot be easily edited

### Data Protection
- Row-Level Security (RLS) on all database tables
- No exposure of:
  - Phone numbers
  - Email addresses
  - Student ID documents
  - Exact DOB (only shows age)
  - Precise GPS location
- Secure file uploads with signed URLs
- EXIF metadata stripping for photos

### Authentication
- Supabase Auth with Phone + OTP
- Secure token storage (encrypted)
- Session management with auto-refresh
- Rate limiting on OTP requests

### Privacy Features
- Incognito Mode (CRUSH+ only): Hide all details except college name
- Block and Report functionality
- Incoming crush privacy: Limited hints only
- Message encryption in transit

## 💳 Subscription Architecture

### CRUSH+ Premium (₹39/week or ₹129/month)

**Features included:**
- See who crushed on you
- Unlimited crushes per day (vs 20 free)
- Undo Pass
- Advanced discovery filters
- Nearby colleges feature
- Profile Boost (30 minutes visibility)
- Incognito Mode
- No ads (future)

**7-Day Free Trial:**
- Automatically granted on first login
- Server-side tracking (non-repeatable)
- Shows remaining days/expiration date
- Converts to paid or reverts to free

**Payment Processing:**
- Server-side payment validation (Razorpay)
- Webhook signature verification
- Idempotent transaction handling
- Never store card data in app

**Entitlement Resolution:**
```
get_user_entitlements(user_id) → {
  plan: 'free' | 'weekly' | 'monthly',
  trial_active: boolean,
  premium_active: boolean,
  incognito_allowed: boolean,
  see_who_crushed_allowed: boolean,
  nearby_colleges_allowed: boolean,
  ...
}
```

## 🔄 Core Workflows

### Sign Up Flow
1. Phone login → OTP verification
2. Age verification (DOB) → Block if under 18
3. Profile creation (name, gender, interests)
4. College selection & student verification
5. Photo upload (min 2, max 5)
6. Onboarding prompts
7. Auto-grant 7-day CRUSH+ trial
8. Show safety popup
9. Enter Discover screen

### Secret Crush Workflow
1. User A views User B's profile
2. User A taps "Crush" button → Crush recorded
3. User B gets notification: "Someone from your college has a crush on you 👀"
4. User B sees limited hints (department, year, shared interests)
5. If User B crushes User A independently:
   - MUTUAL MATCH created
   - Both identities revealed
   - Chat opened automatically
   - "IT'S MUTUAL 💕" animation shown
6. If User B doesn't crush back:
   - Crush expires after 30 days
   - No notification sent to User A

### Safety & Reporting
1. User can report from:
   - Full profile view
   - Chat screen
   - Match menu
2. Report categories: Fake profile, underage, harassment, threats, etc.
3. Reported user NOT notified who reported them
4. Underage reports trigger manual review
5. Admin can warn, suspend, or ban

## 📊 Admin Dashboard

**Features:**
- User management and verification
- Report review and moderation
- College and department management
- Feature flag configuration
- Analytics and metrics
- Subscription monitoring
- Payment transaction history

**Access:**
- Next.js app at `/apps/admin`
- Admin users created via Supabase
- Role-based access (super_admin, moderator, support)

## 🧪 Testing

### Unit Tests
```bash
npm run test
```

### Integration Tests
```bash
cd supabase
npm run test
```

### RLS Policy Testing
Database policies are automatically tested against:
- User can read own profile only
- User cannot read other user's private data
- Blocked users cannot access any data
- Match members can read messages only in their match

## 📱 Mobile App Configuration

### Permissions (iOS/Android)
- Camera: Photo uploads
- Photo Library: Image selection
- Notifications: Push notifications

### Development Builds

```bash
# Build for Android
npm run android

# Build for iOS
npm run ios

# Web preview
npm run web
```

## 🔑 Environment Variables

See `.env.example` for all variables.

**Critical (NEVER commit actual values):**
- `SUPABASE_SERVICE_ROLE_KEY` - Backend only
- `RAZORPAY_KEY_SECRET` - Backend only
- `RAZORPAY_WEBHOOK_SECRET` - Backend only

**Safe to commit:**
- `EXPO_PUBLIC_SUPABASE_URL` - Public
- `EXPO_PUBLIC_SUPABASE_ANON_KEY` - Public (limited permissions)

## 📚 Database Schema

### Key Tables
- `users` - Authentication & basic info
- `profiles` - Full user profiles (incognito, verification, settings)
- `profile_photos` - User photos (max 5, with primary)
- `crushes` - One-directional crushes (pending/matched/expired)
- `matches` - Mutual matches (unique pair)
- `messages` - Real-time chat messages
- `blocks` - User blocking
- `reports` - Safety reports
- `subscriptions` - Subscription status & trials
- `payment_transactions` - Payment records
- `colleges`, `departments`, `interests` - Reference data
- `student_verifications` - College verification records

### RLS Policies
All tables have Row-Level Security enabled:
- Users can read only their own private data
- Users can read public profile data of non-blocked users
- Messages accessible only to match participants
- Admin users have special unrestricted access

## 🎨 Design System

### Colors
- **Background**: `#0f0f0f` (near-black)
- **Card**: `#1a1a1a` (charcoal)
- **Accent**: `#ff006e` (electric pink/purple)
- **Text Primary**: `#ffffff`
- **Text Secondary**: `#b0b0b0` (gray)

### Typography
- **Display**: Montserrat/system bold (28-48px)
- **Body**: System default (14-16px)
- **Caption**: System (12px)

### Spacing
- Base unit: 4px
- Padding/margins: 4, 8, 12, 16, 24px multiples

## 🚢 Deployment

### Mobile Apps

**Android:**
1. Generate signed APK/AAB via Expo
2. Upload to Google Play Console
3. Configure app signing

**iOS:**
1. Configure Apple Developer certificate
2. Build via Expo or Xcode
3. Submit to App Store

### Admin Dashboard

```bash
cd apps/admin
npm run build
# Deploy build/ to Vercel, AWS, etc.
```

## 📈 Analytics

**Tracked Events:**
- signup_started
- signup_completed
- verify_student
- profile_completed
- crush_sent
- mutual_match
- message_sent
- subscription_started
- account_deleted
- report_created

**NOT Tracked:**
- Actual chat content
- Sensitive user data
- Verification documents
- Payment card details

## ⚠️ Known Limitations

1. **Incognito Mode Identity**: Cannot be guaranteed 100% if user voluntarily shares details in messages
2. **Push Notifications**: Requires Expo push service setup for production
3. **Payment Processing**: Razorpay integration requires India-specific setup
4. **Video Chat**: Not implemented in MVP (text + photo messages only)
5. **International**: Currently India-focused (₹ pricing, colleges)

## 🤝 Contributing

1. Create feature branch: `git checkout -b feature/xyz`
2. Commit with clear messages
3. Submit PR with description
4. Ensure tests pass: `npm run test`
5. Lint passes: `npm run lint`

## 📄 License

Proprietary - Do not distribute

---

**Made with ❤️ for college students worldwide**
