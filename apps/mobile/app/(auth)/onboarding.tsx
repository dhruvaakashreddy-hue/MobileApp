import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/providers/AuthProvider';

const COLORS = {
  dark: '#0f0f0f',
  card: '#1a1a1a',
  accent: '#ff006e',
  textPrimary: '#ffffff',
  textSecondary: '#b0b0b0',
};

export default function OnboardingScreen() {
  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleNextStep = async () => {
    if (step < 13) {
      setStep(step + 1);
    } else {
      // Complete onboarding
      setIsLoading(true);
      try {
        // TODO: Complete profile creation and navigate to main app
        router.replace('/(app)/discover');
      } catch (error) {
        console.error('Onboarding error:', error);
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handlePrevStep = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>Let's set up your profile</Text>
            <Text style={styles.stepSubtitle}>Step 1 of 13</Text>
          </View>
        );
      case 2:
        return (
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>Verify your age</Text>
            <Text style={styles.stepSubtitle}>We confirm you're 18+</Text>
            <Text style={styles.stepDescription}>This is required to use CRUSH</Text>
          </View>
        );
      case 3:
        return (
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>What's your name?</Text>
            <Text style={styles.stepSubtitle}>Your display name</Text>
          </View>
        );
      case 4:
        return (
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>Select your gender</Text>
            <Text style={styles.stepSubtitle}>How do you identify?</Text>
          </View>
        );
      case 5:
        return (
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>Who are you interested in?</Text>
            <Text style={styles.stepSubtitle}>Your preferences</Text>
          </View>
        );
      case 6:
        return (
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>Which college do you attend?</Text>
            <Text style={styles.stepSubtitle}>Select your institution</Text>
          </View>
        );
      case 7:
        return (
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>Verify as a student</Text>
            <Text style={styles.stepSubtitle}>Choose your verification method</Text>
          </View>
        );
      case 8:
        return (
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>Add your photos</Text>
            <Text style={styles.stepSubtitle}>Minimum 2, maximum 5 photos</Text>
          </View>
        );
      case 9:
        return (
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>Select your interests</Text>
            <Text style={styles.stepSubtitle}>Pick 5-10 that describe you</Text>
          </View>
        );
      case 10:
        return (
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>What's your major?</Text>
            <Text style={styles.stepSubtitle}>Your course/department</Text>
          </View>
        );
      case 11:
        return (
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>What year are you in?</Text>
            <Text style={styles.stepSubtitle}>Your academic year</Text>
          </View>
        );
      case 12:
        return (
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>What's your dating intent?</Text>
            <Text style={styles.stepSubtitle}>What are you looking for?</Text>
          </View>
        );
      case 13:
        return (
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>Answer some prompts</Text>
            <Text style={styles.stepSubtitle}>Help people get to know you</Text>
          </View>
        );
      default:
        return null;
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.content}
      >
        <ScrollView style={styles.scrollView}>
          {renderStep()}
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.button, styles.secondaryButton]}
            onPress={handlePrevStep}
            disabled={step === 1 || isLoading}
          >
            <Text style={styles.secondaryButtonText}>Back</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.primaryButton, isLoading && styles.buttonDisabled]}
            onPress={handleNextStep}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color={COLORS.dark} />
            ) : (
              <Text style={styles.primaryButtonText}>
                {step === 13 ? 'Complete' : 'Next'}
              </Text>
            )}
          </TouchableOpacity>
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
  },
  scrollView: {
    flex: 1,
  },
  stepContent: {
    justifyContent: 'center',
    minHeight: 300,
  },
  stepTitle: {
    fontSize: 32,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 12,
  },
  stepSubtitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.accent,
    marginBottom: 12,
  },
  stepDescription: {
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 20,
  },
  footer: {
    flexDirection: 'row',
    gap: 12,
    paddingTop: 24,
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryButton: {
    backgroundColor: COLORS.accent,
  },
  primaryButtonText: {
    color: COLORS.dark,
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.accent,
  },
  secondaryButtonText: {
    color: COLORS.accent,
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
