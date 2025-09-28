import { deriveKeysFromSeed, hippiusCredentialsFromKeyPair } from '@/lib/crypto';
import { ensureUserStorage, makeS3Client } from '@/lib/s3';
import { useChatStore } from '@/lib/store';
import { getTestUsers } from '@/lib/test-users';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';

export default function LoginScreen() {
  const [isLoading, setIsLoading] = useState(false);
  const [testUsers, setTestUsers] = useState<any[]>([]);
  
  const router = useRouter();
  const { login, setError, logout, error } = useChatStore();

  const config = Constants.expoConfig?.extra;
  const s3Endpoint = config?.hippS3Endpoint || 'https://your-hippius-s3-endpoint.com';

  // Load test users on component mount
  React.useEffect(() => {
    const users = getTestUsers();
    setTestUsers(users);
  }, []);

  const handleTestUserLogin = async (testUser: any) => {
    setIsLoading(true);
    try {
      const keyPair = deriveKeysFromSeed(testUser.seed, testUser.ss58Address);
      const credentials = hippiusCredentialsFromKeyPair(keyPair);
      
      const s3Client = makeS3Client({
        endpoint: s3Endpoint,
        ...credentials
      });

      // Ensure user storage exists
      await ensureUserStorage(s3Client, `chat-${keyPair.ss58Address}`);
      const messaging = new (await import('@/lib/messaging')).MessagingService(s3Client, keyPair);
      await ensureUserStorage(s3Client, `profile-${keyPair.ss58Address}`);

      // Load existing profile or create a new one with test user's info
      const existingProfile = await messaging.getUserProfile(keyPair.ss58Address);
      if (!existingProfile) {
        await messaging.updateUserProfile({
          v: 1,
          address: keyPair.ss58Address,
          displayName: testUser.displayName,
          pk: Buffer.from(keyPair.pk).toString('hex'),
          avatarUrl: testUser.avatarUrl,
          about: testUser.about,
          updatedAt: new Date().toISOString()
        });
      }
      
      login(keyPair, s3Client);
      router.replace('/(tabs)/contacts');
    } catch (error) {
      console.error('Test user login error:', error);
      setError('Failed to login with test user. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };


  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={styles.logoContainer}>
          <Text style={styles.logo}>💬</Text>
        </View>
        <Text style={styles.title}>HippChat</Text>
        <Text style={styles.subtitle}>Secure 1:1 Encrypted Chat</Text>
        <View style={styles.securityBadge}>
          <Text style={styles.securityText}>🔐 End-to-End Encrypted</Text>
        </View>
      </View>

      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={() => setError(null)} style={styles.errorCloseButton}>
            <Text style={styles.errorCloseText}>×</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.testUsersContainer}>
        <Text style={styles.label}>Choose a test user to start chatting</Text>
        <View style={styles.usersGrid}>
          {testUsers.map((user) => (
            <TouchableOpacity
              key={user.ss58Address}
              style={[
                styles.testUserButton,
                isLoading && styles.testUserButtonDisabled
              ]}
              onPress={() => handleTestUserLogin(user)}
              disabled={isLoading}
            >
              <View style={styles.userAvatar}>
                <Text style={styles.userAvatarText}>
                  {user.displayName.charAt(0)}
                </Text>
              </View>
              <View style={styles.testUserInfo}>
                <Text style={styles.testUserName}>{user.displayName}</Text>
                <Text style={styles.testUserAddress}>{user.ss58Address.slice(0, 8)}...</Text>
                {user.about && (
                  <Text style={styles.testUserAbout} numberOfLines={2}>
                    {user.about}
                  </Text>
                )}
              </View>
              {isLoading && (
                <View style={styles.loadingIndicator}>
                  <ActivityIndicator color="#3167dd" size="small" />
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  content: {
    flexGrow: 1,
    padding: 24,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 48,
  },
  logoContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#e3f2fd',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    shadowColor: '#3167dd',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  logo: {
    fontSize: 32,
  },
  title: {
    fontSize: 36,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 18,
    color: '#6b7280',
    marginBottom: 16,
    textAlign: 'center',
  },
  securityBadge: {
    backgroundColor: '#e3f2fd',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#3167dd',
  },
  securityText: {
    fontSize: 14,
    color: '#3167dd',
    fontWeight: '600',
  },
  testUsersContainer: {
    marginBottom: 20,
  },
  label: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 20,
    textAlign: 'center',
  },
  usersGrid: {
    gap: 12,
  },
  testUserButton: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 16,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  testUserButtonDisabled: {
    opacity: 0.6,
  },
  userAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#3167dd',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  userAvatarText: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '600',
  },
  testUserInfo: {
    flex: 1,
  },
  testUserName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  testUserAddress: {
    fontSize: 13,
    color: '#6b7280',
    fontFamily: 'monospace',
    marginBottom: 6,
  },
  testUserAbout: {
    fontSize: 14,
    color: '#6b7280',
    lineHeight: 20,
  },
  loadingIndicator: {
    marginLeft: 12,
  },
  errorContainer: {
    backgroundColor: '#fef2f2',
    borderColor: '#ef4444',
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 20,
    marginBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  errorText: {
    color: '#ef4444',
    fontSize: 14,
    flex: 1,
    marginRight: 8,
    fontWeight: '500',
  },
  errorCloseButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorCloseText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
});
