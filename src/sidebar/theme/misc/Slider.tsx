import cn from "../../utils/classnames.ts";

export default function Slider({
  className = "",
  width,
  text = "",
}: {
  className?: string;
  width: number;
  text?: string;
}) {
  return (
    <div
      className={cn(
        className,
        "w-full overflow-hidden rounded-full bg-gray-700 relative",
        text ? "h-6" : "h-2"
      )}
    >
      <div
        className="h-full rounded-full bg-yellow-400 transition-all duration-500 "
        style={{ width: `${width}%` }}
      />
      {Boolean(text) && (
        <p className="absolute top-1/2 -translate-y-1/2 text-sm text-black left-3">
          {text}
        </p>
      )}
    </div>
  );
}
