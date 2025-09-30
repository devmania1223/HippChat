import { deriveKeysFromSeed, hippiusCredentialsFromKeyPair, mnemonicToSs58 } from '@/lib/crypto';
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
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';

export default function LoginScreen() {
  const [isLoading, setIsLoading] = useState(false);
  const [testUsers, setTestUsers] = useState<any[]>([]);
  const [loginMode, setLoginMode] = useState<'test' | 'seed'>('test');
  const [seedPhrase, setSeedPhrase] = useState('');
  const [isValidatingSeed, setIsValidatingSeed] = useState(false);

  const router = useRouter();
  const { login, setError, logout, error } = useChatStore();

  const config = Constants.expoConfig?.extra;
  const s3Endpoint = config?.hippS3Endpoint || 'https://your-hippius-s3-endpoint.com';

  // Load test users on component mount
  React.useEffect(() => {
    const loadTestUsers = async () => {
      const users = await getTestUsers();
      setTestUsers(users);
    };
    loadTestUsers();
  }, []);

  const handleTestUserLogin = async (testUser: any) => {
    setIsLoading(true);
    try {
      const keyPair = await deriveKeysFromSeed(testUser.seed);
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

  const handleSeedLogin = async () => {
    if (!seedPhrase.trim()) {
      setError('Please enter a valid seed phrase');
      return;
    }

    setIsValidatingSeed(true);
    try {
      // Get address from seed using API
      const { ss58_address, public_key } = await mnemonicToSs58(seedPhrase.trim());

      // Derive keypair using the API response
      const keyPair = await deriveKeysFromSeed(seedPhrase.trim());
      const credentials = hippiusCredentialsFromKeyPair(keyPair);

      const s3Client = makeS3Client({
        endpoint: s3Endpoint,
        ...credentials
      });

      // Ensure user storage exists
      await ensureUserStorage(s3Client, `chat-${ss58_address}`);
      const messaging = new (await import('@/lib/messaging')).MessagingService(s3Client, keyPair);
      await ensureUserStorage(s3Client, `profile-${ss58_address}`);

      // Load existing profile or create a new one
      const existingProfile = await messaging.getUserProfile(ss58_address);
      if (!existingProfile) {
        await messaging.updateUserProfile({
          v: 1,
          address: ss58_address,
          displayName: `User ${ss58_address.slice(0, 8)}`,
          pk: public_key,
          about: 'Secure chat user',
          updatedAt: new Date().toISOString()
        });
      }

      login(keyPair, s3Client);
      router.replace('/(tabs)/contacts');
    } catch (error) {
      console.error('Seed login error:', error);
      setError(error instanceof Error ? error.message : 'Failed to login with seed phrase. Please try again.');
    } finally {
      setIsValidatingSeed(false);
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

      {/* Login Mode Toggle */}
      <View style={styles.modeToggleContainer}>
        <TouchableOpacity
          style={[
            styles.modeToggle,
            loginMode === 'test' && styles.modeToggleActive
          ]}
          onPress={() => setLoginMode('test')}
        >
          <Text style={[
            styles.modeToggleText,
            loginMode === 'test' && styles.modeToggleTextActive
          ]}>
            Test Users
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.modeToggle,
            loginMode === 'seed' && styles.modeToggleActive
          ]}
          onPress={() => setLoginMode('seed')}
        >
          <Text style={[
            styles.modeToggleText,
            loginMode === 'seed' && styles.modeToggleTextActive
          ]}>
            Seed Phrase
          </Text>
        </TouchableOpacity>
      </View>

      {loginMode === 'test' ? (
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
      ) : (
        <View style={styles.seedContainer}>
          <Text style={styles.label}>Enter your seed phrase</Text>
          <Text style={styles.seedSubtitle}>
            Enter your 12 or 24 word seed phrase to access your wallet
          </Text>
          <View style={styles.seedInputContainer}>
            <TextInput
              style={styles.seedInput}
              value={seedPhrase}
              onChangeText={setSeedPhrase}
              placeholder="Enter your seed phrase here..."
              placeholderTextColor="#9ca3af"
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry={false}
            />
          </View>
          <TouchableOpacity
            style={[
              styles.seedLoginButton,
              (!seedPhrase.trim() || isValidatingSeed) && styles.seedLoginButtonDisabled
            ]}
            onPress={handleSeedLogin}
            disabled={!seedPhrase.trim() || isValidatingSeed}
          >
            {isValidatingSeed ? (
              <ActivityIndicator color="#ffffff" size="small" />
            ) : (
              <Text style={styles.seedLoginButtonText}>Login with Seed</Text>
            )}
          </TouchableOpacity>
        </View>
      )}
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
  modeToggleContainer: {
    flexDirection: 'row',
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 4,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  modeToggle: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  modeToggleActive: {
    backgroundColor: '#3167dd',
    shadowColor: '#3167dd',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  modeToggleText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
  },
  modeToggleTextActive: {
    color: '#ffffff',
  },
  seedContainer: {
    marginBottom: 20,
  },
  seedSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
  },
  seedInputContainer: {
    marginBottom: 20,
  },
  seedInput: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontSize: 16,
    color: '#1a1a1a',
    minHeight: 120,
    textAlignVertical: 'top',
  },
  seedLoginButton: {
    backgroundColor: '#3167dd',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 16,
    alignItems: 'center',
    shadowColor: '#3167dd',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  seedLoginButtonDisabled: {
    backgroundColor: '#9ca3af',
    shadowOpacity: 0,
    elevation: 0,
  },
  seedLoginButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});
