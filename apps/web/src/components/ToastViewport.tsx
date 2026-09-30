"use client";

import { useEffect, useState } from "react";
import { subscribeToToasts, type Toast } from "@/lib/toast";

export function ToastViewport() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const unsubscribe = subscribeToToasts(setToasts);
    return unsubscribe;
  }, []);

  if (toasts.length === 0) {
    return null;
  }

  return (
    <div
      aria-live="polite"
      style={{
        position: "fixed",
        right: 20,
        bottom: 20,
        display: "grid",
        gap: 12,
        zIndex: 1000,
        maxWidth: 360,
      }}
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role={toast.type === "error" ? "alert" : "status"}
          style={{
            padding: "12px 16px",
            borderRadius: "var(--fi-radius)",
            background:
              toast.type === "error"
                ? "var(--fi-conflicting-bg-strong)"
                : toast.type === "success"
                  ? "var(--fi-verified-bg)"
                  : "var(--fi-info-bg)",
            border:
              toast.type === "error"
                ? "1px solid var(--fi-conflicting-border)"
                : "1px solid var(--fi-border-strong)",
            color: "var(--fi-text)",
            boxShadow: "var(--fi-shadow)",
          }}
        >
          {toast.message}
        </div>
      ))}
    </div>
  );
}
