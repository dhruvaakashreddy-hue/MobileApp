import { useInfiniteQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../providers/AuthProvider';

const PROFILES_PER_PAGE = 5;

export function useDiscovery() {
  const { user } = useAuth();

  const discoveryQuery = useInfiniteQuery({
    queryKey: ['discovery_profiles'],
    queryFn: async ({ pageParam = 0 }) => {
      if (!user?.id) throw new Error('User not authenticated');

      const { data, error } = await supabase.rpc('get_discovery_profiles', {
        p_limit: PROFILES_PER_PAGE,
        p_offset: pageParam,
        p_include_nearby: false, // Set to true for premium users
      });

      if (error) throw error;
      return data || [];
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) => {
      if (lastPage.length < PROFILES_PER_PAGE) {
        return undefined;
      }
      return pages.length * PROFILES_PER_PAGE;
    },
    enabled: !!user?.id,
  });

  const allProfiles = discoveryQuery.data?.pages.flatMap((page) => page) || [];

  return {
    profiles: allProfiles,
    isLoading: discoveryQuery.isLoading,
    isFetchingNextPage: discoveryQuery.isFetchingNextPage,
    hasNextPage: discoveryQuery.hasNextPage,
    fetchNextPage: discoveryQuery.fetchNextPage,
    error: discoveryQuery.error,
    refetch: discoveryQuery.refetch,
  };
}
