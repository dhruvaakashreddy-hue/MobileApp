import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

const COLORS = {
  dark: '#0f0f0f',
  card: '#1a1a1a',
  accent: '#ff006e',
  red: '#ff0000',
  textPrimary: '#ffffff',
  textSecondary: '#b0b0b0',
};

interface DiscoveryCardProps {
  profile: {
    id: string;
    user_id: string;
    first_name: string;
    age: number;
    college_name: string;
    department_name?: string;
    year?: number;
    primary_photo_url?: string;
    interests?: string[];
    prompts?: { answer: string }[];
    verification_badge?: boolean;
    is_incognito?: boolean;
  };
  onPass: () => void;
  onCrush: () => void;
  onProfile: () => void;
  disabled?: boolean;
}

export function DiscoveryCard({
  profile,
  onPass,
  onCrush,
  onProfile,
  disabled = false,
}: DiscoveryCardProps) {
  const [showFullProfile, setShowFullProfile] = useState(false);
  const queryClient = useQueryClient();

  const crushMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('create_crush', {
        to_user_id_param: profile.user_id,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      // Refetch discovery profiles
      queryClient.invalidateQueries({ queryKey: ['discovery_profiles'] });
      onCrush();

      // Show success message
      if (data?.[0]?.[1] === 'mutual_match') {
        console.log('Mutual match! 💕');
      }
    },
  });

  const passMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('passes').insert({
        user_id: (await supabase.auth.getUser()).data.user?.id,
        passed_user_id: profile.user_id,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['discovery_profiles'] });
      onPass();
    },
  });

  const isLoading = crushMutation.isPending || passMutation.isPending;

  if (showFullProfile) {
    return (
      <View style={styles.fullProfileContainer}>
        <TouchableOpacity
          style={styles.closeButton}
          onPress={() => setShowFullProfile(false)}
        >
          <Ionicons name="close" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>

        <ScrollView style={styles.fullProfileContent}>
          {profile.primary_photo_url && (
            <Image
              source={{ uri: profile.primary_photo_url }}
              style={styles.fullProfilePhoto}
              resizeMode="cover"
            />
          )}

          <View style={styles.fullProfileInfo}>
            <View style={styles.headerRow}>
              <Text style={styles.nameText}>
                {profile.is_incognito ? 'Anonymous' : profile.first_name}
              </Text>
              {!profile.is_incognito && <Text style={styles.ageText}>, {profile.age}</Text>}
            </View>

            <Text style={styles.collegeText}>{profile.college_name}</Text>

            {!profile.is_incognito && (
              <>
                {profile.department_name && (
                  <Text style={styles.detailText}>
                    {profile.department_name} • Year {profile.year}
                  </Text>
                )}

                {profile.verification_badge && (
                  <View style={styles.badgeContainer}>
                    <Ionicons name="shield-checkmark" size={14} color={COLORS.accent} />
                    <Text style={styles.badgeText}>Student Verified</Text>
                  </View>
                )}

                {profile.interests && profile.interests.length > 0 && (
                  <View style={styles.interestsContainer}>
                    <Text style={styles.sectionTitle}>Interests</Text>
                    <View style={styles.interestsTags}>
                      {profile.interests.slice(0, 5).map((interest) => (
                        <View key={interest} style={styles.interestTag}>
                          <Text style={styles.interestTagText}>{interest}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                {profile.prompts && profile.prompts.length > 0 && (
                  <View style={styles.prompStContainer}>
                    <Text style={styles.sectionTitle}>About Them</Text>
                    {profile.prompts.slice(0, 2).map((prompt, idx) => (
                      <Text key={idx} style={styles.promptText}>
                        "{prompt.answer}"
                      </Text>
                    ))}
                  </View>
                )}
              </>
            )}
          </View>
        </ScrollView>

        <View style={styles.actionButtons}>
          <TouchableOpacity
            style={[styles.actionButton, styles.passButton]}
            onPress={() => {
              setShowFullProfile(false);
              passMutation.mutate();
            }}
            disabled={isLoading}
          >
            <Ionicons name="close" size={20} color={COLORS.textPrimary} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, styles.crushButton]}
            onPress={() => {
              setShowFullProfile(false);
              crushMutation.mutate();
            }}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color={COLORS.dark} size="small" />
            ) : (
              <Ionicons name="heart" size={20} color={COLORS.dark} />
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.cardContainer}>
      <View style={styles.photoContainer}>
        {profile.primary_photo_url ? (
          <Image
            source={{ uri: profile.primary_photo_url }}
            style={styles.photo}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.photoPlaceholder}>
            <Ionicons name="image" size={48} color={COLORS.textSecondary} />
          </View>
        )}

        <View style={styles.gradient} />

        <View style={styles.cardInfo}>
          <View style={styles.nameContainer}>
            <Text style={styles.cardName}>
              {profile.is_incognito ? 'Anonymous' : profile.first_name}
            </Text>
            {!profile.is_incognito && <Text style={styles.cardAge}>{profile.age}</Text>}
          </View>

          <Text style={styles.cardCollege}>{profile.college_name}</Text>

          {!profile.is_incognito && profile.department_name && (
            <Text style={styles.cardDepartment}>{profile.department_name}</Text>
          )}

          {profile.verification_badge && !profile.is_incognito && (
            <View style={styles.verificationBadge}>
              <Ionicons name="shield-checkmark" size={12} color={COLORS.accent} />
              <Text style={styles.badgeLabel}>Verified</Text>
            </View>
          )}

          {profile.interests && profile.interests.length > 0 && !profile.is_incognito && (
            <View style={styles.cardInterests}>
              {profile.interests.slice(0, 2).map((interest) => (
                <Text key={interest} style={styles.interestChip}>
                  {interest}
                </Text>
              ))}
              {profile.interests.length > 2 && (
                <Text style={styles.interestChip}>+{profile.interests.length - 2}</Text>
              )}
            </View>
          )}
        </View>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.actionLeft}
          onPress={() => passMutation.mutate()}
          disabled={isLoading || disabled}
        >
          <Ionicons name="close" size={24} color={COLORS.textSecondary} />
          <Text style={styles.actionLabel}>Pass</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionCenter]}
          onPress={() => setShowFullProfile(true)}
          disabled={disabled}
        >
          <Text style={styles.profileButtonText}>View Profile</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionRight}
          onPress={() => crushMutation.mutate()}
          disabled={isLoading || disabled}
        >
          {isLoading ? (
            <ActivityIndicator color={COLORS.accent} />
          ) : (
            <>
              <Ionicons name="heart" size={24} color={COLORS.accent} />
              <Text style={[styles.actionLabel, { color: COLORS.accent }]}>Crush</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cardContainer: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderRadius: 16,
    overflow: 'hidden',
  },
  photoContainer: {
    flex: 1,
    position: 'relative',
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  photoPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: COLORS.dark,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 120,
    background: 'linear-gradient(transparent, rgba(0,0,0,0.8))',
  },
  cardInfo: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
  },
  nameContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginBottom: 4,
  },
  cardName: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  cardAge: {
    fontSize: 18,
    color: COLORS.textSecondary,
  },
  cardCollege: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  cardDepartment: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  verificationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
  },
  badgeLabel: {
    fontSize: 12,
    color: COLORS.accent,
  },
  cardInterests: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 8,
    flexWrap: 'wrap',
  },
  interestChip: {
    fontSize: 11,
    color: COLORS.textSecondary,
    backgroundColor: 'rgba(255, 0, 110, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  actions: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.dark,
  },
  actionLeft: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
  },
  actionCenter: {
    flex: 1,
    backgroundColor: COLORS.card,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.accent,
  },
  profileButtonText: {
    color: COLORS.accent,
    fontWeight: '600',
    fontSize: 13,
  },
  actionRight: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
  },
  actionLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  fullProfileContainer: {
    flex: 1,
    backgroundColor: COLORS.dark,
    borderRadius: 16,
    overflow: 'hidden',
  },
  closeButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    zIndex: 10,
    padding: 8,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 24,
  },
  fullProfileContent: {
    flex: 1,
  },
  fullProfilePhoto: {
    width: '100%',
    height: 300,
  },
  fullProfileInfo: {
    padding: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 4,
  },
  nameText: {
    fontSize: 28,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  ageText: {
    fontSize: 22,
    color: COLORS.textSecondary,
  },
  collegeText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: 8,
  },
  detailText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginBottom: 8,
  },
  badgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginVertical: 8,
  },
  badgeText: {
    fontSize: 12,
    color: COLORS.accent,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginTop: 16,
    marginBottom: 8,
  },
  interestsContainer: {
    marginTop: 8,
  },
  interestsTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  interestTag: {
    backgroundColor: 'rgba(255, 0, 110, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  interestTagText: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  prompStContainer: {
    marginTop: 16,
    marginBottom: 16,
  },
  promptText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    fontStyle: 'italic',
    marginBottom: 12,
    lineHeight: 20,
  },
  actionButtons: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: COLORS.card,
  },
  actionButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
  },
  passButton: {
    backgroundColor: COLORS.card,
    borderWidth: 2,
    borderColor: COLORS.textSecondary,
  },
  crushButton: {
    backgroundColor: COLORS.accent,
  },
});
