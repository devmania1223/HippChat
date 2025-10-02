import MessageBox from '@/components/MessageBox';
import { useMessaging } from '@/lib/messaging';
import { useChatStore } from '@/lib/store';
import { getTestUsers } from '@/lib/test-users';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  FlatList,
  Image,
  Platform,
  RefreshControl,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

export default function ContactsScreen() {
  const router = useRouter();
  const {
    contacts,
    addContact,
    currentUser,
    logout,
    setSelectedContact
  } = useChatStore();

  const [refreshing, setRefreshing] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const messaging = useMessaging();

  useEffect(() => {
    const initializeContacts = async () => {
      if (contacts.length === 0) {
        try {
          const testUsers = await getTestUsers();
          testUsers.forEach(user => {
            if (user.ss58Address !== currentUser?.ss58Address) {
              addContact({
                address: user.ss58Address,
                displayName: user.displayName,
                pk: user.pk,
                avatarUrl: user.avatarUrl,
                about: user.about,
                unreadCount: 0,
              });
            }
          });
        } catch (error) {
          console.error('Failed to initialize test users:', error);
        }
      }
    };

    initializeContacts();
  }, [contacts.length, currentUser?.ss58Address, addContact]);

  const handleContactPress = (contact: any) => {
    setSelectedContact(contact.address);
    router.push('/chat');
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1000);
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

  const filteredContacts = contacts
    .filter(c => c.address !== currentUser?.ss58Address)
    .filter(c =>
      c.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.address.toLowerCase().includes(searchQuery.toLowerCase())
    );

  const formatTime = (timestamp: number) => {
    const now = new Date();
    const messageDate = new Date(timestamp);
    const diffInHours = (now.getTime() - messageDate.getTime()) / (1000 * 60 * 60);

    if (diffInHours < 24) {
      return messageDate.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit'
      });
    } else if (diffInHours < 48) {
      return 'Yesterday';
    } else if (diffInHours < 168) {
      return messageDate.toLocaleDateString([], { weekday: 'short' });
    } else {
      return messageDate.toLocaleDateString([], {
        month: 'short',
        day: 'numeric'
      });
    }
  };

  const getAvatarColor = (index: number) => {
    const colors = ['#3167dd', '#5856D6', '#AF52DE', '#FF2D55', '#FF9500', '#34C759'];
    return colors[index % colors.length];
  };

  const renderContact = ({ item, index }: { item: any; index: number }) => {
    const hasUnread = item.unreadCount > 0;

    return (
      <TouchableOpacity
        style={styles.contactItem}
        onPress={() => handleContactPress(item)}
        activeOpacity={0.7}
      >
        <View style={styles.avatarContainer}>
          {item.avatarUrl ? (
            <Image
              source={{ uri: item.avatarUrl }}
              style={styles.avatar}
            />
          ) : (
            <View style={[styles.avatarPlaceholder, { backgroundColor: getAvatarColor(index) }]}>
              <Text style={styles.avatarText}>
                {item.displayName.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}

          {item.isOnline && (
            <View style={styles.onlineIndicator} />
          )}

          {hasUnread && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadText}>
                {item.unreadCount > 99 ? '99+' : item.unreadCount}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.contactInfo}>
          <View style={styles.contactHeader}>
            <Text style={[styles.contactName, hasUnread && styles.contactNameUnread]} numberOfLines={1}>
              {item.displayName}
            </Text>
            {item.lastMessageTime && (
              <Text style={[styles.lastMessageTime, hasUnread && styles.lastMessageTimeUnread]}>
                {formatTime(item.lastMessageTime)}
              </Text>
            )}
          </View>

          {item.lastMessage ? (
            <Text
              style={[styles.lastMessage, hasUnread && styles.lastMessageUnread]}
              numberOfLines={1}
            >
              {item.lastMessage}
            </Text>
          ) : (
            <View>
              <Text style={styles.contactAddress} numberOfLines={1}>
                {item.address.slice(0, 12)}...{item.address.slice(-8)}
              </Text>
              {item.about && (
                <Text style={styles.noMessages} numberOfLines={1}>
                  {item.about}
                </Text>
              )}
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Text style={styles.emptyStateIcon}>💬</Text>
      <Text style={styles.emptyStateTitle}>No contacts found</Text>
      <Text style={styles.emptyStateText}>
        {searchQuery ? 'Try a different search term' : 'Your contacts will appear here'}
      </Text>
    </View>
  );

  const totalUnread = contacts.reduce((sum, c) => sum + (c.unreadCount || 0), 0);
  const activeContacts = contacts.filter(c => c.address !== currentUser?.ss58Address).length;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />

      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={styles.headerLeft}>
            <Text style={styles.title}>Messages</Text>
            <Text style={styles.subtitle}>{activeContacts} contacts</Text>
          </View>
          <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
            <Text style={styles.logoutText}>Logout</Text>
          </TouchableOpacity>
        </View>

        {totalUnread > 0 && (
          <View style={styles.statsContainer}>
            <View style={styles.unreadChip}>
              <Text style={styles.unreadChipText}>
                {totalUnread} unread message{totalUnread > 1 ? 's' : ''}
              </Text>
            </View>
          </View>
        )}

        <View style={styles.searchContainer}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search contacts..."
            placeholderTextColor="#9ca3af"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearButton}>
              <Text style={styles.clearIcon}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <FlatList
        data={filteredContacts}
        keyExtractor={(item) => item.address}
        renderItem={renderContact}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#3167dd"
            colors={['#3167dd']}
          />
        }
        contentContainerStyle={[
          styles.listContainer,
          filteredContacts.length === 0 && styles.listContainerEmpty
        ]}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={renderEmptyState}
      />

      <MessageBox
        visible={showLogoutModal}
        title="Logout"
        message="Are you sure you want to logout."
        confirmText="Yes, Logout"
        cancelText="Cancel"
        confirmButtonColor="#3167dd"
        onConfirm={confirmLogout}
        onCancel={cancelLogout}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    backgroundColor: '#ffffff',
    paddingTop: Platform.OS === 'ios' ? 10 : 20,
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  headerLeft: {
    flex: 1,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: '#1a1a1a',
    marginBottom: 4,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    color: '#9096a1ff',
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
  statsContainer: {
    marginBottom: 14,
  },
  unreadChip: {
    backgroundColor: '#3167dd',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 14,
    alignSelf: 'flex-start',
    shadowColor: '#3167dd',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 2,
  },
  unreadChipText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  searchIcon: {
    fontSize: 16,
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#1a1a1a',
    padding: 0,
    fontWeight: '500',
  },
  clearButton: {
    padding: 4,
  },
  clearIcon: {
    fontSize: 16,
    color: '#9ca3af',
    fontWeight: '600',
  },
  listContainer: {
    padding: 20,
  },
  listContainerEmpty: {
    flexGrow: 1,
  },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    padding: 16,
    marginBottom: 12,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#f3f4f6',
  },
  avatarContainer: {
    position: 'relative',
    marginRight: 16,
  },
  avatar: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#e5e7eb',
  },
  avatarPlaceholder: {
    width: 58,
    height: 58,
    borderRadius: 29,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '700',
  },
  onlineIndicator: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#34C759',
    borderWidth: 3,
    borderColor: '#ffffff',
  },
  unreadBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#3167dd',
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 7,
    borderWidth: 2.5,
    borderColor: '#ffffff',
    shadowColor: '#3167dd',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 3,
  },
  unreadText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800',
  },
  contactInfo: {
    flex: 1,
  },
  contactHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5,
  },
  contactName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a1a',
    flex: 1,
    marginRight: 8,
    letterSpacing: -0.3,
  },
  contactNameUnread: {
    fontWeight: '700',
    color: '#000000',
  },
  contactAddress: {
    fontSize: 13,
    color: '#6b7280',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginBottom: 3,
  },
  lastMessage: {
    fontSize: 15,
    color: '#6b7280',
    lineHeight: 20,
  },
  lastMessageUnread: {
    fontWeight: '600',
    color: '#374151',
  },
  noMessages: {
    fontSize: 14,
    color: '#9ca3af',
    fontStyle: 'italic',
  },
  lastMessageTime: {
    fontSize: 13,
    color: '#9ca3af',
    fontWeight: '500',
  },
  lastMessageTimeUnread: {
    color: '#3167dd',
    fontWeight: '700',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingTop: 60,
  },
  emptyStateIcon: {
    fontSize: 64,
    marginBottom: 20,
  },
  emptyStateTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 10,
    letterSpacing: -0.3,
  },
  emptyStateText: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 24,
  },
});