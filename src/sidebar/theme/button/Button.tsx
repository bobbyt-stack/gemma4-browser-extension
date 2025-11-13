import { type ReactNode, cloneElement, isValidElement } from "react";

import cn from "../../utils/classnames.ts";

type ButtonColor = "primary" | "secondary" | "mono" | "danger";
type ButtonVariant = "solid" | "outline" | "ghost";
type ButtonSize = "xs" | "sm" | "md" | "lg";

interface BaseButtonProps {
  children?: ReactNode;
  className?: string;
  color?: ButtonColor;
  variant?: ButtonVariant;
  size?: ButtonSize;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  disabled?: boolean;
  loading?: boolean;
}

interface ButtonAsButton extends BaseButtonProps {
  onClick?: () => void;
  type?: "button" | "submit" | "reset";
}

interface ButtonAsLink extends BaseButtonProps {
  href: string;
  onClick?: never;
  to?: never;
  target?: string;
  rel?: string;
}

export type ButtonProps = ButtonAsButton | ButtonAsLink;

const sizeClasses: Record<ButtonSize, string> = {
  xs: "px-2 py-1.5 text-xs",
  sm: "px-3 py-1.5 text-sm",
  md: "px-4 py-2 text-base",
  lg: "px-6 py-3 text-lg",
};

const iconOnlySizeClasses: Record<ButtonSize, string> = {
  xs: "p-1.5",
  sm: "p-1.5",
  md: "p-2",
  lg: "p-3",
};

const iconSizeClasses: Record<ButtonSize, string> = {
  xs: "h-3 w-3",
  sm: "h-4 w-4",
  md: "h-5 w-5",
  lg: "h-6 w-6",
};

const colorVariantClasses: Record<
  ButtonColor,
  Record<ButtonVariant, string>
> = {
  primary: {
    solid:
      "bg-yellow-400 text-gray-900 hover:bg-yellow-500",
    outline:
      "border-1 border-yellow-400 text-yellow-400 hover:bg-yellow-950",
    ghost:
      "text-yellow-400 hover:bg-yellow-950",
  },
  secondary: {
    solid:
      "bg-blue-500 text-white hover:bg-blue-600",
    outline:
      "border-1 border-blue-400 text-blue-400 hover:bg-blue-950",
    ghost:
      "text-blue-400 hover:bg-blue-950",
  },
  mono: {
    solid:
      "bg-white text-gray-900 hover:bg-gray-100",
    outline:
      "border-1 border-white text-white hover:bg-white/10",
    ghost:
      "text-white hover:bg-white/10",
  },
  danger: {
    solid:
      "bg-red-500 text-white hover:bg-red-600",
    outline:
      "border-1 border-red-400 text-red-400 hover:bg-red-950",
    ghost:
      "text-red-400 hover:bg-red-950",
  },
};

export default function Button({
  children,
  className = "",
  color = "primary",
  variant = "solid",
  size = "md",
  iconLeft,
  iconRight,
  disabled = false,
  loading = false,
  ...props
}: ButtonProps) {
  const isIconOnly = !children && (iconLeft || iconRight || loading);

  const baseClasses = cn(
    "inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:ring-offset-2 focus:ring-offset-gray-900",
    isIconOnly ? iconOnlySizeClasses[size] : sizeClasses[size],
    colorVariantClasses[color][variant],
    {
      "cursor-not-allowed opacity-50": disabled || loading,
    },
    className
  );

  const renderIcon = (icon: ReactNode) => {
    if (isValidElement(icon)) {
      return cloneElement(icon as any, {
        className: cn((icon.props as any)?.className, iconSizeClasses[size]),
      });
    }
    return icon;
  };

  const content = (
    <div className="inline-flex items-center justify-center gap-2">
      {loading && (
        <svg
          className="h-4 w-4 animate-spin"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      )}
      {!loading && iconLeft && renderIcon(iconLeft)}
      {children && <span>{children}</span>}
      {!loading && iconRight && renderIcon(iconRight)}
    </div>
  );

  if ("href" in props && props.href) {
    return (
      <a
        href={props.href}
        className={baseClasses}
        target={props.target}
        rel={props.rel}
        aria-disabled={disabled || loading}
      >
        {content}
      </a>
    );
  }

  return (
    <button
      type={(props as ButtonAsButton).type || "button"}
      onClick={(props as ButtonAsButton).onClick}
      disabled={disabled || loading}
      className={baseClasses}
    >
      {content}
    </button>
  );
}
