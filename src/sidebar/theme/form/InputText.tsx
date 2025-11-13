import { type ChangeEvent, type ReactNode, forwardRef } from "react";

import cn from "../../utils/classnames.ts";
import { FormError } from "../index.ts";
import LabelTooltip from "./LabelTooltip.tsx";

interface InputTextProps {
  label: string;
  placeholder?: string;
  error?: string;
  required?: boolean;
  className?: string;
  id?: string;
  disabled?: boolean;
  value?: string | number;
  onChange?: (e: ChangeEvent<HTMLInputElement>) => void;
  hideLabel?: boolean;
  tooltip?: string | ReactNode;
  more?: ReactNode;
  moreTitle?: string;
  type?: "text" | "number" | "email" | "password" | "url" | "tel";
  min?: number;
  max?: number;
  step?: number;
}

const InputText = forwardRef<HTMLInputElement, InputTextProps>(
  (
    {
      label,
      placeholder,
      error,
      required,
      className = "",
      id,
      hideLabel = false,
      type = "text",
      min,
      max,
      step,
      tooltip = "",
      more = null,
      moreTitle = null,
      ...props
    },
    ref
  ) => {
    return (
      <div
        className={cn("flex flex-col gap-2", className, {
          "!gap-0": hideLabel,
        })}
      >
        <label
          htmlFor={id}
          className={cn(
            "relative text-sm font-medium text-gray-100",
            hideLabel &&
              "clip-[rect(0,0,0,0)] sr-only absolute m-[-1px] h-px w-px overflow-hidden border-0 p-0 whitespace-nowrap"
          )}
        >
          {label}
          {required && <span className="ml-1 text-blue-400">*</span>}
          {tooltip !== "" && (
            <LabelTooltip
              text={<>{tooltip}</>}
              more={more ? { title: moreTitle || label, content: more } : null}
            />
          )}
        </label>
        <input
          ref={ref}
          type={type}
          id={id}
          placeholder={placeholder}
          min={min}
          max={max}
          step={step}
          className={cn(
            "w-full rounded-md border px-3 py-2 text-sm transition-colors focus:ring-2 focus:ring-offset-2 focus:outline-none",
            "bg-gray-800 text-gray-100",
            "focus:ring-offset-gray-900",
            error
              ? "border-red-700 focus:border-red-600 focus:ring-red-600"
              : "border-gray-600 focus:border-yellow-400 focus:ring-yellow-400",
            "placeholder:text-gray-500"
          )}
          {...props}
        />
        {error && <FormError>{error}</FormError>}
      </div>
    );
  }
);

InputText.displayName = "InputText";

export default InputText;
