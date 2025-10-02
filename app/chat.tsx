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
  SafeAreaView,
  StatusBar,
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
        if (newMessages && newMessages.length > 0) {
          const existing = useChatStore.getState().messages[selectedContact] || [];
          const existingIds = new Set(existing.map(m => m.msg_id));
          const deduped = newMessages.filter(m => !existingIds.has(m.msg_id));
          if (deduped.length > 0) {
            addMessages(selectedContact, deduped);
            burstRemainingRef.current = Math.max(burstRemainingRef.current, 3);
          }
        }
        const latestOffset = (useChatStore.getState().lastReadOffsets[selectedContact] ?? pollOffsetRef.current);
        pollOffsetRef.current = latestOffset;
        pollDelayRef.current = 3000;
      } catch (error) {
        console.error('Failed to poll messages:', error);
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
          if (hasIncoming) {
            const now = Date.now();
            const threshold = now - lookbackMs;
            const existing = useChatStore.getState().messages[selectedContact] || [];
            const presentInStore = existing.some(m => m.from === selectedContact && new Date(m.ts).getTime() >= threshold);
            if (!presentInStore) {
              try {
                await messaging.loadInitialHistory(selectedContact, 150);
              } catch (bfErr) {
                console.error('[chat-init] backfill after hasRecentIncoming failed:', bfErr);
              }
            }
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

      addMessage(selectedContact, message);
    } catch (error) {
      console.error('Failed to send message:', error);
      console.log('Error', 'Failed to send message. Please try again.');
      setMessageText(messageContent);
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
      <SafeAreaView style={styles.errorContainer}>
        <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
        <Text style={styles.errorText}>Contact not found</Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.errorButton}>
          <Text style={styles.errorButtonText}>Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#075e54" />
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        {/* WhatsApp-style Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backButtonText}>←</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.contactInfo} activeOpacity={0.7}>
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
              <Text style={styles.contactName} numberOfLines={1}>
                {contact.displayName}
              </Text>
              <Text style={styles.contactStatus}>online</Text>
            </View>
          </TouchableOpacity>

          <View style={styles.headerActions}>
            <TouchableOpacity style={styles.headerIconButton}>
              <Text style={styles.headerIcon}>📹</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.headerIconButton}>
              <Text style={styles.headerIcon}>📞</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.headerIconButton}>
              <Text style={styles.headerIcon}>⋮</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Messages List */}
        <View style={styles.messagesWrapper}>
          <FlatList
            ref={flatListRef}
            data={chatMessages}
            keyExtractor={(item) => item.msg_id}
            renderItem={renderMessage}
            style={styles.messagesList}
            contentContainerStyle={styles.messagesContainer}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
            onLayout={() => flatListRef.current?.scrollToEnd({ animated: true })}
            showsVerticalScrollIndicator={false}
          />
        </View>

        {/* Input Area - Fixed at bottom */}
        <View style={styles.inputWrapper}>
          <View style={styles.inputContainer}>
            <TouchableOpacity style={styles.iconButton}>
              <Text style={styles.iconButtonText}>😊</Text>
            </TouchableOpacity>

            <TextInput
              style={styles.textInput}
              value={messageText}
              onChangeText={setMessageText}
              placeholder="Message"
              placeholderTextColor="#8696a0"
              multiline
              maxLength={1000}
            />

            <TouchableOpacity style={styles.iconButton}>
              <Text style={styles.iconButtonText}>📎</Text>
            </TouchableOpacity>

            {messageText.trim() ? (
              <TouchableOpacity
                style={styles.sendButton}
                onPress={handleSendMessage}
                disabled={isSending}
              >
                {isSending ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={styles.sendIcon}>➤</Text>
                )}
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.iconButton}>
                <Text style={styles.iconButtonText}>🎤</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#075e54',
  },
  keyboardView: {
    flex: 1,
    backgroundColor: '#efeae2',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#ffffff',
  },
  errorText: {
    fontSize: 16,
    color: '#667781',
    marginBottom: 20,
    textAlign: 'center',
  },
  errorButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#075e54',
    borderRadius: 24,
  },
  errorButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 8,
    backgroundColor: '#075e54',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  backButton: {
    padding: 8,
    marginRight: 4,
  },
  backButtonText: {
    fontSize: 24,
    color: '#ffffff',
    fontWeight: '400',
  },
  contactInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    paddingRight: 8,
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
    backgroundColor: '#d9d9d9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  headerAvatarText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
  },
  contactDetails: {
    flex: 1,
    justifyContent: 'center',
  },
  contactName: {
    fontSize: 17,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 1,
  },
  contactStatus: {
    fontSize: 13,
    color: '#d1d7db',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerIconButton: {
    padding: 8,
    marginLeft: 4,
  },
  headerIcon: {
    fontSize: 20,
    color: '#ffffff',
  },
  messagesWrapper: {
    flex: 1,
  },
  messagesList: {
    flex: 1,
  },
  messagesContainer: {
    padding: 8,
    paddingBottom: 16,
  },
  messageContainer: {
    marginBottom: 4,
    paddingHorizontal: 4,
  },
  ownMessage: {
    alignItems: 'flex-end',
  },
  otherMessage: {
    alignItems: 'flex-start',
  },
  messageBubble: {
    maxWidth: '80%',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
  },
  ownBubble: {
    backgroundColor: '#dcf8c6',
    borderTopRightRadius: 2,
  },
  otherBubble: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 2,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 20,
  },
  ownMessageText: {
    color: '#303030',
  },
  otherMessageText: {
    color: '#303030',
  },
  messageTime: {
    fontSize: 11,
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  ownMessageTime: {
    color: '#667781',
  },
  otherMessageTime: {
    color: '#667781',
  },
  inputWrapper: {
    backgroundColor: '#f0f2f5',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: '#e1e1e1',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: '#ffffff',
    borderRadius: 24,
    paddingHorizontal: 4,
    paddingVertical: 4,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  iconButton: {
    padding: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconButtonText: {
    fontSize: 22,
  },
  textInput: {
    flex: 1,
    maxHeight: 100,
    fontSize: 16,
    lineHeight: 20,
    paddingHorizontal: 8,
    paddingVertical: 8,
    color: '#303030',
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#00a884',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 4,
  },
  sendIcon: {
    fontSize: 20,
    color: '#ffffff',
    fontWeight: 'bold',
  },
});