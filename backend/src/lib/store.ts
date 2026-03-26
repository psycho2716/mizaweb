import type {
  AuthUser,
  CartItem,
  SellerProfile,
  CustomizationOption,
  CustomizationRule,
  OrderMessage,
  OrderRecord,
  ProductMedia,
  ProductRecord,
  VerificationStatus,
  VerificationSubmission,
} from "../types/domain";
import { hashPassword } from "./password";

const users = new Map<string, AuthUser>();
const credentials = new Map<string, { userId: string; passwordHash: string }>();
const sellerProfiles = new Map<string, SellerProfile>();
const sellerStatus = new Map<string, VerificationStatus>();
const verifications = new Map<string, VerificationSubmission>();
const products = new Map<string, ProductRecord>();
const cartItems = new Map<string, CartItem>();
const orders = new Map<string, OrderRecord>();
const orderMessages = new Map<string, OrderMessage>();
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
});

export const db = {
  users,
  credentials,
  sellerProfiles,
  sellerStatus,
  verifications,
  products,
  cartItems,
  orders,
  orderMessages,
  productMedia,
  customizationOptions,
  customizationRules,
};

export const defaultSeedUsers = seedUsers;
export const defaultSeedCredentials = seedCredentials;
