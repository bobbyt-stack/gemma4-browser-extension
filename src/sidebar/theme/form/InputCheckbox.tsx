import { type ChangeEvent, type ReactNode, forwardRef } from "react";

import cn from "../../utils/classnames.ts";
import LabelTooltip from "./LabelTooltip.tsx";

interface InputCheckboxProps {
  label: string;
  description?: string;
  error?: string;
  required?: boolean;
  className?: string;
  id?: string;
  tooltip?: string | ReactNode;
  more?: ReactNode;
  moreTitle?: string;
  checked?: boolean;
  onChange?: (e: ChangeEvent<HTMLInputElement>) => void;
}

const InputCheckbox = forwardRef<HTMLInputElement, InputCheckboxProps>(
  (
    {
      label,
      description,
      error,
      required,
      className = "",
      id,
      tooltip = "",
      more = null,
      moreTitle = null,
      ...props
    },
    ref
  ) => {
    const checkboxId =
      id || `checkbox-${Math.random().toString(36).substr(2, 9)}`;

    return (
      <label htmlFor={id} className={cn("flex flex-col gap-2", className)}>
        <div className="relative text-sm font-medium text-gray-100">
          {label}
          {required && (
            <span className="ml-1 text-blue-400">*</span>
          )}
          {tooltip !== "" && (
            <LabelTooltip
              text={<>{tooltip}</>}
              more={more ? { title: moreTitle || label, content: more } : null}
            />
          )}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <input
            ref={ref}
            type="checkbox"
            id={checkboxId}
            className={cn(
              "h-4 w-4 cursor-pointer rounded border transition-colors focus:ring-2 focus:ring-offset-2 focus:outline-none",
              "bg-gray-800",
              "focus:ring-offset-gray-900",
              error
                ? "border-red-700 text-red-500 focus:border-red-600 focus:ring-red-600"
                : "border-gray-600 text-yellow-500 focus:border-yellow-400 focus:ring-yellow-400"
            )}
            {...props}
          />
          {description && (
            <p className="mt-1 text-xs text-gray-400">
              {description}
            </p>
          )}
        </div>
        {error && (
          <span className="text-sm text-red-400">
            {error}
          </span>
        )}
      </label>
    );
  }
);

InputCheckbox.displayName = "InputCheckbox";

export default InputCheckbox;
