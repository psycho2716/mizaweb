import type {
  AuthUser,
  CartItem,
  ConversationMessageRecord,
  ConversationRecord,
  CustomizationOption,
  CustomizationRule,
  OrderLineItemRecord,
  OrderMessage,
  OrderRecord,
  ProductMedia,
  ProductRecord,
  ProductReviewRecord,
  SellerPaymentMethod,
  SellerLocationChangeRequest,
  SellerProfile,
  VerificationStatus,
  VerificationSubmission,
} from "../types/domain";
import { hashPassword } from "./password";

const users = new Map<string, AuthUser>();
const credentials = new Map<string, { userId: string; passwordHash: string }>();
const sellerProfiles = new Map<string, SellerProfile>();
const sellerPaymentMethods = new Map<string, SellerPaymentMethod>();
const sellerStatus = new Map<string, VerificationStatus>();
const verifications = new Map<string, VerificationSubmission>();
const sellerLocationRequests = new Map<string, SellerLocationChangeRequest>();
const products = new Map<string, ProductRecord>();
const cartItems = new Map<string, CartItem>();
const orders = new Map<string, OrderRecord>();
const orderLineItems = new Map<string, OrderLineItemRecord>();
const orderMessages = new Map<string, OrderMessage>();
const productReviews = new Map<string, ProductReviewRecord>();
const conversations = new Map<string, ConversationRecord>();
const conversationMessages = new Map<string, ConversationMessageRecord>();
const productMedia = new Map<string, ProductMedia>();
const customizationOptions = new Map<string, CustomizationOption>();
const customizationRules = new Map<string, CustomizationRule>();

const seedUsers: AuthUser[] = [
  { id: "u-buyer-1", email: "buyer@miza.dev", role: "buyer" },
  { id: "u-seller-1", email: "seller@miza.dev", role: "seller" },
  { id: "u-admin-1", email: "admin@miza.dev", role: "admin" },
];

const seedCredentials = [
  { userId: "u-buyer-1", email: "buyer@miza.dev", password: "Buyer123!" },
  { userId: "u-seller-1", email: "seller@miza.dev", password: "Seller123!" },
  { userId: "u-admin-1", email: "admin@miza.dev", password: "Admin123!" },
];

for (const user of seedUsers) {
  users.set(user.id, user);
}
for (const credential of seedCredentials) {
  credentials.set(credential.email.toLowerCase(), {
    userId: credential.userId,
    passwordHash: hashPassword(credential.password),
  });
}
sellerStatus.set("u-seller-1", "unsubmitted");
sellerProfiles.set("u-seller-1", {
  sellerId: "u-seller-1",
  businessName: "Romblon Stone Craft",
  contactNumber: "+639000000001",
  address: "Romblon, Philippines",
  shopLatitude: 12.5755,
  shopLongitude: 122.2707
});

export const db = {
  users,
  credentials,
  sellerProfiles,
  sellerPaymentMethods,
  sellerStatus,
  verifications,
  sellerLocationRequests,
  products,
  cartItems,
  orders,
  orderLineItems,
  orderMessages,
  productReviews,
  conversations,
  conversationMessages,
  productMedia,
  customizationOptions,
  customizationRules,
};

export const defaultSeedUsers = seedUsers;
export const defaultSeedCredentials = seedCredentials;
