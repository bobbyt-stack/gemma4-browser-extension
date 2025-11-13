import { type ChangeEvent, forwardRef } from "react";

import cn from "../../utils/classnames.ts";

interface InputTextareaProps {
  label: string;
  placeholder?: string;
  error?: string;
  required?: boolean;
  className?: string;
  id?: string;
  rows?: number;
  value?: string;
  onChange?: (e: ChangeEvent<HTMLTextAreaElement>) => void;
}

const InputTextarea = forwardRef<HTMLTextAreaElement, InputTextareaProps>(
  (
    {
      label,
      placeholder,
      error,
      required,
      className = "",
      id,
      rows = 4,
      ...props
    },
    ref
  ) => {
    return (
      <div className={cn("flex flex-col gap-2", className)}>
        <label
          htmlFor={id}
          className="text-sm font-medium text-gray-100"
        >
          {label}
          {required && (
            <span className="ml-1 text-blue-400">*</span>
          )}
        </label>
        <textarea
          ref={ref}
          id={id}
          rows={rows}
          placeholder={placeholder}
          className={cn(
            "resize-vertical w-full rounded-md border px-3 py-2 text-sm transition-colors focus:ring-2 focus:ring-offset-2 focus:outline-none",
            "bg-gray-800 text-gray-100",
            "focus:ring-offset-gray-900",
            error
              ? "border-red-700 focus:border-red-600 focus:ring-red-600"
              : "border-gray-600 focus:border-yellow-400 focus:ring-yellow-400",
            "placeholder:text-gray-500"
          )}
          {...props}
        />
        {error && (
          <span className="text-sm text-red-400">
            {error}
          </span>
        )}
      </div>
    );
  }
);

InputTextarea.displayName = "InputTextarea";

export default InputTextarea;
