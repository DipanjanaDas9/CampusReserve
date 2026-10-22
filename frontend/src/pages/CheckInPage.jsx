import { useState } from "react";
import { Building2, CalendarDays, CheckCircle2, Clock, Info, ShieldCheck, Timer, Users } from "lucide-react";
import { StudentLayout } from "../layouts/StudentLayout";
const SAMPLE = {
    id: "R-1042",
    space: "Engineering Room 312",
    building: "Engineering Building",
    date: "Oct 22",
    time: "10:00 AM – 12:00 PM",
    groupSize: "6 people",
    status: "Approved",
    window: "9:45 AM – 10:30 AM",
};
export function CheckInPage() {
    const [message, setMessage] = useState(null);
    const rows = [
        { icon: CalendarDays, label: "Date", value: SAMPLE.date },
        { icon: Clock, label: "Time", value: SAMPLE.time },
        { icon: Users, label: "Group Size", value: SAMPLE.groupSize },
        { icon: ShieldCheck, label: "Status", value: SAMPLE.status, badge: true },
        { icon: Timer, label: "Check-in Window", value: SAMPLE.window },
    ];
    return (<StudentLayout active="reservations">
      <div className="mx-auto max-w-lg">
        <h1 className="text-2xl font-bold text-foreground">Check In to Your Reservation</h1>
        <p className="mt-1 text-sm text-muted-foreground">Confirm your arrival and start using the space</p>

        <div className="mt-6 rounded-xl border bg-card p-5 shadow-card">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-20 items-center justify-center rounded-md bg-secondary">
              <Building2 className="h-6 w-6 text-primary"/>
            </div>
            <div>
              <div className="font-semibold text-foreground">{SAMPLE.space}</div>
              <div className="text-sm text-muted-foreground">{SAMPLE.building}</div>
            </div>
          </div>

          <dl className="mt-5 divide-y border-t text-sm">
            {rows.map(({ icon: Icon, label, value, badge }) => (<div key={label} className="flex items-center justify-between py-3">
                <dt className="flex items-center gap-2 text-muted-foreground"><Icon className="h-4 w-4"/>{label}</dt>
                <dd className="font-medium text-foreground">
                  {badge ? <span className="rounded-full bg-success/15 px-2.5 py-0.5 text-xs text-success">{value}</span> : value}
                </dd>
              </div>))}
          </dl>

          <button type="button" onClick={() => setMessage("Check-in isn't available yet — the backend is not connected.")} className="mt-5 flex w-full items-center justify-center gap-2 rounded-md bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
            <CheckCircle2 className="h-4 w-4"/> Check In
          </button>
          {message && <p className="mt-3 text-center text-sm text-destructive">{message}</p>}

          <div className="mt-4 flex items-start gap-2 rounded-md bg-primary/10 p-3 text-sm text-primary">
            <Info className="mt-0.5 h-4 w-4 shrink-0"/>
            Please check in within 30 minutes of your reservation start time.
          </div>
        </div>
        <p className="mt-3 text-center text-xs italic text-muted-foreground">Sample reservation shown until the backend is connected</p>
      </div>
    </StudentLayout>);
}
