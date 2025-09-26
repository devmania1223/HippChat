import MessageBox from '@/components/MessageBox';
import { useMessaging } from '@/lib/messaging';
import { useChatStore } from '@/lib/store';
import { getTestUsers } from '@/lib/test-users';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';

export default function ContactsScreen() {
  const router = useRouter();
  const { 
    contacts, 
    addContact, 
    updateContact, 
    currentUser, 
    logout,
    setSelectedContact 
  } = useChatStore();
  
  const [refreshing, setRefreshing] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const messaging = useMessaging();

  // Initialize contacts with test users
  useEffect(() => {
    const initializeContacts = () => {
      if (contacts.length === 0) {
        try {
          const testUsers = getTestUsers();
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
    // Here you would typically poll for new messages
    // For now, just simulate a refresh
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

  const renderContact = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={styles.contactItem}
      onPress={() => handleContactPress(item)}
    >
      <View style={styles.avatarContainer}>
        {item.avatarUrl ? (
          <Image source={{ uri: item.avatarUrl }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarText}>
              {item.displayName.charAt(0).toUpperCase()}
            </Text>
          </View>
        )}
        {item.unreadCount > 0 && (
          <View style={styles.unreadBadge}>
            <Text style={styles.unreadText}>
              {item.unreadCount > 99 ? '99+' : item.unreadCount}
            </Text>
          </View>
        )}
      </View>
      
      <View style={styles.contactInfo}>
        <Text style={styles.contactName}>{item.displayName}</Text>
        <Text style={styles.contactAddress}>{item.address.slice(0, 8)}...</Text>
        {item.lastMessage && (
          <Text style={styles.lastMessage} numberOfLines={1}>
            {item.lastMessage}
          </Text>
        )}
        {item.lastMessageTime && (
          <Text style={styles.lastMessageTime}>
            {new Date(item.lastMessageTime).toLocaleTimeString([], { 
              hour: '2-digit', 
              minute: '2-digit' 
            })}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Contacts</Text>
        <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>
      
      <FlatList
        data={contacts.filter(c => c.address !== currentUser?.ss58Address)}
        keyExtractor={(item) => item.address}
        renderItem={renderContact}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        contentContainerStyle={styles.listContainer}
        showsVerticalScrollIndicator={false}
      />
      
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
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
  listContainer: {
    padding: 20,
  },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    marginBottom: 8,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  avatarContainer: {
    position: 'relative',
    marginRight: 12,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  avatarPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  unreadBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: '#ff4444',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  unreadText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  contactInfo: {
    flex: 1,
  },
  contactName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  contactAddress: {
    fontSize: 12,
    color: '#666',
    fontFamily: 'monospace',
    marginBottom: 4,
  },
  lastMessage: {
    fontSize: 14,
    color: '#666',
    marginBottom: 2,
  },
  lastMessageTime: {
    fontSize: 12,
    color: '#999',
    alignSelf: 'flex-end',
  },
});