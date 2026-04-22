"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function LogoutButton() {
  const [loading, setLoading] = useState(false);

  async function onLogout() {
    setLoading(true);
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
      });
      window.location.href = "/login";
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button variant="secondary" onClick={onLogout} disabled={loading}>
      {loading ? "退出中..." : "退出登录"}
    </Button>
  );
}
