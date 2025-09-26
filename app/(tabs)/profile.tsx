import MessageBox from '@/components/MessageBox';
import { useMessaging } from '@/lib/messaging';
import { useChatStore } from '@/lib/store';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';

export default function ProfileScreen() {
  const { currentUser, logout } = useChatStore();
  const [displayName, setDisplayName] = useState('Anonymous');
  const [about, setAbout] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const messaging = useMessaging();
  const router = useRouter();
  const [isProfileLoading, setIsProfileLoading] = useState(true);

  // Load existing profile into local state
  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        if (!currentUser || !messaging) return;
        const existing = await messaging.getUserProfile(currentUser.ss58Address);
        if (!isMounted || !existing) return;
        if (existing.displayName) setDisplayName(existing.displayName);
        if (existing.about) setAbout(existing.about);
      } catch (e) {
        console.error('Failed to load existing profile:', e);
      } finally {
        if (isMounted) setIsProfileLoading(false);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [currentUser?.ss58Address, messaging]);

  const handleSaveProfile = async () => {
    if (!currentUser || !messaging) return;

    setIsSaving(true);
    try {
      await messaging.updateUserProfile({
        v: 1,
        address: currentUser.ss58Address,
        displayName,
        pk: Buffer.from(currentUser.pk).toString('hex'),
        about,
        updatedAt: new Date().toISOString()
      });
      setIsEditing(false);
      console.log('Success', 'Profile updated successfully');
    } catch (error) {
      console.error('Failed to update profile:', error);
      console.error('Error', 'Failed to update profile. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogout = () => {
    setShowLogoutModal(true);
  };

  const confirmLogout = () => {
    setShowLogoutModal(false);
    logout();
    router.replace('/login');
  };

  const cancelLogout = () => {
    setShowLogoutModal(false);
  };

  if (!currentUser) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Not authenticated</Text>
      </View>
    );
  }

  if (isProfileLoading) {
    return (
      <ScrollView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Profile</Text>
          <View style={[styles.logoutButton, { opacity: 0.6 }]}>
            <Text style={styles.logoutText}>Logout</Text>
          </View>
        </View>

        <View style={styles.profileContainer}>
          <View style={styles.avatarSection}>
            <SkeletonCircle size={80} />
            <View style={{ height: 12 }} />
            <SkeletonLine width={120} height={16} />
          </View>

          <View style={styles.infoSection}>
            <SkeletonField labelWidth={120} valueWidth={200} />
            <SkeletonField labelWidth={80} valueWidth={260} multipleLines />
            <SkeletonField labelWidth={90} valueWidth={260} />
            <SkeletonField labelWidth={100} valueWidth={220} />
          </View>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Profile</Text>
        <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.profileContainer}>
        <View style={styles.avatarSection}>
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarText}>
              {displayName.charAt(0).toUpperCase()}
            </Text>
          </View>
          <TouchableOpacity style={styles.changeAvatarButton}>
            <Text style={styles.changeAvatarText}>Change Avatar</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.infoSection}>
          <View style={styles.fieldContainer}>
            <Text style={styles.fieldLabel}>Display Name</Text>
            {isEditing ? (
              <TextInput
                style={styles.textInput}
                value={displayName}
                onChangeText={setDisplayName}
                placeholder="Enter display name"
              />
            ) : (
              <Text style={styles.fieldValue}>{displayName}</Text>
            )}
          </View>

          <View style={styles.fieldContainer}>
            <Text style={styles.fieldLabel}>About</Text>
            {isEditing ? (
              <TextInput
                style={[styles.textInput, styles.textArea]}
                value={about}
                onChangeText={setAbout}
                placeholder="Tell us about yourself"
                multiline
                numberOfLines={3}
              />
            ) : (
              <Text style={styles.fieldValue}>{about || 'No description'}</Text>
            )}
          </View>

          <View style={styles.fieldContainer}>
            <Text style={styles.fieldLabel}>Address</Text>
            <Text style={[styles.fieldValue, styles.addressText]}>{currentUser.ss58Address}</Text>
          </View>

          <View style={styles.fieldContainer}>
            <Text style={styles.fieldLabel}>Public Key</Text>
            <Text style={[styles.fieldValue, styles.keyText]}>
              {Buffer.from(currentUser.pk).toString('hex').slice(0, 32)}...
            </Text>
          </View>
        </View>

        <View style={styles.buttonContainer}>
          {isEditing ? (
            <View style={styles.editButtons}>
              <TouchableOpacity
                style={[styles.button, styles.cancelButton]}
                onPress={() => setIsEditing(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.saveButton]}
                onPress={handleSaveProfile}
                disabled={isSaving}
              >
                {isSaving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.saveButtonText}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.button, styles.editButton]}
              onPress={() => setIsEditing(true)}
            >
              <Text style={styles.editButtonText}>Edit Profile</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
      
      <MessageBox
        visible={showLogoutModal}
        title="Logout"
        message="Are you sure you want to logout?"
        confirmText="Logout"
        cancelText="Cancel"
        confirmButtonColor="#FF3B30"
        onConfirm={confirmLogout}
        onCancel={cancelLogout}
      />
    </ScrollView>
  );
}

function usePulse() {
  const opacity = React.useRef(new Animated.Value(0.6)).current;
  React.useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.6, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return opacity;
}

function SkeletonLine({ width = 200, height = 14 }: { width?: number; height?: number }) {
  const opacity = usePulse();
  return (
    <Animated.View
      style={{ width, height, borderRadius: 6, backgroundColor: '#e6e6e6', opacity, marginBottom: 12 }}
    />
  );
}

function SkeletonCircle({ size = 50 }: { size?: number }) {
  const opacity = usePulse();
  return (
    <Animated.View
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#e6e6e6', opacity }}
    />
  );
}

function SkeletonField({ labelWidth = 100, valueWidth = 220, multipleLines = false }: { labelWidth?: number; valueWidth?: number; multipleLines?: boolean }) {
  return (
    <View style={{ marginBottom: 20 }}>
      <SkeletonLine width={labelWidth} height={12} />
      <SkeletonLine width={valueWidth} height={16} />
      {multipleLines && <SkeletonLine width={valueWidth} height={16} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 18,
    color: '#666',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  logoutButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#ff4444',
    borderRadius: 6,
  },
  logoutText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  profileContainer: {
    backgroundColor: '#fff',
    margin: 20,
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: 30,
  },
  avatarPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarText: {
    color: '#fff',
    fontSize: 32,
    fontWeight: 'bold',
  },
  changeAvatarButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#f0f0f0',
    borderRadius: 6,
  },
  changeAvatarText: {
    color: '#007AFF',
    fontSize: 14,
    fontWeight: '600',
  },
  infoSection: {
    marginBottom: 30,
  },
  fieldContainer: {
    marginBottom: 20,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
  },
  fieldValue: {
    fontSize: 16,
    color: '#333',
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    backgroundColor: '#f9f9f9',
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  addressText: {
    fontFamily: 'monospace',
    fontSize: 14,
  },
  keyText: {
    fontFamily: 'monospace',
    fontSize: 14,
  },
  buttonContainer: {
    marginTop: 20,
  },
  editButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  editButton: {
    backgroundColor: '#007AFF',
  },
  editButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  cancelButton: {
    backgroundColor: '#f0f0f0',
  },
  cancelButtonText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '600',
  },
  saveButton: {
    backgroundColor: '#007AFF',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});