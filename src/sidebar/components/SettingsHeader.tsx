import cn from "../utils/classnames.ts";

interface SettingsHeaderProps {
  className?: string;
}

export default function SettingsHeader({
  className = "",
}: SettingsHeaderProps) {
  return (
    <header
      className={cn(
        className,
        "border-b border-chrome-border bg-chrome-bg-primary px-6 py-4"
      )}
    >
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-normal text-chrome-text-primary leading-tight">
            Trillim Browser Assistant
          </h1>
          <p className="text-sm text-chrome-text-secondary mt-1">
            Powered by{" "}
            <a
              href="https://github.com/trillim-ai/trillim"
              target="_blank"
              className="text-chrome-accent-primary hover:text-chrome-accent-hover no-underline"
              rel="noreferrer"
            >
              Trillim
            </a>
          </p>
        </div>
      </div>
    </header>
  );
}
