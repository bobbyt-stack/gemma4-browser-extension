import { type ReactNode, useRef, useState } from "react";

import cn from "../../utils/classnames.ts";

type TooltipPosition = "top" | "bottom" | "left" | "right";

export interface TooltipProps {
  children: ReactNode;
  text: ReactNode;
  position?: TooltipPosition;
  className?: string;
}

export default function Tooltip({
  children,
  text,
  position = "top",
  className = "",
}: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const timeoutRef = useRef<number>(null);

  const positionClasses: Record<TooltipPosition, string> = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
    left: "right-full top-1/2 -translate-y-1/2 mr-2",
    right: "left-full top-1/2 -translate-y-1/2 ml-2",
  };

  const arrowClasses: Record<TooltipPosition, string> = {
    top: "top-full left-1/2 -translate-x-1/2 border-l-transparent border-r-transparent border-b-transparent border-t-gray-100",
    bottom:
      "bottom-full left-1/2 -translate-x-1/2 border-l-transparent border-r-transparent border-t-transparent border-b-gray-100",
    left: "left-full top-1/2 -translate-y-1/2 border-t-transparent border-b-transparent border-r-transparent border-l-gray-100",
    right:
      "right-full top-1/2 -translate-y-1/2 border-t-transparent border-b-transparent border-l-transparent border-r-gray-100",
  };

  const showTooltip = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setIsVisible(true);
  };

  const hideTooltip = () => {
    timeoutRef.current = window.setTimeout(() => {
      setIsVisible(false);
    }, 100);
  };

  return (
    <div
      className={cn("relative inline-block", className)}
      onMouseEnter={showTooltip}
      onMouseLeave={hideTooltip}
      onFocus={showTooltip}
      onBlur={hideTooltip}
    >
      <button type="button" className="block">
        {children}
      </button>
      {isVisible && (
        <div
          className={cn(
            "absolute z-50",
            positionClasses[position],
            "animate-fadeIn"
          )}
          role="tooltip"
        >
          <div
            className={cn(
              "rounded bg-gray-100 px-3 py-2 text-sm whitespace-nowrap text-gray-900"
            )}
          >
            {text}
          </div>
          <div
            className={cn("absolute h-0 w-0 border-4", arrowClasses[position])}
          />
        </div>
      )}
    </div>
  );
}
