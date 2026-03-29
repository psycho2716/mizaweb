export interface ConversationThread {
  id: string;
  buyerId: string;
  sellerId: string;
  updatedAt: string;
  peerId: string;
  peerEmail: string;
  lastMessagePreview?: string;
  lastMessageAt?: string;
}

export interface DirectMessage {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: string;
}
