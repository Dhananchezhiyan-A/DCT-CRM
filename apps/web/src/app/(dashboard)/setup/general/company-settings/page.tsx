"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Building2, Check, ChevronDown, Edit3, Plus, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { companySettingsApi } from "@/lib/api";

type Tab = "company" | "fiscal" | "hours" | "holidays" | "currency";
type Holiday = { id: string; name: string; date: string };
type SettingsState = {
  accessUrl: string;
  fiscalYear: { type: "standard" | "custom"; startsIn: string };
  businessHours: { weekStartsOn: string; timezone: string; days: string[]; start: string; end: string };
  holidays: Holiday[];
  currency: { code: string; symbol: string; separator: "en-IN" | "en-US" | "de-DE"; decimals: number };
};

const defaults: SettingsState = {
  accessUrl: "https://crm.dctcrm.com",
  fiscalYear: { type: "standard", startsIn: "January" },
  businessHours: { weekStartsOn: "Monday", timezone: "Asia/Kolkata", days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"], start: "09:00", end: "17:00" },
  holidays: [],
  currency: { code: "INR", symbol: "Rs.", separator: "en-IN", decimals: 2 },
};
const tabs: { id: Tab; label: string }[] = [
  { id: "company", label: "Company Details" }, { id: "fiscal", label: "Fiscal Year" }, { id: "hours", label: "Business hours" }, { id: "holidays", label: "Holidays" }, { id: "currency", label: "Currencies" },
];
const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export default function CompanySettingsPage() {
  const [tab, setTab] = React.useState<Tab>("company");
  const [settings, setSettings] = React.useState<SettingsState>(defaults);
  const [company, setCompany] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState("");
  const [holidayDialog, setHolidayDialog] = React.useState(false);
  const [currencyDialog, setCurrencyDialog] = React.useState(false);
  const [holidayDraft, setHolidayDraft] = React.useState({ name: "", date: "" });
  const [currencyDraft, setCurrencyDraft] = React.useState(defaults.currency);

  React.useEffect(() => {
    companySettingsApi.get().then((response) => {
      const data = response.data?.data;
      const stored = data?.settings && typeof data.settings === "object" ? data.settings : {};
      setCompany(data);
      setSettings({
        ...defaults, ...stored,
        businessHours: { ...defaults.businessHours, ...stored.businessHours },
        fiscalYear: { ...defaults.fiscalYear, ...stored.fiscalYear },
        currency: { ...defaults.currency, ...stored.currency },
        holidays: Array.isArray(stored.holidays) ? stored.holidays : [],
      });
    }).catch(() => setMessage("Unable to load company settings.")).finally(() => setLoading(false));
  }, []);

  const patch = (value: Partial<SettingsState>) => setSettings((current) => ({ ...current, ...value }));
  const save = async () => {
    setSaving(true);
    try { await companySettingsApi.update(settings); setMessage("Settings saved"); }
    catch (error: any) { setMessage(error?.response?.data?.error || "Unable to save settings"); }
    finally { setSaving(false); window.setTimeout(() => setMessage(""), 3000); }
  };
  const addHoliday = () => {
    if (!holidayDraft.name || !holidayDraft.date) return;
    patch({ holidays: [...settings.holidays, { ...holidayDraft, id: crypto.randomUUID() }] });
    setHolidayDraft({ name: "", date: "" }); setHolidayDialog(false);
  };
  const currencyPreview = new Intl.NumberFormat(settings.currency.separator, { minimumFractionDigits: settings.currency.decimals, maximumFractionDigits: settings.currency.decimals }).format(1234567.89);

  if (loading) return <div className="p-8 text-sm text-muted-foreground">Loading company settings...</div>;

  return <div className="space-y-5">
    <div className="flex items-center gap-3"><Link href="/setup" className="text-muted-foreground hover:text-primary"><ArrowLeft className="h-4 w-4" /></Link><div><p className="text-sm text-muted-foreground">Setup / General</p><h1 className="text-xl font-semibold tracking-tight">Company Settings</h1></div></div>
    <div className="overflow-hidden rounded-lg border bg-card">
      <nav className="flex overflow-x-auto border-b">{tabs.map((item) => <button key={item.id} type="button" onClick={() => setTab(item.id)} className={`whitespace-nowrap border-b-2 px-5 py-4 text-sm font-medium ${tab === item.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{item.label}</button>)}</nav>
      <main className="min-h-[560px] p-7 md:p-10">
        {tab === "company" && <CompanyPanel company={company} settings={settings} patch={patch} />}
        {tab === "fiscal" && <SettingsPanel title="Manage Fiscal Year" description="A defined accounting period can be set to measure financial performance and reporting."><div className="grid max-w-2xl gap-5 sm:grid-cols-[180px_1fr] sm:items-center"><Label>Fiscal Year Type</Label><div className="flex flex-wrap gap-5"><label className="flex items-center gap-2 text-sm"><input type="radio" checked={settings.fiscalYear.type === "standard"} onChange={() => patch({ fiscalYear: { ...settings.fiscalYear, type: "standard" } })} /> Standard Fiscal Year</label><label className="flex items-center gap-2 text-sm"><input type="radio" checked={settings.fiscalYear.type === "custom"} onChange={() => patch({ fiscalYear: { ...settings.fiscalYear, type: "custom" } })} /> Custom Fiscal Year</label></div><Label>Fiscal Year begins in</Label><Select value={settings.fiscalYear.startsIn} onChange={(value) => patch({ fiscalYear: { ...settings.fiscalYear, startsIn: value } })} options={months} /></div></SettingsPanel>}
        {tab === "hours" && <SettingsPanel title="Business hours" description="Business hours define the operational hours of your organization."><div className="grid max-w-2xl gap-5 sm:grid-cols-[180px_1fr] sm:items-center text-sm"><span className="text-muted-foreground">Week starts on</span><Select value={settings.businessHours.weekStartsOn} onChange={(value) => patch({ businessHours: { ...settings.businessHours, weekStartsOn: value } })} options={weekdays.slice(0, 5)} /><span className="text-muted-foreground">Business days</span><div className="flex flex-wrap gap-3">{weekdays.map((day) => <label key={day} className="flex items-center gap-1.5"><input type="checkbox" checked={settings.businessHours.days.includes(day)} onChange={(event) => patch({ businessHours: { ...settings.businessHours, days: event.target.checked ? [...settings.businessHours.days, day] : settings.businessHours.days.filter((item) => item !== day) } })} />{day.slice(0, 3)}</label>)}</div><span className="text-muted-foreground">Business hours</span><div className="flex items-center gap-2"><Input type="time" value={settings.businessHours.start} onChange={(event) => patch({ businessHours: { ...settings.businessHours, start: event.target.value } })} /><span>to</span><Input type="time" value={settings.businessHours.end} onChange={(event) => patch({ businessHours: { ...settings.businessHours, end: event.target.value } })} /></div><span className="text-muted-foreground">Time zone</span><Select value={settings.businessHours.timezone} onChange={(value) => patch({ businessHours: { ...settings.businessHours, timezone: value } })} options={["Asia/Kolkata", "UTC", "America/New_York", "Europe/London"]} /></div><div className="mt-10 border-t pt-6"><h3 className="font-semibold">Shift hours</h3><p className="mt-1 text-sm text-muted-foreground">Create shift hours and assign shifts based on employee availability.</p><Button className="mt-4"><Plus className="mr-2 h-4 w-4" />New Shift hours</Button></div></SettingsPanel>}
        {tab === "holidays" && <SettingsPanel title="Holiday details" description="Create a list of holidays based on your organization."><div className="flex justify-end"><Button onClick={() => setHolidayDialog(true)}><Plus className="mr-2 h-4 w-4" />Create Holiday list</Button></div>{settings.holidays.length ? <div className="mt-6 divide-y rounded-md border">{settings.holidays.map((holiday) => <div className="flex items-center justify-between p-4" key={holiday.id}><div><p className="font-medium">{holiday.name}</p><p className="text-sm text-muted-foreground">{holiday.date}</p></div><Button variant="ghost" size="icon" onClick={() => patch({ holidays: settings.holidays.filter((item) => item.id !== holiday.id) })}><X className="h-4 w-4" /></Button></div>)}</div> : <div className="mt-12 flex min-h-52 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">No holidays configured</div>}</SettingsPanel>}
        {tab === "currency" && <SettingsPanel title="Currencies" description="Define the currency preferences used by your organization."><div className="flex flex-wrap items-center justify-between gap-4 rounded-md border bg-muted/20 px-4 py-4"><div className="flex flex-wrap items-center gap-5 text-sm"><span>Home Currency</span><strong>{settings.currency.code === "INR" ? "Indian Rupee - INR" : settings.currency.code}</strong><span>Currency Format</span><strong>{settings.currency.symbol} {currencyPreview}</strong></div><Button variant="outline" onClick={() => { setCurrencyDraft(settings.currency); setCurrencyDialog(true); }}><Edit3 className="mr-2 h-4 w-4" />Edit</Button></div></SettingsPanel>}
      </main>
      <footer className="flex items-center justify-between border-t bg-muted/10 px-7 py-4 md:px-10"><span className="text-sm text-emerald-600">{message}</span><div className="flex gap-2"><Button variant="outline" onClick={() => setTab("company")}>Cancel</Button><Button onClick={save} disabled={saving}><Save className="mr-2 h-4 w-4" />{saving ? "Saving..." : "Save"}</Button></div></footer>
    </div>
    <Dialog open={holidayDialog} onOpenChange={setHolidayDialog}><DialogContent><DialogHeader><DialogTitle>Create Holiday</DialogTitle></DialogHeader><div className="grid gap-4 py-3"><div><Label htmlFor="holiday-name">Holiday name</Label><Input id="holiday-name" value={holidayDraft.name} onChange={(event) => setHolidayDraft({ ...holidayDraft, name: event.target.value })} placeholder="Independence Day" /></div><div><Label htmlFor="holiday-date">Date</Label><Input id="holiday-date" type="date" value={holidayDraft.date} onChange={(event) => setHolidayDraft({ ...holidayDraft, date: event.target.value })} /></div></div><DialogFooter><Button variant="outline" onClick={() => setHolidayDialog(false)}>Cancel</Button><Button onClick={addHoliday}><Check className="mr-2 h-4 w-4" />Add holiday</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={currencyDialog} onOpenChange={setCurrencyDialog}><DialogContent><DialogHeader><DialogTitle>Edit Currency</DialogTitle></DialogHeader><div className="grid gap-4 py-3"><div className="grid grid-cols-2 gap-2"><div><Label>Code</Label><Input value={currencyDraft.code} onChange={(event) => setCurrencyDraft({ ...currencyDraft, code: event.target.value.toUpperCase() })} /></div><div><Label>Symbol</Label><Input value={currencyDraft.symbol} onChange={(event) => setCurrencyDraft({ ...currencyDraft, symbol: event.target.value })} /></div></div><div><Label>Digit separators</Label><Select value={currencyDraft.separator} onChange={(value) => setCurrencyDraft({ ...currencyDraft, separator: value as SettingsState["currency"]["separator"] })} options={["en-IN", "en-US", "de-DE"]} /></div><div><Label>Decimal places</Label><Select value={String(currencyDraft.decimals)} onChange={(value) => setCurrencyDraft({ ...currencyDraft, decimals: Number(value) })} options={["0", "1", "2", "3", "4"]} /></div></div><DialogFooter><Button variant="outline" onClick={() => setCurrencyDialog(false)}>Cancel</Button><Button onClick={() => { patch({ currency: currencyDraft }); setCurrencyDialog(false); }}><Check className="mr-2 h-4 w-4" />Save</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}

function CompanyPanel({ company, settings, patch }: { company: any; settings: SettingsState; patch: (value: Partial<SettingsState>) => void }) {
  return <div className="space-y-10"><div className="flex items-start gap-5"><div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-400"><Building2 className="h-10 w-10" /></div><div className="space-y-2"><h2 className="text-xl font-semibold">{company?.name || "DCT Real Estate"}</h2><p className="text-sm text-muted-foreground">Org ID: {company?.companyCode || "DCT-RE"}</p><p className="text-sm">{company?.email || "admin@dctcrm.com"}</p><p className="text-sm text-muted-foreground">{company?.phone || "Phone number not configured"}</p></div></div><div><h3 className="text-sm font-semibold">Access URL <Edit3 className="ml-1 inline h-3.5 w-3.5 text-muted-foreground" /></h3><div className="mt-4 flex max-w-xl items-center gap-3 rounded-md border bg-muted/20 px-4 py-3 text-sm"><span className="text-muted-foreground">URL</span><Input value={settings.accessUrl} onChange={(event) => patch({ accessUrl: event.target.value })} className="h-8 border-0 bg-transparent p-0 shadow-none" /></div></div><div><h3 className="text-sm font-semibold">Local Information</h3><div className="mt-4 grid max-w-xl gap-4 sm:grid-cols-[140px_1fr] sm:items-center text-sm"><span className="text-muted-foreground">Time Zone</span><span>{settings.businessHours.timezone}</span></div></div></div>;
}

function SettingsPanel({ title, description, children }: { title: string; description: string; children: React.ReactNode }) { return <div><h2 className="text-xl font-semibold">{title}</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p><div className="mt-9">{children}</div></div>; }
function Select({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: string[] }) { return <div className="relative"><select value={value} onChange={(event) => onChange(event.target.value)} className="h-9 w-full appearance-none rounded-md border bg-background px-3 pr-9 text-sm outline-none focus:ring-2 focus:ring-primary/30">{options.map((option) => <option key={option} value={option}>{option}</option>)}</select><ChevronDown className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-muted-foreground" /></div>; }