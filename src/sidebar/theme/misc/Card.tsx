import type { ReactNode } from "react";

import cn from "../../utils/classnames.ts";

export default function Card({
  className = "",
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        className,
        "rounded-lg border border-gray-700 bg-gray-800 p-4"
      )}
    >
      {children}
    </div>
  );
}
