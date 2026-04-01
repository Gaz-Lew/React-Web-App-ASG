import React, { createContext, useContext, useState, useCallback, useId } from "react";
import { AlertCircle, CheckCircle, Info, AlertTriangle, X } from "lucide-react";

export type ToastType = "success" | "error" | "warning" | "info";

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
}

interface ToastContextType {
  toasts: Toast[];
  showToast: (message: string, type?: ToastType, duration?: number) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

/**
 * Toast Provider
 *
 * Wrap your app with this to enable toast notifications
 *
 * Usage:
 * <ToastProvider>
 *   <App />
 * </ToastProvider>
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: ToastType = "info", duration: number = 3500) => {
    const id = `toast-${Date.now()}-${Math.random()}`;

    setToasts((prev) => [...prev, { id, message, type, duration }]);

    // Auto-remove after duration
    if (duration > 0) {
      setTimeout(() => removeToast(id), duration);
    }
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, showToast, removeToast }}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  );
}

/**
 * useToast Hook
 *
 * Use this in any component to show toast notifications
 *
 * Usage:
 * const { showToast } = useToast();
 * showToast('Saved successfully!', 'success');
 */
export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return context;
}

/**
 * Toast Container
 *
 * Renders all active toasts
 */
interface ToastContainerProps {
  toasts: Toast[];
  onRemove: (id: string) => void;
}

function ToastContainer({ toasts, onRemove }: ToastContainerProps) {
  return (
    <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 max-w-md pointer-events-none">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onRemove={() => onRemove(toast.id)} />
      ))}
    </div>
  );
}

/**
 * Individual Toast Item
 */
interface ToastItemProps {
  toast: Toast;
  onRemove: () => void;
}

function ToastItem({ toast, onRemove }: ToastItemProps) {
  const typeConfig = {
    success: {
      bg: "bg-green-50 dark:bg-green-900/20",
      border: "border-green-200 dark:border-green-800",
      icon: <CheckCircle size={18} className="text-green-600 dark:text-green-400" />,
      text: "text-green-800 dark:text-green-200",
    },
    error: {
      bg: "bg-red-50 dark:bg-red-900/20",
      border: "border-red-200 dark:border-red-800",
      icon: <AlertCircle size={18} className="text-red-600 dark:text-red-400" />,
      text: "text-red-800 dark:text-red-200",
    },
    warning: {
      bg: "bg-yellow-50 dark:bg-yellow-900/20",
      border: "border-yellow-200 dark:border-yellow-800",
      icon: <AlertTriangle size={18} className="text-yellow-600 dark:text-yellow-400" />,
      text: "text-yellow-800 dark:text-yellow-200",
    },
    info: {
      bg: "bg-gray-50 dark:bg-gray-800/20",
      border: "border-gray-200 dark:border-gray-700",
      icon: <Info size={18} className="text-gray-600 dark:text-gray-400" />,
      text: "text-gray-800 dark:text-gray-200",
    },
  };

  const config = typeConfig[toast.type];

  return (
    <div
      className={`
        ${config.bg} ${config.border} ${config.text}
        border rounded-lg p-4 shadow-lg pointer-events-auto
        flex items-start gap-3 min-w-[300px] max-w-[400px]
        animate-in slide-in-from-right-4 fade-in duration-300
      `}
      role="alert"
    >
      {/* Icon */}
      <div className="flex-shrink-0 mt-0.5">{config.icon}</div>

      {/* Message */}
      <div className="flex-1 text-sm font-medium">{toast.message}</div>

      {/* Close Button */}
      <button
        onClick={onRemove}
        className={`
          flex-shrink-0 p-1 hover:opacity-75 transition
          ${config.text}
        `}
        aria-label="Close notification"
      >
        <X size={16} />
      </button>
    </div>
  );
}

export default ToastProvider;
