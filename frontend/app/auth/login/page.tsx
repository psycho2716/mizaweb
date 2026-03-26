"use client";

import { useState } from "react";
import { loginWithUserId } from "@/lib/api/endpoints";

export default function LoginPage() {
  const [userId, setUserId] = useState("u-buyer-1");
  const [message, setMessage] = useState("");

  async function handleLogin() {
    try {
      const result = await loginWithUserId(userId);
      localStorage.setItem("miza_token", result.token);
      localStorage.setItem("miza_user", JSON.stringify(result.user));
      setMessage(`Logged in as ${result.user.role} (${result.user.email})`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Login failed");
    }
  }

  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="text-2xl font-semibold">Login</h1>
      <p className="mt-2 text-sm text-zinc-600">Demo login (development mode).</p>
      <label className="mt-4 block text-sm font-medium" htmlFor="user-id">
        User ID
      </label>
      <select
        id="user-id"
        className="mt-2 w-full rounded border p-2 text-sm"
        value={userId}
        onChange={(event) => setUserId(event.target.value)}
      >
        <option value="u-buyer-1">u-buyer-1 (buyer)</option>
        <option value="u-seller-1">u-seller-1 (seller)</option>
        <option value="u-admin-1">u-admin-1 (admin)</option>
      </select>
      <button
        type="button"
        className="mt-4 rounded bg-zinc-900 px-4 py-2 text-sm text-white"
        onClick={handleLogin}
      >
        Login
      </button>
      <p className="mt-3 text-sm text-zinc-700">{message}</p>
    </main>
  );
}
