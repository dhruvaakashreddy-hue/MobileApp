import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Share } from '@capacitor/share';
import { useApp } from '../state/AppContext';
import {
  Button, Card, IconButton, Screen, ScreenHeader, SectionLabel, ToggleRow,
} from '../components/ui';
import { ActiveHoursPicker } from '../components/ActiveHoursPicker';
import {
  ALL_CATEGORIES, CATEGORY_BLURBS, CATEGORY_EMOJI, CATEGORY_LABELS,
} from '../data/personas';
import {
  billingIsLive, formatExpiry, PRICE_LABEL, PRICE_PERIOD,
} from '../lib/billing';
import { isNative } from '../lib/notifications';
import { IntervalPicker } from '../components/IntervalPicker';
import { formatE164ForDisplay } from '../lib/auth';
import { Avatar } from '../components/Avatar';

export function Settings() {
  const {
    settings, persona, premium, premiumActive, session,
    updateSettings, toggleCategory, restore, cancelSubscription, buzz, signOut,
  } = useApp();
  const navigate = useNavigate();
  const [restoreMsg, setRestoreMsg] = useState<string | null>(null);
  const [cancelState, setCancelState] = useState<'idle' | 'confirm' | 'busy'>('idle');
  const [cancelMsg, setCancelMsg] = useState<string | null>(null);

  const onRestore = async () => {
    buzz();
    setRestoreMsg('Checking…');
    const ok = await restore();
    setRestoreMsg(
      ok
        ? 'Subscription restored.'
        : 'No active subscription found for this account.',
    );
  };

  const onCancel = async () => {
    buzz();
    setCancelState('busy');
    setCancelMsg(null);
    const ok = await cancelSubscription();
    setCancelState('idle');
    setCancelMsg(
      ok
        ? `Cancelled. You keep access until ${formatExpiry(premium) ?? 'the end of this period'}.`
        : "That didn't work. Try again, or cancel from your payment app.",
    );
  };

  const onShare = async () => {
    buzz();
    const text =
      'I let a drill sergeant live in my phone and now I drink water. Get Nudge.';
    try {
      if (isNative()) {
        await Share.share({ title: 'Nudge', text, dialogTitle: 'Share Nudge' });
      } else if (navigator.share) {
        await navigator.share({ title: 'Nudge', text });
      }
    } catch {
      // User dismissed the share sheet — nothing to do.
    }
  };

  const only = settings.categories.length === 1;

  return (
    <Screen>
      <ScreenHeader
        title="Settings"
        left={
          <IconButton label="Back" onClick={() => navigate(-1)} className="mt-1">
            ‹
          </IconButton>
        }
      />

      <SectionLabel>Account</SectionLabel>
      <Card className="mb-6">
        <button
          onClick={() => {
            buzz();
            navigate('/profile/edit');
          }}
          className="tap flex w-full items-center gap-3 rounded-2xl text-left transition active:bg-white/5"
        >
          <Avatar
            photo={session?.user.photoUrl ?? null}
            name={session?.user.displayName ?? null}
            size={52}
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[16px] font-bold">
              {session?.user.displayName ?? 'Guest'}
            </span>
            <span className="block truncate text-[13px] text-white/45">
              {session?.user.phoneNumber
                ? formatE164ForDisplay(session.user.phoneNumber)
                : (session?.user.email ?? '')}
            </span>
            {session?.user.email && session.user.phoneNumber && (
              <span className="block truncate text-[13px] text-white/35">
                {session.user.email}
              </span>
            )}
          </span>
          <span className="text-white/30" aria-hidden>›</span>
        </button>
        <button
          onClick={() => {
            buzz();
            navigate('/profile/edit');
          }}
          className="tap mt-2 w-full rounded-2xl border border-white/10 px-4 text-sm font-semibold text-white/70 transition active:bg-white/5"
        >
          {session?.user.displayName ? 'Edit profile' : 'Set up your profile'}
        </button>
        <button
          onClick={() => {
            buzz();
            void signOut();
          }}
          className="tap mt-3 w-full rounded-2xl border border-white/10 px-4 text-sm font-semibold text-white/60 transition active:bg-white/5"
        >
          Sign out
        </button>
      </Card>

      <SectionLabel>How often</SectionLabel>
      <Card className="mb-6">
        <IntervalPicker
          value={settings.intervalMinutes}
          accentHex={persona.theme.hex}
          onChange={(minutes) => void updateSettings({ intervalMinutes: minutes })}
        />
      </Card>

      <SectionLabel>Active hours</SectionLabel>
      <Card className="mb-6">
        <ActiveHoursPicker
          activeStart={settings.activeStart}
          activeEnd={settings.activeEnd}
          onChange={(next) => void updateSettings(next)}
        />
      </Card>

      <SectionLabel>What you'll get nudged about</SectionLabel>
      <Card className="mb-6">
        {ALL_CATEGORIES.map((c) => {
          const checked = settings.categories.includes(c);
          return (
            <ToggleRow
              key={c}
              emoji={CATEGORY_EMOJI[c]}
              label={CATEGORY_LABELS[c]}
              description={CATEGORY_BLURBS[c]}
              checked={checked}
              // Block turning off the last one — zero categories means no nudges at all.
              disabled={checked && only}
              accentHex={persona.theme.hex}
              onChange={() => {
                buzz();
                void toggleCategory(c);
              }}
            />
          );
        })}
        {only && (
          <p className="mt-2 px-1 text-[13px] text-white/40">
            Keep at least one switched on, otherwise there's nothing to send.
          </p>
        )}
      </Card>

      <SectionLabel>Alerts</SectionLabel>
      <Card className="mb-6">
        <ToggleRow
          emoji="🔊"
          label="Notification sound"
          description="Each persona has its own sound. Off keeps it to a silent banner."
          checked={settings.soundEnabled}
          accentHex={persona.theme.hex}
          onChange={(v) => {
            buzz();
            void updateSettings({ soundEnabled: v });
          }}
        />
        <ToggleRow
          emoji="📳"
          label="Haptics"
          description="A little buzz when you tap things and when a nudge lands."
          checked={settings.hapticsEnabled}
          accentHex={persona.theme.hex}
          onChange={(v) => void updateSettings({ hapticsEnabled: v })}
        />
      </Card>

      <SectionLabel>Subscription</SectionLabel>
      <Card className="mb-6">
        <div className="flex items-start gap-3">
          <span className="text-2xl" aria-hidden>
            {premiumActive ? '✅' : '⚠️'}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold">
              {premiumActive ? 'Active' : 'Not active'}
            </p>
            <p className="mt-0.5 text-[13px] leading-snug text-white/45">
              {premiumActive
                ? formatExpiry(premium)
                  ? `${PRICE_LABEL}/${PRICE_PERIOD} · renews ${formatExpiry(premium)}`
                  : `${PRICE_LABEL}/${PRICE_PERIOD}`
                : `Nudge is ${PRICE_LABEL} a ${PRICE_PERIOD}. Nudges are paused until it is active.`}
            </p>
          </div>
        </div>

        {!premiumActive && (
          <Button
            full
            className="mt-4"
            accent={persona.theme.accent}
            onAccent={persona.theme.onAccent}
            onClick={() => navigate('/paywall')}
          >
            Subscribe
          </Button>
        )}

        <button
          onClick={onRestore}
          className="tap mt-2 w-full rounded-2xl px-4 text-sm font-semibold text-white/60 transition active:bg-white/5"
        >
          Restore purchases
        </button>
        {restoreMsg && (
          <p className="mt-1 text-center text-[13px] text-white/50" role="status">
            {restoreMsg}
          </p>
        )}

        {/* "Cancel anytime" is promised on the paywall, so it has to be a
            button here rather than an instruction to email support. */}
        {premiumActive && billingIsLive() && (
          <div className="mt-3 border-t border-white/10 pt-3">
            {cancelState === 'confirm' ? (
              <>
                <p className="text-[13px] leading-snug text-white/55">
                  Cancel your subscription? Nudges keep coming until{' '}
                  {formatExpiry(premium) ?? 'the end of this period'}, then stop.
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => {
                      buzz();
                      setCancelState('idle');
                    }}
                    className="tap flex-1 rounded-2xl bg-white/10 px-4 py-2.5 text-sm font-semibold transition active:bg-white/15"
                  >
                    Keep it
                  </button>
                  <button
                    onClick={onCancel}
                    className="tap flex-1 rounded-2xl bg-rose-500/15 px-4 py-2.5 text-sm font-semibold text-rose-200 transition active:bg-rose-500/25"
                  >
                    Yes, cancel
                  </button>
                </div>
              </>
            ) : (
              <button
                onClick={() => {
                  buzz();
                  setCancelState('confirm');
                }}
                disabled={cancelState === 'busy'}
                className="tap w-full rounded-2xl px-4 text-[13px] font-semibold text-white/40 transition active:bg-white/5 disabled:opacity-40"
              >
                {cancelState === 'busy' ? 'Cancelling…' : 'Cancel subscription'}
              </button>
            )}
            {cancelMsg && (
              <p className="mt-2 text-center text-[13px] text-white/50" role="status">
                {cancelMsg}
              </p>
            )}
          </div>
        )}

        <p className="mt-3 border-t border-white/10 pt-3 text-[12px] leading-snug text-white/35">
          Paid monthly by UPI Autopay or card. You keep access until the end of
          the period you have paid for.
        </p>
      </Card>

      <SectionLabel>Spread the chaos</SectionLabel>
      <Card className="mb-6">
        <button
          onClick={onShare}
          className="tap flex w-full items-center gap-3 rounded-2xl px-1 py-3 text-left transition active:bg-white/5"
        >
          <span className="text-xl" aria-hidden>📤</span>
          <span className="flex-1 text-[15px] font-semibold">Share Nudge with a friend</span>
          <span className="text-white/30" aria-hidden>›</span>
        </button>
        <button
          onClick={() => {
            buzz();
            // TODO: swap in the real store listing URLs once the app is published.
            // Android: market://details?id=com.nudge.app
            // iOS: itms-apps://itunes.apple.com/app/id<APP_ID>?action=write-review
            window.open('https://example.com/nudge', '_blank');
          }}
          className="tap flex w-full items-center gap-3 rounded-2xl px-1 py-3 text-left transition active:bg-white/5"
        >
          <span className="text-xl" aria-hidden>⭐</span>
          <span className="flex-1 text-[15px] font-semibold">Rate the app</span>
          <span className="text-white/30" aria-hidden>›</span>
        </button>
      </Card>

      <button
        onClick={() => {
          buzz();
          void updateSettings({ onboarded: false });
          navigate('/onboarding');
        }}
        className="tap mb-8 w-full rounded-2xl px-4 text-sm font-semibold text-white/35 transition active:bg-white/5"
      >
        Replay the intro
      </button>
    </Screen>
  );
}
