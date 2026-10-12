"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { MessageSquare, X, Send, Bot, User, Loader2, Trash2 } from "lucide-react";
import { aiApi } from "@/lib/api";

interface Message {
  id: string;
  content: string;
  sender: "user" | "bot";
  timestamp: Date;
  type?: string;
}

const SUGGESTED_QUESTIONS = [
  "How many leads today?",
  "How many bookings this month?",
  "What is this month's revenue?",
  "Show lead status",
  "Show sales performance",
  "How much payment is pending?",
  "Show unit availability",
  "Show pipeline",
];

export function Chatbot() {
  const [isOpen, setIsOpen] = React.useState(false);
  const [message, setMessage] = React.useState("");
  const [messages, setMessages] = React.useState<Message[]>([
    {
      id: "welcome",
        content: "Hello! I'm your DCT AI Assistant. You can ask me about leads, opportunities, site visits, quotations, bookings, payments, projects, reports and dashboards.",
      sender: "bot",
      timestamp: new Date(),
    },
  ]);
  const [isTyping, setIsTyping] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [conversationId, setConversationId] = React.useState<string | null>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  const handleSend = async (text?: string) => {
    const messageText = text || message.trim();
    if (!messageText) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      content: messageText,
      sender: "user",
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setMessage("");
    setIsTyping(true);
    setError(null);

    try {
      const response = await aiApi.chat(messageText, conversationId || undefined);
      const result = response.data;

      if (result.success && result.data) {
        const aiData = result.data;
        if (aiData.conversationId && !conversationId) {
          setConversationId(aiData.conversationId);
        }
        const botMessage: Message = {
          id: (Date.now() + 1).toString(),
          content: aiData.response || aiData.assistantMessage?.content || "I couldn't process that request.",
          sender: "bot",
          timestamp: new Date(),
          type: aiData.responseType || "text",
        };
        setMessages((prev) => [...prev, botMessage]);
      } else {
        const botMessage: Message = {
          id: (Date.now() + 1).toString(),
          content: result.error || "Something went wrong. Please try again.",
          sender: "bot",
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, botMessage]);
      }
    } catch (err: any) {
      console.error("AI chat error:", err);
      let errorMessage = "AI Assistant is temporarily unavailable. Please try again shortly.";
      if (err.response?.status === 401) {
        errorMessage = "Your session has expired. Please log in again.";
      } else if (err.response?.status === 403) {
        errorMessage = "You don't have permission to access this information.";
      } else if (err.response?.data?.error) {
        errorMessage = err.response.data.error;
      }
      setError(errorMessage);
      const botMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: errorMessage,
        sender: "bot",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, botMessage]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleNewConversation = () => {
    setMessages([
      {
        id: "welcome",
        content: "Hello! I'm your DCT AI Assistant. You can ask me about leads, opportunities, site visits, quotations, bookings, payments, projects, reports and dashboards.",
        sender: "bot",
        timestamp: new Date(),
      },
    ]);
    setConversationId(null);
    setError(null);
  };

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {isOpen && (
        <Card className="w-96 mb-4 shadow-xl border">
          <CardHeader className="flex flex-row items-center justify-between p-4 border-b">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-primary" />
              <CardTitle className="text-sm font-semibold">DCT AI Assistant</CardTitle>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={handleNewConversation}
                className="h-8 w-8"
                title="New conversation"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsOpen(false)}
                className="h-8 w-8"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-96 px-4" ref={scrollRef}>
              <div className="space-y-4 py-4">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={cn(
                      "flex gap-2",
                      msg.sender === "user" ? "justify-end" : "justify-start"
                    )}
                  >
                    {msg.sender === "bot" && (
                      <Avatar className="h-6 w-6 shrink-0">
                        <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                          AI
                        </AvatarFallback>
                      </Avatar>
                    )}
                    <div
                      className={cn(
                        "rounded-lg px-3 py-2 max-w-[85%] text-sm whitespace-pre-wrap",
                        msg.sender === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted"
                      )}
                    >
                      {msg.content}
                    </div>
                    {msg.sender === "user" && (
                      <Avatar className="h-6 w-6 shrink-0">
                        <AvatarFallback className="text-xs">
                          <User className="h-3 w-3" />
                        </AvatarFallback>
                      </Avatar>
                    )}
                  </div>
                ))}
                {isTyping && (
                  <div className="flex gap-2">
                    <Avatar className="h-6 w-6 shrink-0">
                      <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                        AI
                      </AvatarFallback>
                    </Avatar>
                    <div className="bg-muted rounded-lg px-3 py-2 text-sm">
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </div>
                  </div>
                )}
                {messages.length <= 1 && (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground px-1">Suggested questions:</p>
                    <div className="flex flex-wrap gap-2">
                      {SUGGESTED_QUESTIONS.map((q) => (
                        <Button
                          key={q}
                          variant="outline"
                          size="sm"
                          className="text-xs h-7"
                          onClick={() => handleSend(q)}
                        >
                          {q}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
            <div className="p-4 border-t">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSend();
                }}
                className="flex gap-2"
              >
                <Input
                  placeholder="Ask about leads, bookings, revenue..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="flex-1"
                  disabled={isTyping}
                />
                <Button type="submit" size="icon" disabled={!message.trim() || isTyping}>
                  <Send className="h-4 w-4" />
                </Button>
              </form>
            </div>
          </CardContent>
        </Card>
      )}
      <Button
        size="icon"
        onClick={() => setIsOpen(!isOpen)}
        className="h-14 w-14 rounded-full shadow-lg"
      >
        {isOpen ? (
          <X className="h-6 w-6" />
        ) : (
          <MessageSquare className="h-6 w-6" />
        )}
      </Button>
    </div>
  );
}
