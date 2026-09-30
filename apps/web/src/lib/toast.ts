export type ToastType = "success" | "error" | "info";

export type Toast = {
  id: number;
  message: string;
  type: ToastType;
};

const listeners = new Set<(toasts: Toast[]) => void>();
let queue: Toast[] = [];
let sequence = 0;

function emit() {
  listeners.forEach((listener) => listener([...queue]));
}

export function showToast(message: string, type: ToastType = "info") {
  const toast: Toast = { id: sequence++, message, type };
  queue = [...queue, toast];
  emit();

  window.setTimeout(() => {
    queue = queue.filter((item) => item.id !== toast.id);
    emit();
  }, 4000);
}

export function subscribeToToasts(listener: (toasts: Toast[]) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
