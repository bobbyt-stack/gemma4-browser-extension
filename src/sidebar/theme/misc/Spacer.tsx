import cn from "../../utils/classnames.ts";

export default function Spacer({ className = "" }: { className?: string }) {
  return (
    <hr
      className={cn(
        className,
        "my-8 border-t-1 border-gray-800"
      )}
    />
  );
}
