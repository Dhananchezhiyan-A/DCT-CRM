import Link from "next/link";
import { ArrowLeft, ArrowRight, Settings } from "lucide-react";

export interface SetupItem {
  label: string;
  description: string;
  href?: string;
}

export default function SetupSectionPage({
  title,
  description,
  items,
}: {
  title: string;
  description: string;
  items: SetupItem[];
}) {
  return (
    <div className="space-y-8">
      <div className="border-b pb-6">
        <Link href="/setup" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary">
          <ArrowLeft className="h-4 w-4" />
          Back to Setup
        </Link>
        <div className="mt-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Setup</p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight">{title}</h1>
            <p className="mt-2 max-w-2xl text-muted-foreground">{description}</p>
          </div>
          <Settings className="mt-1 h-8 w-8 text-muted-foreground" />
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {items.map((item) => {
          const content = (
            <>
              <div>
                <h2 className="font-medium">{item.label}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </>
          );

          return item.href ? (
            <Link key={item.label} href={item.href} className="flex items-center justify-between rounded-lg border bg-card p-5 hover:border-primary">
              {content}
            </Link>
          ) : (
            <div key={item.label} className="flex items-center justify-between rounded-lg border bg-card p-5">
              {content}
            </div>
          );
        })}
      </div>
    </div>
  );
}
