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
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
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
            "relative text-sm font-medium text-chrome-text-primary",
            hideLabel &&
              "clip-[rect(0,0,0,0)] sr-only absolute m-[-1px] h-px w-px overflow-hidden border-0 p-0 whitespace-nowrap"
          )}
        >
          {label}
          {required && (
            <span className="ml-1 text-chrome-accent-primary">*</span>
          )}
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
            "w-full rounded px-4 py-2.5 text-sm transition-colors focus:ring-1 focus:outline-none",
            "bg-chrome-bg-primary text-chrome-text-primary",
            "focus:ring-offset-chrome-bg-primary",
            error
              ? "border border-red-500 focus:border-red-500 focus:ring-red-500"
              : "border border-chrome-border focus:border-chrome-accent-primary focus:ring-chrome-accent-primary",
            "placeholder:text-chrome-text-disabled",
            "disabled:opacity-50 disabled:cursor-not-allowed"
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
