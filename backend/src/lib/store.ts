import type {
  AuthUser,
  CartItem,
  OrderRecord,
  ProductRecord,
  VerificationStatus,
  VerificationSubmission,
} from "../types/domain";

const users = new Map<string, AuthUser>();
const sellerStatus = new Map<string, VerificationStatus>();
const verifications = new Map<string, VerificationSubmission>();
const products = new Map<string, ProductRecord>();
const cartItems = new Map<string, CartItem>();
const orders = new Map<string, OrderRecord>();

const seedUsers: AuthUser[] = [
  { id: "u-buyer-1", email: "buyer@miza.dev", role: "buyer" },
  { id: "u-seller-1", email: "seller@miza.dev", role: "seller" },
  { id: "u-admin-1", email: "admin@miza.dev", role: "admin" },
];

for (const user of seedUsers) {
  users.set(user.id, user);
}
sellerStatus.set("u-seller-1", "unsubmitted");

export const db = {
  users,
  sellerStatus,
  verifications,
  products,
  cartItems,
  orders,
};
