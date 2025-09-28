import { useMessaging } from '@/lib/messaging';
import { Message } from '@/lib/s3';
import { useChatStore } from '@/lib/store';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

export default function ChatScreen() {
  const router = useRouter();
  const { 
    selectedContact, 
    contacts, 
    messages, 
    addMessage, 
    addMessages,
    updateLastReadOffset,
    currentUser 
  } = useChatStore();
  
  const [messageText, setMessageText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const messaging = useMessaging();
  const pollOffsetRef = useRef<number>(0);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollDelayRef = useRef<number>(5000);
  const burstRemainingRef = useRef<number>(0);

  const contact = contacts.find(c => c.address === selectedContact);
  const chatMessages = messages[selectedContact || ''] || [];

  useEffect(() => {
    if (!selectedContact || !messaging) {
      return;
    }

    let cancelled = false;
    pollDelayRef.current = 3000;

    const schedule = (delay: number) => {
      if (cancelled) return;
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
      pollTimerRef.current = setTimeout(pollOnce, delay);
    };

    const pollOnce = async () => {
      console.log('pollOnce called');
      if (cancelled || !selectedContact || !messaging) return;
      try {
        const newMessages = await messaging.pollMessages(selectedContact, pollOffsetRef.current);
        // pollMessages currently returns Message[]; offset is advanced inside store on next lines
        if (newMessages && newMessages.length > 0) {
          // de-dup against store before appending, in case poll returns overlapping lines
          const existing = useChatStore.getState().messages[selectedContact] || [];
          const existingIds = new Set(existing.map(m => m.msg_id));
          const deduped = newMessages.filter(m => !existingIds.has(m.msg_id));
          if (deduped.length > 0) {
            addMessages(selectedContact, deduped);
            // Trigger burst mode to reduce latency for subsequent polls
            burstRemainingRef.current = Math.max(burstRemainingRef.current, 3);
          }
        }
        // Update offset to latest known from store if messaging.pollMessages advanced it,
        // else keep the previous value. In current implementation, pollInboxTail returns
        // newOffset internally, but we don't get it here; so fetch from store.
        const latestOffset = (useChatStore.getState().lastReadOffsets[selectedContact] ?? pollOffsetRef.current);
        pollOffsetRef.current = latestOffset;
        // reset backoff on success
        pollDelayRef.current = 3000;
      } catch (error) {
        console.error('Failed to poll messages:', error);
        // keep retry cadence predictable despite transient errors (5-6s jitter)
        pollDelayRef.current = Math.floor(5000 + Math.random() * 1000);
      } finally {
        const delay = burstRemainingRef.current > 0 ? 1000 : pollDelayRef.current;
        if (burstRemainingRef.current > 0) burstRemainingRef.current -= 1;
        schedule(delay);
      }
    };

    const initAndStart = async () => {
      if (cancelled) return;
      try {
        setIsLoading(true);
        const savedOffset = useChatStore.getState().lastReadOffsets[selectedContact];
        if (savedOffset == null) {
          try {
            await messaging.loadInitialHistory(selectedContact, 100);
          } catch (e) {
            console.error('Failed initial history load:', e);
          }
        }
        try {
          const lookbackMs = 10 * 60 * 1000;
          const hasIncoming = await messaging.hasRecentIncoming(selectedContact, lookbackMs);
          // console.log('[chat-init] hasRecentIncoming within 10m:', hasIncoming, 'contact:', selectedContact);
          if (hasIncoming) {
            const now = Date.now();
            const threshold = now - lookbackMs;
            const existing = useChatStore.getState().messages[selectedContact] || [];
            const presentInStore = existing.some(m => m.from === selectedContact && new Date(m.ts).getTime() >= threshold);
            if (!presentInStore) {
              // console.log('[chat-init] recent incoming detected but not in store; backfilling');
              try {
                await messaging.loadInitialHistory(selectedContact, 150);
              } catch (bfErr) {
                console.error('[chat-init] backfill after hasRecentIncoming failed:', bfErr);
              }
            }
            // Enter burst mode to catch new lines within 1-3s
            burstRemainingRef.current = Math.max(burstRemainingRef.current, 3);
          }
        } catch (e) {
          console.error('[chat-init] hasRecentIncoming failed:', e);
        }
        const startOffset = (useChatStore.getState().lastReadOffsets[selectedContact] ?? new Date().getTime());
        pollOffsetRef.current = startOffset;
      } finally {
        setIsLoading(false);
        schedule(0);
      }
    };

    // start after optional backfill
    initAndStart();

    return () => {
      cancelled = true;
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [selectedContact, messaging]);

  const handleSendMessage = async () => {
    if (!messageText.trim() || !selectedContact || isSending || !messaging) return;

    const messageContent = messageText.trim();
    setMessageText('');
    setIsSending(true);

    try {
      const message = await messaging.sendMessage({
        to: selectedContact,
        content: messageContent,
        type: 'text'
      });

      // Add message to local state
      addMessage(selectedContact, message);
      
      // advance the poll offset optimistically by leveraging store's update on next poll
    } catch (error) {
      console.error('Failed to send message:', error);
      console.log('Error', 'Failed to send message. Please try again.');
      setMessageText(messageContent); // Restore message text
    } finally {
      setIsSending(false);
    }
  };

  const renderMessage = ({ item }: { item: Message & { decryptedContent?: string } }) => {
    const isOwn = item.from === currentUser?.ss58Address;
    const content = item.decryptedContent || 'Unable to decrypt';

    return (
      <View style={[styles.messageContainer, isOwn ? styles.ownMessage : styles.otherMessage]}>
        <View style={[styles.messageBubble, isOwn ? styles.ownBubble : styles.otherBubble]}>
          <Text style={[styles.messageText, isOwn ? styles.ownMessageText : styles.otherMessageText]}>
            {content}
          </Text>
          <Text style={[styles.messageTime, isOwn ? styles.ownMessageTime : styles.otherMessageTime]}>
            {new Date(item.ts).toLocaleTimeString([], { 
              hour: '2-digit', 
              minute: '2-digit' 
            })}
          </Text>
        </View>
      </View>
    );
  };

  if (!contact) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Contact not found</Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView 
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <View style={styles.contactInfo}>
          {contact.avatarUrl ? (
            <Image source={{ uri: contact.avatarUrl }} style={styles.headerAvatar} />
          ) : (
            <View style={styles.headerAvatarPlaceholder}>
              <Text style={styles.headerAvatarText}>
                {contact.displayName.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          <View style={styles.contactDetails}>
            <Text style={styles.contactName}>{contact.displayName}</Text>
            <View style={styles.statusContainer}>
              <View style={styles.statusIndicator} />
              <Text style={styles.contactStatus}>Online</Text>
            </View>
          </View>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.actionButton}>
            <Text style={styles.actionButtonText}>⋯</Text>
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        ref={flatListRef}
        data={chatMessages}
        keyExtractor={(item) => item.msg_id}
        renderItem={renderMessage}
        style={styles.messagesList}
        contentContainerStyle={styles.messagesContainer}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        onLayout={() => flatListRef.current?.scrollToEnd({ animated: true })}
      />

      <View style={styles.inputContainer}>
        <TextInput
          style={styles.textInput}
          value={messageText}
          onChangeText={setMessageText}
          placeholder="Type a message..."
          multiline
          maxLength={1000}
        />
        <TouchableOpacity
          style={[styles.sendButton, (!messageText.trim() || isSending) && styles.sendButtonDisabled]}
          onPress={handleSendMessage}
          disabled={!messageText.trim() || isSending}
        >
          {isSending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.sendButtonText}>Send</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
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
    marginBottom: 20,
    textAlign: 'center',
  },
  header: {
    flexDirection: 'row',
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
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f8fafc',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  backButtonText: {
    fontSize: 20,
    color: '#3167dd',
    fontWeight: '600',
  },
  contactInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  headerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginRight: 12,
  },
  headerAvatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#3167dd',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  headerAvatarText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  contactDetails: {
    flex: 1,
  },
  contactName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 2,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10b981',
    marginRight: 6,
  },
  contactStatus: {
    fontSize: 13,
    color: '#6b7280',
  },
  headerActions: {
    marginLeft: 12,
  },
  actionButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f8fafc',
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionButtonText: {
    fontSize: 18,
    color: '#6b7280',
    fontWeight: '600',
  },
  messagesList: {
    flex: 1,
  },
  messagesContainer: {
    padding: 20,
  },
  messageContainer: {
    marginBottom: 16,
  },
  ownMessage: {
    alignItems: 'flex-end',
  },
  otherMessage: {
    alignItems: 'flex-start',
  },
  messageBubble: {
    maxWidth: '85%',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 24,
  },
  ownBubble: {
    backgroundColor: '#3167dd',
    borderBottomRightRadius: 6,
  },
  otherBubble: {
    backgroundColor: '#ffffff',
    borderBottomLeftRadius: 6,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  messageText: {
    fontSize: 16,
    lineHeight: 22,
  },
  ownMessageText: {
    color: '#ffffff',
  },
  otherMessageText: {
    color: '#1a1a1a',
  },
  messageTime: {
    fontSize: 12,
    marginTop: 6,
  },
  ownMessageTime: {
    color: 'rgba(255, 255, 255, 0.7)',
    textAlign: 'right',
  },
  otherMessageTime: {
    color: '#9ca3af',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  textInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 14,
    marginRight: 12,
    maxHeight: 120,
    fontSize: 16,
    backgroundColor: '#f8fafc',
    color: '#1a1a1a',
  },
  sendButton: {
    backgroundColor: '#3167dd',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 24,
    minWidth: 70,
    alignItems: 'center',
    shadowColor: '#3167dd',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  sendButtonDisabled: {
    backgroundColor: '#9ca3af',
    shadowOpacity: 0,
    elevation: 0,
  },
  sendButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});
