import request from "supertest";
import { describe, expect, it } from "vitest";
import { app } from "../../src/app";

describe("auth + cart + checkout + orders flow", () => {
  it("issues JWT token on login", async () => {
    const response = await request(app).post("/auth/login").send({
      email: "buyer@miza.dev",
      password: "Buyer123!",
    });
    expect(response.status).toBe(200);
    expect(typeof response.body.token).toBe("string");
    expect(response.body.token.length).toBeGreaterThan(20);

    const meResponse = await request(app)
      .get("/auth/me")
      .set("authorization", `Bearer ${response.body.token as string}`);
    expect(meResponse.status).toBe(200);
    expect(meResponse.body.user.id).toBe("u-buyer-1");
  });

  it("supports add-to-cart, checkout, and order retrieval", async () => {
    const guestSessionId = "guest-test-1";
    const productResponse = await request(app)
      .post("/products")
      .set("x-user-id", "u-seller-1")
      .send({
        title: "Checkout Stone",
        description: "Cart flow test product",
        basePrice: 1550,
      });
    expect(productResponse.status).toBe(201);
    const productId = productResponse.body.id as string;

    const cartAddResponse = await request(app)
      .post("/cart/items")
      .set("x-guest-session-id", guestSessionId)
      .send({
        productId,
        quantity: 2,
      });
    expect(cartAddResponse.status).toBe(201);

    const checkoutResponse = await request(app)
      .post("/checkout")
      .set("x-user-id", "u-buyer-1")
      .set("x-guest-session-id", guestSessionId)
      .send({ paymentMethod: "cash" });
    expect(checkoutResponse.status).toBe(201);
    const orderId = checkoutResponse.body.id as string;

    const orderListResponse = await request(app)
      .get("/orders")
      .set("x-user-id", "u-buyer-1");
    expect(orderListResponse.status).toBe(200);
    expect(Array.isArray(orderListResponse.body.data)).toBe(true);

    const orderDetailResponse = await request(app)
      .get(`/orders/${orderId}`)
      .set("x-user-id", "u-buyer-1");
    expect(orderDetailResponse.status).toBe(200);
    expect(orderDetailResponse.body.data.id).toBe(orderId);
  });
});
