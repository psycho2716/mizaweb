import { z } from "zod";

export const loginSchema = z.object({
    email: z.string().email("Enter a valid email"),
    password: z.string().min(8, "Password must be at least 8 characters")
});

export const buyerRegisterSchema = loginSchema.extend({
    role: z.literal("buyer")
});

export const sellerRegisterSchema = loginSchema.extend({
    role: z.literal("seller"),
    fullName: z.string().min(2, "Full name is required"),
    businessName: z.string().min(2, "Business name is required"),
    contactNumber: z.string().min(7, "Contact number is required"),
    address: z.string().min(3, "Business address is required"),
    shopLatitude: z
        .number({ error: "Drop a pin on the map for your shop" })
        .min(-90)
        .max(90),
    shopLongitude: z
        .number({ error: "Drop a pin on the map for your shop" })
        .min(-180)
        .max(180)
});

export const registerSchema = z.union([buyerRegisterSchema, sellerRegisterSchema]);

export const createListingSchema = z.object({
    title: z.string().min(2, "Title is required"),
    description: z.string().min(3, "Description is required"),
    basePrice: z.number().positive("Price must be positive")
});
