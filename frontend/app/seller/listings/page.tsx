"use client";

import { useState } from "react";
import { createProduct, publishProduct } from "@/lib/api/endpoints";

export default function SellerListingsPage() {
  const [title, setTitle] = useState("Stone Tile");
  const [description, setDescription] = useState("Polished stone tile");
  const [basePrice, setBasePrice] = useState("1200");
  const [latestProductId, setLatestProductId] = useState("");
  const [message, setMessage] = useState("");

  async function handleCreate() {
    try {
      const response = await createProduct({
        title,
        description,
        basePrice: Number(basePrice),
      });
      setLatestProductId(response.id);
      setMessage(`Created listing ${response.id}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Create failed");
    }
  }

  async function handlePublish() {
    if (!latestProductId) {
      setMessage("Create a product first.");
      return;
    }
    try {
      await publishProduct(latestProductId);
      setMessage(`Published ${latestProductId}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Publish failed");
    }
  }

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-semibold">Seller Listings</h1>
      <p className="mt-2 text-sm text-zinc-600">Create and publish listing flow.</p>
      <div className="mt-4 grid gap-3">
        <input
          className="rounded border p-2 text-sm"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Title"
        />
        <input
          className="rounded border p-2 text-sm"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Description"
        />
        <input
          className="rounded border p-2 text-sm"
          value={basePrice}
          onChange={(event) => setBasePrice(event.target.value)}
          placeholder="Base price"
        />
      </div>
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          className="rounded bg-zinc-900 px-4 py-2 text-sm text-white"
          onClick={handleCreate}
        >
          Create Listing
        </button>
        <button
          type="button"
          className="rounded border px-4 py-2 text-sm"
          onClick={handlePublish}
        >
          Publish Latest
        </button>
      </div>
      <p className="mt-3 text-sm text-zinc-700">{message}</p>
    </main>
  );
}
