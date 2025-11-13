import { AlertTriangle, CheckCircle, Info, X, XCircle } from "lucide-react";
import type { ReactNode } from "react";

import cn from "../../utils/classnames.ts";

interface MessageProps {
  type: "success" | "error" | "warning" | "info";
  title: string;
  message?: string;
  children?: ReactNode;
  onClose?: () => void;
  className?: string;
}

const messageStyles = {
  success: {
    container:
      "border-green-800 bg-green-900/20",
    icon: "text-green-500",
    title: "text-green-400",
    text: "text-green-300",
    closeButton:
      "text-green-400 hover:text-green-200",
  },
  error: {
    container:
      "border-red-800 bg-red-900/20",
    icon: "text-red-500",
    title: "text-red-400",
    text: "text-red-300",
    closeButton:
      "text-red-400 hover:text-red-200",
  },
  warning: {
    container:
      "border-yellow-800 bg-yellow-900/20",
    icon: "text-yellow-500",
    title: "text-yellow-400",
    text: "text-yellow-300",
    closeButton:
      "text-yellow-400 hover:text-yellow-200",
  },
  info: {
    container:
      "border-blue-800 bg-blue-900/20",
    icon: "text-blue-500",
    title: "text-blue-400",
    text: "text-blue-300",
    closeButton:
      "text-blue-400 hover:text-blue-200",
  },
};

const icons = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

export default function Message({
  type,
  title,
  message,
  children,
  onClose,
  className = "",
}: MessageProps) {
  const styles = messageStyles[type];
  const Icon = icons[type];

  return (
    <div className={cn("rounded-lg border p-4", styles.container, className)}>
      <div className="flex items-start gap-3">
        <Icon className={cn("mt-0.5 h-5 w-5 flex-shrink-0", styles.icon)} />
        <div className="flex-1">
          <h3 className={cn("font-semibold", styles.title)}>{title}</h3>
          {message && (
            <p className={cn("mt-1 text-sm", styles.text)}>{message}</p>
          )}
          {children && (
            <div className={cn("mt-2 text-sm", styles.text)}>{children}</div>
          )}
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className={cn(
              "flex-shrink-0 rounded p-1 transition-colors",
              styles.closeButton
            )}
            aria-label="Close message"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
