import type { ToolCallMessagePartComponent } from "@assistant-ui/react";
import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export const ToolFallback: ToolCallMessagePartComponent = ({
  toolName,
  argsText,
  result,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(true);
  
  return (
    <div className="rounded-lg border bg-muted/50 p-3">
      <div className="flex items-center gap-2">
        <CheckIcon className="h-4 w-4 text-green-500" />
        <p className="flex-1 text-sm">
          调用工具: <b>{toolName}</b>
        </p>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => setIsCollapsed(!isCollapsed)}
        >
          {isCollapsed ? (
            <ChevronDownIcon className="h-4 w-4" />
          ) : (
            <ChevronUpIcon className="h-4 w-4" />
          )}
        </Button>
      </div>
      {!isCollapsed && (
        <div className="mt-2 space-y-2">
          <div className="rounded bg-muted p-2">
            <pre className="text-xs overflow-x-auto">{argsText}</pre>
          </div>
          {result !== undefined && (
            <div className="rounded bg-muted p-2">
              <p className="text-xs font-medium mb-1">结果:</p>
              <pre className="text-xs overflow-x-auto">
                {typeof result === "string"
                  ? result
                  : JSON.stringify(result, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
