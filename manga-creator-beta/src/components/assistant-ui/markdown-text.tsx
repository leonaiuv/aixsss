"use client";

import "@assistant-ui/react-markdown/styles/dot.css";

import {
  type CodeHeaderProps,
  MarkdownTextPrimitive,
  unstable_memoizeMarkdownComponents as memoizeMarkdownComponents,
  useIsMarkdownCodeBlock,
} from "@assistant-ui/react-markdown";
import remarkGfm from "remark-gfm";
import { type FC, memo, useState } from "react";
import { CheckIcon, CopyIcon } from "lucide-react";

import { TooltipIconButton } from "@/components/assistant-ui/tooltip-icon-button";
import { cn } from "@/lib/utils";

const MarkdownTextImpl = () => {
  return (
    <MarkdownTextPrimitive
      remarkPlugins={[remarkGfm]}
      className="prose prose-sm dark:prose-invert max-w-none"
      components={defaultComponents}
    />
  );
};

export const MarkdownText = memo(MarkdownTextImpl);

const CodeHeader: FC<CodeHeaderProps> = ({ language, code }) => {
  const { isCopied, copyToClipboard } = useCopyToClipboard();
  const onCopy = () => {
    if (!code || isCopied) return;
    copyToClipboard(code);
  };

  return (
    <div className="flex items-center justify-between rounded-t-md bg-muted px-3 py-1.5 text-xs">
      <span className="font-mono text-muted-foreground">{language}</span>
      <TooltipIconButton tooltip="复制" onClick={onCopy}>
        {!isCopied && <CopyIcon className="h-3.5 w-3.5" />}
        {isCopied && <CheckIcon className="h-3.5 w-3.5" />}
      </TooltipIconButton>
    </div>
  );
};

const useCopyToClipboard = ({
  copiedDuration = 3000,
}: {
  copiedDuration?: number;
} = {}) => {
  const [isCopied, setIsCopied] = useState<boolean>(false);

  const copyToClipboard = (value: string) => {
    if (!value) return;

    navigator.clipboard.writeText(value).then(() => {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), copiedDuration);
    });
  };

  return { isCopied, copyToClipboard };
};

const defaultComponents = memoizeMarkdownComponents({
  h1: ({ className, ...props }) => (
    <h1 className={cn("text-2xl font-bold mt-6 mb-4", className)} {...props} />
  ),
  h2: ({ className, ...props }) => (
    <h2 className={cn("text-xl font-bold mt-5 mb-3", className)} {...props} />
  ),
  h3: ({ className, ...props }) => (
    <h3 className={cn("text-lg font-bold mt-4 mb-2", className)} {...props} />
  ),
  p: ({ className, ...props }) => (
    <p className={cn("mb-3 leading-relaxed", className)} {...props} />
  ),
  a: ({ className, ...props }) => (
    <a className={cn("text-primary underline", className)} {...props} />
  ),
  ul: ({ className, ...props }) => (
    <ul className={cn("list-disc pl-6 mb-3", className)} {...props} />
  ),
  ol: ({ className, ...props }) => (
    <ol className={cn("list-decimal pl-6 mb-3", className)} {...props} />
  ),
  pre: ({ className, ...props }) => (
    <pre className={cn("rounded-b-md bg-muted p-3 overflow-x-auto", className)} {...props} />
  ),
  code: function Code({ className, ...props }) {
    const isCodeBlock = useIsMarkdownCodeBlock();
    return (
      <code
        className={cn(
          !isCodeBlock && "bg-muted px-1.5 py-0.5 rounded text-sm",
          className
        )}
        {...props}
      />
    );
  },
  CodeHeader,
});
