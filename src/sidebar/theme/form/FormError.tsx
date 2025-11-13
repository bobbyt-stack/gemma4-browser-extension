import type { ReactNode } from "react";

import cn from "../../utils/classnames.ts";

export default function FormError({
  className = "",
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <span className={cn(className, "text-sm text-red-400")}>
      {children}
    </span>
  );
}
