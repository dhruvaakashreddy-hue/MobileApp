import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ImpactStyle } from '@capacitor/haptics';
import { useApp } from '../state/AppContext';
import { Button, Screen } from '../components/ui';
import { Avatar } from '../components/Avatar';
import { AVATAR_PRESETS, presetRef, randomPreset } from '../data/avatars';
import { ImagePickError, pickProfilePhoto, type PhotoSource } from '../lib/image';
import {
  INVALID_EMAIL_MESSAGE,
  NAME_MAX_LENGTH,
  NAME_REQUIRED_MESSAGE,
  isValidEmail,
  isValidName,
  normalizeName,
} from '../lib/auth';

/**
 * Shown once after a first sign-in, and reachable later from Settings to edit.
 * Name is required; email is optional; the picture can be a preset, a camera
 * shot or something from the gallery.
 */
export function ProfileSetup({ mode = 'setup' }: { mode?: 'setup' | 'edit' }) {
  const { session, saveProfile, buzz } = useApp();
  const navigate = useNavigate();

  const user = session?.user;
  const [name, setName] = useState(user?.displayName ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  // Suggest a random one on first setup so nobody faces an empty circle.
  const [photo, setPhoto] = useState<string | null>(
    user?.photoUrl ?? (mode === 'setup' ? presetRef(randomPreset().id) : null),
  );
  const [nameError, setNameError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (mode === 'setup') nameRef.current?.focus();
  }, [mode]);

  const choosePhoto = async (source: PhotoSource) => {
    setSheetOpen(false);
    setPhotoError(null);
    setPicking(true);
    try {
      const dataUrl = await pickProfilePhoto(source);
      setPhoto(dataUrl);
      buzz(ImpactStyle.Medium);
    } catch (err) {
      // Backing out of the picker is a normal thing to do, not an error.
      if (err instanceof ImagePickError && err.cancelled) return;
      setPhotoError(
        err instanceof ImagePickError ? err.message : "Couldn't use that image.",
      );
    } finally {
      setPicking(false);
    }
  };

  const submit = async () => {
    if (saving) return;

    const cleanName = normalizeName(name);
    const cleanEmail = email.trim();

    let bad = false;
    if (!isValidName(cleanName)) {
      setNameError(NAME_REQUIRED_MESSAGE);
      nameRef.current?.focus();
      bad = true;
    }
    // Only validated when something was typed — the field is optional.
    if (cleanEmail.length > 0 && !isValidEmail(cleanEmail)) {
      setEmailError(INVALID_EMAIL_MESSAGE);
      bad = true;
    }
    if (bad) {
      buzz(ImpactStyle.Heavy);
      return;
    }

    setSaving(true);
    await saveProfile({
      displayName: cleanName,
      email: cleanEmail.length > 0 ? cleanEmail : null,
      photoUrl: photo,
    });
    setSaving(false);
    buzz();
    navigate(mode === 'edit' ? '/settings' : '/', { replace: true });
  };

  return (
    <Screen>
      <div className="flex min-h-[calc(100vh-2rem)] flex-col pb-6">
        <header className="pt-8 text-center">
          <h1 className="font-display text-3xl leading-tight tracking-tight">
            {mode === 'edit' ? 'Edit your profile' : "Let's set you up"}
          </h1>
          <p className="mx-auto mt-2 max-w-xs text-[15px] leading-snug text-white/55">
            {mode === 'edit'
              ? 'Change how you appear in the app.'
              : 'Just a name and a face. Takes ten seconds.'}
          </p>
        </header>

        {/* Picture */}
        <div className="mt-7 flex flex-col items-center">
          <button
            onClick={() => {
              buzz();
              setSheetOpen(true);
            }}
            disabled={picking}
            aria-label="Change profile picture"
            className="relative rounded-full transition active:scale-95 disabled:opacity-50"
          >
            <Avatar photo={photo} name={name} size={112} />
            <span
              className="absolute bottom-0 right-0 grid h-9 w-9 place-items-center rounded-full border-4 border-ink bg-violet-600 text-sm"
              aria-hidden
            >
              {picking ? '…' : '📷'}
            </span>
          </button>
          <button
            onClick={() => {
              buzz();
              setSheetOpen(true);
            }}
            className="tap mt-2 rounded-2xl px-4 text-sm font-semibold text-violet-300"
          >
            {photo ? 'Change picture' : 'Add a picture'}
          </button>
          {photoError && (
            <p className="mt-1 px-6 text-center text-sm text-rose-300" role="alert">
              {photoError}
            </p>
          )}
        </div>

        {/* Preset strip */}
        <p className="mt-6 mb-2 px-1 text-xs font-bold uppercase tracking-[0.14em] text-white/40">
          Or pick one
        </p>
        <div className="-mx-5 flex gap-3 overflow-x-auto no-scrollbar px-5 pb-2">
          {AVATAR_PRESETS.map((preset) => {
            const ref = presetRef(preset.id);
            const active = photo === ref;
            return (
              <button
                key={preset.id}
                onClick={() => {
                  buzz();
                  setPhoto(ref);
                  setPhotoError(null);
                }}
                aria-label={preset.label}
                aria-pressed={active}
                className={`shrink-0 rounded-full transition active:scale-90 ${
                  active ? 'ring-[3px] ring-white ring-offset-2 ring-offset-ink' : ''
                }`}
              >
                <Avatar photo={ref} name={null} size={56} />
              </button>
            );
          })}
        </div>

        <form
          className="mt-7"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <label
            htmlFor="name"
            className="mb-2 block px-1 text-xs font-bold uppercase tracking-[0.14em] text-white/40"
          >
            Your name <span className="text-rose-400">*</span>
          </label>
          <input
            ref={nameRef}
            id="name"
            type="text"
            autoComplete="name"
            enterKeyHint="next"
            maxLength={NAME_MAX_LENGTH}
            placeholder="What should we call you?"
            value={name}
            aria-invalid={!!nameError}
            aria-describedby={nameError ? 'name-error' : undefined}
            onChange={(e) => {
              setName(e.target.value);
              setNameError(null);
            }}
            onBlur={() => {
              if (name.trim().length > 0 && !isValidName(name)) {
                setNameError(NAME_REQUIRED_MESSAGE);
              }
            }}
            className="tap w-full rounded-2xl border bg-white/5 px-4 text-lg font-bold outline-none transition placeholder:font-medium placeholder:text-white/25 focus:border-white/30"
            style={{ borderColor: nameError ? '#F43F5E' : 'rgba(255,255,255,0.10)' }}
          />
          {nameError && (
            <p
              id="name-error"
              className="mt-2 flex items-start gap-1.5 px-1 text-sm text-rose-300"
              role="alert"
            >
              <span aria-hidden>⚠️</span>
              {nameError}
            </p>
          )}

          <label
            htmlFor="email"
            className="mb-2 mt-5 block px-1 text-xs font-bold uppercase tracking-[0.14em] text-white/40"
          >
            Email <span className="normal-case tracking-normal text-white/30">(optional)</span>
          </label>
          <input
            id="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            enterKeyHint="done"
            placeholder="you@example.com"
            value={email}
            aria-invalid={!!emailError}
            aria-describedby={emailError ? 'email-error' : undefined}
            onChange={(e) => {
              setEmail(e.target.value);
              setEmailError(null);
            }}
            onBlur={() => {
              if (email.trim().length > 0 && !isValidEmail(email)) {
                setEmailError(INVALID_EMAIL_MESSAGE);
              }
            }}
            className="tap w-full rounded-2xl border bg-white/5 px-4 text-base font-semibold outline-none transition placeholder:font-medium placeholder:text-white/25 focus:border-white/30"
            style={{ borderColor: emailError ? '#F43F5E' : 'rgba(255,255,255,0.10)' }}
          />
          {emailError && (
            <p
              id="email-error"
              className="mt-2 flex items-start gap-1.5 px-1 text-sm text-rose-300"
              role="alert"
            >
              <span aria-hidden>⚠️</span>
              {emailError}
            </p>
          )}

          <Button full type="submit" disabled={saving} className="mt-7 h-14">
            {saving ? 'Saving…' : mode === 'edit' ? 'Save changes' : 'Continue'}
          </Button>
        </form>

        {mode === 'edit' && (
          <button
            onClick={() => navigate('/settings')}
            className="tap mt-2 w-full rounded-2xl text-sm font-semibold text-white/40"
          >
            Cancel
          </button>
        )}
      </div>

      <PhotoSourceSheet
        open={sheetOpen}
        hasPhoto={!!photo}
        onClose={() => setSheetOpen(false)}
        onPick={(source) => void choosePhoto(source)}
        onRemove={() => {
          buzz();
          setPhoto(null);
          setSheetOpen(false);
        }}
      />
    </Screen>
  );
}

/** Bottom sheet offering camera, gallery and remove. */
function PhotoSourceSheet({
  open,
  hasPhoto,
  onClose,
  onPick,
  onRemove,
}: {
  open: boolean;
  hasPhoto: boolean;
  onClose: () => void;
  onPick: (source: PhotoSource) => void;
  onRemove: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          role="dialog"
          aria-modal="true"
          aria-label="Choose a profile picture"
        >
          <button
            aria-label="Close"
            tabIndex={-1}
            onClick={onClose}
            className="absolute inset-0 h-full w-full cursor-default bg-black/60 backdrop-blur-sm"
          />
          <motion.div
            className="relative w-full rounded-t-3xl border-t border-white/10 bg-ink-card p-5 nav-pb-safe"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 420, damping: 36 }}
          >
            <span
              className="mx-auto mb-4 block h-1 w-10 rounded-full bg-white/20"
              aria-hidden
            />
            <SheetButton emoji="📸" label="Take a photo" onClick={() => onPick('camera')} />
            <SheetButton emoji="🖼️" label="Choose from gallery" onClick={() => onPick('gallery')} />
            {hasPhoto && (
              <SheetButton emoji="🗑️" label="Remove picture" danger onClick={onRemove} />
            )}
            <button
              onClick={onClose}
              className="tap mt-2 w-full rounded-2xl border border-white/10 px-5 text-base font-bold transition active:scale-[0.98]"
            >
              Cancel
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function SheetButton({
  emoji,
  label,
  onClick,
  danger,
}: {
  emoji: string;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`tap flex w-full items-center gap-3 rounded-2xl px-4 text-left text-[16px] font-semibold transition active:bg-white/5 ${
        danger ? 'text-rose-300' : ''
      }`}
    >
      <span className="text-xl" aria-hidden>{emoji}</span>
      {label}
    </button>
  );
}
