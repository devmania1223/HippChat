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
          <Text style={styles.backButtonText}>← Back</Text>
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
          <View>
            <Text style={styles.contactName}>{contact.displayName}</Text>
            <Text style={styles.contactStatus}>Online</Text>
          </View>
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
    marginBottom: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  backButton: {
    marginRight: 16,
  },
  backButtonText: {
    fontSize: 16,
    color: '#007AFF',
  },
  contactInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  headerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  headerAvatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  headerAvatarText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  contactName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  contactStatus: {
    fontSize: 12,
    color: '#666',
  },
  messagesList: {
    flex: 1,
  },
  messagesContainer: {
    padding: 16,
  },
  messageContainer: {
    marginBottom: 12,
  },
  ownMessage: {
    alignItems: 'flex-end',
  },
  otherMessage: {
    alignItems: 'flex-start',
  },
  messageBubble: {
    maxWidth: '80%',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 20,
  },
  ownBubble: {
    backgroundColor: '#007AFF',
    borderBottomRightRadius: 4,
  },
  otherBubble: {
    backgroundColor: '#fff',
    borderBottomLeftRadius: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  messageText: {
    fontSize: 16,
    lineHeight: 20,
  },
  ownMessageText: {
    color: '#fff',
  },
  otherMessageText: {
    color: '#333',
  },
  messageTime: {
    fontSize: 12,
    marginTop: 4,
  },
  ownMessageTime: {
    color: 'rgba(255, 255, 255, 0.7)',
    textAlign: 'right',
  },
  otherMessageTime: {
    color: '#999',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  textInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginRight: 12,
    maxHeight: 100,
    fontSize: 16,
  },
  sendButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 20,
    minWidth: 60,
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#ccc',
  },
  sendButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
