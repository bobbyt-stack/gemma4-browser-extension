import cn from "../../utils/classnames.ts";

export default function Loader({ className = "" }: { className?: string }) {
  return (
    <div className={cn(className, "flex items-center justify-center py-12")}>
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-600 border-t-yellow-400" />
    </div>
  );
}
