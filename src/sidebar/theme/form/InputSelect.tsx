import { type ReactNode, type SelectHTMLAttributes, forwardRef } from "react";

import cn from "../../utils/classnames.ts";
import { FormError } from "../index.ts";
import LabelTooltip from "./LabelTooltip.tsx";

interface Option {
  value: string;
  label: string;
  disabled?: boolean;
}

interface OptGroup {
  label: string;
  options: Option[];
}

type SelectOptions = Option[] | OptGroup[];

interface InputSelectProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "className"> {
  label: string;
  placeholder?: string;
  error?: string;
  required?: boolean;
  className?: string;
  id?: string;
  options: SelectOptions;
  tooltip?: string | ReactNode;
  more?: ReactNode;
  moreTitle?: string;
}

const InputSelect = forwardRef<HTMLSelectElement, InputSelectProps>(
  (
    {
      label,
      placeholder,
      error,
      required,
      className = "",
      id,
      options,
      tooltip = "",
      more = null,
      moreTitle = null,
      ...props
    },
    ref
  ) => {
    return (
      <div className={cn("flex flex-col gap-2", className)}>
        <label
          htmlFor={id}
          className="relative text-sm font-medium text-gray-100"
        >
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
        </label>
        <select
          ref={ref}
          id={id}
          className={cn(
            "w-full rounded-md border px-3 py-2 text-sm transition-colors focus:ring-2 focus:ring-offset-2 focus:outline-none",
            "bg-gray-800 text-gray-100",
            "focus:ring-offset-gray-900",
            error
              ? "border-red-700 focus:border-red-600 focus:ring-red-600"
              : "border-gray-600 focus:border-yellow-400 focus:ring-yellow-400"
          )}
          {...props}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((item, index) => {
            // Check if this is an OptGroup by checking for 'options' property
            if ("options" in item) {
              return (
                <optgroup key={`optgroup-${index}`} label={item.label}>
                  {item.options.map((option) => (
                    <option
                      key={option.value}
                      value={option.value}
                      disabled={option.disabled}
                    >
                      {option.label}
                    </option>
                  ))}
                </optgroup>
              );
            } else {
              // This is a regular Option
              return (
                <option
                  key={item.value}
                  value={item.value}
                  disabled={item.disabled}
                >
                  {item.label}
                </option>
              );
            }
          })}
        </select>
        {error && <FormError>{error}</FormError>}
      </div>
    );
  }
);

InputSelect.displayName = "InputSelect";

export default InputSelect;
