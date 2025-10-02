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
        <View style={styles.headerContent}>
          <Text style={styles.title}>Profile</Text>
          <Text style={styles.subtitle}>Manage your account</Text>
        </View>
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
        confirmText="Yes, Logout"
        cancelText="Cancel"
        confirmButtonColor="#3167dd"
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
    backgroundColor: '#f8fafc',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#ffffff',
  },
  errorText: {
    fontSize: 18,
    color: '#6b7280',
    textAlign: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  headerContent: {
    flex: 1,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 4,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    color: '#6b7280',
    fontWeight: '500',
  },
  logoutButton: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    backgroundColor: '#3167dd',
    borderRadius: 10,
    shadowColor: '#3167dd',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  logoutText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  profileContainer: {
    backgroundColor: '#ffffff',
    margin: 20,
    borderRadius: 20,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: 32,
  },
  avatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#3167dd',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#3167dd',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  avatarText: {
    color: '#ffffff',
    fontSize: 36,
    fontWeight: '600',
  },
  changeAvatarButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  changeAvatarText: {
    color: '#3167dd',
    fontSize: 14,
    fontWeight: '600',
  },
  infoSection: {
    marginBottom: 32,
  },
  fieldContainer: {
    marginBottom: 24,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  fieldValue: {
    fontSize: 16,
    color: '#1a1a1a',
    lineHeight: 24,
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: '#f8fafc',
    color: '#1a1a1a',
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  addressText: {
    fontFamily: 'monospace',
    fontSize: 14,
    color: '#6b7280',
    backgroundColor: '#f8fafc',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  keyText: {
    fontFamily: 'monospace',
    fontSize: 14,
    color: '#6b7280',
    backgroundColor: '#f8fafc',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  buttonContainer: {
    marginTop: 24,
  },
  editButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  editButton: {
    backgroundColor: '#3167dd',
    shadowColor: '#3167dd',
    shadowOpacity: 0.2,
  },
  editButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  cancelButton: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  cancelButtonText: {
    color: '#6b7280',
    fontSize: 16,
    fontWeight: '600',
  },
  saveButton: {
    backgroundColor: '#3167dd',
    shadowColor: '#3167dd',
    shadowOpacity: 0.2,
  },
  saveButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});