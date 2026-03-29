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
        stockQuantity: 50,
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
    expect(orderDetailResponse.body.data.order.id).toBe(orderId);
    expect(Array.isArray(orderDetailResponse.body.data.lineItems)).toBe(true);
  });

  it("merges guest cart into buyer cart on GET /cart when both token and guest session match", async () => {
    const login = await request(app).post("/auth/login").send({
      email: "buyer@miza.dev",
      password: "Buyer123!",
    });
    expect(login.status).toBe(200);
    const token = login.body.token as string;

    const productResponse = await request(app)
      .post("/products")
      .set("x-user-id", "u-seller-1")
      .send({
        title: "Guest merge stone",
        description: "Merge test",
        basePrice: 900,
        stockQuantity: 50,
      });
    expect(productResponse.status).toBe(201);
    const productId = productResponse.body.id as string;

    const guestSessionId = "guest-merge-flow-1";
    const addGuest = await request(app)
      .post("/cart/items")
      .set("x-guest-session-id", guestSessionId)
      .send({ productId, quantity: 2 });
    expect(addGuest.status).toBe(201);

    const cartAsBuyer = await request(app)
      .get("/cart")
      .set("authorization", `Bearer ${token}`)
      .set("x-guest-session-id", guestSessionId);
    expect(cartAsBuyer.status).toBe(200);
    expect(cartAsBuyer.body.data).toHaveLength(1);
    expect(cartAsBuyer.body.data[0].quantity).toBe(2);
    expect(cartAsBuyer.body.data[0].buyerId).toBe("u-buyer-1");
    expect(cartAsBuyer.body.data[0].guestSessionId).toBeUndefined();
  });

  it("merges duplicate lines for the same product and rejects stock overage", async () => {
    const login = await request(app).post("/auth/login").send({
      email: "buyer@miza.dev",
      password: "Buyer123!",
    });
    expect(login.status).toBe(200);
    const token = login.body.token as string;

    const productResponse = await request(app)
      .post("/products")
      .set("x-user-id", "u-seller-1")
      .send({
        title: "Stock merge stone",
        description: "Merge + cap test",
        basePrice: 400,
        stockQuantity: 5,
      });
    expect(productResponse.status).toBe(201);
    const productId = productResponse.body.id as string;

    const addTwo = await request(app)
      .post("/cart/items")
      .set("authorization", `Bearer ${token}`)
      .send({ productId, quantity: 2 });
    expect(addTwo.status).toBe(201);

    const addTwoMore = await request(app)
      .post("/cart/items")
      .set("authorization", `Bearer ${token}`)
      .send({ productId, quantity: 2 });
    expect(addTwoMore.status).toBe(200);

    const cartMid = await request(app).get("/cart").set("authorization", `Bearer ${token}`);
    const linesForProduct = (cartMid.body.data as { productId: string; quantity: number }[]).filter(
      (row) => row.productId === productId
    );
    expect(linesForProduct).toHaveLength(1);
    expect(linesForProduct[0].quantity).toBe(4);

    const fill = await request(app)
      .post("/cart/items")
      .set("authorization", `Bearer ${token}`)
      .send({ productId, quantity: 1 });
    expect(fill.status).toBe(200);
    const cartFull = await request(app).get("/cart").set("authorization", `Bearer ${token}`);
    const linesFull = (cartFull.body.data as { productId: string; quantity: number }[]).filter(
      (row) => row.productId === productId
    );
    expect(linesFull).toHaveLength(1);
    expect(linesFull[0].quantity).toBe(5);

    const over = await request(app)
      .post("/cart/items")
      .set("authorization", `Bearer ${token}`)
      .send({ productId, quantity: 1 });
    expect(over.status).toBe(400);
  });
});
