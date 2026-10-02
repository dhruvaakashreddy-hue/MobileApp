import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/providers/AuthProvider';
import { TextInput } from '../../src/components/TextInput';

const COLORS = {
  dark: '#0f0f0f',
  card: '#1a1a1a',
  accent: '#ff006e',
  textPrimary: '#ffffff',
  textSecondary: '#b0b0b0',
};

export default function LoginScreen() {
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const { signInWithPhone } = useAuth();

  const handleSendOtp = async () => {
    try {
      setError('');
      setIsLoading(true);

      // Validate phone
      const cleanPhone = phone.replace(/[^\d]/g, '');
      if (cleanPhone.length < 10 || cleanPhone.length > 10) {
        setError('Please enter a valid 10-digit phone number');
        return;
      }

      await signInWithPhone(cleanPhone);
      router.push({
        pathname: '/(auth)/verify-otp',
        params: { phone: cleanPhone },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send OTP');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.content}
      >
        <View style={styles.header}>
          <Text style={styles.title}>CRUSH</Text>
          <Text style={styles.subtitle}>Your campus. Your crush. Find out if it's mutual.</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>Enter your phone number</Text>
          <TextInput
            placeholder="10-digit number"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            editable={!isLoading}
            placeholderTextColor={COLORS.textSecondary}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.button, isLoading && styles.buttonDisabled]}
            onPress={handleSendOtp}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color={COLORS.dark} />
            ) : (
              <Text style={styles.buttonText}>Send OTP</Text>
            )}
          </TouchableOpacity>

          <Text style={styles.disclaimer}>
            We'll send you a 6-digit code to verify your number.
          </Text>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            By continuing, you agree to our Terms of Service and Privacy Policy.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.dark,
  },
  content: {
    flex: 1,
    padding: 24,
    justifyContent: 'space-between',
  },
  header: {
    marginTop: 40,
    marginBottom: 60,
  },
  title: {
    fontSize: 48,
    fontWeight: '700',
    color: COLORS.accent,
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    color: COLORS.textSecondary,
    lineHeight: 24,
  },
  form: {
    flex: 1,
    justifyContent: 'center',
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 12,
  },
  error: {
    color: '#ff4444',
    fontSize: 14,
    marginTop: 8,
    marginBottom: 8,
  },
  button: {
    backgroundColor: COLORS.accent,
    paddingVertical: 16,
    borderRadius: 12,
    marginTop: 24,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: COLORS.dark,
    fontSize: 16,
    fontWeight: '600',
  },
  disclaimer: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 16,
    textAlign: 'center',
    lineHeight: 18,
  },
  footer: {
    paddingBottom: 24,
  },
  footerText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
});
