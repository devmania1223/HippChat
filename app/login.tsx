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
        <Text style={styles.title}>HippChat</Text>
        <Text style={styles.subtitle}>Secure 1:1 Encrypted Chat</Text>
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
        <Text style={styles.label}>Choose a test user to start chatting:</Text>
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
            <View style={styles.testUserInfo}>
              <Text style={styles.testUserName}>{user.displayName}</Text>
              <Text style={styles.testUserAddress}>{user.ss58Address.slice(0, 8)}...</Text>
              {user.about && (
                <Text style={styles.testUserAbout}>{user.about}</Text>
              )}
            </View>
            {isLoading && (
              <ActivityIndicator color="#007AFF" size="small" />
            )}
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  content: {
    flexGrow: 1,
    padding: 20,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
  },
  testUsersContainer: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  testUserButton: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 16,
    marginBottom: 8,
  },
  testUserButtonDisabled: {
    opacity: 0.6,
  },
  testUserInfo: {
    flex: 1,
  },
  testUserName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  testUserAddress: {
    fontSize: 12,
    color: '#666',
    fontFamily: 'monospace',
    marginBottom: 4,
  },
  testUserAbout: {
    fontSize: 14,
    color: '#666',
  },
  errorContainer: {
    backgroundColor: '#FFE6E6',
    borderColor: '#FF3B30',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginHorizontal: 20,
    marginBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  errorText: {
    color: '#FF3B30',
    fontSize: 14,
    flex: 1,
    marginRight: 8,
  },
  errorCloseButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FF3B30',
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorCloseText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
