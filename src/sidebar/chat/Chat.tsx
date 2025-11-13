import { Message } from "@huggingface/transformers";
import { useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";

import {
  BackgroundTasks,
  REQUIRED_MODEL_IDS,
  STORAGE_KEYS,
} from "../../shared/types.ts";
import { Button, InputText, MessageContent } from "../theme";
import cn from "../utils/classnames.ts";

interface FormParams {
  input: string;
}

export default function Chat({ className = "" }: { className?: string }) {
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const {
    control,
    formState: { errors },
    handleSubmit,
  } = useForm<FormParams>({
    defaultValues: {
      input: "",
    },
  });
  const [messages, setMessages] = useState<Message[]>([]);

  const onSubmit = (data: FormParams) => {
    const newMessages = [
      ...messages,
      {
        role: "user",
        content: data.input,
      },
    ];
    setMessages(newMessages);

    chrome.runtime.sendMessage(
      {
        type: BackgroundTasks.GENERATE_TEXT,
        messages: [
          { role: "system", content: "You are a helpful assistant." },
          ...newMessages,
        ],
      },
      (response) => {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: response.result },
        ]);
      }
    );
  };

  return (
    <div className={cn(className, "flex flex-col rounded-lg")}>
      <div
        ref={messagesContainerRef}
        className={cn("space-y-4 overflow-y-auto p-4")}
      >
        {messages.map((message, index) => (
          <div
            key={index}
            className={cn(
              "w-9/10 rounded-lg p-3",
              message.role === "user"
                ? "justify-self-end bg-blue-100 dark:bg-blue-900"
                : "bg-gray-100 dark:bg-gray-800"
            )}
          >
            <div className="mb-1 text-xs font-semibold text-gray-600 dark:text-gray-400">
              {message.role.toUpperCase()}
            </div>
            <div className="text-sm text-gray-900 dark:text-gray-100">
              <MessageContent content={message.content} />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-auto p-4">
        <form onSubmit={handleSubmit(onSubmit)} className="flex gap-2">
          <Controller
            name="input"
            control={control}
            rules={{ required: "Message is required" }}
            render={({ field }) => (
              <InputText
                id="text-input"
                label="Message"
                placeholder="Type your message..."
                error={errors.input?.message as string}
                value={field.value}
                onChange={field.onChange}
                className="flex-1"
                hideLabel
              />
            )}
          />

          <Button
            type="submit"
            color="primary"
            variant="solid"
            //loading={processing}
          >
            Send
          </Button>
        </form>
      </div>
    </div>
  );
}
